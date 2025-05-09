import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import * as fs from 'fs';
import * as path from 'path';

// File size limit (10MB)
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// 테스트 파일 경로 오류를 우회하기 위한 설정
// pdf-parse가 찾는 테스트 디렉토리 생성
const testDir = path.join(process.cwd(), 'test', 'data');
try {
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }

    // 빈 테스트 파일 생성
    const testFilePath = path.join(testDir, '05-versions-space.pdf');
    if (!fs.existsSync(testFilePath)) {
        // 빈 파일 생성
        fs.writeFileSync(testFilePath, Buffer.alloc(0));
    }
} catch (error) {
    console.error('테스트 파일 생성 오류:', error);
    // 오류가 발생해도 계속 진행
}

// 이제 pdf-parse를 안전하게 임포트할 수 있습니다
import pdfParse from 'pdf-parse';

// Debugging: simple GET handler to verify route is live
export async function GET() {
    console.log('[extract-pdf] GET ping');
    return NextResponse.json({ message: 'extract-pdf endpoint live' });
}

export async function POST(request: NextRequest) {
    console.log('[extract-pdf] POST hit');
    try {
        // Create Supabase client and check session
        const supabase = await createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse form data
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Check file type
        if (!file.name.endsWith('.pdf') && file.type !== 'application/pdf') {
            return NextResponse.json({ error: 'Invalid file type. Only PDF files are supported.' }, { status: 400 });
        }

        // Check file size
        if (file.size > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json({
                error: `File size exceeds the maximum limit of 10MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.`
            }, { status: 400 });
        }

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        try {
            // PDF 파싱
            const data = await pdfParse(buffer, { max: 0 });

            // Format the extracted text
            const fileName = file.name.replace('.pdf', '');
            const extractedText = formatPdfText(data.text, fileName);

            return NextResponse.json({
                success: true,
                text: extractedText,
                filename: file.name,
                pageCount: data.numpages,
                info: data.info
            });
        } catch (error: any) {
            console.error('Error parsing PDF:', error);
            return NextResponse.json({ error: 'Failed to parse PDF file: ' + error.message }, { status: 500 });
        }
    } catch (error: any) {
        console.error('Error in PDF extraction:', error);
        return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
    }
}

/**
 * Format the extracted PDF text with proper markdown structure
 */
function formatPdfText(text: string, fileName: string): string {
    // Clean up the text: remove excessive newlines and spaces
    let cleanedText = text
        .replace(/\n{3,}/g, '\n\n')  // Replace 3+ consecutive newlines with just 2
        .replace(/\s{2,}/g, ' ')     // Replace 2+ spaces with just 1
        .trim();

    // Add a title and format as markdown
    const formattedText = `# ${fileName}\n\n${cleanedText}`;

    return formattedText;
}
