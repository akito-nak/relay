import type { Metadata } from 'next'
import { Zap } from 'lucide-react'
import { ChatInterface } from '@/components/chat/ChatInterface'

export const metadata: Metadata = {
  title: 'Chat',
}

function getProviderLabel(): string {
  const provider = process.env.LLM_PROVIDER ?? 'groq'
  const labels: Record<string, string> = {
    groq:      'Groq · Llama 3.3 70B',
    openai:    'OpenAI · GPT-4o',
    anthropic: 'Anthropic · Claude',
    ollama:    'Ollama (local)',
    gemini:    'Gemini Flash',
  }
  return labels[provider] ?? provider
}

export default function HomePage() {
  const providerLabel = getProviderLabel()

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight text-foreground">
            Relay
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            {providerLabel}
          </span>
          <span
            className="h-2 w-2 rounded-full bg-green-500"
            title="LLM connected"
          />
        </div>
      </header>

      <ChatInterface />
    </div>
  )
}