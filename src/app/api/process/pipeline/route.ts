// src/app/api/process/pipeline/route.ts
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js'; // SupabaseClient 타입 임포트
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'; // Langchain 임포트
import { processSingleSegment } from '@/lib/generation'; // 단일 세그먼트 처리 함수 임포트
import pLimit from 'p-limit'; // p-limit 임포트
import { waitUntil } from '@vercel/functions'; // waitUntil 임포트

// Background Function으로 전환 시 maxDuration config는 일반적으로 사용되지 않음
// export const config = {
//     maxDuration: 300,
// };

interface PipelinePayload {
    contentId: string;
    text: string;
    additionalMemory?: string;
}

// 개별 세그먼트 처리를 위한 타입 (다음 단계에서 사용)
interface SegmentToProcess {
    id: string;
    content_id: string;
    segment_text: string;
    position: number;
    additionalMemory?: string;
}

interface SegmentRecord {
    id: string;
    content_id: string;
    segment_text: string;
    position: number;
}

// --- 최종 상태 업데이트 함수 (파이프라인 마지막에 호출) ---
async function updateFinalContentStatus(supabase: SupabaseClient, contentId: string) {
    console.log(`[Pipeline][${contentId}] Step 3: Calculating final status...`);
    try {
        const { data: segments, error } = await supabase
            .from('content_segments')
            .select('status')
            .eq('content_id', contentId);

        if (error) {
            throw new Error(`Failed to fetch segment statuses: ${error.message}`);
        }

        const totalSegments = segments.length;
        const completedSegments = segments.filter((s: { status: string }) => s.status === 'completed').length;
        const failedSegments = segments.filter((s: { status: string }) => s.status === 'failed').length;

        let finalStatus = 'failed'; // 기본값을 failed로 설정

        if (totalSegments === 0) {
            finalStatus = 'completed'; // 세그먼트가 없으면 완료 처리 (엣지 케이스)
            console.log(`[Pipeline][${contentId}] No segments found, marking as completed.`);
        } else if (completedSegments === totalSegments) {
            finalStatus = 'completed';
            console.log(`[Pipeline][${contentId}] All ${totalSegments} segments completed successfully.`);
        } else if (completedSegments > 0) {
            finalStatus = 'partially_completed'; // 일부 성공, 일부 실패
            console.warn(`[Pipeline][${contentId}] Partially completed. ${completedSegments}/${totalSegments} succeeded, ${failedSegments}/${totalSegments} failed.`);
        } else {
            // completedSegments === 0 && failedSegments > 0
            finalStatus = 'failed';
            console.error(`[Pipeline][${contentId}] All ${totalSegments} segments failed.`);
        }

        const updatePayload: { processing_status: string } = {
            processing_status: finalStatus,
        };

        const { error: updateError } = await supabase
            .from('contents')
            .update(updatePayload)
            .eq('id', contentId);

        if (updateError) {
            console.error(`[Pipeline][${contentId}] Failed to update final content status: ${updateError.message}`);
        } else {
            console.log(`[Pipeline][${contentId}] Final content status updated to: ${finalStatus}`);
        }

    } catch (error) {
        console.error(`[Pipeline][${contentId}] Error during final status update:`, error);
        // 최종 상태 업데이트 실패 시 추가 처리 (예: 별도 로깅)
    }
}

// 백그라운드에서 실제 파이프라인을 처리하는 함수
async function runPipelineInBackground(payload: PipelinePayload) {
    const { contentId, text, additionalMemory } = payload;
    const supabase: SupabaseClient = await createServerClient();

    try {
        console.log(`[Pipeline-BG] Starting processing for contentId: ${contentId}`);

        // --- 단계 1: 상태 업데이트 및 세분화 (Segmentation) ---
        console.log(`[Pipeline-BG][${contentId}] Step 1: Segmentation`);
        await supabase
            .from('contents')
            .update({ processing_status: 'segmenting' })
            .eq('id', contentId);

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 500,
            chunkOverlap: 20,
        });
        const segmentsText = await splitter.splitText(text);
        console.log(`[Pipeline-BG][${contentId}] Split into ${segmentsText.length} segments.`);

        if (segmentsText.length === 0) {
            console.warn(`[Pipeline-BG][${contentId}] No segments created. Using original text.`);
            segmentsText.push(text);
        }

        const segmentDataToInsert = segmentsText.map((segmentText, index) => ({
            content_id: contentId!,
            segment_text: segmentText,
            position: index + 1,
            status: 'pending',
        }));

        const { data: insertedSegments, error: insertError } = await supabase
            .from('content_segments')
            .insert(segmentDataToInsert)
            .select('id, content_id, segment_text, position')
            .returns<SegmentRecord[]>();

        if (insertError) {
            throw new Error(`Failed to insert segments: ${insertError.message}`);
        }
        if (!insertedSegments || insertedSegments.length === 0) {
            throw new Error('Failed to insert segments or retrieve their data.');
        }

        console.log(`[Pipeline-BG][${contentId}] Successfully inserted ${insertedSegments.length} segments.`);

        const segmentsToProcess: SegmentToProcess[] = insertedSegments.map((seg: SegmentRecord) => ({
            ...seg,
            additionalMemory: additionalMemory
        }));

        await supabase
            .from('contents')
            .update({ processing_status: 'processing_segments' })
            .eq('id', contentId);

        // --- 단계 2: 병렬 그룹/카드 생성 (제한된 동시성 사용) ---
        console.log(`[Pipeline-BG][${contentId}] Step 2: Parallel Group/Chunk Generation`);
        const limit = pLimit(5);
        const processingPromises = segmentsToProcess.map(segment => {
            return limit(() => processSingleSegment(supabase, segment));
        });

        const results = await Promise.all(processingPromises);

        const successfulTasks = results.filter(r => r.success).length;
        const failedTasks = results.length - successfulTasks;
        console.log(`[Pipeline-BG][${contentId}] Segment processing completed. Success: ${successfulTasks}, Failed: ${failedTasks}`);
        if (failedTasks > 0) {
            results.forEach((result, index) => {
                if (!result.success) {
                    console.error(`[Pipeline-BG][${contentId}] Segment ${segmentsToProcess[index].position} (ID: ${segmentsToProcess[index].id}) failed: ${result.error}`);
                }
            });
        }

        // --- 단계 3: 최종 상태 업데이트 ---
        await updateFinalContentStatus(supabase, contentId);

        console.log(`[Pipeline-BG][${contentId}] Background processing completed successfully.`);

    } catch (error) {
        console.error(`[Pipeline-BG][${contentId ?? 'unknown'}] Error processing pipeline in background`, error);
        if (contentId) {
            try {
                // 백그라운드 실패 시 상태 업데이트
                await supabase
                    .from('contents')
                    .update({ processing_status: 'failed' }) // 간단하게 failed로만 업데이트
                    .eq('id', contentId);
            } catch (dbError) {
                console.error(`[Pipeline-BG][${contentId}] Failed to update content status to 'failed' after background error`, dbError);
            }
        }
        // 백그라운드 함수에서는 에러를 다시 던져 Vercel 로그에서 확인하는 것이 일반적
        // throw error;
    }
}

// HTTP POST 핸들러 (즉시 응답)
export async function POST(req: Request) {
    console.log('[Pipeline] Received request');
    try {
        const payload: PipelinePayload = await req.json();
        const { contentId, text } = payload;

        if (!contentId || !text) {
            console.error('[Pipeline] Missing contentId or text');
            return NextResponse.json({ error: 'Missing required data' }, { status: 400 });
        }

        // waitUntil을 사용하여 백그라운드 작업 실행을 예약하고 즉시 응답
        waitUntil(runPipelineInBackground(payload));

        console.log(`[Pipeline] Accepted request for ${contentId}. Processing will continue in the background.`);
        // 클라이언트에게는 처리가 시작되었음을 알리는 성공 응답을 즉시 반환
        return NextResponse.json({ success: true, message: 'Processing started in background.', contentId: contentId }, { status: 202 }); // 202 Accepted

    } catch (error) {
        console.error('[Pipeline] Error handling initial request', error);
        return NextResponse.json({ error: 'Failed to initiate pipeline processing' }, { status: 500 });
    }
}