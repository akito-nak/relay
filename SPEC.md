# Relay — Technical Specification

> **A production-quality AI workspace assistant connecting Jira, Slack, and GitHub via the Model Context Protocol.**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals & Architecture Decisions](#2-goals--architecture-decisions)
3. [Architecture Overview](#3-architecture-overview)
4. [Technology Stack](#4-technology-stack)
   - 4.1 [Frontend](#41-frontend)
   - 4.2 [Backend](#42-backend)
   - 4.3 [LLM Layer](#43-llm-layer)
   - 4.4 [MCP Layer](#44-mcp-layer)
   - 4.5 [External Services](#45-external-services)
   - 4.6 [Testing](#46-testing)
5. [What Is MCP?](#5-what-is-mcp)
   - 5.1 [The Problem MCP Solves](#51-the-problem-mcp-solves)
   - 5.2 [Core Concepts & Glossary](#52-core-concepts--glossary)
   - 5.3 [How MCP Works — Step by Step](#53-how-mcp-works--step-by-step)
   - 5.4 [Transport Mechanisms](#54-transport-mechanisms)
   - 5.5 [MCP vs Function Calling](#55-mcp-vs-function-calling)
6. [MCP Ecosystem Reference](#6-mcp-ecosystem-reference)
7. [Services & Infrastructure](#7-services--infrastructure)
   - 7.1 [Why Groq?](#71-why-groq)
   - 7.2 [LLM Switching Strategy](#72-llm-switching-strategy)
   - 7.3 [Jira Cloud Free Tier](#73-jira-cloud-free-tier)
   - 7.4 [Slack Free Workspace](#74-slack-free-workspace)
   - 7.5 [GitHub Free Tier](#75-github-free-tier)
   - 7.6 [Local Machine Constraints (M1, 32GB)](#76-local-machine-constraints-m1-32gb)
8. [Application Features](#8-application-features)
9. [Phased Build Plan](#9-phased-build-plan)
   - Phase 1: [Foundation & Chat UI](#phase-1-foundation--chat-ui)
   - Phase 2: [Notes MCP Server](#phase-2-notes-mcp-server)
   - Phase 3: [Jira MCP Server](#phase-3-jira-mcp-server)
   - Phase 4: [GitHub MCP Server](#phase-4-github-mcp-server)
   - Phase 5: [Slack Bot Integration](#phase-5-slack-bot-integration)
   - Phase 6: [Polish, Tests & Portfolio](#phase-6-polish-tests--portfolio)
10. [Challenges & Approaches](#10-challenges--approaches)
11. [Testing Strategy](#11-testing-strategy)
12. [File & Folder Structure](#12-file--folder-structure)
13. [Environment Variables](#13-environment-variables)
14. [Glossary Quick Reference](#14-glossary-quick-reference)

---

## 1. Overview

Relay is a **chat-driven workspace assistant** built on the **Model Context Protocol (MCP)** — the open standard for connecting AI language models to external tools and data. It is a web UI where you converse with an AI that can read and write Jira tickets, browse GitHub repositories, post to Slack, and manage notes — all through natural language, powered entirely by free-tier services.

This document is the technical specification covering architecture, design decisions, infrastructure, and implementation details for each phase of the project.

---

## 2. Goals & Architecture Decisions

**Project goals:**

- Build a fully functional AI assistant that operates across Jira, GitHub, Slack, and a Notes store via MCP
- Implement a provider-agnostic LLM layer switchable via a single environment variable
- Use the official Anthropic MCP SDK for both custom servers (Notes, Jira) and official servers (GitHub)
- Keep all infrastructure on free tiers: Groq, Jira Cloud, GitHub, Slack
- Maintain unit test coverage across the LLM abstraction layer and MCP client manager

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Browser (React / Next.js)                      │
│                                                                        │
│   ┌─────────────────────┐         ┌───────────────────────────────┐  │
│   │  Chat UI            │         │  Dashboard / Activity Feed    │  │
│   │  - Streaming msgs   │         │  - Jira ticket list           │  │
│   │  - Tool call display│         │  - GitHub PR summary          │  │
│   │  - MCP server status│         │  - Slack message log          │  │
│   └──────────┬──────────┘         └───────────────────────────────┘  │
└──────────────┼──────────────────────────────────────────────────────-─┘
               │ HTTP / SSE (streaming)
┌──────────────▼───────────────────────────────────────────────────────┐
│                        Next.js API Routes                              │
│                                                                        │
│   POST /api/chat          → orchestrates LLM + MCP tool calls         │
│   GET  /api/mcp/servers   → lists active MCP servers & their tools    │
│   POST /api/mcp/invoke    → directly invoke an MCP tool (debug UI)    │
│   POST /api/slack/events  → Slack webhook receiver                    │
└──────────────┬───────────────────────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────────────────┐
│                        LLM Abstraction Layer                           │
│                                                                        │
│   Reads LLM_PROVIDER env var to select:                               │
│     - groq      → Groq API (Llama 3.3 70B) — default, free           │
│     - openai    → OpenAI API                                          │
│     - anthropic → Anthropic Claude API                                │
│     - gemini    → Google Gemini API                                   │
│     - ollama    → Local Ollama instance                               │
│                                                                        │
│   All providers use the OpenAI-compatible chat completions format.    │
│   Tool/function call schema is normalized here.                       │
└──────────────┬───────────────────────────────────────────────────────┘
               │ Tool calls routed to MCP Client Manager
┌──────────────▼───────────────────────────────────────────────────────┐
│                        MCP Client Manager                              │
│                                                                        │
│   Manages connections to one or more MCP servers.                     │
│   Translates LLM tool call requests → MCP protocol messages.          │
│   Returns MCP results → LLM as tool call results.                     │
└──────┬────────────────────┬─────────────────────┬────────────────────┘
       │                    │                      │
┌──────▼──────┐    ┌────────▼────────┐    ┌───────▼──────────┐
│ Notes MCP   │    │  Jira MCP       │    │  GitHub MCP      │
│ Server      │    │  Server         │    │  Server          │
│ (Phase 2)   │    │  (Phase 3,      │    │  (Phase 4,       │
│ (custom)    │    │   custom)       │    │   official)      │
│ stdio       │    │  stdio/HTTP     │    │  HTTP/SSE        │
└─────────────┘    └────────┬────────┘    └───────┬──────────┘
                            │                      │
                   ┌────────▼────────┐    ┌───────▼──────────┐
                   │  Jira Cloud     │    │  GitHub API      │
                   │  REST API       │    │  REST/GraphQL    │
                   │  (free ≤10      │    │  (free)          │
                   │   users)        │    │                  │
                   └─────────────────┘    └──────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Slack Bolt App (separate lightweight process)                       │
│                                                                      │
│  Receives Slack events → forwards to /api/chat → responds via       │
│  Slack SDK. Uses the same MCP servers as the web UI.                │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Single monorepo | Yes (Next.js) | API routes live alongside UI; MCP servers in packages/ |
| MCP transport | stdio (local), HTTP+SSE (Phase 4+) | stdio is easiest to start; HTTP scales to remote servers |
| LLM provider | Groq (default) | Free tier, fastest response, best tool-call reliability of free options |
| State management | React Context + SWR | Lightweight; no Redux overhead for this scope |
| Database | None initially; SQLite (Phase 5) | Start simple; add persistence only when needed |

---

## 4. Technology Stack

### 4.1 Frontend

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 14+ (App Router) | Full-stack framework; API routes + React UI |
| **React** | 18+ | UI library |
| **TypeScript** | 5+ | Type safety — critical when working with MCP schemas |
| **Tailwind CSS** | 3+ | Utility-first styling for fast, responsive UI |
| **shadcn/ui** | latest | Pre-built accessible components (chat bubbles, cards, badges) |
| **SWR** | 2+ | Data fetching and caching for dashboard panels |
| **Lucide React** | latest | Icon library (matches shadcn/ui) |

> **Why Next.js over plain React?** Next.js API routes let us keep the MCP client server-side, which is important because MCP servers are spawned as child processes — that can't happen in a browser.

### 4.2 Backend

| Technology | Purpose |
|---|---|
| **Next.js API Routes** (App Router) | HTTP endpoints for chat, MCP management, Slack webhooks |
| **Node.js streams / ReadableStream** | Server-Sent Events for streaming LLM responses to the UI |
| **Zod** | Schema validation for MCP tool inputs/outputs and API request bodies |
| **@slack/bolt** | Slack app framework (separate process, Phase 5) |

### 4.3 LLM Layer

| Provider | Model | Free? | Tool Calling | Notes |
|---|---|---|---|---|
| **Groq** (default) | `llama-3.3-70b-versatile` | Yes (rate limited) | Excellent | Primary choice; very fast |
| Groq | `gemma2-9b-it` | Yes | Decent | Fallback if 70B hits limits |
| OpenAI | `gpt-4o-mini` | No (paid) | Excellent | Easy upgrade path |
| Anthropic | `claude-haiku-4-5` | No (paid) | Excellent | Best-in-class tool use |
| Google Gemini | `gemini-2.0-flash` | Yes (AI Studio) | Excellent | Free alternative to Groq |
| Ollama (local) | `llama3.2:3b` | Yes (no limits) | Good | Fully offline; slower on M1 |

**Groq Free Tier Limits (as of spec writing):**
- 30 requests/minute
- 14,400 requests/day
- 6,000 tokens/minute

For development and personal use, these limits are sufficient. The app will display current usage and gracefully degrade (show a clear error with retry guidance, never silently fail).

### 4.4 MCP Layer

| Package | Purpose |
|---|---|
| `@modelcontextprotocol/sdk` | Official MCP TypeScript SDK — client + server base classes |
| `@modelcontextprotocol/server-github` | Official GitHub MCP server (Phase 4) |
| Custom `jira-mcp-server` | Custom server wrapping the Jira Cloud REST API (Phase 3) |
| Custom `notes-mcp-server` | Custom in-memory notes server (Phase 2) |

### 4.5 External Services

| Service | Free Tier | Used For |
|---|---|---|
| **Groq** | 14,400 req/day | LLM inference |
| **Jira Cloud** | Free ≤10 users | Ticket management |
| **Slack** | Free (90-day history) | Bot interaction |
| **GitHub** | Free | Repo/PR/issue data |
| **Vercel** | Free hobby tier | Deployment (Phase 6) |

### 4.6 Testing

| Tool | Purpose |
|---|---|
| **Jest** | Unit tests — LLM abstraction, MCP tool schemas, utility functions |
| **React Testing Library** | Component tests — chat UI, tool call display |
| **Playwright** | Integration/e2e tests — full chat flow, MCP tool invocation |
| **MSW (Mock Service Worker)** | Mock external APIs (Jira, Groq) in tests |

---

## 5. What Is MCP?

### 5.1 The Problem MCP Solves

Large language models are powerful at reasoning, but they start with no access to your data. A model doesn't know what's in your Jira board, what's on your filesystem, or what happened in last night's GitHub CI run.

**Before MCP**, developers solved this by:
1. Injecting data into the prompt (context stuffing — hits token limits fast)
2. Writing custom function-calling code per application (fragmented, no reuse)
3. Building one-off plugins per model provider (OpenAI Plugins, etc.)

**MCP** (Model Context Protocol) is an open standard, introduced by Anthropic in late 2024, that defines a universal interface between an AI model and external tools/data. Think of it as:

> **USB-C for AI** — one standard connector, any device.

If you build a Jira MCP server today, it works with Claude, with an app using Groq, with a future model you haven't heard of yet — as long as it speaks MCP.

### 5.2 Core Concepts & Glossary

#### MCP Host
The **host** is the application a user interacts with. It embeds an MCP client and manages connections to MCP servers.

*Examples:* Claude Desktop, Cursor IDE, **your Next.js app**.

#### MCP Client
The **client** is the protocol implementation inside the host. It connects to servers, discovers their capabilities, and routes LLM tool calls to the appropriate server.

*In Relay:* The MCP client is managed by `src/lib/mcp/client-manager.ts` using `@modelcontextprotocol/sdk`'s `Client` class.

#### MCP Server
The **server** is a separate process that exposes capabilities. It can be:
- A local subprocess (stdio transport) — simplest to start
- A remote HTTP server (HTTP+SSE transport) — production-ready

*In Relay:* Two custom servers (Notes, Jira) and one official server (GitHub via `@modelcontextprotocol/server-github`).

#### Tools
**Tools** are functions the LLM can decide to call. They're the main mechanism for taking action.

```typescript
// Example tool definition in an MCP server
{
  name: "create_jira_ticket",
  description: "Creates a new ticket in a Jira project",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", description: "Jira project key, e.g. PROJ" },
      summary: { type: "string", description: "Ticket title" },
      description: { type: "string", description: "Detailed description" },
      issueType: { type: "string", enum: ["Bug", "Story", "Task"] }
    },
    required: ["project", "summary", "issueType"]
  }
}
```

When the LLM receives a user message like *"Create a bug ticket for the login crash"*, it sees all available tools and decides to call `create_jira_ticket` with the right arguments. Your MCP server executes the real Jira API call and returns the result.

#### Resources
**Resources** are data the LLM can read — like files, database rows, or API responses. Unlike tools, resources don't take arguments; they're identified by a URI.

```
jira://tickets/PROJ-123        → returns ticket details
github://repos/my-org/my-repo  → returns repo metadata
notes://note/meeting-2024-01-15 → returns a note's content
```

Resources are useful for giving the LLM access to specific pieces of data without requiring it to call a tool.

#### Prompts
**Prompts** are pre-built prompt templates exposed by the server. They help standardize common interactions.

```typescript
// A Jira server might expose this prompt:
{
  name: "sprint_standup",
  description: "Generate a standup update from current sprint tickets",
  arguments: [
    { name: "assignee", description: "Jira username to filter by" }
  ]
}
```

#### Sampling
**Sampling** allows an MCP server to ask the host to make an LLM call on its behalf. Less commonly used, but enables complex agentic patterns where the server itself needs to reason.

### 5.3 How MCP Works — Step by Step

Here is the full lifecycle of a user asking *"Create a Jira bug for the login crash"*:

```
User → "Create a Jira bug for the login crash"
  │
  ▼
[1] Next.js API route receives the message
  │
  ▼
[2] LLM Abstraction Layer calls Groq with:
    - The user's message
    - A list of available tools (fetched from all connected MCP servers)
    - System prompt explaining what the assistant can do
  │
  ▼
[3] Groq (Llama 3.3 70B) responds:
    "I'll create that bug ticket."
    tool_call: {
      name: "create_jira_ticket",
      arguments: {
        project: "PROJ",
        summary: "Login crash on mobile",
        issueType: "Bug",
        description: "Users report app crashes when attempting to log in on iOS 17"
      }
    }
  │
  ▼
[4] MCP Client Manager receives the tool call
    Finds the Jira MCP server handles "create_jira_ticket"
    Sends MCP CallToolRequest to the Jira server process
  │
  ▼
[5] Jira MCP Server receives the request
    Makes a real call to Jira Cloud REST API
    Returns: { ticketId: "PROJ-456", url: "https://..." }
  │
  ▼
[6] MCP Client returns the result to the LLM
    LLM generates a final human-readable response:
    "Done! I created bug ticket PROJ-456: 'Login crash on mobile'. 
     You can view it here: https://..."
  │
  ▼
[7] Response streamed back to the React UI
```

### 5.4 Transport Mechanisms

MCP servers communicate with clients over a **transport**. Two are relevant here:

#### stdio (Standard I/O)
The server runs as a child process. The client writes JSON-RPC messages to stdin, reads responses from stdout. Simple, no networking required.

```
Host process  ──stdin──►  MCP Server process
              ◄─stdout──
```

**Best for:** Local servers, getting started, development.
**Used in:** Phase 2 (Notes server), Phase 3 (Jira server).

#### HTTP + SSE (Server-Sent Events)
The server runs as an HTTP server. The client connects via HTTP for requests and SSE for streaming responses.

```
Host  ──POST /mcp──►  MCP HTTP Server
      ◄──SSE stream──
```

**Best for:** Remote servers, production deployments, servers you want to share.
**Used in:** Phase 4 (GitHub MCP server connects via HTTP).

### 5.5 MCP vs Function Calling

You may have heard of **OpenAI function calling** or **tool use**. MCP is related but different:

| | OpenAI Function Calling | MCP |
|---|---|---|
| What it is | Feature of a specific LLM API | Open protocol standard |
| Who defines tools | Your application code | MCP server (separate process) |
| Portability | OpenAI-specific | Works with any MCP-compatible host |
| Runtime | In-process | Out-of-process (separate server) |
| Discovery | You hardcode tool schemas | Client discovers tools dynamically from server |
| Reusability | Per-app | One server, many apps |

MCP uses the same underlying idea (LLM picks a function to call, you execute it) but standardizes the protocol so tools become **reusable and composable** across different hosts and models.

---

## 6. MCP Ecosystem Reference

Notable production MCP servers and what makes each architecturally interesting.

### 1. `@modelcontextprotocol/server-filesystem`
**What it does:** Exposes your local filesystem as MCP tools and resources. The LLM can read files, write files, list directories, search contents.

**Why it's interesting:** Shows how to handle security — the server enforces an `allowedPaths` whitelist so the LLM cannot read `/etc/passwd`. Good model for any server that needs access controls.

**Tools exposed:** `read_file`, `write_file`, `list_directory`, `search_files`, `create_directory`

**Notable:** Implements resources with file:// URIs and path safety validation.

---

### 2. `@modelcontextprotocol/server-github`
**What it does:** Connects to GitHub's API. Lets the LLM read repos, issues, PRs, commits, file contents.

**Why it's interesting:** Uses HTTP+SSE transport and handles OAuth token auth. Shows how to wrap a third-party REST API as MCP tools with clean schema design.

**Tools exposed:** `get_pull_request`, `list_issues`, `create_issue`, `search_repositories`, `get_file_contents`

**Notable:** Clean schema design for CRUD APIs — the same pattern used in Relay's Jira server.

---

### 3. `@modelcontextprotocol/server-postgres`
**What it does:** Gives the LLM read-only access to a PostgreSQL database — it can list tables, describe schemas, and run SELECT queries.

**Why it's interesting:** Exposes database schema as MCP resources (each table is a resource). Enforces read-only access at the SQL level. Shows how to expose structured data safely.

**Notable:** Resource URI design (`postgres://table/users`) and schema metadata as resources.

---

### 4. `@modelcontextprotocol/server-brave-search`
**What it does:** Wraps the Brave Search API so the LLM can search the web.

**Why it's interesting:** Extremely simple — just one tool (`brave_web_search`). Perfect reference for your first server. Also shows API key management via environment variables.

**Notable:** Minimal server implementation — good reference for single-tool servers.

---

### 5. `@modelcontextprotocol/server-puppeteer`
**What it does:** Gives the LLM control over a headless Chromium browser — navigate to URLs, click elements, fill forms, take screenshots.

**Why it's interesting:** Tools return multimodal content (screenshots as base64 images). Shows MCP isn't just text. Also illustrates stateful servers — the browser session persists across tool calls.

**Notable:** Returns image/binary content; manages stateful browser sessions across tool calls.

---

### 6. `@modelcontextprotocol/server-memory`
**What it does:** A knowledge graph that persists between conversations. The LLM can store entities, relationships, and observations — and query them later.

**Why it's interesting:** Adds long-term memory to any LLM without RAG complexity. Shows how prompts and tools work together: the server exposes a prompt that tells the LLM how and when to save memories.

**Notable:** Prompt + tool cooperation for autonomous memory; JSON file persistence.

---

### 7. Community: Linear MCP Server
**What it does:** Connects to Linear (a popular issue tracker), exposing issues, cycles (sprints), and projects as tools.

**Why it's interesting:** Similar architecture to Relay's Jira server — shows how to wrap a GraphQL API vs REST.

---

### 8. Community: Slack MCP Server
**What it does:** Reads Slack channels, sends messages, searches message history.

**Why it's interesting:** Shows how to handle OAuth scope complexity and rate limiting. Relevant to Phase 5.

---

## 7. Services & Infrastructure

### 7.1 Why Groq?

Groq builds custom silicon (LPUs — Language Processing Units) optimized for inference. The result is dramatically faster token generation than GPU-based providers.

| Provider | Tokens/sec (approx) | Llama 3.3 70B | Free? |
|---|---|---|---|
| Groq | ~800-1200 | Yes | Yes |
| Together AI | ~100-200 | Yes | Limited |
| Ollama (M1 32GB) | ~15-40 | Yes | Yes (local) |
| OpenAI | ~60-100 | No (GPT-4o) | No |

For a chat application, speed directly impacts user experience. Groq's free tier is the best combination of quality + speed + zero cost available.

**Groq API endpoint:** `https://api.groq.com/openai/v1` — it uses the OpenAI-compatible format, so swapping to real OpenAI later is a one-line change.

### 7.2 LLM Switching Strategy

The abstraction lives in `src/lib/llm/client.ts`. It reads `LLM_PROVIDER` from env and returns a provider-specific client that exposes a common interface.

```typescript
// src/lib/llm/types.ts
export interface LLMClient {
  chat(messages: Message[], tools?: Tool[]): Promise<LLMResponse>;
  stream(messages: Message[], tools?: Tool[]): AsyncIterable<LLMChunk>;
}

// src/lib/llm/client.ts
export function createLLMClient(): LLMClient {
  const provider = process.env.LLM_PROVIDER ?? "groq";
  switch (provider) {
    case "groq":     return new GroqClient();
    case "openai":   return new OpenAIClient();
    case "anthropic": return new AnthropicClient();
    case "ollama":   return new OllamaClient();
    default: throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
```

**Switching providers:** Change `LLM_PROVIDER` in `.env.local`. No other code changes.

### 7.3 Jira Cloud Free Tier

Jira Cloud offers a free plan for up to **10 users** with unlimited projects and issues. This is sufficient for the project.

**Setup steps:**
1. Create a free Atlassian account at atlassian.com
2. Create a Jira Software project
3. Generate an API token at `id.atlassian.com/manage-profile/security/api-tokens`
4. Note your domain: `your-domain.atlassian.net`

**Authentication:** Basic auth with email + API token (Base64 encoded).

**Rate limits:** 1000 requests per 10 minutes per user — very generous for development.

### 7.4 Slack Free Workspace

The Slack free plan retains 90 days of message history and supports full API access for bots.

**Setup steps:**
1. Create a free Slack workspace at slack.com
2. Go to `api.slack.com/apps` → Create New App → From Scratch
3. Add Bot Token Scopes: `chat:write`, `commands`, `app_mentions:read`
4. Install to workspace, save Bot Token (`xoxb-...`)
5. Enable Socket Mode for local development (no public URL needed)

**Why Socket Mode?** In development, your laptop isn't publicly accessible. Socket Mode lets Slack push events to your app via WebSocket instead of HTTP webhooks — no ngrok needed.

### 7.5 GitHub Free Tier

GitHub's free plan includes full API access with 5,000 requests/hour per token. More than enough.

**Setup:** Create a Personal Access Token at `github.com/settings/tokens` with `repo` and `read:org` scopes.

### 7.6 Local Machine Constraints (M1, 32GB)

Your MacBook Pro M1 with 32GB RAM is capable of running models locally via Ollama, but the experience varies by model size:

| Model | Size | Speed on M1 32GB | Tool Calling |
|---|---|---|---|
| `llama3.2:1b` | ~1.3GB | Very fast (~80 tok/s) | Poor |
| `llama3.2:3b` | ~2GB | Fast (~50 tok/s) | Decent |
| `llama3.1:8b` | ~5GB | Comfortable (~30 tok/s) | Good |
| `llama3.3:70b` | ~43GB | Won't fit | N/A |
| `qwen2.5:14b` | ~9GB | Good (~20 tok/s) | Good |

**Recommendation:** Use Groq for the primary experience (fast, reliable tool calling, no local resources). Use Ollama + `llama3.1:8b` only if you need to work offline or hit Groq limits.

The Next.js dev server, MCP server subprocesses, and the Slack Bolt process combined use ~800MB RAM — well within your 32GB.

---

## 8. Application Features

### Core Features (All Phases)

- **Chat interface** with streaming AI responses
- **Tool call visualization** — when the AI calls an MCP tool, show it in the UI (tool name, arguments, result)
- **MCP server status panel** — shows connected servers and available tools
- **Provider badge** — shows which LLM is active
- **Error display** — clear, actionable error messages (rate limit, auth failure, etc.)

### Jira Features (Phase 3)

- Query tickets by project, assignee, sprint, status
- Create tickets from natural language
- Update ticket status, add comments
- Summarize sprint progress

### GitHub Features (Phase 4)

- List open PRs and their status
- Summarize a PR (changes + CI status)
- Create issues from a description
- Search code across a repository

### Slack Features (Phase 5)

- Slack slash command `/ask [question]` → AI responds in-channel
- Mention the bot `@assistant create a Jira ticket for...`
- Bot posts standup summaries on a schedule

---

## 9. Phased Build Plan

---

### Phase 1: Foundation & Chat UI

**Status:** ✅ Complete

**Goal:** Next.js app with streaming chat UI connected to Groq, with provider abstraction for switching LLMs via env var.

**What to build:**

1. **Scaffold Next.js project**
   ```bash
   npx create-next-app@latest mcp-learning-app \
     --typescript --tailwind --app --src-dir
   cd mcp-learning-app
   npx shadcn@latest init
   ```

2. **Install dependencies**
   ```bash
   npm install openai zod swr lucide-react
   npm install -D jest @testing-library/react @testing-library/jest-dom \
     playwright @playwright/test msw
   ```

3. **LLM abstraction layer** — `src/lib/llm/`
   - `types.ts` — `Message`, `Tool`, `LLMResponse`, `LLMClient` interfaces
   - `groq.ts` — Groq client (uses `openai` package with custom base URL)
   - `ollama.ts` — Ollama client stub
   - `client.ts` — factory function reading `LLM_PROVIDER` env var

4. **Chat API route** — `src/app/api/chat/route.ts`
   - Accepts `{ messages: Message[] }` POST body
   - Streams response using `ReadableStream`
   - Returns SSE-formatted chunks

5. **Chat UI** — `src/app/page.tsx` + `src/components/chat/`
   - `ChatWindow` — scrollable message list
   - `MessageBubble` — user vs assistant styling
   - `ChatInput` — textarea with send button, Enter to submit
   - Streaming display: show tokens as they arrive

6. **Provider indicator** — small badge in top-right showing active LLM

---

### Phase 2: Notes MCP Server

**Status:** ✅ Complete

**Goal:** Custom MCP server for in-memory note management, connected to the chat via stdio transport with tool call visualization in the UI.

**What to build:**

1. **Notes MCP Server** — `packages/notes-server/`

   In-memory note store. No external API dependency — a clean isolated MCP server implementation.

   ```typescript
   // packages/notes-server/src/index.ts
   import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
   import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
   import { z } from "zod";

   const notes: Map<string, string> = new Map();

   const server = new McpServer({
     name: "notes-server",
     version: "1.0.0",
   });

   server.tool(
     "create_note",
     "Create or overwrite a note with a given title",
     { title: z.string(), content: z.string() },
     async ({ title, content }) => {
       notes.set(title, content);
       return { content: [{ type: "text", text: `Note "${title}" saved.` }] };
     }
   );

   server.tool(
     "read_note",
     "Read the content of a note by title",
     { title: z.string() },
     async ({ title }) => {
       const content = notes.get(title);
       if (!content) return { content: [{ type: "text", text: `No note found with title "${title}".` }] };
       return { content: [{ type: "text", text: content }] };
     }
   );

   server.tool(
     "list_notes",
     "List all note titles",
     {},
     async () => {
       const titles = Array.from(notes.keys());
       return { content: [{ type: "text", text: titles.length ? titles.join(", ") : "No notes yet." }] };
     }
   );

   const transport = new StdioServerTransport();
   await server.connect(transport);
   ```

2. **MCP Client Manager** — `src/lib/mcp/client-manager.ts`
   - Spawns MCP server processes as Node child processes
   - Uses `@modelcontextprotocol/sdk`'s `Client` class with stdio transport
   - Discovers tools from connected servers
   - Routes tool call requests to the correct server

3. **Update Chat API route** to:
   - Fetch available tools from MCP Client Manager
   - Include tools in LLM call
   - When LLM returns a tool call, execute it via MCP Client Manager
   - Return tool result to LLM for final response

4. **Tool Call Display component** — `src/components/chat/ToolCallDisplay.tsx`
   - Shows tool name, arguments (collapsible JSON), and result
   - Styled distinctly from user/assistant messages

---

### Phase 3: Jira MCP Server

**Status:** ✅ Complete

**Goal:** Custom MCP server wrapping the Jira Cloud REST API, supporting ticket search, creation, status transitions, and comments.

**What to build:**

1. **Jira MCP Server** — `packages/jira-server/`

   ```
   packages/jira-server/
   ├── src/
   │   ├── index.ts          ← server entry point
   │   ├── jira-client.ts    ← Jira REST API wrapper (typed)
   │   ├── tools/
   │   │   ├── tickets.ts    ← create/read/update/search tickets
   │   │   ├── sprints.ts    ← sprint queries
   │   │   └── users.ts      ← user/assignee lookup
   │   ├── resources/
   │   │   └── ticket.ts     ← jira://ticket/{key} resource
   │   └── prompts/
   │       └── standup.ts    ← standup summary prompt template
   ├── package.json
   └── tsconfig.json
   ```

   **Tools to implement:**

   | Tool | Description | Jira API Endpoint |
   |---|---|---|
   | `search_tickets` | JQL search | `GET /rest/api/3/search` |
   | `get_ticket` | Get ticket details | `GET /rest/api/3/issue/{key}` |
   | `create_ticket` | Create new issue | `POST /rest/api/3/issue` |
   | `update_ticket_status` | Transition status | `POST /rest/api/3/issue/{key}/transitions` |
   | `add_comment` | Add comment | `POST /rest/api/3/issue/{key}/comment` |
   | `get_sprint_tickets` | Active sprint issues | `GET /rest/agile/1.0/board/{id}/sprint` |
   | `list_projects` | List accessible projects | `GET /rest/api/3/project` |

   **Resources to implement:**
   - `jira://ticket/{key}` → returns full ticket JSON

   **Prompts to implement:**
   - `standup_summary` — generates a standup from tickets assigned to a user

2. **Jira API client** — a clean TypeScript wrapper around Jira's REST API with proper types for Issue, Sprint, Comment, etc.

3. **Update MCP Client Manager** to support multiple concurrent servers (Notes + Jira both running).

4. **Update Chat UI** — add a Jira sidebar showing active sprint tickets that updates when the AI modifies them.

---

### Phase 4: GitHub MCP Server

**Status:** ✅ Complete

**Goal:** Connect the official `@modelcontextprotocol/server-github` package alongside the custom Notes and Jira servers.

**What to build:**

1. Install `@modelcontextprotocol/server-github` at root and wire into MCP Client Manager with `GITHUB_PERSONAL_ACCESS_TOKEN`.
2. Multi-server tool routing handles tool calls across Notes, Jira, and GitHub simultaneously.
3. Cross-service capability: "Summarize PR #42 and create a Jira ticket with the review notes" — GitHub + Jira in a single conversation turn.

---

### Phase 5: Slack Bot Integration

**Status:** ✅ Complete

**Goal:** Expose the AI assistant via Slack using Bolt SDK with Socket Mode — no public URL required.

**What to build:**

1. **Slack Bolt app** — `apps/slack-bot/`
   - Separate Node.js process (not Next.js)
   - Uses Socket Mode — no public URL needed in development
   - Listens for app mentions and slash commands

2. **Slash command `/ask`**
   ```
   /ask what tickets are in the current sprint?
   ```
   Bot responds in-channel with formatted Jira data.

3. **App mention support**
   ```
   @assistant create a bug ticket for the payment timeout issue
   ```

4. **Slack-specific formatting** — Jira tickets formatted as Slack blocks with clickable links; GitHub PRs with status indicators.

5. **Shared backend** — the Slack bot POSTs to the same `/api/chat` endpoint as the web UI. No MCP logic duplication.

---

### Phase 6: Polish, Tests & Portfolio

**Status:** 🔨 In progress

**Goal:** Complete test coverage, deploy to Vercel, finalize documentation.

**What to build:**

1. **Complete test suite** — bring all unit and integration tests to coverage targets (see Section 11)
2. **Deploy to Vercel** — free hobby plan; MCP servers run as Vercel Serverless Functions or separate processes
3. **Environment validation on startup** — check all required env vars are present, display a setup guide if any are missing
4. **Rate limit handling** — graceful UI for Groq rate limit errors with countdown timer
5. **Demo mode** — if no API keys are configured, use mocked responses so the UI is explorable
6. **README and architecture diagram** — portfolio-ready documentation

---

## 10. Challenges & Approaches

### Challenge 1: MCP Server Process Management

**Problem:** MCP servers run as subprocesses. If Next.js hot-reloads during development, you can accumulate orphaned processes.

**Approach:**
- Use a singleton pattern for the MCP Client Manager so it's not re-instantiated on every API call.
- Track spawned PIDs and send SIGTERM on process exit.
- Add a `/api/mcp/restart` endpoint for development convenience.

```typescript
// src/lib/mcp/client-manager.ts
class MCPClientManager {
  private static instance: MCPClientManager;
  
  static getInstance(): MCPClientManager {
    if (!MCPClientManager.instance) {
      MCPClientManager.instance = new MCPClientManager();
    }
    return MCPClientManager.instance;
  }
}
```

---

### Challenge 2: Tool Call Reliability Across Models

**Problem:** Smaller or less capable models sometimes hallucinate tool names, pass wrong argument types, or attempt to call tools that don't exist.

**Approach:**
- Validate all LLM tool call arguments against the tool's Zod schema before sending to MCP.
- If validation fails, return a descriptive error to the LLM so it can retry.
- Show tool call validation errors in the UI with the raw LLM output for debugging.
- Prefer Groq + Llama 3.3 70B — it's significantly more reliable than smaller models.

---

### Challenge 3: Groq Rate Limits During Testing

**Problem:** Running integration tests against the real Groq API will exhaust rate limits.

**Approach:**
- Unit tests mock the LLM using MSW (`msw/node`).
- Integration tests use a deterministic stub that returns pre-recorded responses (cassette pattern).
- Only a single "smoke test" integration suite tests against the live Groq API, and it's tagged `@live` so it's excluded from default test runs.

---

### Challenge 4: Streaming + Tool Calls in the Same Response

**Problem:** The LLM may stream text, then emit a tool call, then stream more text after the tool result comes back. The UI needs to handle this interrupted stream gracefully.

**Approach:**
- Model the chat as a list of "turns," where a turn can contain: text chunks, tool calls (with arguments + result), and more text.
- The `ChatWindow` renders turns, and each turn renders its parts in order.
- Tool calls appear inline as expandable cards, not as a separate UI section.

---

### Challenge 5: Multiple MCP Servers, Duplicate Tool Names

**Problem:** If Notes server and Jira server both define a tool called `search`, the MCP Client Manager won't know which to call.

**Approach:**
- Enforce a naming convention: all tool names are prefixed with the server name (`notes__search`, `jira__search`).
- The Client Manager strips the prefix before sending to the MCP server.
- The LLM receives prefixed names so it knows which server a tool belongs to.

---

### Challenge 6: Jira API Version Complexity

**Problem:** Jira has two major API versions (v2 and v3) and a separate Agile API. They have subtly different response shapes.

**Approach:**
- Use Jira API v3 for all issue operations (it's the current standard and supports Atlassian Document Format).
- Use the Agile API (`/rest/agile/1.0`) only for sprint data.
- Define TypeScript types for all Jira responses and validate them with Zod on ingestion.

---

### Challenge 7: Slack Socket Mode in Production

**Problem:** Slack Socket Mode is convenient in development but Slack recommends HTTP events for production.

**Approach:**
- Phase 5 uses Socket Mode only.
- Phase 6 (deploy) documents the path to HTTP mode with a public URL.
- Keep a `SLACK_MODE=socket|http` env var so you can switch without code changes.

---

### Challenge 8: Keeping Tests in Sync With Code

**Problem:** It's easy to add a new MCP tool and forget to add tests.

**Approach:**
- Add a meta-test: a Jest test that reads the server's tool list at runtime and asserts that every tool has a corresponding test file.
- Make this part of the CI gate.

---

## 11. Testing Strategy

> **Rule:** Every time a tool, component, or API route is created or modified, its tests are updated in the same commit. Tests are not optional.

### Test Types & Coverage Targets

| Type | Tool | Target Coverage | What It Tests |
|---|---|---|---|
| Unit | Jest | 80%+ per module | LLM abstraction, MCP tool logic, utility functions |
| Component | Jest + RTL | 70%+ per component | Chat UI rendering, tool call display, error states |
| Integration | Playwright | Critical paths | Full chat flow, MCP tool invocation, Slack commands |
| Live | Playwright (manual) | Smoke only | Real API calls to Groq, Jira, GitHub |

### Test Organization

```
src/
  lib/
    llm/
      client.ts
      client.test.ts       ← co-located unit test
    mcp/
      client-manager.ts
      client-manager.test.ts
packages/
  notes-server/
    src/
      index.ts
      index.test.ts
  jira-server/
    src/
      tools/
        tickets.ts
        tickets.test.ts
tests/
  integration/             ← Playwright tests
    chat-flow.spec.ts
    jira-tools.spec.ts
    github-tools.spec.ts
```

### Mocking Strategy

- **Groq API:** MSW intercepts `api.groq.com` in unit/component tests, returns fixture responses.
- **Jira API:** MSW intercepts `*.atlassian.net` in unit tests.
- **GitHub API:** MSW intercepts `api.github.com`.
- **MCP servers:** Unit tests for the Client Manager mock the child process with a fake stdio transport.

### CI Pipeline (GitHub Actions, free)

```yaml
on: [push, pull_request]
jobs:
  test:
    steps:
      - npm ci
      - npm run type-check
      - npm run lint
      - npm run test:unit       # Jest, no external calls
      - npm run test:component  # Jest + RTL
      - npm run test:e2e        # Playwright, mocked APIs
```

Live tests (`@live` tagged) run manually or on a weekly schedule.

---

## 12. File & Folder Structure

```
mcp-learning-app/
├── apps/
│   └── slack-bot/             ← Phase 5: Slack Bolt app
│       ├── src/
│       │   ├── index.ts
│       │   ├── handlers/
│       │   └── formatters/
│       └── package.json
│
├── packages/
│   ├── notes-server/          ← Phase 2: Custom MCP server
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── jira-server/           ← Phase 3: Custom Jira MCP server
│       ├── src/
│       │   ├── index.ts
│       │   ├── jira-client.ts
│       │   ├── tools/
│       │   ├── resources/
│       │   └── prompts/
│       └── package.json
│
├── src/                       ← Next.js app
│   ├── app/
│   │   ├── page.tsx           ← Main chat page
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── chat/
│   │       │   └── route.ts   ← LLM + MCP orchestration
│   │       ├── mcp/
│   │       │   ├── servers/route.ts
│   │       │   └── invoke/route.ts
│   │       └── slack/
│   │           └── events/route.ts
│   │
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── ChatWindow.test.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   └── ToolCallDisplay.tsx
│   │   ├── mcp/
│   │   │   ├── McpInspector.tsx    ← raw protocol viewer
│   │   │   ├── ServerStatus.tsx    ← connected servers panel
│   │   │   └── ToolPlayground.tsx  ← invoke tools manually
│   │   ├── jira/
│   │   │   └── SprintSidebar.tsx
│   │   └── ui/                ← shadcn/ui components
│   │
│   └── lib/
│       ├── llm/
│       │   ├── types.ts
│       │   ├── client.ts      ← factory
│       │   ├── client.test.ts
│       │   ├── groq.ts
│       │   ├── ollama.ts
│       │   └── openai.ts
│       └── mcp/
│           ├── client-manager.ts
│           ├── client-manager.test.ts
│           └── types.ts
│
├── tests/
│   ├── integration/           ← Playwright
│   │   ├── chat-flow.spec.ts
│   │   └── jira-tools.spec.ts
│   └── fixtures/              ← API response fixtures for MSW
│       ├── groq-chat.json
│       ├── jira-search.json
│       └── github-prs.json
│
├── .env.local.example         ← template — never commit .env.local
├── package.json               ← workspace root
├── turbo.json                 ← Turborepo config (monorepo builds)
├── jest.config.ts
├── playwright.config.ts
└── tsconfig.json
```

---

## 13. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in values. Never commit `.env.local`.

```bash
# LLM Provider (groq | openai | anthropic | ollama | gemini)
LLM_PROVIDER=groq

# Groq
GROQ_API_KEY=gsk_...

# OpenAI (optional, for switching)
OPENAI_API_KEY=sk-...

# Anthropic Claude (optional)
ANTHROPIC_API_KEY=sk-ant-...

# Ollama (optional, for local)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# Jira (Phase 3)
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_USER_EMAIL=you@example.com
JIRA_API_TOKEN=your-token
JIRA_DEFAULT_PROJECT=PROJ

# GitHub (Phase 4)
GITHUB_TOKEN=ghp_...
GITHUB_DEFAULT_OWNER=your-github-username

# Slack (Phase 5)
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...  # Socket Mode token
SLACK_SIGNING_SECRET=...
SLACK_MODE=socket  # or http for production
```

---

## 14. Glossary Quick Reference

| Term | Definition |
|---|---|
| **MCP** | Model Context Protocol — open standard for connecting LLMs to external tools/data |
| **Host** | The application (your Next.js app) that embeds an MCP client |
| **Client** | Protocol implementation inside the host; manages server connections |
| **Server** | Separate process exposing tools, resources, and prompts via MCP |
| **Tool** | A function an LLM can call to take action (create ticket, search repo, etc.) |
| **Resource** | Data the LLM can read, identified by a URI (jira://ticket/PROJ-123) |
| **Prompt** | Pre-built prompt template exposed by an MCP server |
| **stdio transport** | MCP communication via process stdin/stdout — simplest method |
| **HTTP+SSE transport** | MCP communication via HTTP requests + Server-Sent Events — for remote servers |
| **Tool call** | An LLM's decision to invoke a tool, including the tool name and arguments |
| **Groq** | Cloud inference provider using custom LPU chips; free tier with fast throughput |
| **Llama 3.3 70B** | Meta's open-weight model; available on Groq; strong tool-calling capability |
| **Streaming** | Returning LLM tokens to the UI as they're generated (vs waiting for full response) |
| **SSE** | Server-Sent Events — HTTP-based unidirectional stream from server to browser |
| **Socket Mode** | Slack feature allowing bots to receive events via WebSocket (no public URL needed) |
| **JQL** | Jira Query Language — SQL-like syntax for searching Jira issues |
| **MSW** | Mock Service Worker — intercepts HTTP requests in tests for deterministic responses |

---

*Relay — Technical Specification v1.0*
