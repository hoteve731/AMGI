"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processSnippet = processSnippet;
const openai_1 = __importDefault(require("openai"));
const supabase_js_1 = require("@supabase/supabase-js");
// Supabase 클라이언트 초기화
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceRoleKey);
// OpenAI 클라이언트 초기화
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://api.openai.com/v1"
});
// 스니펫 생성 프롬프트 템플릿
const getSnippetPrompt = (headerText, snippetType, contentMarkdown = '', language = 'Korean', customQuery) => {
    // 언어 설정에 따른 프롬프트 조정
    let langPrefix = '';
    if (language === 'English') {
        langPrefix = 'Please generate the snippet in English.';
    }
    else if (language === 'Korean') {
        langPrefix = '스니펫을 한국어로 생성해주세요.';
    }
    else {
        langPrefix = `Please generate the snippet in ${language}.`;
    }
    const basePrompt = `Please generate a response for the following selected text: "${headerText}"\n\n`;
    // 원본 콘텐츠가 있는 경우 추가
    const contentContext = contentMarkdown
        ? `\n\nOriginal content for reference:\n${contentMarkdown}\n\nPlease use this original content to generate a more accurate and relevant response related to the selected text.`
        : '';
    let promptContent = '';
    switch (snippetType) {
        case 'summary':
            promptContent = 'Provide a concise summary of what the **selected text** refers to. If it\'s a concept, include its definition and key points. Use Markdown format, and highlight important terms in **bold**.';
            break;
        case 'question':
            promptContent = 'Generate a question and an answer related to the **selected text**. Use Markdown format. Write the question as an `##` header and the answer as plain text.';
            break;
        case 'explanation':
            promptContent = 'Provide a more detailed explanation of what the **selected text** refers to. Include examples if relevant. Use Markdown format. Highlight important terms in **bold**, and use lists or tables if appropriate.';
            break;
        case 'custom':
            promptContent = `User's question regarding the selected text ("${headerText}"): "${customQuery}"\n\nPlease answer this question in Markdown format. If the selected text provides context, use it in your answer.`;
            break;
        default: // A general, brief explanation
            promptContent = 'Provide a concise explanation of what the **selected text** refers to, in Markdown format.';
    }
    return `${langPrefix}\n\n${basePrompt}${promptContent}${contentContext}\n\nThe output text must be in ${language}.`;
};
// 태그 추출 프롬프트
const getTagsPrompt = (headerText, snippetContent, language = 'Korean') => {
    // 언어 설정에 따른 프롬프트 조정
    let langPrefix = '';
    if (language === 'English') {
        langPrefix = 'Please extract tags in English.';
    }
    else if (language === 'Korean') {
        langPrefix = '태그를 한국어로 추출해주세요.';
    }
    else {
        langPrefix = `Please extract tags in ${language}.`;
    }
    return `${langPrefix}\n\nThe following is the snippet content for "${headerText}":\n\n${snippetContent}\n\nExtract important keywords or tags from this content, up to 5. Each tag should be a single word or short phrase, separated by commas. Return only the tags.\n\nThe output text must be in ${language}.`;
};
async function processSnippet(data) {
    try {
        console.log('스니펫 생성 요청 받음:', JSON.stringify(data));
        const { userId, header_text, content_id, snippet_type, custom_query } = data;
        // 필수 필드 검증
        if (!userId || !header_text || !snippet_type) {
            throw new Error('필수 필드가 누락되었습니다.');
        }
        // 커스텀 타입인 경우 쿼리 필수
        if (snippet_type === 'custom' && !custom_query) {
            throw new Error('커스텀 스니펫에는 쿼리가 필요합니다.');
        }
        console.log('스니펫 생성 시작:', header_text);
        // 원본 콘텐츠 정보 가져오기
        let contentMarkdown = '';
        let language = 'Korean'; // 기본값
        if (content_id) {
            console.log(`콘텐츠 ID ${content_id}에 대한 정보 조회 중...`);
            const { data: contentData, error: contentError } = await supabase
                .from('contents')
                .select('markdown_text, language')
                .eq('id', content_id)
                .single();
            if (contentError) {
                console.error('콘텐츠 정보 조회 오류:', contentError);
                console.log('원본 콘텐츠 없이 스니펫 생성을 진행합니다.');
            }
            else if (contentData) {
                contentMarkdown = contentData.markdown_text || '';
                language = contentData.language || 'Korean';
                console.log(`콘텐츠 정보 조회 완료. 언어: ${language}, 마크다운 길이: ${contentMarkdown.length}자`);
                // 마크다운이 너무 길면 관련 부분만 추출 (최대 2000자)
                if (contentMarkdown.length > 2000) {
                    // 헤더 텍스트 주변의 관련 내용 찾기 시도
                    const headerIndex = contentMarkdown.indexOf(header_text);
                    if (headerIndex !== -1) {
                        // 헤더 텍스트 주변 2000자 추출 (앞뒤 균형 맞춤)
                        const startPos = Math.max(0, headerIndex - 1000);
                        const endPos = Math.min(contentMarkdown.length, headerIndex + 1000);
                        contentMarkdown = contentMarkdown.substring(startPos, endPos);
                        console.log('헤더 텍스트 주변 콘텐츠 추출 완료');
                    }
                    else {
                        // 헤더를 찾지 못한 경우 앞부분 2000자만 사용
                        contentMarkdown = contentMarkdown.substring(0, 2000);
                        console.log('콘텐츠 앞부분 2000자만 사용');
                    }
                }
            }
        }
        // 프롬프트 생성
        const prompt = getSnippetPrompt(header_text, snippet_type, contentMarkdown, language, custom_query);
        // OpenAI API 호출
        console.log('OpenAI API 호출 - 스니펫 생성');
        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-nano-2025-04-14",
            messages: [
                { role: "system", content: "당신은 학습 자료에서 중요한 개념을 추출하고 설명하는 전문가입니다. 마크다운 형식으로 깔끔하게 응답해주세요." },
                { role: "user", content: prompt }
            ],
            temperature: 0.2,
        });
        // 응답 텍스트 추출
        const snippetContent = completion.choices[0].message.content || '';
        console.log('스니펫 내용 생성 완료');
        // 태그 추출
        const tagsPrompt = getTagsPrompt(header_text, snippetContent, language);
        console.log('OpenAI API 호출 - 태그 추출');
        const tagsCompletion = await openai.chat.completions.create({
            model: "gpt-4.1-nano-2025-04-14",
            messages: [
                { role: "system", content: "당신은 텍스트에서 중요한 키워드나 태그를 추출하는 AI 어시스턴트입니다. 태그만 간결하게 반환해주세요." },
                { role: "user", content: tagsPrompt }
            ],
            temperature: 0.2,
        });
        const tagsText = tagsCompletion.choices[0].message.content || '';
        const tags = tagsText.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        console.log('태그 추출 완료:', tags);
        // 스니펫 DB에 저장
        console.log('스니펫 DB 저장 시작');
        const { data: snippet, error: snippetError } = await supabase
            .from('snippets')
            .insert({
            user_id: userId,
            content_id: content_id || null,
            header_text: header_text,
            snippet_type: snippet_type,
            custom_query: custom_query || null,
            markdown_content: snippetContent
        })
            .select()
            .single();
        if (snippetError) {
            console.error('스니펫 저장 오류:', snippetError);
            throw new Error('스니펫 저장 중 오류가 발생했습니다.');
        }
        console.log('스니펫 저장 완료, ID:', snippet.id);
        // 태그 처리
        console.log('태그 처리 시작');
        for (const tagName of tags) {
            // 기존 태그 확인 또는 새 태그 생성
            const { data: existingTag, error: tagError } = await supabase
                .from('snippet_tags')
                .select('*')
                .eq('name', tagName)
                .eq('user_id', userId)
                .maybeSingle();
            if (tagError) {
                console.error('태그 조회 중 오류:', tagError);
                continue;
            }
            let tagId;
            if (existingTag) {
                tagId = existingTag.id;
                console.log('기존 태그 사용:', tagName, tagId);
            }
            else {
                const { data: newTag, error: createTagError } = await supabase
                    .from('snippet_tags')
                    .insert({
                    name: tagName,
                    user_id: userId
                })
                    .select()
                    .single();
                if (createTagError) {
                    console.error('태그 생성 중 오류:', createTagError);
                    continue;
                }
                tagId = newTag.id;
                console.log('새 태그 생성:', tagName, tagId);
            }
            // 스니펫-태그 관계 생성
            const { error: relationError } = await supabase
                .from('snippet_tag_relations')
                .insert({
                snippet_id: snippet.id,
                tag_id: tagId
            });
            if (relationError) {
                console.error('스니펫-태그 관계 생성 중 오류:', relationError);
            }
        }
        console.log('태그 처리 완료');
        return { success: true, snippet };
    }
    catch (error) {
        console.error('스니펫 생성 처리 중 오류:', error);
        throw error;
    }
}
