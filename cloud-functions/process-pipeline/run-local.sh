#!/bin/bash

# Load environment variables from root .env.local file if it exists
if [ -f ../../.env.local ]; then
  source ../../.env.local
fi

# Check if environment variables are set, otherwise use default values
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
  echo "NEXT_PUBLIC_SUPABASE_URL is not set in .env.local file. Please add it."
  exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "SUPABASE_SERVICE_ROLE_KEY is not set in .env.local file. Please add it."
  exit 1
fi

if [ -z "$OPENAI_API_KEY" ]; then
  echo "OPENAI_API_KEY is not set in .env.local file. Please add it."
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