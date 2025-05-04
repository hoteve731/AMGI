import { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import asyncRetry from 'async-retry';
// 기존 프롬프트 생성 함수들 임포트
import { generateGroupsPrompt, generateUnifiedChunksPrompt /* generateNormalChunksPrompt, generateClozeChunksPrompt */ } from '@/prompt_generator';
import pLimit from 'p-limit'; // 세그먼트 내 청크 생성 병렬 처리를 위해 추가

// --- 인터페이스 정의 --- (함수 외부, 파일 상단으로 이동 또는 유지)
interface SegmentToProcess {
    id: string;
    content_id: string;
    segment_text: string;
    position: number;
    additionalMemory?: string;
}
interface ParsedGroupFromLLM {
    title: string;
    original_text: string; // 그룹의 원본 텍스트 (청크 생성 시 입력으로 사용)
    position: number;
}
// 수정: 통합 파싱 결과를 위한 타입 (필요 시 조정)
interface ParsedChunkFromUnifiedLLM {
    summary: string;        // 질문 또는 cloze 앞면
    masked_text: string;    // 답변 또는 cloze 뒷면
    position: number;
    chunk_type: 'normal' | 'cloze'; // 타입 구분 추가
}
interface FinalGroupData extends ParsedGroupFromLLM {
    id: string; // DB 저장을 위해 UUID 추가
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// 세그먼트 내 청크 생성 동시성 제한 (예: 3개) - 너무 많으면 단일 세그먼트 처리 시간이 길어질 수 있음
const chunkGenConcurrency = pLimit(3);

/**
 * 단일 텍스트 세그먼트를 처리합니다.
 * 1. LLM 호출하여 세그먼트 내 그룹 생성
 * 2. 생성된 각 그룹에 대해 단일 통합 LLM 호출하여 모든 타입의 청크 생성 (병렬)
 * 3. 결과를 DB에 저장
 */
export async function processSingleSegment(
    supabase: SupabaseClient,
    segment: SegmentToProcess
): Promise<{ success: boolean; error?: string }> {
    const { id: segmentId, content_id, segment_text, position: segmentPosition, additionalMemory } = segment;
    const logPrefix = `[Generation][${content_id}][Seg ${segmentPosition}]`;
    console.log(`${logPrefix} Starting processing segment ${segmentId}`);

    let generatedGroups: FinalGroupData[] = []; // 생성된 그룹 데이터 (ID 포함)
    let allChunksToInsert: any[] = [];          // 최종 DB 저장용 청크 배열

    try {
        // 1. 세그먼트 상태 업데이트 ('processing')
        await supabase.from('content_segments').update({ status: 'processing' }).eq('id', segmentId);

        // --- 2. LLM 호출 1: 세그먼트 내 그룹 생성 ---
        console.log(`${logPrefix} Stage 1: Generating groups from segment text...`);
        const groupSystemPrompt = generateGroupsPrompt(additionalMemory); // 기존 그룹 프롬프트 사용
        let groupResponseText: string | null = null;

        await asyncRetry(async (bail) => {
            const completion = await openai.chat.completions.create({
                model: "gpt-4.1-nano-2025-04-14",
                messages: [
                    { role: "system", content: groupSystemPrompt },
                    { role: "user", content: segment_text } // 입력으로 세그먼트 텍스트 사용
                ],
                temperature: 0, max_tokens: 10000, // 기존 설정 참고
            });
            groupResponseText = completion.choices[0].message.content;
            if (!groupResponseText) throw new Error('LLM returned empty content for groups');
        }, { retries: 2, /* ... retry options ... */ });

        if (!groupResponseText) throw new Error('Group generation failed after retries.');

        // 2.1 그룹 응답 파싱 (기존 파싱 로직 사용)
        const parsedGroupsLlm: ParsedGroupFromLLM[] = parseGroupsResponse(groupResponseText);
        console.log(`${logPrefix} Parsed ${parsedGroupsLlm.length} groups from segment.`);

        if (parsedGroupsLlm.length === 0) {
            console.warn(`${logPrefix} No groups generated for this segment.`);
            // 그룹이 없으면 청크 생성 단계 스킵하고 완료 처리
            await supabase.from('content_segments').update({ status: 'completed' }).eq('id', segmentId);
            console.log(`${logPrefix} Segment marked as completed (no groups).`);
            return { success: true };
        }

        // 생성된 그룹에 UUID 할당 및 저장 준비
        generatedGroups = parsedGroupsLlm.map(g => ({ ...g, id: crypto.randomUUID() }));
        const groupsToInsert = generatedGroups.map(g => ({
            id: g.id,
            content_id: content_id,
            title: g.title,
            original_text: g.original_text, // 그룹 원본 텍스트 저장 (청크 생성 시 필요)
            position: g.position,
            segment_position: segmentPosition
        }));

        // --- 3. DB 저장 1: 그룹 정보 우선 저장 ---
        console.log(`${logPrefix} Saving ${groupsToInsert.length} groups to DB...`);
        const { error: groupInsertError } = await supabase.from('content_groups').insert(groupsToInsert);
        if (groupInsertError) throw new Error(`Failed to insert groups: ${groupInsertError.message}`);


        // --- 4. LLM 호출 2: 각 그룹에 대한 통합 청크 생성 (세그먼트 내 병렬 처리) ---
        console.log(`${logPrefix} Stage 2: Generating unified chunks for ${generatedGroups.length} groups in parallel (limit ${chunkGenConcurrency.activeCount}/${chunkGenConcurrency.pendingCount})...`);

        const chunkGenerationPromises = generatedGroups.map(group => {
            return chunkGenConcurrency(async () => {
                const groupLogPrefix = `${logPrefix}[Grp ${group.position}]`;
                console.log(`${groupLogPrefix} Generating unified chunks for group: ${group.title}`);
                let chunksForGroup: any[] = []; // 최종 DB 저장 형식으로 변환될 청크들

                try {
                    // 4.1 통합 프롬프트 생성 및 단일 LLM 호출
                    const unifiedSystemPrompt = generateUnifiedChunksPrompt(additionalMemory); // 통합 프롬프트 사용
                    let unifiedChunkResponse: string | null = null;

                    await asyncRetry(async () => {
                        const completion = await openai.chat.completions.create({
                            model: "gpt-4.1-nano-2025-04-14", // 모델 유지 또는 변경 고려
                            messages: [
                                { role: "system", content: unifiedSystemPrompt },
                                { role: "user", content: group.original_text } // 그룹 원본 텍스트 사용
                            ],
                            temperature: 0, max_tokens: 10000, // 토큰 수 증가 고려
                        });
                        unifiedChunkResponse = completion.choices[0].message.content;
                        if (!unifiedChunkResponse) throw new Error('LLM returned empty content for unified chunks');
                    }, { retries: 1 }); // 재시도 횟수 유지 또는 조정

                    if (unifiedChunkResponse) {
                        // 4.2 통합 응답 파싱 (새로운 파싱 함수 사용)
                        const parsedUnifiedChunks = parseUnifiedChunksResponse(unifiedChunkResponse);
                        console.log(`${groupLogPrefix} Parsed ${parsedUnifiedChunks.length} unified chunks (normal + cloze).`);

                        // 파싱된 결과를 DB 저장 형식으로 변환
                        chunksForGroup = parsedUnifiedChunks.map(chunk => ({
                            group_id: group.id,
                            summary: chunk.summary,
                            masked_text: chunk.masked_text,
                            position: chunk.position,
                            chunk_type: chunk.chunk_type, // 파서가 타입을 반환해야 함
                            segment_position: segmentPosition,
                            // 기본 카드 상태 정보 추가
                            card_state: 'new', ease: 2.5, interval: 0, repetition_count: 0, status: 'active'
                        }));
                    } else {
                        console.warn(`${groupLogPrefix} LLM returned no response for unified chunks.`);
                    }
                } catch (error) {
                    console.error(`${groupLogPrefix} Error generating or parsing unified chunks:`, error);
                    // 개별 그룹 처리 실패 시, 에러를 던져 Promise.all에서 잡도록 함
                    // 또는 빈 배열 반환 후 최종 결과에서 실패 처리 (현재는 에러 throw)
                    throw error;
                }

                return chunksForGroup;
            });
        });

        // 모든 그룹의 청크 생성 완료 기다림
        const results = await Promise.allSettled(chunkGenerationPromises); // 수정: Promise.allSettled 사용 고려

        allChunksToInsert = [];
        let failedGroupCount = 0;
        results.forEach((result, index) => {
            const groupLogPrefix = `${logPrefix}[Grp ${generatedGroups[index].position}]`;
            if (result.status === 'fulfilled') {
                allChunksToInsert.push(...result.value);
            } else {
                failedGroupCount++;
                console.error(`${groupLogPrefix} Failed to generate chunks:`, result.reason);
                // 실패한 그룹에 대한 처리 (예: 로그 남기기, 부분 성공 처리 등)
            }
        });

        console.log(`${logPrefix} Finished generating chunks for all groups. Total successful chunks: ${allChunksToInsert.length}. Failed groups: ${failedGroupCount}`);

        // --- 5. DB 저장 2: 성공한 청크 정보 저장 ---
        if (allChunksToInsert.length > 0) {
            console.log(`${logPrefix} Saving ${allChunksToInsert.length} successful chunks to DB...`);
            // Position 재정렬 로직 (통합 파서가 position을 잘 반환한다면 필요 없을 수도 있음)
            allChunksToInsert.sort((a, b) => a.position - b.position);
            allChunksToInsert.forEach((chunk, index) => chunk.position = index + 1);

            const { error: chunkInsertError } = await supabase.from('content_chunks').insert(allChunksToInsert);
            if (chunkInsertError) {
                // 청크 저장 실패 시에도 세그먼트 상태는 업데이트 필요할 수 있음 (부분 성공 등)
                console.error(`${logPrefix} Failed to insert chunks, but continuing to update segment status. Error: ${chunkInsertError.message}`);
                // throw new Error(`Failed to insert chunks: ${chunkInsertError.message}`);
            }
        } else if (failedGroupCount === 0) {
            console.warn(`${logPrefix} No chunks were generated for any group in this segment.`);
        }

        // --- 6. 세그먼트 상태 완료/실패 업데이트 ---
        // 수정: 실패한 그룹이 있어도 세그먼트 자체는 처리를 마쳤으므로 completed 또는 failed 상태로 업데이트
        const finalSegmentStatus = failedGroupCount > 0 ? 'failed' : 'completed'; // 실패 그룹 있으면 failed
        await supabase.from('content_segments').update({ status: finalSegmentStatus }).eq('id', segmentId);
        console.log(`${logPrefix} Successfully processed segment ${segmentId} with status: ${finalSegmentStatus}`);
        return { success: finalSegmentStatus === 'completed' }; // 성공 여부 반환

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`${logPrefix} Error processing segment ${segmentId}: ${errorMessage}`);
        try {
            await supabase.from('content_segments').update({ status: 'failed' }).eq('id', segmentId);
        } catch (dbError) {
            console.error(`${logPrefix} Failed to update segment status to 'failed'`, dbError);
        }
        return { success: false, error: errorMessage };
    }
}

// --- 파싱 함수들 (기존 로직 기반) ---

/**
 * 그룹 생성 LLM 응답 파싱 (기존 process-groups 로직 참고)
 * 형식: <그룹 N>\n제목: ...\n오리지널 소스: ...
 */
function parseGroupsResponse(responseText: string): ParsedGroupFromLLM[] {
    console.log("[ParsingGroups] Parsing groups response...");
    const groups: ParsedGroupFromLLM[] = [];
    const groupRegex = /<그룹 (\d+)>[\s\r\n]*제목: (.*?)\s*[\r\n]+오리지널 소스: ([\s\S]*?)(?=\n\n<그룹 \d+>|$)/g;
    let match;
    try {
        while ((match = groupRegex.exec(responseText)) !== null) {
            const position = parseInt(match[1]);
            const title = match[2].trim();
            const original_text = match[3].trim();
            if (!isNaN(position) && title && original_text) {
                groups.push({ position, title, original_text });
            } else {
                console.warn(`[ParsingGroups] Skipping invalid group format: Match[1]=${match[1]}, Match[2]=${match[2]}`);
            }
        }
        groups.sort((a, b) => a.position - b.position);
        console.log(`[ParsingGroups] Parsed ${groups.length} groups.`);
    } catch (e) {
        console.error("[ParsingGroups] Error:", e);
    }
    return groups;
}

// 수정: 기존 parseChunksResponse 대신 통합 응답 파싱 함수 추가
/**
 * 통합 청크 생성 LLM 응답 파싱
 * 형식 예시:
 * 카드 1: 앞면 질문? / 뒷면 답변.
 * 카드 2: {{Cloze}} 단어. / **Cloze** 단어.
 * ...
 */
function parseUnifiedChunksResponse(responseText: string): ParsedChunkFromUnifiedLLM[] {
    console.log("[ParsingUnifiedChunks] Parsing unified chunks response...");
    const chunks: ParsedChunkFromUnifiedLLM[] = [];
    // 수정: 정규식 개선 필요 - cloze와 normal 형식을 모두 처리
    // 예시 정규식 (개선 필요):
    // const chunkRegex = /카드 (\d+):\s*(.*?)\s*\/\s*(.*)/g; // 기존 normal 형식 + cloze 일부 포함?
    // const chunkRegex = /^카드\s(\d+):\s(.*?)(?:\s\/\s(.*)|\.)$/gm;
    // const chunkRegex = /^카드 (\d+): (.*)$/gm; // 라인 단위로 우선 매칭
    const lines = responseText.trim().split(/\r?\n/);
    let currentPosition = 1;

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine.startsWith('카드 ')) continue;

        const matchCardNumber = trimmedLine.match(/^카드 (\d+):\s*(.*)/);
        if (!matchCardNumber) continue;

        // const position = parseInt(matchCardNumber[1]); // LLM이 부여한 position 사용 또는 직접 할당
        const position = currentPosition++; // 순차적 position 할당
        const content = matchCardNumber[2].trim();

        // Cloze 형식 확인 ({{...}} / **...**) - 더 정확한 정규식 필요
        const clozeMatch = content.match(/^(.*?{{.+?}}.*?)\s*\/\s*(.*?\*\*.+?\*\*.*?)$/);
        if (clozeMatch && clozeMatch[1] && clozeMatch[2]) {
            chunks.push({
                position,
                summary: clozeMatch[1].trim(),
                masked_text: clozeMatch[2].trim(),
                chunk_type: 'cloze'
            });
        } else {
            // Normal 형식 확인 (질문? / 답변.)
            const normalMatch = content.match(/^(.*?\?)\s*\/\s*(.*?)$/);
            if (normalMatch && normalMatch[1] && normalMatch[2]) {
                chunks.push({
                    position,
                    summary: normalMatch[1].trim(),
                    masked_text: normalMatch[2].trim(),
                    chunk_type: 'normal'
                });
            } else {
                console.warn(`[ParsingUnifiedChunks] Skipping unrecognized chunk format: ${trimmedLine}`);
            }
        }
    }

    // 정렬은 외부에서 처리하므로 여기서는 생략
    // chunks.sort((a, b) => a.position - b.position);
    console.log(`[ParsingUnifiedChunks] Parsed ${chunks.length} unified chunks.`);
    return chunks;
}

// 기존 parseChunksResponse 함수는 주석 처리 또는 삭제
/*
function parseChunksResponse(responseText: string, chunkType: 'normal' | 'cloze'): ParsedChunkFromLLM[] {
    // ... 기존 로직 ...
}
*/