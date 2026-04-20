import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const notes = new Map<string, string>()

const server = new McpServer({
  name:    'notes-server',
  version: '1.0.0',
})

server.tool(
  'create_note',
  'Create or overwrite a note. Use this to save anything the user wants to remember.',
  {
    title:   z.string().describe('Short title for the note'),
    content: z.string().describe('Full content of the note'),
  },
  async ({ title, content }) => {
    notes.set(title, content)
    return {
      content: [{ type: 'text' as const, text: `Note "${title}" saved.` }],
    }
  }
)

server.tool(
  'read_note',
  'Read the content of a saved note by its title.',
  {
    title: z.string().describe('Title of the note to read'),
  },
  async ({ title }) => {
    const note = notes.get(title)
    if (!note) {
      return {
        content: [{ type: 'text' as const, text: `No note found with title "${title}".` }],
        isError: true,
      }
    }
    return {
      content: [{ type: 'text' as const, text: note }],
    }
  }
)

server.tool(
  'list_notes',
  'List the titles of all saved notes.',
  {},
  async () => {
    const titles = Array.from(notes.keys())
    const text   = titles.length
      ? `Saved notes:\n${titles.map(t => `• ${t}`).join('\n')}`
      : 'No notes saved yet.'
    return {
      content: [{ type: 'text' as const, text }],
    }
  }
)

server.tool(
  'delete_note',
  'Delete a saved note by its title.',
  {
    title: z.string().describe('Title of the note to delete'),
  },
  async ({ title }) => {
    const existed = notes.delete(title)
    return {
      content: [{
        type: 'text' as const,
        text: existed
          ? `Note "${title}" deleted.`
          : `No note found with title "${title}".`,
      }],
    }
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Notes MCP server running on stdio')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})