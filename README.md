# ⚡ Relay

A hands-on learning application for building with the **Model Context Protocol (MCP)** — the open standard that connects AI language models to real-world tools and data sources. Relay is a chat-driven workspace assistant that integrates with Jira, Slack, and GitHub through natural language.

> Built to learn. Built to ship.

---

## What Is This?

Relay is two things at once:

1. **A working AI assistant** — chat with an LLM that can read and write Jira tickets, browse GitHub pull requests, post to Slack, and manage notes, all through natural language.

2. **A learning project** — every component is built from scratch and explained. If you want to understand how MCP works, how AI tool calling is orchestrated, or how to wire a streaming LLM response into a Next.js app, this codebase shows you exactly how.

---

## What Is MCP?

**Model Context Protocol (MCP)** is an open standard introduced by Anthropic that defines how AI models communicate with external tools and data sources.

Before MCP, connecting an LLM to a tool (like a database or an API) meant writing custom glue code for every combination of model and tool. MCP standardises that interface — like USB-C for AI. You build a tool once as an MCP server, and any MCP-compatible host can use it.

### Key concepts

| Term | What it means |
|---|---|
| **Host** | The application the user talks to — in Relay, this is the Next.js app |
| **Client** | The MCP protocol implementation inside the host — manages server connections |
| **Server** | A separate process that exposes tools, resources, and prompts |
| **Tool** | A function the LLM can call — e.g. `create_ticket`, `list_notes` |
| **Resource** | Data the LLM can read, identified by a URI — e.g. `jira://ticket/PROJ-123` |
| **Transport** | How the host and server communicate — stdio (local) or HTTP+SSE (remote) |

### How a tool call works

```
You: "Save a note about MCP"
  │
  ▼
Next.js API route receives the message
  │
  ▼
Groq (Llama 3.3 70B) decides to call create_note tool
  │
  ▼
MCP Client Manager routes the call to the Notes MCP server
  │
  ▼
Notes server stores the note, returns a result
  │
  ▼
LLM reads the result, writes a confirmation
  │
  ▼
Streaming response appears in the chat
```

---

## Features

- **Streaming chat** — responses appear token by token as they are generated
- **Tool call display** — see exactly which MCP tools the AI calls, with arguments and results
- **Markdown rendering** — bold, lists, headings, and code blocks with syntax highlighting
- **Code copy button** — one click to copy any code block
- **Dark / light mode** — toggle with persistence across sessions
- **Provider switching** — swap between Groq, OpenAI, and Ollama with one env var change
- **Notes MCP server** — a custom MCP server built from scratch for learning
- **Jira integration** *(Phase 3)* — create and query tickets via natural language
- **GitHub integration** *(Phase 4)* — PR summaries and issue tracking
- **Slack bot** *(Phase 5)* — chat with Relay directly from Slack

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | Full-stack — API routes live alongside the UI |
| UI | React 18 + Tailwind CSS + shadcn/ui | Fast, responsive, component-driven |
| Language | TypeScript | Required for working safely with MCP schemas |
| LLM | Groq (Llama 3.3 70B) | Free tier, fastest inference, strong tool calling |
| MCP | `@modelcontextprotocol/sdk` | Official Anthropic SDK for building MCP servers and clients |
| Markdown | `react-markdown` + `rehype-highlight` | Renders LLM output cleanly with syntax highlighting |
| Testing | Jest + React Testing Library + Playwright | Unit, component, and integration coverage |

---

## Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later
- A free **Groq API key** — get one at [console.groq.com](https://console.groq.com)

Optional (for later phases):
- A free **Jira Cloud** account — [atlassian.com](https://www.atlassian.com)
- A free **Slack** workspace — [slack.com](https://slack.com)
- A **GitHub** personal access token — [github.com/settings/tokens](https://github.com/settings/tokens)

---

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/akito-nak/relay.git
cd relay
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example env file and fill in your values:

```bash
cp .env.local.example .env.local
```

Open `.env.local` and add your Groq API key:

```bash
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_your_key_here
```

> **Never commit `.env.local`** — it is in `.gitignore` by default.

### 4. Build the MCP servers

Each MCP server is a separate TypeScript package that must be compiled before it can run:

```bash
cd packages/notes-server
npm install
npm run build
cd ../..
```

> When new MCP servers are added in later phases, repeat this step for each one.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Running Locally

### Development

```bash
npm run dev          # start Next.js dev server with hot reload
```

### Tests

```bash
npm test             # run all unit and component tests
npm run test:watch   # watch mode
npm run test:coverage # with coverage report
npm run test:e2e     # Playwright integration tests
```

### Type checking

```bash
npm run type-check   # TypeScript compiler check (no emit)
```

### Linting

```bash
npm run lint
```

---

## Switching LLM Providers

Relay is designed to work with any OpenAI-compatible API. Change one line in `.env.local`:

```bash
# Groq — free, fastest (default)
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...

# OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Ollama — fully local, no API key needed
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1:8b
```

No code changes required — the provider badge in the header updates automatically.

---

## Project Structure

```
relay/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── chat/route.ts        # LLM + MCP orchestration
│   │   ├── layout.tsx               # Root layout with font and metadata
│   │   ├── page.tsx                 # Home page
│   │   └── globals.css              # Tailwind base + CSS variables
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatInterface.tsx    # Main chat component (streaming, state)
│   │   │   ├── MessageBubble.tsx    # Individual message rendering
│   │   │   ├── MarkdownContent.tsx  # Markdown + code highlighting
│   │   │   └── ToolCallDisplay.tsx  # MCP tool call visualization
│   │   └── ui/
│   │       └── theme-toggle.tsx     # Dark / light mode button
│   └── lib/
│       ├── llm/
│       │   └── client.ts            # LLM provider factory (Groq / OpenAI / Ollama)
│       └── mcp/
│           └── client-manager.ts    # MCP server connections and tool routing
│
├── packages/
│   ├── notes-server/                # Phase 2: custom notes MCP server
│   └── jira-server/                 # Phase 3: custom Jira MCP server
│
├── apps/
│   └── slack-bot/                   # Phase 5: Slack Bolt app
│
├── tests/
│   └── integration/                 # Playwright end-to-end tests
│
├── SPEC.md                          # Full project specification and tutorial
├── .env.local.example               # Environment variable template
└── jest.config.ts                   # Test configuration
```

---

## MCP Servers

### Notes Server *(Phase 2 — complete)*

A simple in-memory note store — no external API. Built to learn the MCP protocol without authentication complexity.

| Tool | Description |
|---|---|
| `create_note` | Create or overwrite a note by title |
| `read_note` | Read a note's content by title |
| `list_notes` | List all saved note titles |
| `delete_note` | Delete a note by title |

### Jira Server *(Phase 3 — in progress)*

A custom MCP server wrapping the Jira Cloud REST API.

| Tool | Description |
|---|---|
| `search_tickets` | Search issues using JQL |
| `get_ticket` | Get full ticket details |
| `create_ticket` | Create a new issue |
| `update_ticket_status` | Transition ticket status |
| `add_comment` | Add a comment to a ticket |

### GitHub Server *(Phase 4 — planned)*

Uses the official `@modelcontextprotocol/server-github` package.

### Slack Bot *(Phase 5 — planned)*

A Slack Bolt app that exposes the same AI assistant via Slack slash commands and mentions.

---

## Real-World MCP Servers Worth Studying

If you want to see how production MCP servers are built, these are excellent references:

| Server | What it teaches |
|---|---|
| `@modelcontextprotocol/server-filesystem` | Path security, file:// resource URIs |
| `@modelcontextprotocol/server-github` | Wrapping a REST API, HTTP+SSE transport |
| `@modelcontextprotocol/server-postgres` | Read-only access patterns, schema as resources |
| `@modelcontextprotocol/server-memory` | Stateful servers, prompt + tool cooperation |
| `@modelcontextprotocol/server-puppeteer` | Binary (image) content, stateful browser sessions |

---

## Learn More

- [Model Context Protocol — official docs](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Groq Console](https://console.groq.com)
- [Next.js App Router docs](https://nextjs.org/docs/app)
- Full project specification and tutorial: [`SPEC.md`](./SPEC.md)

---

## Phases

| Phase | Status | Description |
|---|---|---|
| 1 | ✅ Complete | Next.js scaffold, streaming chat, LLM abstraction |
| 2 | ✅ Complete | Notes MCP server, tool call UI |
| 3 | ✅ Complete | Jira MCP server |
| 4 | ✅ Complete | GitHub MCP server |
| 5 | ✅ Complete | Slack bot |
| 6 | 🔨 In progress | Tests, deployment, portfolio polish |
