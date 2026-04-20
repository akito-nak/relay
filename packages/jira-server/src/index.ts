#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const BASE_URL = process.env.JIRA_BASE_URL ?? ''
const EMAIL = process.env.JIRA_EMAIL ?? ''
const API_TOKEN = process.env.JIRA_API_TOKEN ?? ''

const auth = Buffer.from(`${EMAIL}:${API_TOKEN}`).toString('base64')

async function jiraRequest(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}/rest/api/3${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Jira API error ${res.status}: ${text}`)
  }
  return res.json()
}

function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] }
}

const server = new McpServer({ name: 'jira-server', version: '1.0.0' })

server.tool(
  'list_projects',
  'List all Jira projects',
  {},
  async () => {
    const data = await jiraRequest('/project')
    const projects = (data as { key: string; name: string }[])
      .map((p) => `${p.key}: ${p.name}`)
      .join('\n')
    return text(projects || 'No projects found')
  }
)

server.tool(
  'search_tickets',
  'Search Jira issues using JQL',
  { jql: z.string().describe('JQL query, e.g. "project = RELAY AND status = Open"') },
  async ({ jql }) => {
    const data = await jiraRequest(`/search?jql=${encodeURIComponent(jql)}&maxResults=20&fields=summary,status,assignee,priority`)
    const issues = (data as { issues: { key: string; fields: { summary: string; status: { name: string }; assignee?: { displayName: string }; priority?: { name: string } } }[] }).issues
    if (!issues.length) return text('No issues found')
    const lines = issues.map((i) => {
      const { summary, status, assignee, priority } = i.fields
      return `${i.key} [${status.name}] ${priority ? `(${priority.name}) ` : ''}${summary}${assignee ? ` — ${assignee.displayName}` : ''}`
    })
    return text(lines.join('\n'))
  }
)

server.tool(
  'get_ticket',
  'Get full details of a Jira ticket',
  { key: z.string().describe('Ticket key, e.g. RELAY-1') },
  async ({ key }) => {
    const data = await jiraRequest(`/issue/${key}?fields=summary,description,status,assignee,priority,comment`)
    const i = data as {
      key: string
      fields: {
        summary: string
        status: { name: string }
        priority?: { name: string }
        assignee?: { displayName: string }
        description?: { content?: { content?: { text?: string }[] }[] }
        comment?: { comments?: { author: { displayName: string }; body?: { content?: { content?: { text?: string }[] }[] } }[] }
      }
    }
    const { summary, status, priority, assignee, description, comment } = i.fields
    const descText = description?.content?.flatMap((b) => b.content?.map((c) => c.text) ?? []).join(' ') ?? 'No description'
    const comments = comment?.comments?.slice(-3).map((c) => {
      const body = c.body?.content?.flatMap((b) => b.content?.map((n) => n.text) ?? []).join(' ') ?? ''
      return `  ${c.author.displayName}: ${body}`
    }).join('\n') ?? ''
    return text([
      `${i.key}: ${summary}`,
      `Status: ${status.name}${priority ? ` | Priority: ${priority.name}` : ''}${assignee ? ` | Assignee: ${assignee.displayName}` : ''}`,
      `Description: ${descText}`,
      comments ? `Recent comments:\n${comments}` : '',
    ].filter(Boolean).join('\n'))
  }
)

server.tool(
  'create_ticket',
  'Create a new Jira issue',
  {
    project: z.string().describe('Project key, e.g. RELAY'),
    summary: z.string().describe('Issue title'),
    description: z.string().optional().describe('Issue description'),
    issueType: z.enum(['Task', 'Bug', 'Story']).default('Task'),
    priority: z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest']).optional(),
  },
  async ({ project, summary, description, issueType, priority }) => {
    const body: Record<string, unknown> = {
      fields: {
        project: { key: project },
        summary,
        issuetype: { name: issueType },
        ...(priority ? { priority: { name: priority } } : {}),
        ...(description ? {
          description: {
            type: 'doc', version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
          }
        } : {}),
      },
    }
    const data = await jiraRequest('/issue', { method: 'POST', body: JSON.stringify(body) })
    const result = data as { key: string; self: string }
    return text(`Created ${result.key}: ${BASE_URL}/browse/${result.key}`)
  }
)

server.tool(
  'update_ticket_status',
  'Transition a Jira ticket to a new status',
  {
    key: z.string().describe('Ticket key, e.g. RELAY-1'),
    status: z.string().describe('Target status name, e.g. "In Progress", "Done"'),
  },
  async ({ key, status }) => {
    const data = await jiraRequest(`/issue/${key}/transitions`)
    const transitions = (data as { transitions: { id: string; name: string }[] }).transitions
    const match = transitions.find((t) => t.name.toLowerCase() === status.toLowerCase())
    if (!match) {
      const available = transitions.map((t) => t.name).join(', ')
      return text(`Status "${status}" not found. Available: ${available}`)
    }
    await jiraRequest(`/issue/${key}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: match.id } }),
    })
    return text(`${key} moved to "${match.name}"`)
  }
)

server.tool(
  'add_comment',
  'Add a comment to a Jira ticket',
  {
    key: z.string().describe('Ticket key, e.g. RELAY-1'),
    comment: z.string().describe('Comment text'),
  },
  async ({ key, comment }) => {
    await jiraRequest(`/issue/${key}/comment`, {
      method: 'POST',
      body: JSON.stringify({
        body: {
          type: 'doc', version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: comment }] }],
        },
      }),
    })
    return text(`Comment added to ${key}`)
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)