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
    var _a, _b, _c;
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
            temperature: 0, max_tokens: 10000,
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
            var _a, _b, _c;
            try {
                const groupInfo = parsedGroups[index];
                if (!groupInfo) {
                    throw new Error(`Group info not found for index ${index}`);
                }
                // 청크 생성
                const chunksPrompt = (0, prompt_generator_1.generateUnifiedChunksPrompt)(additionalMemory);
                const chunkCompletion = await openai.chat.completions.create({
                    model: "gpt-4.1-mini-2025-04-14",
                    messages: [{ role: "system", content: chunksPrompt }, { role: "user", content: groupInfo.originalSource }],
                    temperature: 0, max_tokens: 10000,
                });
                const chunkResultText = ((_c = (_b = (_a = chunkCompletion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || '';
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
            }
            catch (error) {
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
    }
    catch (error) {
        console.error(`[Segment ${segmentPosition}][${segmentId}] Error processing segment:`, error);
        try {
            await updateSegmentStatus(supabase, segmentId, 'failed');
        }
        catch (statusError) {
            console.error(`[Segment ${segmentPosition}][${segmentId}] Failed to update status to 'failed':`, statusError);
        }
        return { success: false, segmentId, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
// === 최종 콘텐츠 상태 업데이트 함수 ===
async function updateFinalContentStatus(supabase, contentId) {
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
async function updateSegmentStatus(supabase, segmentId, status) {
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
function parseGroupResult(resultText, contentId, segmentId) {
    var _a, _b;
    console.log(`[Parse][${contentId}][${segmentId}] Parsing group result...`);
    const groups = [];
    const groupMatches = resultText.matchAll(/###\s*(.*?)\s*\n([\s\S]*?)(?=###|$)/g);
    for (const match of groupMatches) {
        const title = ((_a = match[1]) === null || _a === void 0 ? void 0 : _a.trim()) || '';
        const originalSource = ((_b = match[2]) === null || _b === void 0 ? void 0 : _b.trim()) || '';
        if (title && originalSource) {
            groups.push({ title, originalSource });
        }
    }
    console.log(`[Parse][${contentId}][${segmentId}] Parsed ${groups.length} groups.`);
    return groups;
}
// 청크 파싱 함수
function parseChunkResult(resultText, contentId, segmentId, groupIndex) {
    var _a, _b;
    console.log(`[Parse][${contentId}][${segmentId}][Grp ${groupIndex}] Parsing chunk result...`);
    const chunks = [];
    const chunkMatches = resultText.matchAll(/\*\*Q:\s*(.*?)\s*\*\*\s*\n\s*\*\*A:\s*([\s\S]*?)(?=\*\*Q:|\*\*A:|\s*$)/g);
    for (const match of chunkMatches) {
        const front = ((_a = match[1]) === null || _a === void 0 ? void 0 : _a.trim()) || '';
        const back = ((_b = match[2]) === null || _b === void 0 ? void 0 : _b.trim()) || '';
        if (front && back) {
            chunks.push({ front, back });
        }
    }
    console.log(`[Parse][${contentId}][${segmentId}][Grp ${groupIndex}] Parsed ${chunks.length} chunks.`);
    return chunks;
}
// === 텍스트를 마크다운으로 변환하는 함수 ===
async function convertTextToMarkdown(supabase, openai, contentId, text, additionalMemory) {
    var _a, _b, _c;
    console.log(`[Markdown][${contentId}] Starting markdown conversion...`);
    try {
        // 1. 마크다운 변환 프롬프트 생성
        const markdownPrompt = (0, prompt_generator_1.generateMarkdownConversionPrompt)(additionalMemory);
        console.log(`[Markdown][${contentId}] Generated markdown conversion prompt`);
        // 2. OpenAI API 호출
        const markdownCompletion = await openai.chat.completions.create({
            model: "gpt-4.1-mini-2025-04-14",
            messages: [
                { role: "system", content: markdownPrompt },
                { role: "user", content: text }
            ],
            temperature: 0,
            max_tokens: 15000,
        });
        const markdownText = ((_c = (_b = (_a = markdownCompletion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || '';
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
    }
    catch (error) {
        console.error(`[Markdown][${contentId}] Error in markdown conversion:`, error);
        return {
            success: false,
            error: `Error in markdown conversion: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}
// === 메인 HTTP 핸들러 - 로직 일부 복원 ===
functions.http('processTextPipeline', async (req, res) => {
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
    let contentId = null;
    try {
        console.log("Request body:", JSON.stringify(req.body));
        const { contentId: reqContentId, text, userId, additionalMemory, title: reqTitle, processType = 'markdown' } = req.body;
        contentId = reqContentId;
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
        }
        else if (processType === 'groups') {
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
                var _a, _b, _c;
                try {
                    const groupInfo = groups[index];
                    // 청크 생성
                    const chunksPrompt = (0, prompt_generator_1.generateUnifiedChunksPrompt)(additionalMemory);
                    const chunkCompletion = await openai.chat.completions.create({
                        model: "gpt-4.1-mini-2025-04-14",
                        messages: [
                            { role: "system", content: chunksPrompt },
                            { role: "user", content: groupInfo.originalSource }
                        ],
                        temperature: 0,
                        max_tokens: 10000,
                    });
                    const chunkResultText = ((_c = (_b = (_a = chunkCompletion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || '';
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
                }
                catch (error) {
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
        }
        else {
            return res.status(400).send(`Invalid processType: ${processType}. Must be 'markdown' or 'groups'`);
        }
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
        // OpenAI API 호출하여 그룹 생성
        const groupCompletion = await openai.chat.completions.create({
            model: "gpt-4.1-mini-2025-04-14",
            messages: [
                { role: "system", content: groupsPrompt },
                { role: "user", content: fullText }
            ],
            temperature: 0,
            max_tokens: 10000,
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
// contents 테이블 상태 업데이트 함수
async function updateContentStatus(supabase, contentId, status) {
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
