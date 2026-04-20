import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { createLLMClient } from '@/lib/llm/client'
import type { LLMConfig } from '@/lib/llm/client'
import { getMCPManager } from '@/lib/mcp/client-manager'

const MessageSchema = z.object({
  role:    z.enum(['user', 'assistant']),
  content: z.string().min(1),
})

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1),
})

const SYSTEM_PROMPT = `\
You are Relay, a helpful AI assistant with access to tools via the Model Context Protocol (MCP).

Important context: "MCP" always refers to the Model Context Protocol — an open standard
by Anthropic that connects AI models to external tools and data sources.
It is NOT Microsoft Certified Professional.

You have access to two sets of tools:
- Notes tools: save, read, list, and delete in-memory notes
- Jira tools: list projects, search tickets, get ticket details, create tickets,
  update ticket status, and add comments

Always call the appropriate tool directly — credentials are pre-configured, never ask
the user for authentication details. Confirm what you did after using a tool.`

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request', details: parsed.error.errors },
      { status: 400 }
    )
  }

  let llm: LLMConfig
  try {
    llm = createLLMClient()
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'LLM init failed' },
      { status: 500 }
    )
  }

  const mcp   = getMCPManager()
  await mcp.initialize()
  const tools = mcp.toOpenAITools()

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...parsed.data.messages,
  ]

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        )
      }

      try {
        // ── Tool call loop (max 5 rounds) ─────────────────────────────
        for (let round = 0; round < 5; round++) {
          const response = await llm.client.chat.completions.create({
            model:       llm.model,
            messages,
            tools:       tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? 'auto' : undefined,
            stream:      false,
          })

          const choice = response.choices[0]
          if (!choice) break

          // ── The LLM wants to call one or more tools ─────────────────
          if (
            choice.finish_reason === 'tool_calls' &&
            choice.message.tool_calls?.length
          ) {
            messages.push(choice.message)

            for (const toolCall of choice.message.tool_calls) {
              const name = toolCall.function.name
              let   args: Record<string, unknown> = {}

              try {
                args = JSON.parse(toolCall.function.arguments) ?? {}
              } catch { /* leave args empty */ }

              // Tell the UI a tool call is happening
              send({ type: 'tool_call', tool: { id: toolCall.id, name, args } })

              // Execute via MCP
              const result = await mcp.callTool(name, args)

              // Tell the UI what the tool returned
              send({ type: 'tool_result', tool: { id: toolCall.id, name, ...result } })

              // Add the result to the conversation so the LLM can read it
              messages.push({
                role:         'tool',
                tool_call_id: toolCall.id,
                content:      result.content,
              })
            }

            // Loop again — the LLM will now compose a response using the tool results
            continue
          }

          // ── No tool calls — stream the final text response ───────────
          const stream = await llm.client.chat.completions.create({
            model:    llm.model,
            messages,
            stream:   true,
          })

          for await (const chunk of stream) {
            send(chunk)
          }

          break
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (err) {
        send({ error: err instanceof Error ? err.message : 'Stream error' })
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