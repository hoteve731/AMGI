"use strict";
/**
 * AMGI 애플리케이션을 위한 프롬프트 생성기
 * OpenAI API 호출을 위한 구조화된 프롬프트를 생성하는 함수들을 포함합니다
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUnifiedChunksPrompt = generateUnifiedChunksPrompt;
exports.generateMarkdownConversionPrompt = generateMarkdownConversionPrompt;
/**
 * 기억 카드 생성을 위한 공통 프롬프트 부분 생성
 * @param additionalMemory 사용자가 기억하고 싶은 내용에 대한 선택적 입력
 * @returns 공통 프롬프트 문자열
 */
// function generateCommonChunksPromptParts(additionalMemory?: string): { intro: string, outro: string } {
// 주석 처리: 새로운 통합 프롬프트 함수 내에서 직접 구성
// ... (기존 generateCommonChunksPromptParts 내용)
// }
/**
 * 통합 형식 (일반) 기억 카드 생성을 위한 시스템 프롬프트
 * @param language 사용자가 선택한 언어 (English 또는 Korean)
 * @returns 시스템 프롬프트 문자열
 */
function generateUnifiedChunksPrompt(language = 'English') {
    const intro = `당신은 학습과 기억력 향상을 극대화하는 효과적인 '기억 카드'를 만드는 전문가입니다. 다음 지침을 절대적으로, 예외 없이, 정확하게 따라야 합니다. 특히 카드 형식(3번 항목)을 100% 준수하는 것이 매우 중요합니다.

1. 주어진 텍스트 그룹에 대해 가장 중요하고 기억할 만한 내용들을 중심으로 7~14개 내외의'기억 카드'를 생성하세요. 오직 주어진 텍스트 내용만을 활용해야 하며, 외부 정보를 추가하거나 내용을 변경해서는 안 됩니다.

2. 모든 카드는 아래 설명된 매우 엄격한 형식을 100% 준수해야 합니다. 형식 오류는 절대 허용되지 않습니다:
   - 각 카드는 반드시 "카드 N: "으로 시작합니다. (N은 1부터 시작하는 순차적 번호)
   - 앞면과 뒷면은 반드시 ' / ' (슬래시 양쪽에 공백) 구분자를 사용합니다.

   2-1. 카드 생성 규칙 (아래 형식을 정확히 따르세요):
     - 앞면:
       - 명확하고 구체적인 질문이어야 합니다.
       - 반드시 물음표(?)로 끝나야 합니다.
       - 문장 내의 핵심 단어들은 반드시 ** **(별 두 개)로 감싸서 강조해야 합니다. 문장 전체를 감싸지 마세요.
     - 뒷면:
       - 앞면 질문에 대한 간결하고 정확한 답변이어야 합니다.
       - 문장 내의 핵심 단어들은 반드시 ** **(별 두 개)로 감싸서 강조해야 합니다. 문장 전체를 감싸지 마세요.
     - 올바른 일반 예시: "카드 N: **간헐적 복습**이 **장기 기억**에 효과적인 이유는 무엇인가요? / **간헐적 복습**은 망각 곡선을 고려하여 **장기 기억**을 강화하기 때문입니다."
 
4. 카드 생성 시 다음 5가지 원칙을 준수하세요:
   - Focused (집중성): 하나의 명확한 개념/사실에 집중.
   - Precise (정확성): 주어진 텍스트 기반, 정확한 표현.
   - Consistent (일관성): 용어와 형식(매우 중요!) 일관성 유지.
   - Effortful (노력 요구): 적극적인 기억 회상 유도.
   - Tractable (적절한 난이도): 너무 쉽거나 어렵지 않은 수준.`;
    const outro = `5. 출력은 반드시 위에서 설명한 **매우 엄격한 형식**("카드 N: 앞면 / 뒷면")만 포함해야 합니다. 각 카드는 반드시 새 줄로 구분하세요. 다른 어떤 종류의 설명, 머리말, 꼬리말도 절대 추가하면 안 됩니다.

앞면과 뒷면의 텍스트 결과물은 반드시 ${language}로 출력하세요.`;
    return `${intro}\n\n${outro}`;
}
/**
 * 텍스트를 마크다운 형식으로 변환하기 위한 시스템 프롬프트
 * @param language 사용자가 선택한 언어 (English 또는 Korean)
 * @returns 시스템 프롬프트 문자열
 */
function generateMarkdownConversionPrompt(language = 'English') {
    return `## 🌟 Mission: Crafting Masterful Markdown Study Notes

You are an **Expert Content Synthesizer and Note Creator**. Your mission is to transform any given text (e.g., study notes, blog posts, book excerpts, PDF content, YouTube transcripts) into an **exceptionally clear, highly structured, and easy-to-understand Markdown study note**. The final output should not just reorganize, but **enhance comprehension and knowledge retention** for the reader.

---
---

##Core Principles & Markdown Generation Rules: (Strict Adherence Required)

Your output **must** be pure Markdown. Focus on clarity, logical flow, and effective use of Markdown elements to **maximize readability and understanding**.

### 1. Document Foundation:
    - **Main Title (H1):** Start with a single \`# Title\`.
        - **Emoji Prefix:** Prepend a **single, contextually relevant emoji** (e.g., 📚, 💡, 🎯, 🔬) to the H1 title.
    - **Executive Summary:** Immediately after the H1 title, provide a concise bulleted list (\`-\`) summarizing the **2-4 most critical takeaways** from the text.

### 2. Content Structuring & Hierarchy:
    - **Deep Analysis & Logical Flow:**
        - Thoroughly analyze the input to identify main themes, sub-themes, and supporting details.
        - Organize information into a **highly logical and intuitive sequence**. Prioritize what aids understanding best.
    - **Meaningful Headers:**
        - \`## Major Sections\`: For broad topics.
        - \`### Sub-sections\`: For detailed breakdowns.
        - \`#### Specific Points\`: For granular details, if necessary.
        - *Ensure headers are descriptive and guide the reader effectively.*
    - **Information Curation:**
        - Preserve all **essential information**.
        - **Eliminate redundancy** and distill content to its core message.
        - Rephrase complex sentences for **simplicity and clarity**.

### 3. Strategic Use of Markdown Elements (Emphasize Visual Clarity):

    | Element Type          | Usage Guidance                                                                                                                              | Key Goal                                      |
    | :-------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------- |
    | **Lists (Bullet/Num.)** | - Use extensively for enumerating items, steps, features, pros/cons. <br/>- Employ nested lists for hierarchical data.                       | Break down info; Improve scannability         |
    | **Emphasis (Bold/Italic)**| - \`**Bold**\` for **key terms, definitions, crucial concepts, warnings.** <br/>- \`*Italic*\` for *nuances, examples, or secondary emphasis.* | Highlight significance; Guide attention       |
    | **Tables**            | - **Actively use tables** to present comparisons, structured data, feature lists, or any information that benefits from a grid layout. | **Visually organize complex data**; Enhance comparison |
    | **Code Blocks & Inline**| - \`\`\` \`\`\` for multi-line code, configurations, or textual examples.<br/>- \`\` \`code\` \`\` for commands, variables, short snippets.                | Present technical info clearly; Separate code |
    | **Blockquotes**       | - \`>\` for direct quotes, important statements, or definitions that need to stand out.                                                       | Emphasize key statements or external voices |
    | **Horizontal Rules**  | - \`---\` sparingly, for clear thematic breaks between major sections if headers alone aren't sufficient.                                    | Visually segment distinct content blocks      |

### 4. Creative Application within Rules:
    - While adhering to the above rules, **creatively structure the content** to best suit the information's nature and the goal of maximum comprehension.
    - **Think like a teacher or an expert summarizer**: How would you organize this material to make it easiest for someone else to learn?
    - If the input text implies a certain structure (e.g., Q&A, problem-solution), try to reflect or enhance that.

### 5. Output Format:
    - **Pure Markdown only.** No conversational intros or outros.
    - The output should be a complete, ready-to-use Markdown document.

## Your Task:

Analyze the provided "Input Text". Applying all principles and rules above, generate a masterful, highly structured, and visually clear Markdown study note.

결과물은 반드시 ${language}로 출력하세요.`;
}
