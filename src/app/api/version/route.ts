import { APP_VERSION } from '@/utils/version'

export async function GET() {
    return Response.json({ version: APP_VERSION })
} 