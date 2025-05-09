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
exports.processSnippetCreation = exports.processAudioTranscription = exports.processTextPipeline = void 0;
// cloud-functions/process-pipeline/src/index.ts
const functions = __importStar(require("@google-cloud/functions-framework"));
const openai_1 = __importDefault(require("openai"));
const supabase_js_1 = require("@supabase/supabase-js");
const prompt_generator_1 = require("./prompt_generator");
const audio_processor_1 = require("./audio_processor");
const os = __importStar(require("os"));
const express_fileupload_1 = __importDefault(require("express-fileupload"));
const snippet_processor_1 = require("./snippet_processor");
// @types/express-fileupload 패키지가 이미 Express.Request에 files 속성을 정의하고 있으므로
// 별도의 타입 확장이 필요하지 않습니다.
console.log("GCF Script - Top Level: Starting execution..."); // 최상단 로그
// --- 클라이언트 초기화 복원 ---
let supabase;
let openai;
let isInitialized = false;
// 클라이언트 초기화 함수
function initializeClients() {
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
    console.log("Clients initialized successfully");
}
try {
    initializeClients();
}
catch (initError) {
    console.error("Failed to initialize clients:", initError);
}
// === 원래 Helper 함수 정의들 모두 복원 ===
// === 단일 세그먼트 처리 함수 ===
async function processSingleSegment(supabase, openai, segment) {
    var _a, _b, _c;
    const { id: segmentId, content_id: contentId, segment_text: segmentText, position: segmentPosition, additionalMemory, language = 'English' } = segment;
    console.log(`[Segment ${segmentPosition}][${segmentId}] Starting processing (simplified) with language: ${language}.`);
    try {
        // 1. 세그먼트 상태 업데이트: processing_groups
        await updateSegmentStatus(supabase, segmentId, 'processing_groups');
        // 2. 단일 그룹 직접 생성 (OpenAI API 호출 없음)
        console.log(`[Segment ${segmentPosition}][${segmentId}] Creating single group directly...`);
        // 3. 그룹 저장 (DB Insert)
        console.log(`[Segment ${segmentPosition}][${segmentId}] Inserting single group...`);
        const groupToInsert = {
            content_id: contentId,
            title: '', // 제목 필드는 비워둠
            original_text: segmentText, // 세그먼트 텍스트를 그대로 사용
            segment_position: segmentPosition,
            position: 0 // 단일 그룹이므로 position은 0
        };
        // 그룹 삽입 실행
        const { data: insertedGroups, error: groupInsertError } = await supabase
            .from('content_groups')
            .insert([groupToInsert])
            .select('id, title');
        if (groupInsertError) {
            console.error(`[Segment ${segmentPosition}][${segmentId}] Failed to insert group:`, groupInsertError);
            await updateSegmentStatus(supabase, segmentId, 'failed');
            return { success: false, segmentId, error: `Failed to insert group: ${groupInsertError.message}` };
        }
        if (!insertedGroups || insertedGroups.length === 0) {
            console.error(`[Segment ${segmentPosition}][${segmentId}] No group was inserted.`);
            await updateSegmentStatus(supabase, segmentId, 'failed');
            return { success: false, segmentId, error: 'No group was inserted' };
        }
        const insertedGroup = insertedGroups[0];
        console.log(`[Segment ${segmentPosition}][${segmentId}] Successfully inserted single group with ID: ${insertedGroup.id}`);
        // 4. 세그먼트 상태 업데이트: processing_chunks
        await updateSegmentStatus(supabase, segmentId, 'processing_chunks');
        // 5. 청크 생성
        console.log(`[Segment ${segmentPosition}][${segmentId}] Generating chunks for single group...`);
        try {
            // 청크 생성 (여전히 OpenAI API 사용)
            const chunksPrompt = (0, prompt_generator_1.generateUnifiedChunksPrompt)(language);
            const chunkCompletion = await openai.chat.completions.create({
                model: "gpt-4.1-nano-2025-04-14",
                messages: [{ role: "system", content: chunksPrompt }, { role: "user", content: segmentText }],
                temperature: 0, max_tokens: 10000,
            });
            const chunkResultText = ((_c = (_b = (_a = chunkCompletion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || '';
            const parsedChunks = parseChunkResult(chunkResultText, contentId, segmentId, 0);
            if (parsedChunks.length === 0) {
                console.warn(`[Segment ${segmentPosition}][${segmentId}] No chunks generated.`);
                await updateSegmentStatus(supabase, segmentId, 'completed');
                return { success: true, segmentId };
            }
            // 청크 삽입
            const chunksToInsert = parsedChunks.map((chunk, chunkIndex) => ({
                group_id: insertedGroup.id,
                summary: chunk.front,
                masked_text: chunk.back,
                position: chunkIndex
            }));
            const { error: chunkInsertError } = await supabase
                .from('content_chunks')
                .insert(chunksToInsert);
            if (chunkInsertError) {
                console.error(`[Segment ${segmentPosition}][${segmentId}] Failed to insert chunks:`, chunkInsertError);
                await updateSegmentStatus(supabase, segmentId, 'failed');
                return { success: false, segmentId, error: `Failed to insert chunks: ${chunkInsertError.message}` };
            }
            console.log(`[Segment ${segmentPosition}][${segmentId}] Successfully inserted ${chunksToInsert.length} chunks.`);
        }
        catch (chunkError) {
            console.error(`[Segment ${segmentPosition}][${segmentId}] Error generating chunks:`, chunkError);
            await updateSegmentStatus(supabase, segmentId, 'failed');
            return { success: false, segmentId, error: `Failed to generate chunks: ${chunkError instanceof Error ? chunkError.message : 'Unknown error'}` };
        }
        // 6. 세그먼트 상태 업데이트: completed
        await updateSegmentStatus(supabase, segmentId, 'completed');
        return { success: true, segmentId };
    }
    catch (error) {
        console.error(`[Segment ${segmentPosition}][${segmentId}] Processing error:`, error);
        await updateSegmentStatus(supabase, segmentId, 'failed');
        return { success: false, segmentId, error: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
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
    // 새로운 정규식 패턴: <그룹 N> 형식을 찾고, 그 다음에 제목과 오리지널 소스를 추출
    const groupPattern = /<그룹\s*\d+>\s*제목:\s*(.*?)(?:\s*\n|\r\n)오리지널\s*소스:\s*([\s\S]*?)(?=<그룹|$)/gi;
    const matches = Array.from(resultText.matchAll(groupPattern));
    for (const match of matches) {
        const title = ((_a = match[1]) === null || _a === void 0 ? void 0 : _a.trim()) || '';
        const originalSource = ((_b = match[2]) === null || _b === void 0 ? void 0 : _b.trim()) || '';
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
function parseChunkResult(resultText, contentId, segmentId, groupIndex) {
    var _a, _b;
    console.log(`[Parse][${contentId}][${segmentId}][Grp ${groupIndex}] Parsing chunk result...`);
    const chunks = [];
    // 새로운 정규식 패턴: "카드 N: 앞면 / 뒷면" 형식을 찾음
    const chunkPattern = /카드\s*\d+\s*:\s*(.*?)\s*\/\s*([\s\S]*?)(?=카드\s*\d+\s*:|$)/gi;
    const matches = Array.from(resultText.matchAll(chunkPattern));
    for (const match of matches) {
        const front = ((_a = match[1]) === null || _a === void 0 ? void 0 : _a.trim()) || '';
        const back = ((_b = match[2]) === null || _b === void 0 ? void 0 : _b.trim()) || '';
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
async function convertTextToMarkdown(supabase, openai, contentId, text, language = 'English') {
    var _a, _b, _c;
    console.log(`[Markdown][${contentId}] Starting markdown conversion with language: ${language}...`);
    try {
        // 1. 마크다운 변환 프롬프트 생성
        const markdownPrompt = (0, prompt_generator_1.generateMarkdownConversionPrompt)(language);
        console.log(`[Markdown][${contentId}] Generated markdown conversion prompt`);
        // 2. OpenAI API 호출
        const markdownCompletion = await openai.chat.completions.create({
            model: "gpt-4.1-nano-2025-04-14",
            messages: [
                { role: "system", content: markdownPrompt },
                { role: "user", content: text }
            ],
            temperature: 0.1,
            max_tokens: 20000,
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
exports.processTextPipeline = functions.http('processTextPipeline', async (req, res) => {
    var _a, _b, _c;
    // CORS, Method Check, Initialization Check (이전과 동일)
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    // OPTIONS 요청 처리
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    // POST 요청 아닌 경우 오류 반환
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    // 초기화 확인
    if (!isInitialized) {
        try {
            console.log("Initializing clients...");
            initializeClients();
        }
        catch (error) {
            console.error("Initialization error:", error);
            res.status(500).send('Server configuration error');
            return;
        }
    }
    let contentId = '';
    try {
        console.log("Request body:", JSON.stringify(req.body));
        const { contentId: reqContentId, text, userId, additionalMemory, title: reqTitle, processType = 'markdown', language = 'English' } = req.body;
        contentId = reqContentId;
        // processType에 따라 다른 처리 로직 실행
        if (processType === 'markdown') {
            // 마크다운 변환 처리 로직 (기존과 동일)
            console.log(`[Main][${contentId}] Processing type: markdown conversion`);
            // 콘텐츠 상태 업데이트
            await updateContentStatus(supabase, contentId, 'received');
            // 마크다운 변환 실행
            const markdownResult = await convertTextToMarkdown(supabase, openai, contentId, text, language);
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
            // 그룹 및 청크 생성 처리 로직 (기존과 동일)
            console.log(`[Main][${contentId}] Processing type: groups and chunks (simplified)`);
            // 콘텐츠 마크다운 텍스트와 언어 설정 가져오기
            const { data: contentData, error: contentError } = await supabase
                .from('contents')
                .select('markdown_text, language')
                .eq('id', contentId)
                .single();
            if (contentError || !(contentData === null || contentData === void 0 ? void 0 : contentData.markdown_text)) {
                console.error(`[Main][${contentId}] Failed to fetch markdown text:`, contentError);
                await updateContentStatus(supabase, contentId, 'failed');
                return res.status(500).send('Failed to fetch markdown text');
            }
            const markdownText = contentData.markdown_text;
            // 저장된 language 값을 사용하거나 기본값 사용
            const contentLanguage = contentData.language || language;
            console.log(`[Main][${contentId}] Retrieved markdown text (length: ${markdownText.length}), language: ${contentLanguage}`);
            // 단일 그룹 생성 (그룹 분할 없음)
            await updateContentStatus(supabase, contentId, 'groups_generating');
            console.log(`[Main][${contentId}] Creating single group with full markdown text`);
            // 단일 그룹 삽입
            const { data: insertedGroup, error: insertError } = await supabase
                .from('content_groups')
                .insert([{
                    content_id: contentId,
                    title: '', // 타이틀 사용하지 않음
                    original_text: markdownText, // 마크다운 텍스트 그대로 사용
                    position: 0 // 단일 그룹이므로 position은 0
                }])
                .select('id')
                .single();
            if (insertError || !insertedGroup) {
                console.error(`[Main][${contentId}] Failed to insert group:`, insertError);
                await updateContentStatus(supabase, contentId, 'failed');
                return res.status(500).send('Failed to insert group');
            }
            console.log(`[Main][${contentId}] Single group created with ID: ${insertedGroup.id}`);
            await updateContentStatus(supabase, contentId, 'groups_generated');
            // 청크 생성 시작
            await updateContentStatus(supabase, contentId, 'chunks_generating');
            console.log(`[Main][${contentId}] Generating chunks for the single group`);
            // 단일 그룹에 대한 청크 생성
            try {
                const chunksPrompt = (0, prompt_generator_1.generateUnifiedChunksPrompt)(contentLanguage);
                const chunkCompletion = await openai.chat.completions.create({
                    model: "gpt-4.1-nano-2025-04-14",
                    messages: [
                        { role: "system", content: chunksPrompt },
                        { role: "user", content: markdownText }
                    ],
                    temperature: 0,
                    max_tokens: 10000,
                });
                const chunkResultText = ((_c = (_b = (_a = chunkCompletion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || '';
                if (!chunkResultText) {
                    throw new Error('No chunk result text generated');
                }
                // 청크 파싱
                const parsedChunks = parseChunkResult(chunkResultText, contentId, 'direct', 0);
                if (parsedChunks.length === 0) {
                    throw new Error('No chunks parsed from result text');
                }
                console.log(`[Main][${contentId}] Parsed ${parsedChunks.length} chunks`);
                // 청크 삽입
                const chunksToInsert = parsedChunks.map((chunk, index) => ({
                    group_id: insertedGroup.id,
                    summary: chunk.front,
                    masked_text: chunk.back,
                    position: index // position 필드 사용 (order 대신)
                }));
                const { error: chunksInsertError } = await supabase
                    .from('content_chunks')
                    .insert(chunksToInsert);
                if (chunksInsertError) {
                    throw new Error(`Failed to insert chunks: ${chunksInsertError.message}`);
                }
                console.log(`[Main][${contentId}] Successfully inserted ${chunksToInsert.length} chunks`);
            }
            catch (chunkError) {
                console.error(`[Main][${contentId}] Error generating chunks:`, chunkError);
                await updateContentStatus(supabase, contentId, 'failed');
                return res.status(500).send(`Failed to generate chunks: ${chunkError instanceof Error ? chunkError.message : 'Unknown error'}`);
            }
            // 최종 상태 업데이트
            await updateFinalContentStatus(supabase, contentId);
            // 성공 응답
            return res.status(200).send({
                success: true,
                contentId,
                groupsCount: 1, // 항상 1개의 그룹
                chunksCount: 0 // 실제 청크 수는 계산하지 않음 (간소화)
            });
        }
        else if (processType === 'snippet') {
            // 스니펫 생성 처리 로직
            console.log(`[Main] Processing type: snippet creation`);
            // 필수 필드 검증
            const { userId, header_text, snippet_type } = req.body;
            if (!userId || !header_text || !snippet_type) {
                return res.status(400).send({
                    success: false,
                    error: '필수 필드가 누락되었습니다. userId, header_text, snippet_type이 필요합니다.'
                });
            }
            // 스니펫 처리 함수 호출
            const result = await (0, snippet_processor_1.processSnippet)(req.body);
            // 성공 응답
            return res.status(200).send(result);
        }
        else {
            return res.status(400).send(`Invalid processType: ${processType}. Must be 'markdown', 'groups', or 'snippet'`);
        }
    }
    catch (error) {
        console.error(`[Main][${contentId}] Pipeline error:`, error);
        // 에러 발생 시 상태 업데이트 시도
        if (contentId) {
            try {
                await updateContentStatus(supabase, contentId, 'failed');
            }
            catch (updateError) {
                console.error(`[Main][${contentId}] Failed to update content status:`, updateError);
            }
        }
        return res.status(500).send({
            success: false,
            error: error.message || 'An error occurred during processing'
        });
    }
});
// === contents 테이블 상태 업데이트 함수 ===
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
// === 오디오 트랜스크립션 엔드포인트 ===
exports.processAudioTranscription = functions.http('processAudioTranscription', async (req, res) => {
    var _a;
    // CORS 설정
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Content-Length');
    // OPTIONS 요청 처리
    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }
    // POST 요청만 허용
    if (req.method !== 'POST') {
        return res.status(405).send({ success: false, error: 'Method Not Allowed' });
    }
    // 클라이언트 초기화 확인
    if (!isInitialized) {
        console.error('Clients not initialized. Cannot process request.');
        return res.status(500).send({ success: false, error: 'Server configuration error' });
    }
    // 파일 업로드 미들웨어 설정
    const fileMiddleware = (0, express_fileupload_1.default)({
        limits: { fileSize: 75 * 1024 * 1024 }, // 75MB 제한
        abortOnLimit: true,
        useTempFiles: true,
        tempFileDir: os.tmpdir(),
        debug: true
    });
    // 미들웨어 적용
    await new Promise((resolve, reject) => {
        fileMiddleware(req, res, (err) => {
            if (err) {
                console.error('File upload middleware error:', err);
                reject(err);
            }
            else {
                resolve();
            }
        });
    }).catch(err => {
        return res.status(400).send({
            success: false,
            error: `File upload error: ${err.message || 'Unknown error'}`
        });
    });
    let contentId = '';
    try {
        console.log("Audio transcription request received:", req.headers['content-type']);
        // multipart/form-data 요청 확인
        if (!((_a = req.headers['content-type']) === null || _a === void 0 ? void 0 : _a.includes('multipart/form-data'))) {
            return res.status(400).send('Invalid content type. Expected multipart/form-data');
        }
        // 요청 데이터 파싱
        const { userId, language = 'English', contentId: reqContentId } = req.body;
        contentId = reqContentId;
        if (!userId) {
            return res.status(400).send('Missing required parameter: userId');
        }
        if (!req.files || !req.files.file) {
            return res.status(400).send('No audio file provided');
        }
        // express-fileupload에서는 파일이 단일 파일이거나 배열일 수 있음
        const fileObj = req.files.file;
        // 단일 파일인지 배열인지 확인
        const file = Array.isArray(fileObj) ? fileObj[0] : fileObj;
        // express-fileupload의 속성 이름 사용
        const fileName = file.name || 'audio-file';
        const fileType = file.mimetype || 'audio/mpeg';
        const fileBuffer = file.data; // buffer 대신 data 사용
        console.log(`[AudioTranscription][${contentId}] Processing file: ${fileName}, size: ${fileBuffer.length} bytes, type: ${fileType}`);
        // 오디오 트랜스크립션 수행
        const result = await (0, audio_processor_1.transcribeAudio)(supabase, fileBuffer, fileName, fileType, language, userId);
        if (!result.success) {
            console.error(`[AudioTranscription][${contentId}] Transcription failed:`, result.error);
            // 오류가 있지만 사용자에게 보여줄 텍스트가 있는 경우 (예: 파일이 너무 긴 경우)
            if (result.transcription) {
                return res.status(200).send({
                    success: true,
                    transcription: result.transcription,
                    warning: result.error
                });
            }
            return res.status(500).send({
                success: false,
                error: result.error || 'Unknown error during transcription'
            });
        }
        // 성공 응답
        return res.status(200).send({
            success: true,
            transcription: result.transcription,
            language_code: result.language_code
        });
    }
    catch (error) {
        console.error(`[AudioTranscription][${contentId}] Error:`, error);
        return res.status(500).send({
            success: false,
            error: error.message || 'Unknown server error'
        });
    }
});
// === 스니펫 생성 엔드포인트 ===
exports.processSnippetCreation = functions.http('processSnippetCreation', async (req, res) => {
    // CORS 설정
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    // OPTIONS 요청 처리
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    // POST 요청 아닌 경우 오류 반환
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    // 초기화 확인
    if (!isInitialized) {
        try {
            console.log("Initializing clients for snippet creation...");
            initializeClients();
        }
        catch (error) {
            console.error("Initialization error:", error);
            res.status(500).send('Server configuration error');
            return;
        }
    }
    console.log("Processing snippet creation request");
    try {
        // 요청 본문 로깅
        console.log("Request body:", JSON.stringify(req.body));
        // 필수 필드 검증
        const { userId, header_text, snippet_type } = req.body;
        if (!userId || !header_text || !snippet_type) {
            return res.status(400).send({
                success: false,
                error: '필수 필드가 누락되었습니다. userId, header_text, snippet_type이 필요합니다.'
            });
        }
        // 스니펫 처리 함수 호출
        const result = await (0, snippet_processor_1.processSnippet)(req.body);
        // 성공 응답
        return res.status(200).send(result);
    }
    catch (error) {
        console.error("Snippet creation error:", error);
        // 오류 응답
        return res.status(500).send({
            success: false,
            error: error.message || '스니펫 생성 중 오류가 발생했습니다.'
        });
    }
});
console.log("GCF Script - Bottom Level: Functions registered.");
