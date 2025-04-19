// src/app/api/process/pipeline/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'; // Langchain 임포트
import { processSingleSegment } from '@/lib/generation'; // 단일 세그먼트 처리 함수 임포트
import pLimit from 'p-limit'; // p-limit 임포트

export const config = {
    maxDuration: 300,
};

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

// --- 최종 상태 업데이트 함수 (파이프라인 마지막에 호출) ---
async function updateFinalContentStatus(supabase: any, contentId: string) {
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
        // let errorMessage: string | null = null; // errorMessage 변수 제거 또는 주석 처리

        if (totalSegments === 0) {
            finalStatus = 'completed'; // 세그먼트가 없으면 완료 처리 (엣지 케이스)
            console.log(`[Pipeline][${contentId}] No segments found, marking as completed.`);
        } else if (completedSegments === totalSegments) {
            finalStatus = 'completed';
            console.log(`[Pipeline][${contentId}] All ${totalSegments} segments completed successfully.`);
        } else if (completedSegments > 0) {
            finalStatus = 'partially_completed'; // 일부 성공, 일부 실패
            // errorMessage = `${failedSegments} out of ${totalSegments} segments failed.`; // errorMessage 관련 조건문 제거
            console.warn(`[Pipeline][${contentId}] Partially completed. ${completedSegments}/${totalSegments} succeeded, ${failedSegments}/${totalSegments} failed.`);
        } else {
            // completedSegments === 0 && failedSegments > 0
            finalStatus = 'failed';
            // errorMessage = `All ${failedSegments} segments failed.`; // errorMessage 관련 조건문 제거
            console.error(`[Pipeline][${contentId}] All ${totalSegments} segments failed.`);
        }

        const updatePayload: { processing_status: string } = {
            processing_status: finalStatus,
        };
        // if (errorMessage) { // errorMessage 관련 조건문 제거
        //     updatePayload.error_message = errorMessage;
        // }

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

export async function POST(req: Request) {
    console.log('[Pipeline] Received request');
    let contentId: string | null = null;
    const supabase = await createClient(); // 함수 시작 시 클라이언트 생성

    try {
        const payload: PipelinePayload = await req.json();
        contentId = payload.contentId;
        const { text, additionalMemory } = payload;

        if (!contentId || !text) {
            console.error('[Pipeline] Missing contentId or text');
            return NextResponse.json({ error: 'Missing required data' }, { status: 400 });
        }

        console.log(`[Pipeline] Starting processing for contentId: ${contentId}`);

        // --- 단계 1: 상태 업데이트 및 세분화 (Segmentation) ---
        console.log(`[Pipeline][${contentId}] Step 1: Segmentation`);
        await supabase
            .from('contents')
            .update({ processing_status: 'segmenting' })
            .eq('id', contentId);

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1500,
            chunkOverlap: 150,
        });
        const segmentsText = await splitter.splitText(text);
        console.log(`[Pipeline][${contentId}] Split into ${segmentsText.length} segments.`);

        if (segmentsText.length === 0) {
            console.warn(`[Pipeline][${contentId}] No segments created. Using original text.`);
            segmentsText.push(text);
        }

        const segmentDataToInsert = segmentsText.map((segmentText, index) => ({
            content_id: contentId!, // contentId가 null이 아님을 확신 (위에서 체크)
            segment_text: segmentText,
            position: index + 1,
            status: 'pending', // 'pending' 상태로 저장
        }));

        // 기존 세그먼트 삭제 (재처리 시 중복 방지 - 선택 사항)
        // await supabase.from('content_segments').delete().eq('content_id', contentId);

        const { data: insertedSegments, error: insertError } = await supabase
            .from('content_segments')
            .insert(segmentDataToInsert)
            .select('id, content_id, segment_text, position'); // 다음 단계에 필요한 정보 선택

        if (insertError) {
            throw new Error(`Failed to insert segments: ${insertError.message}`);
        }
        if (!insertedSegments || insertedSegments.length === 0) {
            throw new Error('Failed to insert segments or retrieve their data.');
        }

        console.log(`[Pipeline][${contentId}] Successfully inserted ${insertedSegments.length} segments.`);

        // 다음 단계로 전달할 데이터 준비
        const segmentsToProcess: SegmentToProcess[] = insertedSegments.map(seg => ({
            ...seg,
            additionalMemory: additionalMemory // additionalMemory 추가
        }));

        await supabase
            .from('contents')
            .update({ processing_status: 'processing_segments' }) // 상태 업데이트
            .eq('id', contentId);

        // --- 단계 2: 병렬 그룹/카드 생성 (제한된 동시성 사용) ---
        console.log(`[Pipeline][${contentId}] Step 2: Parallel Group/Chunk Generation`);

        // 동시성 제한 설정 (예: 동시에 5개 작업 실행)
        const limit = pLimit(5); // 숫자는 필요에 따라 조정 (OpenAI Rate Limit, Vercel 리소스 등 고려)

        // 각 세그먼트 처리 작업을 Promise 배열로 만듭니다.
        const processingPromises = segmentsToProcess.map(segment => {
            // limit()으로 감싸서 동시 실행 수를 제어합니다.
            return limit(() => processSingleSegment(supabase, segment));
        });

        // 모든 세그먼트 처리 작업이 완료될 때까지 기다립니다.
        const results = await Promise.all(processingPromises);

        // 처리 결과 로깅 (성공/실패 집계)
        const successfulTasks = results.filter(r => r.success).length;
        const failedTasks = results.length - successfulTasks;
        console.log(`[Pipeline][${contentId}] Segment processing completed. Success: ${successfulTasks}, Failed: ${failedTasks}`);
        if (failedTasks > 0) {
            // 실패한 세그먼트 정보 로깅 (선택 사항)
            results.forEach((result, index) => {
                if (!result.success) {
                    console.error(`[Pipeline][${contentId}] Segment ${segmentsToProcess[index].position} (ID: ${segmentsToProcess[index].id}) failed: ${result.error}`);
                }
            });
        }

        // --- 단계 3: 최종 상태 업데이트 ---
        // 분리된 함수 호출
        await updateFinalContentStatus(supabase, contentId);

        console.log(`[Pipeline][${contentId}] Background processing completed.`);
        return NextResponse.json({ success: true, message: 'Pipeline processing finished.' });

    } catch (error) {
        console.error(`[Pipeline][${contentId ?? 'unknown'}] Error processing pipeline`, error);
        if (contentId) {
            try {
                await supabase
                    .from('contents')
                    // .update({ processing_status: 'failed', error_message: error instanceof Error ? error.message : String(error) })
                    .update({ processing_status: 'failed' }) // error_message 없이 상태만 업데이트
                    .eq('id', contentId);
            } catch (dbError) {
                console.error(`[Pipeline][${contentId}] Failed to update content status to 'failed'`, dbError);
            }
        }
        // Background Function에서는 클라이언트에게 직접 오류를 반환하는 대신 로깅에 집중할 수 있음
        // throw error; // 필요 시 에러를 다시 던져 Vercel 로그에서 확인
        return NextResponse.json({ error: 'Pipeline processing failed' }, { status: 500 }); // 또는 간단한 오류 응답
    }
}