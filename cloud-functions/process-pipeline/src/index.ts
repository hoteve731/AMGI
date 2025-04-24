// cloud-functions/process-pipeline/src/index.ts
import * as functions from '@google-cloud/functions-framework';
import OpenAI from 'openai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { generateGroupsPrompt, generateUnifiedChunksPrompt } from './prompt_generator';

console.log("GCF Script - Top Level: Starting execution..."); // 최상단 로그

// --- 타입 정의 복원 ---
interface InsertedGroup { id: string; title: string; }
interface ParsedGroup { title: string; originalSource: string; }
interface ParsedChunk { front: string; back: string; }
interface SegmentRecord { id: string; content_id: string; segment_text: string; position: number; }
interface SegmentToProcess extends SegmentRecord { additionalMemory?: string; }
interface SegmentResult { success: boolean; segmentId: string; error?: string; }

// --- 클라이언트 초기화 복원 ---
let supabase: SupabaseClient;
let openai: OpenAI;
let isInitialized = false;
try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    console.log("Checking environment variables...");
    console.log(`SUPABASE_URL exists: ${!!supabaseUrl}`);
    console.log(`SUPABASE_SERVICE_ROLE_KEY exists: ${!!supabaseServiceRoleKey}`);
    console.log(`OPENAI_API_KEY exists: ${!!openaiApiKey}`);

    if (!supabaseUrl || !supabaseServiceRoleKey || !openaiApiKey) {
        throw new Error('Server configuration error: Missing required environment variables.');
    }

    console.log("Initializing Supabase client...");
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    console.log("Initializing OpenAI client...");
    openai = new OpenAI({ apiKey: openaiApiKey });

    isInitialized = true;
    console.log("Clients initialized successfully.");
} catch (initError) {
    console.error("Failed to initialize clients:", initError);
}

// === 원래 Helper 함수 정의들 모두 복원 ===

// === 단일 세그먼트 처리 함수 ===
async function processSingleSegment(supabase: SupabaseClient, openai: OpenAI, segment: SegmentToProcess): Promise<SegmentResult> {
    const { id: segmentId, content_id: contentId, segment_text: segmentText, position: segmentPosition, additionalMemory } = segment;
    console.log(`[Segment ${segmentPosition}][${segmentId}] Starting processing.`);

    try {
        // 1. 세그먼트 상태 업데이트: processing_groups
        await updateSegmentStatus(supabase, segmentId, 'processing_groups');

        // 2. 그룹 생성 (OpenAI)
        const groupsPrompt = generateGroupsPrompt(additionalMemory);
        console.log(`[Segment ${segmentPosition}][${segmentId}] Generating groups...`);
        const groupCompletion = await openai.chat.completions.create({
            model: "gpt-4o-mini-2024-07-18",
            messages: [{ role: "system", content: groupsPrompt }, { role: "user", content: segmentText }],
            temperature: 0.2, max_tokens: 1500,
        });
        const groupResultText = groupCompletion.choices[0]?.message?.content?.trim() || '';
        const parsedGroups = parseGroupResult(groupResultText, contentId, segmentId);

        if (parsedGroups.length === 0) {
            console.warn(`[Segment ${segmentPosition}][${segmentId}] No groups generated or parsed. Marking as completed.`);
            await updateSegmentStatus(supabase, segmentId, 'completed');
            return { success: true, segmentId };
        }

        // 3. 그룹 저장 (DB Insert)
        console.log(`[Segment ${segmentPosition}][${segmentId}] Inserting ${parsedGroups.length} groups...`);
        const groupsToInsert = parsedGroups.map((group, index) => ({
            content_id: contentId,
            title: group.title,
            original_text: group.originalSource,
            segment_position: segmentPosition,
            position: index
        }));
        const { data: insertedGroupsData, error: groupInsertError } = await supabase
            .from('content_groups')
            .insert(groupsToInsert)
            .select('id, title');
        if (groupInsertError) throw new Error(`Failed to insert groups: ${groupInsertError.message}`);
        const insertedGroups = insertedGroupsData as InsertedGroup[] | null;
        if (!insertedGroups || insertedGroups.length !== parsedGroups.length) throw new Error(`Failed to retrieve IDs for all inserted groups.`);
        console.log(`[Segment ${segmentPosition}][${segmentId}] Inserted ${insertedGroups.length} groups.`);

        // 4. 세그먼트 상태 업데이트: processing_chunks
        await updateSegmentStatus(supabase, segmentId, 'processing_chunks');

        // 5. 청크 생성 및 저장 준비
        const allChunksToInsert: any[] = [];
        const chunksPrompt = generateUnifiedChunksPrompt(additionalMemory);
        console.log(`[Segment ${segmentPosition}][${segmentId}] Generating chunks for ${insertedGroups.length} groups...`);

        for (let i = 0; i < parsedGroups.length; i++) {
            const currentParsedGroup = parsedGroups[i];
            const currentInsertedGroup = insertedGroups.find(g => g.title === currentParsedGroup.title);
            if (!currentInsertedGroup) {
                console.warn(`[Segment ${segmentPosition}][${segmentId}] Cannot find DB ID for parsed group: "${currentParsedGroup.title}". Skipping chunks.`);
                continue;
            }
            const currentGroupId = currentInsertedGroup.id;
            if (!currentParsedGroup.originalSource || currentParsedGroup.originalSource.trim().length < 10) continue;

            const chunkCompletion = await openai.chat.completions.create({
                model: "gpt-4o-mini-2024-07-18",
                messages: [{ role: "system", content: chunksPrompt }, { role: "user", content: currentParsedGroup.originalSource }],
                temperature: 0.3, max_tokens: 1000,
            });
            const chunkResultText = chunkCompletion.choices[0]?.message?.content?.trim() || '';
            if (!chunkResultText) continue;

            const parsedChunks = parseChunkResult(chunkResultText, contentId, segmentId, i + 1);
            if (parsedChunks.length > 0) {
                const chunksForThisGroup = parsedChunks.map((chunk, index) => ({
                    group_id: currentGroupId,
                    summary: chunk.front,
                    masked_text: chunk.back,
                    position: index
                }));
                allChunksToInsert.push(...chunksForThisGroup);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // 6. 청크 저장 (DB Insert)
        if (allChunksToInsert.length > 0) {
            console.log(`[Segment ${segmentPosition}][${segmentId}] Inserting ${allChunksToInsert.length} chunks into content_chunks table...`);
            const { error: chunkInsertError } = await supabase.from('content_chunks').insert(allChunksToInsert);
            if (chunkInsertError) throw new Error(`Failed to insert chunks: ${chunkInsertError.message}`);
            console.log(`[Segment ${segmentId}] Inserted ${allChunksToInsert.length} chunks.`);
        }

        // 7. 세그먼트 상태 업데이트: completed
        await updateSegmentStatus(supabase, segmentId, 'completed');
        console.log(`[Segment ${segmentPosition}][${segmentId}] Processing completed successfully.`);
        return { success: true, segmentId };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Segment ${segmentPosition}][${segmentId}] Processing failed:`, error);
        try {
            await updateSegmentStatus(supabase, segmentId, 'failed');
        } catch (statusError) {
            console.error(`[Segment ${segmentPosition}][${segmentId}] CRITICAL: Failed to update segment status to 'failed':`, statusError);
        }
        return { success: false, segmentId, error: errorMessage };
    }
}

// === 최종 콘텐츠 상태 업데이트 함수 ===
async function updateFinalContentStatus(supabase: SupabaseClient, contentId: string) {
    console.log(`[FinalStatus][${contentId}] Calculating final content status...`);
    try {
        const { data: segments, error } = await supabase
            .from('content_segments')
            .select('status')
            .eq('content_id', contentId);

        if (error) throw new Error(`Failed to fetch segment statuses: ${error.message}`);

        const total = segments.length;
        const completed = segments.filter((s: { status: string }) => s.status === 'completed').length;
        const failed = segments.filter((s: { status: string }) => s.status === 'failed').length;

        let finalStatus = 'failed';
        if (total === 0) finalStatus = 'completed';
        else if (completed === total) finalStatus = 'completed';
        else if (completed > 0) finalStatus = 'partially_completed';

        console.log(`[FinalStatus][${contentId}] Segments - Total: ${total}, Completed: ${completed}, Failed: ${failed}. Final status: ${finalStatus}`);
        await updateContentStatus(supabase, contentId, finalStatus);
        console.log(`[FinalStatus][${contentId}] Final content status updated.`);

    } catch (error) {
        console.error(`[FinalStatus][${contentId}] Error calculating or updating final status:`, error);
    }
}

// === 메인 HTTP 핸들러 - 로직 일부 복원 ===
functions.http('processPipeline', async (req, res) => {
    // CORS, Method Check, Initialization Check (이전과 동일)
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    // 클라이언트 초기화 확인
    if (!isInitialized) {
        console.error("GCF Handler - Clients failed to initialize!");
        return res.status(500).send('Internal Server Error: Client initialization failed.');
    }

    let contentId: string | null = null;

    try {
        console.log("Request body:", JSON.stringify(req.body));

        const { contentId: reqContentId, text, userId, additionalMemory, title: reqTitle } = req.body;
        contentId = reqContentId as string;

        console.log(`Validating request parameters - contentId: ${!!contentId}, text: ${!!text}, userId: ${!!userId}, title: ${!!reqTitle}, additionalMemory: ${!!additionalMemory}`);

        if (!contentId || !text || !userId) {
            console.error(`Missing required parameters: contentId=${!!contentId}, text=${!!text}, userId=${!!userId}`);
            return res.status(400).json({ error: 'contentId, text, and userId required.' });
        }

        // title이 없는 경우를 위한 기본값 설정
        const title = reqTitle || "Untitled Content";
        console.log(`Using title: ${title}`);

        console.log(`[Main][${contentId}] Handler started. Segmentation part with dynamic p-limit import.`);

        // --- p-limit 동적 import 추가 ---
        console.log(`[Main][${contentId}] Importing p-limit...`);
        let pLimit;
        try {
            pLimit = (await import('p-limit')).default;
            console.log(`[Main][${contentId}] p-limit imported successfully.`);
        } catch (importError) {
            console.error(`[Main][${contentId}] Failed to import p-limit:`, importError);
            throw new Error(`Failed to import p-limit: ${importError instanceof Error ? importError.message : 'Unknown error'}`);
        }
        // -----------------------------

        // +++ contents 테이블에 레코드 삽입 로직 추가 +++
        console.log(`[Main][${contentId}] Inserting initial record into contents table...`);
        console.log(`[Main][${contentId}] Insert data: { id: ${contentId}, title: ${title}, original_text: ${text}, processing_status: 'received', user_id: ${userId}, additional_memory: ${additionalMemory} }`);

        try {
            const { error: initialInsertError } = await supabase
                .from('contents')
                .insert({
                    id: contentId,
                    title: title,
                    original_text: text,
                    processing_status: 'received',
                    user_id: userId,
                    chunks: [],
                    masked_chunks: [],
                    additional_memory: additionalMemory || ''
                });

            if (initialInsertError) {
                // 고유 키 제약 조건 위반 (이미 존재하는 contentId) 일 수 있으므로, 
                // 에러 메시지를 확인하고 단순히 업데이트를 시도하거나 다른 처리를 할 수 있음
                // 여기서는 일단 에러를 throw
                console.error(`[Main][${contentId}] Failed to insert initial record:`, initialInsertError);
                console.error(`[Main][${contentId}] Error details: ${JSON.stringify(initialInsertError)}`);

                // 이미 존재하는 레코드일 경우 업데이트 시도
                if (initialInsertError.code === '23505') { // 고유 제약 조건 위반 코드
                    console.log(`[Main][${contentId}] Record already exists, attempting update instead...`);
                    const { error: updateError } = await supabase
                        .from('contents')
                        .update({
                            processing_status: 'received',
                            user_id: userId,
                            title: title,
                            original_text: text,
                            chunks: [],
                            masked_chunks: [],
                            additional_memory: additionalMemory || ''
                        })
                        .eq('id', contentId);

                    if (updateError) {
                        console.error(`[Main][${contentId}] Update also failed:`, updateError);
                        throw new Error(`Failed to update existing content record: ${updateError.message}`);
                    } else {
                        console.log(`[Main][${contentId}] Successfully updated existing record.`);
                    }
                } else {
                    throw new Error(`Failed to insert initial content record: ${initialInsertError.message}`);
                }
            } else {
                console.log(`[Main][${contentId}] Initial record inserted successfully.`);
            }
        } catch (dbError) {
            console.error(`[Main][${contentId}] Database operation failed:`, dbError);
            throw new Error(`Database operation failed: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
        }
        // +++++++++++++++++++++++++++++++++++++++++++++

        // --- 로직 복원 시작 (이전과 동일) ---
        // 1. 상태 업데이트: segmenting
        await updateContentStatus(supabase, contentId, 'segmenting');

        // 2. 텍스트 세분화 (Langchain)
        const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1500, chunkOverlap: 100 });
        const segmentsText = await splitter.splitText(text);
        console.log(`[Main][${contentId}] Text split into ${segmentsText.length} segments.`);
        if (segmentsText.length === 0) segmentsText.push(text); // 최소 1개 보장

        // 3. 세그먼트 저장 (DB Insert)
        const segmentDataToInsert = segmentsText.map((segmentText, index) => ({
            content_id: contentId!,
            segment_text: segmentText,
            position: index + 1, // 1부터 시작하는 세그먼트 위치
            status: 'pending',
        }));
        const { data: insertedSegmentsData, error: insertError } = await supabase
            .from('content_segments') // 세그먼트 테이블 이름 확인됨
            .insert(segmentDataToInsert)
            .select('id, content_id, segment_text, position') // 필요한 컬럼만 select
            .returns<SegmentRecord[]>(); // 반환 타입 지정
        if (insertError) throw new Error(`Failed to insert segments: ${insertError.message}`);
        if (!insertedSegmentsData || insertedSegmentsData.length === 0) throw new Error('No segments inserted or returned.');
        const insertedSegments = insertedSegmentsData;
        console.log(`[Main][${contentId}] Inserted ${insertedSegments.length} segments.`);

        // 4. 상태 업데이트: processing_segments (여기까지만 진행)
        await updateContentStatus(supabase, contentId, 'processing_segments');
        console.log(`[Main][${contentId}] Segmentation and saving complete. Stopping before parallel processing.`);
        // --- 로직 복원 끝 (이전과 동일) ---

        // 5. 병렬 세그먼트 처리 (이 부분은 아직 주석 처리)
        const limit = pLimit(5);
        console.log(`[Main][${contentId}] Starting parallel processing...`);
        const processingPromises = insertedSegments.map((segment: SegmentRecord) => {
            const segmentPayload: SegmentToProcess = { ...segment, additionalMemory };
            return limit(() => processSingleSegment(supabase, openai, segmentPayload));
        });

        const results = await Promise.all(processingPromises);
        const successfulTasks = results.filter(r => r.success).length;
        const failedTasks = results.length - successfulTasks;
        console.log(`[Main][${contentId}] All segment processing finished. Success: ${successfulTasks}, Failed: ${failedTasks}`);
        if (failedTasks > 0) {
            results.filter(r => !r.success).forEach(r => console.error(`[Main][${contentId}] Failed segment ${r.segmentId}: ${r.error}`));
        }

        // 6. 최종 상태 업데이트 (이 부분은 아직 주석 처리)
        await updateFinalContentStatus(supabase, contentId);
        console.log(`[Main][${contentId}] Pipeline completed.`);

        // 실제 파이프라인 완료 응답
        res.status(200).json({
            message: `Pipeline completed for ${contentId}. Segments processed: ${results.length}, Success: ${successfulTasks}, Failed: ${failedTasks}`
        });

    } catch (error) {
        const contentIdStr = contentId || 'unknown-id';
        console.error(`[Main][${contentIdStr}] Segmentation phase failed:`, error);
        if (contentId && isInitialized) {
            try { await updateContentStatus(supabase, contentId, 'failed'); }
            catch (statusError) { console.error(`[Main][${contentIdStr}] CRITICAL: Failed to update status to 'failed':`, statusError); }
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during segmentation.';
        res.status(500).json({ error: `Segmentation phase failed: ${errorMessage}` });
    }
});

// --- 원래 Helper 함수 정의들 (updateContentStatus, updateSegmentStatus, parseGroupResult, parseChunkResult) --- 

// contents 테이블 상태 업데이트 함수
async function updateContentStatus(supabase: SupabaseClient, contentId: string, status: string) {
    console.log(`[DB][${contentId}] Updating contents.processing_status to: ${status}`);
    const { error } = await supabase
        .from('contents')
        .update({ processing_status: status /* , created_at: new Date().toISOString() */ })
        .eq('id', contentId);
    if (error) {
        console.error(`[DB][${contentId}] Failed update contents status to ${status}:`, error.message);
        throw new Error(`DB contents status update failed: ${error.message}`);
    }
}

// content_segments 테이블 상태 업데이트 함수
async function updateSegmentStatus(supabase: SupabaseClient, segmentId: string, status: 'processing_groups' | 'processing_chunks' | 'completed' | 'failed' | 'pending') {
    console.log(`[DB][Seg ${segmentId}] Updating content_segments.status to: ${status}`);
    const updateData: { status: string; updated_at?: string } = { status: status };
    updateData.updated_at = new Date().toISOString();

    const { error } = await supabase
        .from('content_segments')
        .update(updateData)
        .eq('id', segmentId);
    if (error) {
        console.error(`[DB][Seg ${segmentId}] Failed update segment status to ${status}:`, error.message);
        throw new Error(`DB segment status update failed: ${error.message}`);
    }
}

// 그룹 파싱 함수
function parseGroupResult(resultText: string, contentId: string, segmentId: string): ParsedGroup[] {
    console.log(`[Parse][${contentId}][Seg ${segmentId}] Parsing group result (Length: ${resultText.length}).`);
    const groups: ParsedGroup[] = [];
    const groupRegex = /<그룹\s*(\d+)>[\s\n]*제목:\s*(.*?)\s*[\s\n]*오리지널\s*소스:\s*([\s\S]*?)(?=<그룹\s*\d+>|$)/gi;
    let match;
    while ((match = groupRegex.exec(resultText)) !== null) {
        const title = match[2].trim(); const originalSource = match[3].trim();
        if (title && originalSource) groups.push({ title, originalSource });
        else console.warn(`[Parse][${contentId}][Seg ${segmentId}] Parsed group ${match[1]} but empty.`);
    }
    if (groups.length === 0 && resultText) console.warn(`[Parse][${contentId}][Seg ${segmentId}] No groups parsed via regex.`);
    console.log(`[Parse][${contentId}][Seg ${segmentId}] Parsed ${groups.length} groups.`);
    return groups;
}

// 청크 파싱 함수 
function parseChunkResult(resultText: string, contentId: string, segmentId: string, groupIndex: number): ParsedChunk[] {
    console.log(`[Parse][${contentId}][Seg ${segmentId}][Grp ${groupIndex}] Parsing chunk result (Length: ${resultText.length}).`);
    const chunks: ParsedChunk[] = [];
    const chunkRegex = /카드\s*(\d+):\s*(.*?)\s*\/\s*(.*?)(?=\n*카드\s*\d+:|\s*$)/gi;
    let match;
    while ((match = chunkRegex.exec(resultText)) !== null) {
        const front = match[2].trim(); const back = match[3].trim();
        if (front && back) chunks.push({ front, back });
        else console.warn(`[Parse][${contentId}][Seg ${segmentId}][Grp ${groupIndex}] Parsed chunk ${match[1]} but empty.`);
    }
    if (chunks.length === 0 && resultText) console.warn(`[Parse][${contentId}][Seg ${segmentId}][Grp ${groupIndex}] No chunks parsed via regex.`);
    console.log(`[Parse][${contentId}][Seg ${segmentId}][Grp ${groupIndex}] Parsed ${chunks.length} chunks.`);
    return chunks;
}

console.log("GCF Script - Bottom Level: Function registered."); 