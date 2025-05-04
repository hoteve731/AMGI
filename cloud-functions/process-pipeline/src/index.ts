// cloud-functions/process-pipeline/src/index.ts
import * as functions from '@google-cloud/functions-framework';
import OpenAI from 'openai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { generateGroupsPrompt, generateUnifiedChunksPrompt, generateMarkdownConversionPrompt } from './prompt_generator';

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
            model: "gpt-4.1-nano-2025-04-14",
            messages: [{ role: "system", content: groupsPrompt }, { role: "user", content: segmentText }],
            temperature: 0, max_tokens: 10000,
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

        // 그룹 삽입 실행
        const { data: insertedGroups, error: groupInsertError } = await supabase
            .from('content_groups')
            .insert(groupsToInsert)
            .select('id, title');

        if (groupInsertError) {
            console.error(`[Segment ${segmentPosition}][${segmentId}] Failed to insert groups:`, groupInsertError);
            await updateSegmentStatus(supabase, segmentId, 'failed');
            return { success: false, segmentId, error: `Failed to insert groups: ${groupInsertError.message}` };
        }

        console.log(`[Segment ${segmentPosition}][${segmentId}] Successfully inserted ${insertedGroups.length} groups.`);

        // 4. 세그먼트 상태 업데이트: processing_chunks
        await updateSegmentStatus(supabase, segmentId, 'processing_chunks');

        // 5. 각 그룹에 대해 청크 생성 (병렬 처리)
        console.log(`[Segment ${segmentPosition}][${segmentId}] Generating chunks for ${insertedGroups.length} groups...`);
        const chunkPromises = insertedGroups.map(async (group, index) => {
            try {
                const groupInfo = parsedGroups[index];
                if (!groupInfo) {
                    throw new Error(`Group info not found for index ${index}`);
                }

                // 청크 생성
                const chunksPrompt = generateUnifiedChunksPrompt(additionalMemory);
                const chunkCompletion = await openai.chat.completions.create({
                    model: "gpt-4.1-nano-2025-04-14",
                    messages: [{ role: "system", content: chunksPrompt }, { role: "user", content: groupInfo.originalSource }],
                    temperature: 0, max_tokens: 10000,
                });
                const chunkResultText = chunkCompletion.choices[0]?.message?.content?.trim() || '';
                const parsedChunks = parseChunkResult(chunkResultText, contentId, segmentId, index);

                if (parsedChunks.length === 0) {
                    console.warn(`[Segment ${segmentPosition}][${segmentId}][Group ${index}] No chunks generated.`);
                    return { groupId: group.id, success: false, error: 'No chunks generated' };
                }

                // 청크 삽입
                const chunksToInsert = parsedChunks.map((chunk, chunkIndex) => ({
                    group_id: group.id,
                    summary: chunk.front,
                    masked_text: chunk.back,
                    position: chunkIndex
                }));

                const { error: chunkInsertError } = await supabase
                    .from('content_chunks')
                    .insert(chunksToInsert);

                if (chunkInsertError) {
                    return { groupId: group.id, success: false, error: chunkInsertError.message };
                }

                console.log(`[Segment ${segmentPosition}][${segmentId}][Group ${index}] Successfully inserted ${chunksToInsert.length} chunks.`);
                return { groupId: group.id, success: true, chunksCount: chunksToInsert.length };
            } catch (error) {
                console.error(`[Segment ${segmentPosition}][${segmentId}][Group ${index}] Error processing chunks:`, error);
                return { groupId: group.id, success: false, error: error instanceof Error ? error.message : 'Unknown error' };
            }
        });

        // 모든 청크 생성 작업 완료 대기
        const chunkResults = await Promise.all(chunkPromises);

        // 청크 생성 결과 확인
        const successfulChunks = chunkResults.filter(result => result.success);
        console.log(`[Segment ${segmentPosition}][${segmentId}] Chunk generation complete: ${successfulChunks.length}/${chunkResults.length} groups successful.`);

        // 6. 세그먼트 상태 업데이트: completed
        await updateSegmentStatus(supabase, segmentId, 'completed');

        return { success: true, segmentId };
    } catch (error) {
        console.error(`[Segment ${segmentPosition}][${segmentId}] Error processing segment:`, error);
        try {
            await updateSegmentStatus(supabase, segmentId, 'failed');
        } catch (statusError) {
            console.error(`[Segment ${segmentPosition}][${segmentId}] Failed to update status to 'failed':`, statusError);
        }
        return { success: false, segmentId, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// === 최종 콘텐츠 상태 업데이트 함수 ===
async function updateFinalContentStatus(supabase: SupabaseClient, contentId: string) {
    console.log(`[DB][${contentId}] Updating final content status to 'completed'`);
    const { error } = await supabase
        .from('contents')
        .update({ processing_status: 'completed' })
        .eq('id', contentId);
    if (error) {
        console.error(`[DB][${contentId}] Failed to update final content status:`, error);
        throw new Error(`Failed to update final content status: ${error.message}`);
    }
}

// === 원래 Helper 함수 정의들 ===

// content_segments 테이블 상태 업데이트 함수
async function updateSegmentStatus(supabase: SupabaseClient, segmentId: string, status: 'processing_groups' | 'processing_chunks' | 'completed' | 'failed' | 'pending') {
    console.log(`[DB][Segment ${segmentId}] Updating segment status to: ${status}`);
    const { error } = await supabase
        .from('content_segments')
        .update({ status })
        .eq('id', segmentId);
    if (error) {
        console.error(`[DB][Segment ${segmentId}] Failed to update segment status to ${status}:`, error);
        throw new Error(`Failed to update segment status: ${error.message}`);
    }
}

// 그룹 파싱 함수
function parseGroupResult(resultText: string, contentId: string, segmentId: string): ParsedGroup[] {
    console.log(`[Parse][${contentId}][${segmentId}] Parsing group result...`);
    const groups: ParsedGroup[] = [];

    // 새로운 정규식 패턴: <그룹 N> 형식을 찾고, 그 다음에 제목과 오리지널 소스를 추출
    const groupPattern = /<그룹\s*\d+>\s*제목:\s*(.*?)(?:\s*\n|\r\n)오리지널\s*소스:\s*([\s\S]*?)(?=<그룹|$)/gi;

    const matches = Array.from(resultText.matchAll(groupPattern));

    for (const match of matches) {
        const title = match[1]?.trim() || '';
        const originalSource = match[2]?.trim() || '';

        if (title && originalSource) {
            groups.push({ title, originalSource });
        }
    }

    console.log(`[Parse][${contentId}][${segmentId}] Parsed ${groups.length} groups.`);

    // 디버깅을 위한 추가 로그
    if (groups.length === 0) {
        console.warn(`[Parse][${contentId}][${segmentId}] No groups found. Raw result text: "${resultText.substring(0, 200)}..."`);
    }

    return groups;
}

// 청크 파싱 함수
function parseChunkResult(resultText: string, contentId: string, segmentId: string, groupIndex: number): ParsedChunk[] {
    console.log(`[Parse][${contentId}][${segmentId}][Grp ${groupIndex}] Parsing chunk result...`);
    const chunks: ParsedChunk[] = [];

    // 새로운 정규식 패턴: "카드 N: 앞면 / 뒷면" 형식을 찾음
    const chunkPattern = /카드\s*\d+\s*:\s*(.*?)\s*\/\s*([\s\S]*?)(?=카드\s*\d+\s*:|$)/gi;

    const matches = Array.from(resultText.matchAll(chunkPattern));

    for (const match of matches) {
        const front = match[1]?.trim() || '';
        const back = match[2]?.trim() || '';

        if (front && back) {
            chunks.push({ front, back });
        }
    }

    console.log(`[Parse][${contentId}][${segmentId}][Grp ${groupIndex}] Parsed ${chunks.length} chunks.`);

    // 디버깅을 위한 추가 로그
    if (chunks.length === 0) {
        console.warn(`[Parse][${contentId}][${segmentId}][Grp ${groupIndex}] No chunks found. Raw result text: "${resultText.substring(0, 200)}..."`);
    }

    return chunks;
}

// === 텍스트를 마크다운으로 변환하는 함수 ===
async function convertTextToMarkdown(supabase: SupabaseClient, openai: OpenAI, contentId: string, text: string, additionalMemory?: string): Promise<{ success: boolean, error?: string }> {
    console.log(`[Markdown][${contentId}] Starting markdown conversion...`);

    try {
        // 1. 마크다운 변환 프롬프트 생성
        const markdownPrompt = generateMarkdownConversionPrompt(additionalMemory);
        console.log(`[Markdown][${contentId}] Generated markdown conversion prompt`);

        // 2. OpenAI API 호출
        const markdownCompletion = await openai.chat.completions.create({
            model: "gpt-4.1-nano-2025-04-14",
            messages: [
                { role: "system", content: markdownPrompt },
                { role: "user", content: text }
            ],
            temperature: 0,
            max_tokens: 15000,
        });

        const markdownText = markdownCompletion.choices[0]?.message?.content?.trim() || '';
        if (!markdownText) {
            console.error(`[Markdown][${contentId}] No markdown text generated`);
            return { success: false, error: 'No markdown text generated' };
        }

        console.log(`[Markdown][${contentId}] Successfully generated markdown text`);

        // 3. 마크다운 텍스트를 DB에 저장
        const { error: updateError } = await supabase
            .from('contents')
            .update({
                markdown_text: markdownText,
                processing_status: 'completed'
            })
            .eq('id', contentId);

        if (updateError) {
            console.error(`[Markdown][${contentId}] Failed to update markdown text:`, updateError);
            return { success: false, error: `Failed to update markdown text: ${updateError.message}` };
        }

        console.log(`[Markdown][${contentId}] Successfully saved markdown text to database`);
        return { success: true };
    } catch (error) {
        console.error(`[Markdown][${contentId}] Error in markdown conversion:`, error);
        return {
            success: false,
            error: `Error in markdown conversion: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

// === 메인 HTTP 핸들러 - 로직 일부 복원 ===
export const processTextPipeline = functions.http('processTextPipeline', async (req, res) => {
    // CORS, Method Check, Initialization Check (이전과 동일)
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    if (!isInitialized) {
        console.error("GCF Handler - Clients failed to initialize!");
        return res.status(500).send('Internal Server Error: Client initialization failed.');
    }

    let contentId: string | null = null;

    try {
        console.log("Request body:", JSON.stringify(req.body));

        const { contentId: reqContentId, text, userId, additionalMemory, title: reqTitle, processType = 'markdown' } = req.body;
        contentId = reqContentId as string;

        // 필수 파라미터 검증
        if (!contentId || !text || !userId) {
            console.error(`[Main] Missing required parameters: contentId=${contentId}, text=${!!text}, userId=${userId}`);
            return res.status(400).send('Missing required parameters: contentId, text, or userId');
        }

        // 제목 설정
        const title = reqTitle || 'Untitled Content';

        // 콘텐츠 상태 업데이트
        await updateContentStatus(supabase, contentId, 'received');

        // processType에 따라 다른 처리 로직 수행
        if (processType === 'markdown') {
            // 마크다운 변환 처리
            console.log(`[Main][${contentId}] Processing type: markdown conversion`);

            // 콘텐츠 상태 업데이트
            await updateContentStatus(supabase, contentId, 'title_generated');

            // 마크다운 변환 실행
            const markdownResult = await convertTextToMarkdown(supabase, openai, contentId, text, additionalMemory);

            if (!markdownResult.success) {
                console.error(`[Main][${contentId}] Markdown conversion failed:`, markdownResult.error);
                await updateContentStatus(supabase, contentId, 'failed');
                return res.status(500).send(`Markdown conversion failed: ${markdownResult.error}`);
            }

            // 성공 응답
            return res.status(200).send({
                success: true,
                contentId,
                processType: 'markdown'
            });
        } else if (processType === 'groups') {
            // 그룹 및 청크 생성 처리 로직
            console.log(`[Main][${contentId}] Processing type: groups and chunks`);

            // 그룹 생성 시작
            await updateContentStatus(supabase, contentId, 'groups_generating');

            // 전체 텍스트에서 직접 그룹 생성
            const { groups, error: groupsError } = await generateGroupsFromFullText(openai, text, additionalMemory);

            if (groupsError || groups.length === 0) {
                console.error(`[Main][${contentId}] Failed to generate groups:`, groupsError);
                await updateContentStatus(supabase, contentId, 'failed');
                return res.status(500).send(`Failed to generate groups: ${groupsError}`);
            }

            console.log(`[Main][${contentId}] Generated ${groups.length} groups`);

            // 그룹 저장
            const groupsToInsert = groups.map((group, index) => ({
                content_id: contentId,
                title: group.title,
                original_text: group.originalSource,
                position: index
            }));

            const { data: insertedGroups, error: insertError } = await supabase
                .from('content_groups')
                .insert(groupsToInsert)
                .select('id, title');

            if (insertError) {
                console.error(`[Main][${contentId}] Failed to insert groups:`, insertError);
                await updateContentStatus(supabase, contentId, 'failed');
                return res.status(500).send(`Failed to insert groups: ${insertError.message}`);
            }

            // 그룹 생성 완료
            await updateContentStatus(supabase, contentId, 'groups_generated');

            // 청크 생성 시작
            await updateContentStatus(supabase, contentId, 'chunks_generating');

            // 각 그룹에 대해 청크 생성 (병렬 처리)
            const chunkPromises = insertedGroups.map(async (group, index) => {
                try {
                    const groupInfo = groups[index];

                    // 청크 생성
                    const chunksPrompt = generateUnifiedChunksPrompt(additionalMemory);
                    const chunkCompletion = await openai.chat.completions.create({
                        model: "gpt-4.1-nano-2025-04-14",
                        messages: [
                            { role: "system", content: chunksPrompt },
                            { role: "user", content: groupInfo.originalSource }
                        ],
                        temperature: 0,
                        max_tokens: 10000,
                    });

                    const chunkResultText = chunkCompletion.choices[0]?.message?.content?.trim() || '';

                    // contentId가 null이 아님을 확인하는 타입 가드 추가
                    if (contentId === null) {
                        return { groupId: group.id, success: false, error: 'Content ID is null' };
                    }

                    const parsedChunks = parseChunkResult(chunkResultText, contentId, 'direct', index);

                    if (parsedChunks.length === 0) {
                        return { groupId: group.id, success: false, error: 'No chunks generated' };
                    }

                    // 청크 삽입
                    const chunksToInsert = parsedChunks.map((chunk, chunkIndex) => ({
                        group_id: group.id,
                        summary: chunk.front,
                        masked_text: chunk.back,
                        position: chunkIndex
                    }));

                    const { error: chunkInsertError } = await supabase
                        .from('content_chunks')
                        .insert(chunksToInsert);

                    if (chunkInsertError) {
                        return { groupId: group.id, success: false, error: chunkInsertError.message };
                    }

                    return { groupId: group.id, success: true, chunksCount: chunksToInsert.length };
                } catch (error) {
                    return {
                        groupId: group.id,
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    };
                }
            });

            // 모든 청크 생성 작업 완료 대기
            const chunkResults = await Promise.all(chunkPromises);

            // 청크 생성 결과 확인
            const successfulChunks = chunkResults.filter(result => result.success);

            if (successfulChunks.length === 0) {
                console.error(`[Main][${contentId}] All chunk generation failed`);
                await updateContentStatus(supabase, contentId, 'failed');
                return res.status(500).send('Failed to generate chunks for all groups');
            }

            // 최종 상태 업데이트
            await updateFinalContentStatus(supabase, contentId);

            // 성공 응답
            return res.status(200).send({
                success: true,
                contentId,
                groupsCount: insertedGroups.length,
                chunksCount: successfulChunks.length
            });
        } else {
            return res.status(400).send(`Invalid processType: ${processType}. Must be 'markdown' or 'groups'`);
        }
    } catch (error) {
        console.error(`[Main][${contentId}] Pipeline error:`, error);

        // 에러 발생 시 상태 업데이트 시도
        if (contentId) {
            try {
                await updateContentStatus(supabase, contentId, 'failed');
            } catch (statusError) {
                console.error(`[Main][${contentId}] Failed to update status to 'failed':`, statusError);
            }
        }

        res.status(500).json({
            error: `Pipeline failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
    }
});

// === 전체 텍스트에서 직접 그룹 생성하는 함수 ===
async function generateGroupsFromFullText(openai: OpenAI, fullText: string, additionalMemory?: string): Promise<{ groups: ParsedGroup[], error?: string }> {
    try {
        const groupsPrompt = generateGroupsPrompt(additionalMemory);

        // OpenAI API 호출하여 그룹 생성
        const groupCompletion = await openai.chat.completions.create({
            model: "gpt-4.1-nano-2025-04-14",
            messages: [
                { role: "system", content: groupsPrompt },
                { role: "user", content: fullText }
            ],
            temperature: 0,
            max_tokens: 10000,
        });

        const groupResultText = groupCompletion.choices[0]?.message?.content?.trim() || '';

        if (!groupResultText) {
            return { groups: [], error: 'No group result text generated' };
        }

        // 그룹 파싱
        const parsedGroups = parseGroupResult(groupResultText, 'direct', 'direct');
        if (parsedGroups.length === 0) {
            return { groups: [], error: 'No groups parsed from result text' };
        }

        // 생성된 그룹 이름 로그 출력
        console.log('[Groups] Generated group titles:');
        parsedGroups.forEach((group, index) => {
            console.log(`[Groups] Group ${index + 1}: ${group.title}`);
        });

        return { groups: parsedGroups };
    } catch (error) {
        return {
            groups: [],
            error: `Error generating groups: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

// contents 테이블 상태 업데이트 함수
async function updateContentStatus(supabase: SupabaseClient, contentId: string, status: 'received' | 'title_generated' | 'groups_generating' | 'groups_generated' | 'chunks_generating' | 'completed' | 'failed') {
    console.log(`[DB][${contentId}] Updating contents.processing_status to: ${status}`);
    const { error } = await supabase
        .from('contents')
        .update({ processing_status: status })
        .eq('id', contentId);
    if (error) {
        console.error(`[DB][${contentId}] Failed update contents status to ${status}:`, error.message);
        throw new Error(`DB contents status update failed: ${error.message}`);
    }
}

console.log("GCF Script - Bottom Level: Function registered.");