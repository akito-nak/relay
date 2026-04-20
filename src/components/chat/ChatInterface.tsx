'use client'

import { useState, useRef, useEffect } from 'react'
import { Loader2, Send, Zap } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import type { Message, ToolCallData } from './MessageBubble'

const SUGGESTIONS = [
  'Explain how the Model Context Protocol works',
  'Save a note called "MCP basics" with a one-sentence summary of what MCP is',
  'What notes have I saved so far?',
  'Write a TypeScript function that fetches JSON from an API',
]

export function ChatInterface() {
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const bottomRef   = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`
  }, [input])

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    const userMessage: Message = {
      id:      crypto.randomUUID(),
      role:    'user',
      content: trimmed,
    }

    const assistantMessage: Message = {
      id:        crypto.randomUUID(),
      role:      'assistant',
      content:   '',
      toolCalls: [],
    }

    setMessages(prev => [...prev, userMessage, assistantMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages: [...messages, userMessage].map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      })

      if (!response.ok)   throw new Error(`HTTP ${response.status}`)
      if (!response.body) throw new Error('No response body')

      const reader  = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const lines = decoder.decode(value, { stream: true }).split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break

          try {
            const parsed = JSON.parse(data)

            // ── Tool call started ──────────────────────────────────────
            if (parsed.type === 'tool_call') {
              const toolCall: ToolCallData = {
                id:   parsed.tool.id,
                name: parsed.tool.name,
                args: parsed.tool.args,
              }
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMessage.id
                    ? { ...msg, toolCalls: [...(msg.toolCalls ?? []), toolCall] }
                    : msg
                )
              )
              continue
            }

            // ── Tool result arrived ────────────────────────────────────
            if (parsed.type === 'tool_result') {
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMessage.id
                    ? {
                        ...msg,
                        toolCalls: (msg.toolCalls ?? []).map(tc =>
                          tc.id === parsed.tool.id
                            ? {
                                ...tc,
                                result:  parsed.tool.content,
                                isError: parsed.tool.isError,
                              }
                            : tc
                        ),
                      }
                    : msg
                )
              )
              continue
            }

            // ── Regular streaming text chunk ───────────────────────────
            const token = parsed.choices?.[0]?.delta?.content ?? ''
            if (!token) continue

            setMessages(prev =>
              prev.map(msg =>
                msg.id === assistantMessage.id
                  ? { ...msg, content: msg.content + token }
                  : msg
              )
            )
          } catch {
            // skip malformed chunk
          }
        }
      }
    } catch {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessage.id
            ? { ...msg, content: 'Something went wrong. Please try again.' }
            : msg
        )
      )
    } finally {
      setIsLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    sendMessage(input)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-hide">
        {messages.length === 0 ? (
          <EmptyState onSuggestionClick={sendMessage} />
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={isLoading && index === messages.length - 1}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-background/80 px-4 py-4 backdrop-blur-sm">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-3xl items-end gap-3"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
            rows={1}
            disabled={isLoading}
            className="max-h-[200px] flex-1 resize-none overflow-y-auto rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send    className="h-4 w-4" />
            }
          </button>
        </form>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Relay can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  )
}

function EmptyState({
  onSuggestionClick,
}: {
  onSuggestionClick: (text: string) => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 py-12">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
        <Zap className="h-6 w-6 text-primary" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">How can I help?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask a question or pick a suggestion below
        </p>
      </div>
      <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            onClick={() => onSuggestionClick(s)}
            className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-muted"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}