import { createLLMClient } from './client'

jest.mock('openai')

import OpenAI from 'openai'

const MockedOpenAI = jest.mocked(OpenAI)

describe('createLLMClient', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    MockedOpenAI.mockClear()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // ── Groq ────────────────────────────────────────────────────────────

  describe('when LLM_PROVIDER is groq', () => {
    beforeEach(() => {
      process.env.LLM_PROVIDER = 'groq'
      process.env.GROQ_API_KEY = 'gsk_test'
    })

    it('returns the llama-3.3-70b-versatile model', () => {
      const { model } = createLLMClient()
      expect(model).toBe('llama-3.3-70b-versatile')