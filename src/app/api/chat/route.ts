import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { createLLMClient } from '@/lib/llm/client'

const MessageSchema = z.object({
  role:    z.enum(['user', 'assistant']),
  content: z.string().min(1),
})

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1),
})

const SYSTEM_PROMPT = `\
You are Relay, a helpful AI assistant. You are concise, accurate, and friendly.
In later phases you will be able to read and write Jira tickets, GitHub pull
requests, and Slack messages using the Model Context Protocol (MCP).`

export async function POST(req: NextRequest) {
  // Step 1 — parse and validate the request body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.errors },
      { status: 400 }
    )
  }

  // Step 2 — initialise the LLM client for the active provider
  let llm: LLMConfig
  try {
    llm = createLLMClient()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create LLM client'
    return Response.json({ error: message }, { status: 500 })
  }

  // Step 3 — start the streaming completion
  let stream: Awaited<ReturnType<typeof llm.client.chat.completions.create>>
  try {
    stream = await llm.client.chat.completions.create({
      model:    llm.model,
      stream:   true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...parsed.data.messages,
      ],
    })
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    return Response.json({ error: 'LLM request failed' }, { status: 500 })
  }

  // Step 4 — forward the stream as SSE to the browser
  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      try {
        for await (const chunk of stream) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
          )
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`)
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}