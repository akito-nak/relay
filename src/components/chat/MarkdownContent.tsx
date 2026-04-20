'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Check, Copy } from 'lucide-react'
import 'highlight.js/styles/github-dark.css'

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as React.ReactElement).props.children)
  }
  return ''
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy code"
      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded bg-white/10 text-white/70 opacity-0 transition-opacity hover:bg-white/20 hover:text-white group-hover:opacity-100"
    >
      {copied
        ? <Check className="h-3.5 w-3.5" />
        : <Copy className="h-3.5 w-3.5" />
      }
    </button>
  )
}

export function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        code({ className, children }) {
          const isBlock = Boolean(className?.startsWith('language-'))

          if (isBlock) {
            return <code className={className}>{children}</code>
          }

          return (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
              {children}
            </code>
          )
        },

        pre({ children }) {
          return (
            <div className="group relative my-4">
              <pre className="overflow-x-auto rounded-xl bg-zinc-900 p-4 text-sm leading-relaxed">
                {children}
              </pre>
              <CopyButton text={extractText(children)} />
            </div>
          )
        },

        p({ children }) {
          return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
        },

        h1({ children }) {
          return <h1 className="mb-3 mt-6 text-xl font-bold first:mt-0">{children}</h1>
        },
        h2({ children }) {
          return <h2 className="mb-2 mt-5 text-lg font-semibold first:mt-0">{children}</h2>
        },
        h3({ children }) {
          return <h3 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h3>
        },

        ul({ children }) {
          return <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>
        },
        ol({ children }) {
          return <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>
        },
        li({ children }) {
          return <li className="leading-relaxed">{children}</li>
        },

        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4 hover:opacity-80"
            >
              {children}
            </a>
          )
        },

        blockquote({ children }) {
          return (
            <blockquote className="my-3 border-l-4 border-muted pl-4 italic text-muted-foreground">
              {children}
            </blockquote>
          )
        },

        hr() {
          return <hr className="my-4 border-border" />
        },

        table({ children }) {
          return (
            <div className="my-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          )
        },
        thead({ children }) {
          return <thead className="border-b border-border">{children}</thead>
        },
        th({ children }) {
          return <th className="px-3 py-2 text-left font-semibold">{children}</th>
        },
        td({ children }) {
          return <td className="border-t border-border px-3 py-2">{children}</td>
        },

        strong({ children }) {
          return <strong className="font-semibold">{children}</strong>
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}