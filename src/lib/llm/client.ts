import OpenAI from 'openai'

export interface LLMConfig {
  client: OpenAI
  model:  string
}

export function createLLMClient(): LLMConfig {
  const provider = process.env.LLM_PROVIDER ?? 'groq'

  switch (provider) {
    case 'groq':
      return {
        client: new OpenAI({
          apiKey:  process.env.GROQ_API_KEY ?? '',
          baseURL: 'https://api.groq.com/openai/v1',
        }),
        model: 'llama-3.3-70b-versatile',
      }

    case 'openai':
      return {
        client: new OpenAI({
          apiKey: process.env.OPENAI_API_KEY ?? '',
        }),
        model: 'gpt-4o-mini',
      }

    case 'ollama':
      return {
        client: new OpenAI({
          apiKey:  'ollama',
          baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
        }),
        model: process.env.OLLAMA_MODEL ?? 'llama3.1:8b',
      }

    default:
      throw new Error(
        `Unknown LLM_PROVIDER: "${provider}". Valid options: groq, openai, ollama`
      )
  }
}