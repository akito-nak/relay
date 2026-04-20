'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, Terminal, XCircle } from 'lucide-react'

export interface ToolCallData {
  id:       string
  name:     string
  args:     Record<string, unknown>
  result?:  string
  isError?: boolean
}

export function ToolCallDisplay({ toolCall }: { toolCall: ToolCallData }) {
  const [expanded, setExpanded] = useState(false)
  const hasResult = toolCall.result !== undefined
  const hasArgs   = Object.keys(toolCall.args ?? {}).length > 0

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-muted/30 text-xs">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

        <span className="font-mono font-medium text-foreground">
          {toolCall.name}
        </span>

        <span className="ml-auto flex items-center gap-1.5">
          {!hasResult && (
            <>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <span className="text-muted-foreground">running</span>
            </>
          )}
          {hasResult && !toolCall.isError && (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          )}
          {hasResult && toolCall.isError && (
            <XCircle className="h-3.5 w-3.5 text-destructive" />
          )}
        </span>

        {expanded
          ? <ChevronDown  className="h-3 w-3 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        }
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {hasArgs && (
            <div>
              <p className="mb-1 text-muted-foreground">Input</p>
              <pre className="overflow-x-auto rounded bg-zinc-900 p-2 text-zinc-100">
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
          )}

          {hasResult && (
            <div>
              <p className={`mb-1 ${toolCall.isError ? 'text-destructive' : 'text-muted-foreground'}`}>
                {toolCall.isError ? 'Error' : 'Output'}
              </p>
              <pre className={`overflow-x-auto rounded p-2 ${
                toolCall.isError
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-zinc-900 text-zinc-100'
              }`}>
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}