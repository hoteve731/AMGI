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
            model: "gpt-4.1-mini-2025-04-14",
            messages: [{ role: "system", content: groupsPrompt }, { role: "user", content: segmentText }],
            temperature: 0, max_tokens: 3000,
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
                model: "gpt-4.1-mini-2025-04-14",
                messages: [{ role: "system", content: chunksPrompt }, { role: "user", content: currentParsedGroup.originalSource }],
                temperature: 0, max_tokens: 3000,
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
    try {
        // 최종 상태 업데이트
        await updateContentStatus(supabase, contentId, 'completed');
        console.log(`[Main][${contentId}] Processing completed successfully.`);
    }
    catch (error) {
        console.error(`[Main][${contentId}] Failed to update final content status:`, error);
        throw error;
    }
}
// === 원래 Helper 함수 정의들 ===
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
// === 메인 HTTP 핸들러 - 로직 일부 복원 ===
functions.http('processTextPipeline', async (req, res) => {
    var _a, _b, _c;
    // CORS, Method Check, Initialization Check (이전과 동일)
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (!isInitialized) {
        console.error("GCF Handler - Clients failed to initialize!");
        return res.status(500).send('Internal Server Error: Client initialization failed.');
    }
    let contentId = null;
    try {
        console.log("Request body:", JSON.stringify(req.body));
        const { contentId: reqContentId, text, userId, additionalMemory, title: reqTitle } = req.body;
        contentId = reqContentId;
        // 필수 파라미터 검증
        if (!contentId) {
            console.error('[Main] Missing required parameter: contentId');
            return res.status(400).send('Bad Request: contentId is required');
        }
        if (!text) {
            console.error(`[Main][${contentId}] Missing required parameter: text`);
            return res.status(400).send('Bad Request: text is required');
        }
        if (!userId) {
            console.error(`[Main][${contentId}] Missing required parameter: userId`);
            return res.status(400).send('Bad Request: userId is required');
        }
        // 제목 설정 (요청에서 받거나 기본값 사용)
        const title = reqTitle || 'Untitled Content';
        // p-limit 패키지 가져오기 (동시성 제어용)
        let limit;
        try {
            const pLimit = await import('p-limit');
            limit = pLimit.default(3); // 최대 3개 동시 처리
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
                        title: title,
                        original_text: text,
                        processing_status: 'received',
                        chunks: [],
                        masked_chunks: [],
                        additional_memory: additionalMemory || ''
                    })
                        .eq('id', contentId);
                    if (updateError) {
                        console.error(`[Main][${contentId}] Failed to update existing record:`, updateError);
                        throw new Error(`Failed to update existing content record: ${updateError.message}`);
                    }
                    else {
                        console.log(`[Main][${contentId}] Existing record updated successfully.`);
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
        // 제목 생성 완료 상태 업데이트
        await updateContentStatus(supabase, contentId, 'title_generated');
        // === 그룹 생성 ===
        console.log(`[Main][${contentId}] Starting group generation...`);
        await updateContentStatus(supabase, contentId, 'groups_generating');
        // 그룹 생성 로직
        const groupsPrompt = (0, prompt_generator_1.generateGroupsPrompt)(additionalMemory);
        const groupCompletion = await openai.chat.completions.create({
            model: "gpt-4.1-mini-2025-04-14",
            messages: [
                { role: "system", content: groupsPrompt },
                { role: "user", content: text }
            ],
            temperature: 0,
            max_tokens: 3000,
        });
        const groupResultText = ((_c = (_b = (_a = groupCompletion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || '';
        const parsedGroups = parseGroupResult(groupResultText, contentId, 'direct');
        if (parsedGroups.length === 0) {
            console.error(`[Main][${contentId}] No groups generated or parsed.`);
            await updateContentStatus(supabase, contentId, 'failed');
            return res.status(500).send('Failed to generate groups');
        }
        console.log(`[Main][${contentId}] Generated ${parsedGroups.length} groups.`);
        // 그룹 저장
        const groupsToInsert = parsedGroups.map((group, index) => ({
            content_id: contentId,
            title: group.title,
            original_text: group.originalSource,
            position: index
        }));
        console.log(`[Main][${contentId}] Inserting ${groupsToInsert.length} groups...`);
        // 그룹 삽입 함수 (재시도 로직 포함)
        const insertGroups = async () => {
            let retryCount = 0;
            const maxRetries = 3;
            let lastError = null;
            while (retryCount < maxRetries) {
                try {
                    const { data: insertedGroups, error: groupInsertError } = await supabase
                        .from('content_groups')
                        .insert(groupsToInsert)
                        .select('id, title');
                    if (groupInsertError) {
                        throw groupInsertError;
                    }
                    console.log(`[Main][${contentId}] Successfully inserted ${insertedGroups.length} groups.`);
                    return insertedGroups;
                }
                catch (error) {
                    lastError = error;
                    retryCount++;
                    console.error(`[Main][${contentId}] Group insertion attempt ${retryCount} failed:`, error);
                    // 지수 백오프
                    const delay = Math.pow(2, retryCount) * 500; // 500ms, 1s, 2s
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            throw new Error(`Failed to insert groups after ${maxRetries} attempts: ${lastError}`);
        };
        // 그룹 삽입 실행
        const insertedGroups = await insertGroups();
        // 그룹 생성 완료 상태 업데이트
        await updateContentStatus(supabase, contentId, 'groups_generated');
        // === 청크 생성 ===
        console.log(`[Main][${contentId}] Starting chunk generation...`);
        await updateContentStatus(supabase, contentId, 'chunks_generating');
        // 각 그룹에 대해 청크 생성 (병렬 처리)
        const chunkGenerationPromises = insertedGroups.map((group, index) => {
            return limit(async () => {
                var _a, _b, _c;
                try {
                    console.log(`[Main][${contentId}][Group ${index}] Generating chunks for group: ${group.title}`);
                    // 해당 그룹의 원본 텍스트 가져오기
                    const groupInfo = parsedGroups[index];
                    if (!groupInfo) {
                        throw new Error(`Group info not found for index ${index}`);
                    }
                    // 청크 생성 프롬프트
                    const chunksPrompt = (0, prompt_generator_1.generateUnifiedChunksPrompt)(additionalMemory);
                    // 청크 생성 API 호출
                    const chunkCompletion = await openai.chat.completions.create({
                        model: "gpt-4.1-mini-2025-04-14",
                        messages: [
                            { role: "system", content: chunksPrompt },
                            { role: "user", content: groupInfo.originalSource }
                        ],
                        temperature: 0,
                        max_tokens: 3000,
                    });
                    const chunkResultText = ((_c = (_b = (_a = chunkCompletion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || '';
                    const parsedChunks = parseChunkResult(chunkResultText, contentId, 'direct', index);
                    if (parsedChunks.length === 0) {
                        console.warn(`[Main][${contentId}][Group ${index}] No chunks generated for group.`);
                        return { groupId: group.id, success: false, chunksCount: 0 };
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
                        console.error(`[Main][${contentId}][Group ${index}] Failed to insert chunks:`, chunkInsertError);
                        return { groupId: group.id, success: false, chunksCount: 0, error: chunkInsertError };
                    }
                    console.log(`[Main][${contentId}][Group ${index}] Successfully inserted ${chunksToInsert.length} chunks.`);
                    return { groupId: group.id, success: true, chunksCount: chunksToInsert.length };
                }
                catch (error) {
                    console.error(`[Main][${contentId}][Group ${index}] Error generating chunks:`, error);
                    return { groupId: group.id, success: false, error };
                }
            });
        });
        // 모든 청크 생성 작업 완료 대기
        const chunkResults = await Promise.all(chunkGenerationPromises);
        // 청크 생성 결과 확인
        const successfulChunks = chunkResults.filter(result => result.success);
        const totalChunksCount = chunkResults.reduce((sum, result) => sum + (result.chunksCount || 0), 0);
        console.log(`[Main][${contentId}] Chunk generation complete: ${successfulChunks.length}/${chunkResults.length} groups successful, total ${totalChunksCount} chunks.`);
        // 모든 그룹에 대해 청크 생성이 실패한 경우
        if (successfulChunks.length === 0) {
            console.error(`[Main][${contentId}] All chunk generation failed.`);
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
            chunksCount: totalChunksCount
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
            model: "gpt-4.1-mini-2025-04-14", // 기존 모델 유지
            messages: [{ role: "system", content: groupsPrompt }, { role: "user", content: fullText }],
            temperature: 0,
            max_tokens: 3500, // 더 긴 응답 허용
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
// === 원래 Helper 함수 정의들 ===
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
console.log("GCF Script - Bottom Level: Function registered.");
