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

# Kill any process using port 8081 (alternative port)
lsof -ti:8081 | xargs kill -9 2>/dev/null

# Run the function on port 8081 instead of the default 8080
npm run build && npx functions-framework --target=processTextPipeline --port=8081