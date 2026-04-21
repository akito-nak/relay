/**
 * @jest-environment node
 */
import { getMCPManager } from './client-manager'

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect:   jest.fn().mockResolvedValue(undefined),
    listTools: jest.fn().mockResolvedValue({
      tools: [
        { name: 'create_note', description: 'Create a note', inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } },
        { name: 'list_notes',  description: 'List notes',   inputSchema: { type: 'object' } },
      ],
    }),
    callTool: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Note created' }],
      isError: false,
    }),
  })),
}))

jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: jest.fn().mockImplementation(() => ({})),
}))

describe('MCPClientManager', () => {
  beforeEach(() => {
    // Reset the global singleton between tests
    const g = global as typeof globalThis & { mcpManager?: unknown }
    delete g.mcpManager
  })

  it('initialises and returns tools after initialize()', async () => {
    const manager = getMCPManager()
    await manager.initialize()
    const tools = await manager.getTools()
    expect(tools.length).toBeGreaterThan(0)
  })

  it('returns OpenAI-formatted tools from toOpenAITools()', async () => {
    const manager = getMCPManager()
    await manager.initialize()
    const tools = manager.toOpenAITools()
    expect(tools[0]).toMatchObject({
      type: 'function',
      function: expect.objectContaining({ name: expect.any(String) }),
    })
  })

  it('calling initialize() twice does not double-connect', async () => {
    const manager = getMCPManager()
    await manager.initialize()
    const countAfterFirst = (await manager.getTools()).length
    await manager.initialize()
    const countAfterSecond = (await manager.getTools()).length
    expect(countAfterSecond).toBe(countAfterFirst)
  })

  it('callTool returns content for a known tool', async () => {
    const manager = getMCPManager()
    await manager.initialize()
    const result = await manager.callTool('create_note', { title: 'Test' })
    expect(result.isError).toBe(false)
    expect(result.content).toBe('Note created')
  })

  it('callTool returns an error for an unknown tool', async () => {
    const manager = getMCPManager()
    await manager.initialize()
    const result = await manager.callTool('nonexistent_tool', {})
    expect(result.isError).toBe(true)
    expect(result.content).toMatch(/unknown tool/i)
  })
})