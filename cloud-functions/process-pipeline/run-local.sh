#!/bin/bash

# 스크립트가 있는 디렉토리로 이동
cd "$(dirname "$0")"

# 프로젝트 루트 디렉토리 (cloud-functions 상위 디렉토리)
ROOT_DIR="$(cd ../.. && pwd)"

# .env.local 파일 경로
ENV_FILE="$ROOT_DIR/.env.local"

# .env.local 파일이 존재하는지 확인
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: .env.local file not found at $ENV_FILE"
    exit 1
fi

# .env.local 파일에서 환경 변수 로드
echo "Loading environment variables from $ENV_FILE"
set -a  # 자동으로 내보내기 활성화
source "$ENV_FILE"
set +a  # 자동으로 내보내기 비활성화

# 필요한 환경 변수가 설정되었는지 확인
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] || [ -z "$OPENAI_API_KEY" ]; then
    echo "Error: Required environment variables are missing in .env.local"
    echo "Make sure NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY are set"
    exit 1
fi

# Export variables with the correct names expected by the application
export SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
export SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
export OPENAI_API_KEY=$OPENAI_API_KEY

# Print environment variables for debugging (without showing the full values)
echo "Environment variables set:"
echo "SUPABASE_URL: ${SUPABASE_URL:0:10}..."
echo "SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY:0:10}..."
echo "OPENAI_API_KEY: ${OPENAI_API_KEY:0:10}..."

# Kill any process using port 8080 (default port)
lsof -ti:8080 | xargs kill -9 2>/dev/null

# Build and run the function with environment variables
npm run build && \
SUPABASE_URL=$SUPABASE_URL \
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY \
OPENAI_API_KEY=$OPENAI_API_KEY \
npx functions-framework --target=processTextPipeline --port=8080