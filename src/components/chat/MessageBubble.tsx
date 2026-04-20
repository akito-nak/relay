import { Zap } from 'lucide-react'
import { MarkdownContent } from './MarkdownContent'
import { ToolCallDisplay } from './ToolCallDisplay'
import type { ToolCallData } from './ToolCallDisplay'

export type { ToolCallData }

export interface Message {
  id:        string
  role:      'user' | 'assistant'
  content:   string
  toolCalls?: ToolCallData[]
}

interface MessageBubbleProps {
  message:      Message
  isStreaming?: boolean
}

export function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  const hasToolCalls = Boolean(message.toolCalls?.length)
  const hasContent   = message.content.length > 0
  const allToolsDone = !hasToolCalls ||
    message.toolCalls!.every(tc => tc.result !== undefined)
  const showDots     = isStreaming && !hasContent && allToolsDone

  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Zap className="h-3.5 w-3.5 text-primary" />
      </div>

      <div className="min-w-0 flex-1 pt-0.5 text-sm text-foreground">
        {hasToolCalls && (
          <div className="mb-2 space-y-1">
            {message.toolCalls!.map(tc => (
              <ToolCallDisplay key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {showDots && <StreamingDots />}

        {hasContent && (
          <>
            <MarkdownContent content={message.content} />
            {isStreaming && (
              <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-foreground opacity-70" />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function StreamingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
    </div>
  )
}