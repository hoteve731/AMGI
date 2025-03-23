import OpenAI from 'openai'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

export async function generateTitle(text: string): Promise<string> {
    const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
            {
                role: "system",
                content: "You are a helpful assistant that generates concise and meaningful titles for given text. The title should capture the main idea or concept."
            },
            {
                role: "user",
                content: `Generate a short and meaningful title for this text:\n\n${text}`
            }
        ],
        temperature: 0.7,
        max_tokens: 50
    })

    return response.choices[0].message.content?.trim() || 'Untitled'
}

export async function splitIntoChunks(text: string): Promise<string[]> {
    const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
            {
                role: "system",
                content: "Split the given text into meaningful chunks. Each chunk should contain one main idea or concept, ideally around 200 characters but prioritize semantic completeness over character count. Return the chunks as a JSON array of strings."
            },
            {
                role: "user",
                content: `Split this text into meaningful chunks:\n\n${text}`
            }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
    })

    const result = JSON.parse(response.choices[0].message.content || '{"chunks": []}')
    return result.chunks
}

export async function maskKeyTerms(chunk: string): Promise<{
    maskedText: string,
    terms: string[]
}> {
    const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
            {
                role: "system",
                content: "Identify key terms in the text and create a masked version where these terms are replaced with underscores. Return both the masked text and the list of masked terms as a JSON object."
            },
            {
                role: "user",
                content: `Create a masked version of this text:\n\n${chunk}`
            }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
    })

    const result = JSON.parse(response.choices[0].message.content || '{"maskedText": "", "terms": []}')
    return result
} 