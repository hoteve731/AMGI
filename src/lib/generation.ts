import { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import asyncRetry from 'async-retry';
// 기존 프롬프트 생성 함수들 임포트
import { generateGroupsPrompt, generateNormalChunksPrompt, generateClozeChunksPrompt } from '@/prompt_generator';
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
interface ParsedChunkFromLLM {
    summary: string;        // 질문 또는 cloze 앞면
    masked_text: string;    // 답변 또는 cloze 뒷면
    position: number;
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
 * 2. 생성된 각 그룹에 대해 LLM 호출하여 청크 생성 (병렬)
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
                model: "gpt-4o-mini-2024-07-18",
                messages: [
                    { role: "system", content: groupSystemPrompt },
                    { role: "user", content: segment_text } // 입력으로 세그먼트 텍스트 사용
                ],
                temperature: 0.1, max_tokens: 1000, // 기존 설정 참고
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


        // --- 4. LLM 호출 2: 각 그룹에 대한 청크 생성 (세그먼트 내 병렬 처리) ---
        console.log(`${logPrefix} Stage 2: Generating chunks for ${generatedGroups.length} groups in parallel (limit ${chunkGenConcurrency.activeCount}/${chunkGenConcurrency.pendingCount})...`);

        const chunkGenerationPromises = generatedGroups.map(group => {
            return chunkGenConcurrency(async () => {
                const groupLogPrefix = `${logPrefix}[Grp ${group.position}]`;
                console.log(`${groupLogPrefix} Generating chunks for group: ${group.title}`);
                const chunksForGroup: any[] = [];

                // 4.1 일반 청크 생성
                try {
                    const normalSystemPrompt = generateNormalChunksPrompt(additionalMemory);
                    let normalChunkResponse: string | null = null;
                    await asyncRetry(async () => {
                        const completion = await openai.chat.completions.create({
                            model: "gpt-4o-mini-2024-07-18",
                            messages: [
                                { role: "system", content: normalSystemPrompt },
                                { role: "user", content: group.original_text } // 그룹의 원본 텍스트 사용
                            ],
                            temperature: 0.1, max_tokens: 1000,
                        });
                        normalChunkResponse = completion.choices[0].message.content;
                        if (!normalChunkResponse) throw new Error('LLM returned empty content for normal chunks');
                    }, { retries: 1 }); // 청크 생성 재시도는 1번만 (선택)

                    if (normalChunkResponse) {
                        const parsedNormal = parseChunksResponse(normalChunkResponse, 'normal');
                        console.log(`${groupLogPrefix} Parsed ${parsedNormal.length} normal chunks.`);
                        parsedNormal.forEach(chunk => chunksForGroup.push({
                            group_id: group.id,
                            summary: chunk.summary,
                            masked_text: chunk.masked_text,
                            position: chunk.position,
                            chunk_type: 'normal',
                            segment_position: segmentPosition,
                            card_state: 'new', ease: 2.5, interval: 0, repetition_count: 0, status: 'active'
                        }));
                    }
                } catch (error) {
                    console.error(`${groupLogPrefix} Error generating normal chunks:`, error);
                    throw error;
                }

                // 4.2 Cloze 청크 생성
                try {
                    const clozeSystemPrompt = generateClozeChunksPrompt(additionalMemory);
                    let clozeChunkResponse: string | null = null;
                    await asyncRetry(async () => {
                        const completion = await openai.chat.completions.create({
                            model: "gpt-4o-mini-2024-07-18",
                            messages: [
                                { role: "system", content: clozeSystemPrompt },
                                { role: "user", content: group.original_text }
                            ],
                            temperature: 0.1, max_tokens: 1000,
                        });
                        clozeChunkResponse = completion.choices[0].message.content;
                        if (!clozeChunkResponse) throw new Error('LLM returned empty content for cloze chunks');
                    }, { retries: 1 });

                    if (clozeChunkResponse) {
                        const parsedCloze = parseChunksResponse(clozeChunkResponse, 'cloze');
                        console.log(`${groupLogPrefix} Parsed ${parsedCloze.length} cloze chunks.`);
                        parsedCloze.forEach(chunk => chunksForGroup.push({
                            group_id: group.id,
                            summary: chunk.summary,
                            masked_text: chunk.masked_text,
                            position: chunk.position, // TODO: normal 과 cloze position 충돌 가능성 검토 필요
                            chunk_type: 'cloze',
                            segment_position: segmentPosition,
                            card_state: 'new', ease: 2.5, interval: 0, repetition_count: 0, status: 'active'
                        }));
                    }
                } catch (error) {
                    console.error(`${groupLogPrefix} Error generating cloze chunks:`, error);
                    throw error;
                }

                return chunksForGroup;
            });
        });

        // 모든 그룹의 청크 생성 완료 기다림
        const results = await Promise.all(chunkGenerationPromises);
        allChunksToInsert = results.flat(); // 결과를 하나의 배열로 합침
        console.log(`${logPrefix} Finished generating chunks for all groups. Total chunks: ${allChunksToInsert.length}`);

        // --- 5. DB 저장 2: 청크 정보 저장 ---
        if (allChunksToInsert.length > 0) {
            console.log(`${logPrefix} Saving ${allChunksToInsert.length} chunks to DB...`);
            // Position 충돌 방지 처리: normal과 cloze의 position을 합쳐서 재정렬
            allChunksToInsert.sort((a, b) => a.position - b.position); // 임시 정렬 (더 나은 방법 필요할 수 있음)
            allChunksToInsert.forEach((chunk, index) => chunk.position = index + 1); // position 재할당

            const { error: chunkInsertError } = await supabase.from('content_chunks').insert(allChunksToInsert);
            if (chunkInsertError) throw new Error(`Failed to insert chunks: ${chunkInsertError.message}`);
        } else {
            console.warn(`${logPrefix} No chunks were generated for any group in this segment.`);
        }

        // --- 6. 세그먼트 상태 완료 업데이트 ---
        await supabase.from('content_segments').update({ status: 'completed' }).eq('id', segmentId);
        console.log(`${logPrefix} Successfully processed segment ${segmentId}`);
        return { success: true };

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

/**
 * 청크 생성 LLM 응답 파싱 (기존 process-chunks 로직 참고)
 * 형식: 카드 N: 앞면 / 뒷면
 */
function parseChunksResponse(responseText: string, chunkType: 'normal' | 'cloze'): ParsedChunkFromLLM[] {
    console.log(`[ParsingChunks][${chunkType}] Parsing chunks response...`);
    const chunks: ParsedChunkFromLLM[] = [];
    // 기존 정규식 참고: 카드 n: 이후의 내용을 non-greedy하게 잡고, 다음 카드 또는 끝까지 매칭
    const cardRegex = /카드 (\d+):([\s\S]*?)(?=카드 \d+:|$)/g;
    let match;
    try {
        while ((match = cardRegex.exec(responseText)) !== null) {
            const position = parseInt(match[1]);
            const content = match[2].trim();
            const parts = content.split('/'); // 앞면/뒷면 분리

            if (!isNaN(position) && parts.length >= 2) {
                const summary = parts[0].trim();
                const masked_text = parts.slice(1).join('/').trim(); // 답변에 '/' 포함 가능성
                if (summary && masked_text) {
                    chunks.push({ position, summary, masked_text });
                } else {
                    console.warn(`[ParsingChunks][${chunkType}] Skipping card ${position} due to empty summary or masked_text.`);
                }
            } else {
                console.warn(`[ParsingChunks][${chunkType}] Skipping invalid card format: Match[1]=${match[1]}, Content=${content}`);
            }
        }
        chunks.sort((a, b) => a.position - b.position);
        console.log(`[ParsingChunks][${chunkType}] Parsed ${chunks.length} chunks.`);
    } catch (e) {
        console.error(`[ParsingChunks][${chunkType}] Error:`, e);
    }
    return chunks;
}