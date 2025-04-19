// src/app/api/process/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('contentId');

    if (!contentId) {
        return NextResponse.json({ error: 'contentId is required' }, { status: 400 });
    }

    const supabase = await createClient();

    try {
        // 1. 콘텐츠 기본 정보 및 전체 상태 조회
        let contentData: any;
        try {
            const { data, error } = await supabase
                .from('contents')
                .select('title, processing_status')
                .eq('id', contentId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    return NextResponse.json({ error: 'Content not found' }, { status: 404 });
                }
                console.error(`[Status][${contentId}] Error fetching content:`, error);
                throw new Error(`Failed to fetch content status: ${error.message}`);
            }
            contentData = data; // Assign fetched data
        } catch (error) {
            console.error(`[Status][${contentId}] Stage 1 FAILED - Fetching content:`, error);
            throw error; // Re-throw to be caught by outer catch
        }

        // 2. 세그먼트 처리 현황 조회 및 진행률 계산
        let progress = 0;
        let totalSegments = 0;
        let completedSegments = 0;
        try {
            const { data: segments, error: segmentError } = await supabase
                .from('content_segments')
                .select('status')
                .eq('content_id', contentId);

            if (segmentError) {
                console.error(`[Status][${contentId}] Error fetching segments:`, segmentError);
                // Continue even if segments fail, but log it
            }

            if (segments) {
                totalSegments = segments.length;
                completedSegments = segments.filter((s: { status: string }) => s.status === 'completed' || s.status === 'failed').length;
                if (totalSegments > 0) {
                    progress = Math.round((completedSegments / totalSegments) * 100);
                } else if (contentData && ['processing_segments', 'completed', 'partially_completed', 'failed'].includes(contentData.processing_status)) {
                    if (contentData.processing_status === 'completed') progress = 100;
                }
            }
        } catch (error) {
            console.error(`[Status][${contentId}] Stage 2 FAILED - Segment fetching or progress calculation:`, error);
            // Proceed without progress info, or re-throw if critical
            // For now, let's allow proceeding
        }

        // 3. 현재까지 생성된 그룹 및 청크 데이터 조회
        let groups: any[] = [];
        let chunks: any[] = [];
        try {
            if (contentData && ['processing_segments', 'completed', 'partially_completed'].includes(contentData.processing_status)) {
                const { data: fetchedGroups, error: groupError } = await supabase
                    .from('content_groups')
                    .select('*')
                    .eq('content_id', contentId)
                    .order('segment_position', { ascending: true })
                    .order('position', { ascending: true });

                if (groupError) {
                    console.error(`[Status][${contentId}] Error fetching groups:`, groupError);
                    // Continue without groups, but log it
                } else {
                    groups = fetchedGroups || [];
                }

                const groupIds = groups.map(g => g.id);

                if (groupIds.length > 0) {
                    const { data: fetchedChunks, error: chunkError } = await supabase
                        .from('content_chunks')
                        .select('*')
                        .in('group_id', groupIds)
                        .order('segment_position', { ascending: true })
                        .order('position', { ascending: true });

                    if (chunkError) {
                        console.error(`[Status][${contentId}] Error fetching chunks:`, chunkError);
                        // Continue without chunks, but log it
                    } else {
                        chunks = fetchedChunks || [];
                    }
                }
            }
        } catch (error) {
            console.error(`[Status][${contentId}] Stage 3 FAILED - Group/chunk fetching:`, error);
            // Proceed without group/chunk data, or re-throw if critical
            // For now, let's allow proceeding
        }

        // 4. 최종 응답 데이터 조합
        let responseData: any;
        try {
            responseData = {
                contentId,
                title: contentData?.title,
                status: contentData?.processing_status,
                progress: progress,
                stats: {
                    totalSegments: totalSegments,
                    completedSegments: completedSegments,
                },
                data: {
                    groups: groups,
                    chunksByGroup: chunks.reduce((acc, chunk) => {
                        if (chunk && chunk.group_id) {
                            if (!acc[chunk.group_id]) {
                                acc[chunk.group_id] = [];
                            }
                            acc[chunk.group_id].push(chunk);
                        } else {
                            console.warn(`[Status][${contentId}] Found chunk data without valid group_id:`, chunk);
                        }
                        return acc;
                    }, {} as Record<string, any[]>),
                }
            };
        } catch (error) {
            console.error(`[Status][${contentId}] Stage 4 FAILED - Assembling response data:`, error);
            throw error; // Re-throw to be caught by outer catch
        }

        return NextResponse.json(responseData);

    } catch (error) {
        // Outer catch block logs the specific stage error if re-thrown, or general error
        console.error(`[Status][${contentId ?? 'unknown'}] Final Error Handler Caught:`, error);
        return NextResponse.json({ error: 'Failed to fetch processing status' }, { status: 500 });
    }
}