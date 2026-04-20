import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { join } from 'path'

export interface MCPTool {
  name:        string
  description: string
  inputSchema: {
    type:        string
    properties?: Record<string, unknown>
    required?:   string[]
  }
  serverName: string
}

interface ConnectedServer {
  client: Client
  tools:  MCPTool[]
}

class MCPClientManager {
  private servers    = new Map<string, ConnectedServer>()
  private toolIndex  = new Map<string, string>()
  private ready      = false
  private initPromise: Promise<void> | null = null

  async initialize(): Promise<void> {
    if (this.ready) return
    if (this.initPromise) return this.initPromise
    this.initPromise = this._init()
    await this.initPromise
  }

  private async _init(): Promise<void> {
    const notesPath = join(
      process.cwd(),
      'packages', 'notes-server', 'dist', 'index.js'
    )

    try {
      await this.connectServer('notes', notesPath)
    } catch (err) {
      console.error('[MCP] Failed to connect notes server:', err)
    }

    const jiraPath = join(
      process.cwd(),
      'packages', 'jira-server', 'dist', 'index.js'
    )

    try {
      await this.connectServer('jira', jiraPath, {
        JIRA_BASE_URL:  process.env.JIRA_BASE_URL  ?? '',
        JIRA_EMAIL:     process.env.JIRA_EMAIL      ?? '',
        JIRA_API_TOKEN: process.env.JIRA_API_TOKEN  ?? '',
      })
    } catch (err) {
      console.error('[MCP] Failed to connect jira server:', err)
    }

    this.ready = true
  }

  private async connectServer(
    name:       string,
    scriptPath: string,
    env:        Record<string, string> = {}
  ): Promise<void> {
    const transport = new StdioClientTransport({
      command: 'node',
      args:    [scriptPath],
      env:     { ...(process.env as Record<string, string>), ...env },
    })

    const client = new Client(
      { name: 'relay', version: '1.0.0' },
      { capabilities: {} }
    )

    await client.connect(transport)

    const { tools: raw } = await client.listTools()

    const tools: MCPTool[] = raw.map(t => ({
      name:        t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema as MCPTool['inputSchema'],
      serverName:  name,
    }))

    this.servers.set(name, { client, tools })

    for (const tool of tools) {
      this.toolIndex.set(tool.name, name)
    }

    console.error(
      `[MCP] "${name}" connected — ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`
    )
  }

  async getTools(): Promise<MCPTool[]> {
    await this.initialize()
    return Array.from(this.servers.values()).flatMap(s => s.tools)
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: string; isError: boolean }> {
    await this.initialize()

    const serverName = this.toolIndex.get(name)
    if (!serverName) {
      return { content: `Unknown tool: "${name}"`, isError: true }
    }

    const server = this.servers.get(serverName)!

    try {
      const result = await server.client.callTool({ name, arguments: args })

      const text = (result.content as Array<{ type: string; text?: string }>)
        .filter(c => c.type === 'text')
        .map(c => c.text ?? '')
        .join('\n')

      return { content: text, isError: Boolean(result.isError) }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tool call failed'
      return { content: message, isError: true }
    }
  }

  toOpenAITools() {
    return Array.from(this.servers.values())
      .flatMap(s => s.tools)
      .map(tool => ({
        type: 'function' as const,
        function: {
          name:        tool.name,
          description: tool.description,
          parameters:  tool.inputSchema,
        },
      }))
  }
}

const globalForMCP = global as typeof globalThis & {
  mcpManager?: MCPClientManager
}

export function getMCPManager(): MCPClientManager {
  if (!globalForMCP.mcpManager) {
    globalForMCP.mcpManager = new MCPClientManager()
  }
  return globalForMCP.mcpManager
}