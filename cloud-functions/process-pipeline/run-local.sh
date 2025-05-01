#!/bin/bash

# Set environment variables
export SUPABASE_URL="https://empkmxewxtabpjddjlha.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtcGtteGV3eHRhYnBqZGRqbGhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjcwNTA4MCwiZXhwIjoyMDU4MjgxMDgwfQ.-DGPQwkQ4jpLWv7kTi6UuoBnWPjQ6WRdUgUmjYm3R68"
export OPENAI_API_KEY="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"

# Kill any process using port 8081 (alternative port)
lsof -ti:8081 | xargs kill -9 2>/dev/null

# Run the function on port 8081 instead of the default 8080
npm run build && npx functions-framework --target=processTextPipeline --port=8081