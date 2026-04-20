import pkg from '@slack/bolt'
const { App } = pkg
import OpenAI from 'openai'

const app = new App({
  token:     process.env.SLACK_BOT_TOKEN,
  appToken:  process.env.SLACK_APP_TOKEN,
  socketMode: true,
})

function createLLMClient() {
  const provider = process.env.LLM_PROVIDER ?? 'groq'
  switch (provider) {
    case 'groq':
      return {
        client: new OpenAI({ apiKey: process.env.GROQ_API_KEY ?? '', baseURL: 'https://api.groq.com/openai/v1' }),
        model: 'llama-3.3-70b-versatile',
      }
    case 'openai':
      return { client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' }), model: 'gpt-4o-mini' }
    default:
      return {
        client: new OpenAI({ apiKey: process.env.GROQ_API_KEY ?? '', baseURL: 'https://api.groq.com/openai/v1' }),
        model: 'llama-3.3-70b-versatile',
      }
  }
}

const SYSTEM_PROMPT = `\
You are Relay, a helpful AI workspace assistant inside Slack.
MCP always refers to the Model Context Protocol — an open standard by Anthropic.
Keep responses concise and well-formatted for Slack (use *bold*, bullet points, \`code\`).
Do not use markdown headers.`

async function getReply(userMessage: string): Promise<string> {
  const { client, model } = createLLMClient()

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userMessage },
    ],
  })

  return response.choices[0]?.message.content ?? 'Sorry, I could not generate a response.'
}

app.event('app_mention', async ({ event, say }) => {
  try {
    const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim()
    const reply = await getReply(text)
    await say({ text: reply, thread_ts: event.ts })
  } catch (err) {
    console.error('Error handling mention:', err)
    await say({ text: 'Something went wrong. Please try again.', thread_ts: event.ts })
  }
})

app.message(async ({ message, say }) => {
  if (message.subtype) return
  const msg = message as { text?: string; ts: string }
  if (!msg.text) return
  try {
    const reply = await getReply(msg.text)
    await say({ text: reply, thread_ts: msg.ts })
  } catch (err) {
    console.error('Error handling DM:', err)
  }
})

;(async () => {
  await app.start()
  console.log('⚡ Relay Slack bot is running')
})()