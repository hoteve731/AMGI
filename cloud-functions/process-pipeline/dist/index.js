"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// cloud-functions/process-pipeline/src/index.ts
const functions = __importStar(require("@google-cloud/functions-framework"));
const openai_1 = __importDefault(require("openai"));
const supabase_js_1 = require("@supabase/supabase-js");
const prompt_generator_1 = require("./prompt_generator");
console.log("GCF Script - Top Level: Starting execution..."); // 최상단 로그
// --- 클라이언트 초기화 복원 ---
let supabase;
let openai;
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
    supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceRoleKey);
    console.log("Initializing OpenAI client...");
    openai = new openai_1.default({ apiKey: openaiApiKey });
    isInitialized = true;
    console.log("Clients initialized successfully.");
}
catch (initError) {
    console.error("Failed to initialize clients:", initError);
}
// === 원래 Helper 함수 정의들 모두 복원 ===
// === 단일 세그먼트 처리 함수 ===
async function processSingleSegment(supabase, openai, segment) {
    var _a, _b, _c, _d, _e, _f;
    const { id: segmentId, content_id: contentId, segment_text: segmentText, position: segmentPosition, additionalMemory } = segment;
    console.log(`[Segment ${segmentPosition}][${segmentId}] Starting processing.`);
    try {
        // 1. 세그먼트 상태 업데이트: processing_groups
        await updateSegmentStatus(supabase, segmentId, 'processing_groups');
        // 2. 그룹 생성 (OpenAI)
        const groupsPrompt = (0, prompt_generator_1.generateGroupsPrompt)(additionalMemory);
        console.log(`[Segment ${segmentPosition}][${segmentId}] Generating groups...`);
        const groupCompletion = await openai.chat.completions.create({
            model: "gpt-4o-mini-2024-07-18",
            messages: [{ role: "system", content: groupsPrompt }, { role: "user", content: segmentText }],
            temperature: 0.2, max_tokens: 1500,
        });
        const groupResultText = ((_c = (_b = (_a = groupCompletion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || '';
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
        if (groupInsertError)
            throw new Error(`Failed to insert groups: ${groupInsertError.message}`);
        const insertedGroups = insertedGroupsData;
        if (!insertedGroups || insertedGroups.length !== parsedGroups.length)
            throw new Error(`Failed to retrieve IDs for all inserted groups.`);
        console.log(`[Segment ${segmentPosition}][${segmentId}] Inserted ${insertedGroups.length} groups.`);
        // 4. 세그먼트 상태 업데이트: processing_chunks
        await updateSegmentStatus(supabase, segmentId, 'processing_chunks');
        // 5. 청크 생성 및 저장 준비
        const allChunksToInsert = [];
        const chunksPrompt = (0, prompt_generator_1.generateUnifiedChunksPrompt)(additionalMemory);
        console.log(`[Segment ${segmentPosition}][${segmentId}] Generating chunks for ${insertedGroups.length} groups...`);
        for (let i = 0; i < parsedGroups.length; i++) {
            const currentParsedGroup = parsedGroups[i];
            const currentInsertedGroup = insertedGroups.find(g => g.title === currentParsedGroup.title);
            if (!currentInsertedGroup) {
                console.warn(`[Segment ${segmentPosition}][${segmentId}] Cannot find DB ID for parsed group: "${currentParsedGroup.title}". Skipping chunks.`);
                continue;
            }
            const currentGroupId = currentInsertedGroup.id;
            if (!currentParsedGroup.originalSource || currentParsedGroup.originalSource.trim().length < 10)
                continue;
            const chunkCompletion = await openai.chat.completions.create({
                model: "gpt-4o-mini-2024-07-18",
                messages: [{ role: "system", content: chunksPrompt }, { role: "user", content: currentParsedGroup.originalSource }],
                temperature: 0.1, max_tokens: 1000,
            });
            const chunkResultText = ((_f = (_e = (_d = chunkCompletion.choices[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content) === null || _f === void 0 ? void 0 : _f.trim()) || '';
            if (!chunkResultText)
                continue;
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
            if (chunkInsertError)
                throw new Error(`Failed to insert chunks: ${chunkInsertError.message}`);
            console.log(`[Segment ${segmentId}] Inserted ${allChunksToInsert.length} chunks.`);
        }
        // 7. 세그먼트 상태 업데이트: completed
        await updateSegmentStatus(supabase, segmentId, 'completed');
        console.log(`[Segment ${segmentPosition}][${segmentId}] Processing completed successfully.`);
        return { success: true, segmentId };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Segment ${segmentPosition}][${segmentId}] Processing failed:`, error);
        try {
            await updateSegmentStatus(supabase, segmentId, 'failed');
        }
        catch (statusError) {
            console.error(`[Segment ${segmentPosition}][${segmentId}] CRITICAL: Failed to update segment status to 'failed':`, statusError);
        }
        return { success: false, segmentId, error: errorMessage };
    }
}
// === 최종 콘텐츠 상태 업데이트 함수 ===
async function updateFinalContentStatus(supabase, contentId) {
    console.log(`[FinalStatus][${contentId}] Calculating final content status...`);
    try {
        const { data: segments, error } = await supabase
            .from('content_segments')
            .select('status')
            .eq('content_id', contentId);
        if (error)
            throw new Error(`Failed to fetch segment statuses: ${error.message}`);
        const total = segments.length;
        const completed = segments.filter((s) => s.status === 'completed').length;
        const failed = segments.filter((s) => s.status === 'failed').length;
        let finalStatus = 'failed';
        if (total === 0)
            finalStatus = 'completed';
        else if (completed === total)
            finalStatus = 'completed';
        else if (completed > 0)
            finalStatus = 'partially_completed';
        console.log(`[FinalStatus][${contentId}] Segments - Total: ${total}, Completed: ${completed}, Failed: ${failed}. Final status: ${finalStatus}`);
        await updateContentStatus(supabase, contentId, finalStatus);
        console.log(`[FinalStatus][${contentId}] Final content status updated.`);
    }
    catch (error) {
        console.error(`[FinalStatus][${contentId}] Error calculating or updating final status:`, error);
    }
}
// === 메인 HTTP 핸들러 - 로직 일부 복원 ===
functions.http('processPipeline', async (req, res) => {
    // CORS, Method Check, Initialization Check (이전과 동일)
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS')
        return res.status(204).send('');
    if (req.method !== 'POST')
        return res.status(405).send('Method Not Allowed');
    // 클라이언트 초기화 확인
    if (!isInitialized) {
        console.error("GCF Handler - Clients failed to initialize!");
        return res.status(500).send('Internal Server Error: Client initialization failed.');
    }
    let contentId = null;
    try {
        console.log("Request body:", JSON.stringify(req.body));
        const { contentId: reqContentId, text, userId, additionalMemory, title: reqTitle } = req.body;
        contentId = reqContentId;
        console.log(`Validating request parameters - contentId: ${!!contentId}, text: ${!!text}, userId: ${!!userId}, title: ${!!reqTitle}, additionalMemory: ${!!additionalMemory}`);
        if (!contentId || !text || !userId) {
            console.error(`Missing required parameters: contentId=${!!contentId}, text=${!!text}, userId=${!!userId}`);
            return res.status(400).json({ error: 'contentId, text, and userId required.' });
        }
        // title이 없는 경우를 위한 기본값 설정
        const title = reqTitle || "Untitled Content";
        console.log(`Using title: ${title}`);
        console.log(`[Main][${contentId}] Handler started. Using direct grouping approach.`);
        // --- p-limit 동적 import 추가 ---
        console.log(`[Main][${contentId}] Importing p-limit...`);
        let pLimit;
        try {
            pLimit = (await import('p-limit')).default;
            console.log(`[Main][${contentId}] p-limit imported successfully.`);
        }
        catch (importError) {
            console.error(`[Main][${contentId}] Failed to import p-limit:`, importError);
            throw new Error(`Failed to import p-limit: ${importError instanceof Error ? importError.message : 'Unknown error'}`);
        }
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
                    }
                    else {
                        console.log(`[Main][${contentId}] Successfully updated existing record.`);
                    }
                }
                else {
                    throw new Error(`Failed to insert initial content record: ${initialInsertError.message}`);
                }
            }
            else {
                console.log(`[Main][${contentId}] Initial record inserted successfully.`);
            }
        }
        catch (dbError) {
            console.error(`[Main][${contentId}] Database operation failed:`, dbError);
            throw new Error(`Database operation failed: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
        }
        // 1. 상태 업데이트: processing_groups
        await updateContentStatus(supabase, contentId, 'processing_groups');
        // 2. 전체 텍스트를 바로 그룹화 (세그멘테이션 없이)
        console.log(`[Main][${contentId}] Generating groups directly from full text...`);
        const { groups: parsedGroups, error: groupingError } = await generateGroupsFromFullText(openai, text, additionalMemory);
        if (groupingError) {
            console.error(`[Main][${contentId}] Error generating groups: ${groupingError}`);
            await updateContentStatus(supabase, contentId, 'failed');
            throw new Error(`Failed to generate groups: ${groupingError}`);
        }
        console.log(`[Main][${contentId}] Generated ${parsedGroups.length} groups.`);
        // 3. 그룹 저장 (DB Insert)
        console.log(`[Main][${contentId}] Inserting ${parsedGroups.length} groups...`);
        const groupsToInsert = parsedGroups.map((group, index) => ({
            content_id: contentId,
            title: group.title,
            original_text: group.originalSource,
            position: index
        }));
        const { data: insertedGroupsData, error: groupInsertError } = await supabase
            .from('content_groups')
            .insert(groupsToInsert)
            .select('id, title');
        if (groupInsertError) {
            console.error(`[Main][${contentId}] Failed to insert groups: ${groupInsertError.message}`);
            await updateContentStatus(supabase, contentId, 'failed');
            throw new Error(`Failed to insert groups: ${groupInsertError.message}`);
        }
        const insertedGroups = insertedGroupsData;
        if (!insertedGroups || insertedGroups.length !== parsedGroups.length) {
            console.error(`[Main][${contentId}] Failed to retrieve IDs for all inserted groups.`);
            await updateContentStatus(supabase, contentId, 'failed');
            throw new Error(`Failed to retrieve IDs for all inserted groups.`);
        }
        console.log(`[Main][${contentId}] Inserted ${insertedGroups.length} groups.`);
        // 4. 상태 업데이트: processing_chunks
        await updateContentStatus(supabase, contentId, 'processing_chunks');
        // 5. 병렬로 각 그룹에 대한 청크(기억 카드) 생성
        console.log(`[Main][${contentId}] Generating chunks for ${insertedGroups.length} groups...`);
        const limit = pLimit(8); // 최대 8개 동시 처리
        const chunksPrompt = (0, prompt_generator_1.generateUnifiedChunksPrompt)(additionalMemory);
        const chunkProcessingPromises = insertedGroups.map((group, index) => {
            return limit(async () => {
                var _a, _b, _c;
                try {
                    console.log(`[Main][${contentId}] Processing group ${index + 1}/${insertedGroups.length}: ${group.title}`);
                    const originalText = parsedGroups[index].originalSource;
                    // 청크 생성 API 호출 (기존 모델 유지)
                    const chunkCompletion = await openai.chat.completions.create({
                        model: "gpt-4o-mini-2024-07-18",
                        messages: [{ role: "system", content: chunksPrompt }, { role: "user", content: originalText }],
                        temperature: 0.1,
                        max_tokens: 1000,
                    });
                    const chunkResultText = ((_c = (_b = (_a = chunkCompletion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || '';
                    if (!chunkResultText) {
                        console.warn(`[Main][${contentId}] No chunks generated for group ${index + 1}.`);
                        return { groupId: group.id, chunks: [] };
                    }
                    // 청크 파싱
                    const parsedChunks = parseChunkResult(chunkResultText, contentId, 'direct', index + 1);
                    if (parsedChunks.length === 0) {
                        console.warn(`[Main][${contentId}] No chunks parsed for group ${index + 1}.`);
                        return { groupId: group.id, chunks: [] };
                    }
                    // 청크 데이터 준비
                    const chunksForThisGroup = parsedChunks.map((chunk, chunkIndex) => ({
                        group_id: group.id,
                        summary: chunk.front,
                        masked_text: chunk.back,
                        position: chunkIndex
                    }));
                    console.log(`[Main][${contentId}] Generated ${chunksForThisGroup.length} chunks for group ${index + 1}.`);
                    return { groupId: group.id, chunks: chunksForThisGroup };
                }
                catch (error) {
                    console.error(`[Main][${contentId}] Error processing group ${index + 1}:`, error);
                    return { groupId: group.id, chunks: [], error: error instanceof Error ? error.message : 'Unknown error' };
                }
            });
        });
        // 모든 청크 처리 완료 대기
        const chunkResults = await Promise.all(chunkProcessingPromises);
        // 모든 청크 데이터 수집
        const allChunksToInsert = chunkResults.flatMap(result => result.chunks);
        console.log(`[Main][${contentId}] Total chunks to insert: ${allChunksToInsert.length}`);
        // 청크 저장 (DB Insert)
        if (allChunksToInsert.length > 0) {
            console.log(`[Main][${contentId}] Inserting ${allChunksToInsert.length} chunks into content_chunks table...`);
            const { error: chunkInsertError } = await supabase.from('content_chunks').insert(allChunksToInsert);
            if (chunkInsertError) {
                console.error(`[Main][${contentId}] Failed to insert chunks: ${chunkInsertError.message}`);
                throw new Error(`Failed to insert chunks: ${chunkInsertError.message}`);
            }
            console.log(`[Main][${contentId}] Inserted ${allChunksToInsert.length} chunks.`);
        }
        // 6. 최종 상태 업데이트: completed
        await updateContentStatus(supabase, contentId, 'completed');
        console.log(`[Main][${contentId}] Pipeline completed.`);
        // 실제 파이프라인 완료 응답
        res.status(200).json({
            message: `Pipeline completed for ${contentId}. Groups: ${insertedGroups.length}, Chunks: ${allChunksToInsert.length}`
        });
    }
    catch (error) {
        console.error(`[Main][${contentId}] Pipeline error:`, error);
        // 에러 발생 시 상태 업데이트 시도
        if (contentId) {
            try {
                await updateContentStatus(supabase, contentId, 'failed');
            }
            catch (statusError) {
                console.error(`[Main][${contentId}] Failed to update status to 'failed':`, statusError);
            }
        }
        res.status(500).json({
            error: `Pipeline failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
    }
});
// === 전체 텍스트에서 직접 그룹 생성하는 함수 ===
async function generateGroupsFromFullText(openai, fullText, additionalMemory) {
    var _a, _b, _c;
    try {
        const groupsPrompt = (0, prompt_generator_1.generateGroupsPrompt)(additionalMemory);
        // OpenAI API 호출하여 그룹 생성 (기존 모델 유지)
        const groupCompletion = await openai.chat.completions.create({
            model: "gpt-4o-mini-2024-07-18", // 기존 모델 유지
            messages: [{ role: "system", content: groupsPrompt }, { role: "user", content: fullText }],
            temperature: 0.1, // 더 결정적인 응답을 위해 temperature 낮춤
            max_tokens: 3000, // 더 긴 응답 허용
        });
        const groupResultText = ((_c = (_b = (_a = groupCompletion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || '';
        if (!groupResultText) {
            return { groups: [], error: 'No group result text generated' };
        }
        // 그룹 파싱
        const parsedGroups = parseGroupResult(groupResultText, 'direct', 'direct');
        if (parsedGroups.length === 0) {
            return { groups: [], error: 'No groups parsed from result text' };
        }
        return { groups: parsedGroups };
    }
    catch (error) {
        return {
            groups: [],
            error: `Error generating groups: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}
// === 원래 Helper 함수 정의들 (updateContentStatus, updateSegmentStatus, parseGroupResult, parseChunkResult) === 
// contents 테이블 상태 업데이트 함수
async function updateContentStatus(supabase, contentId, status) {
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
async function updateSegmentStatus(supabase, segmentId, status) {
    console.log(`[DB][Seg ${segmentId}] Updating content_segments.status to: ${status}`);
    const updateData = { status: status };
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
function parseGroupResult(resultText, contentId, segmentId) {
    console.log(`[Parse][${contentId}][Seg ${segmentId}] Parsing group result (Length: ${resultText.length}).`);
    const groups = [];
    const groupRegex = /<그룹\s*(\d+)>[\s\n]*제목:\s*(.*?)\s*[\s\n]*오리지널\s*소스:\s*([\s\S]*?)(?=<그룹\s*\d+>|$)/gi;
    let match;
    while ((match = groupRegex.exec(resultText)) !== null) {
        const title = match[2].trim();
        const originalSource = match[3].trim();
        if (title && originalSource)
            groups.push({ title, originalSource });
        else
            console.warn(`[Parse][${contentId}][Seg ${segmentId}] Parsed group ${match[1]} but empty.`);
    }
    if (groups.length === 0 && resultText)
        console.warn(`[Parse][${contentId}][Seg ${segmentId}] No groups parsed via regex.`);
    console.log(`[Parse][${contentId}][Seg ${segmentId}] Parsed ${groups.length} groups.`);
    return groups;
}
// 청크 파싱 함수 
function parseChunkResult(resultText, contentId, segmentId, groupIndex) {
    console.log(`[Parse][${contentId}][Seg ${segmentId}][Grp ${groupIndex}] Parsing chunk result (Length: ${resultText.length}).`);
    const chunks = [];
    const chunkRegex = /카드\s*(\d+):\s*(.*?)\s*\/\s*(.*?)(?=\n*카드\s*\d+:|\s*$)/gi;
    let match;
    while ((match = chunkRegex.exec(resultText)) !== null) {
        const front = match[2].trim();
        const back = match[3].trim();
        if (front && back)
            chunks.push({ front, back });
        else
            console.warn(`[Parse][${contentId}][Seg ${segmentId}][Grp ${groupIndex}] Parsed chunk ${match[1]} but empty.`);
    }
    if (chunks.length === 0 && resultText)
        console.warn(`[Parse][${contentId}][Seg ${segmentId}][Grp ${groupIndex}] No chunks parsed via regex.`);
    console.log(`[Parse][${contentId}][Seg ${segmentId}][Grp ${groupIndex}] Parsed ${chunks.length} chunks.`);
    return chunks;
}
console.log("GCF Script - Bottom Level: Function registered.");
