/**
 * @jest-environment node
 */
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

  describe('when LLM_PROVIDER is groq', () => {
    beforeEach(() => {
      process.env.LLM_PROVIDER = 'groq'
      process.env.GROQ_API_KEY = 'gsk_test'
    })

    it('returns the llama-3.3-70b-versatile model', () => {
      const { model } = createLLMClient()
      expect(model).toBe('llama-3.3-70b-versatile')
    })

    it('initialises OpenAI with the Groq base URL', () => {
      createLLMClient()
      expect(MockedOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://api.groq.com/openai/v1' })
      )
    })
  })

  describe('when LLM_PROVIDER is unset', () => {
    beforeEach(() => {
      delete process.env.LLM_PROVIDER
      process.env.GROQ_API_KEY = 'gsk_test'
    })

    it('defaults to groq', () => {
      const { model } = createLLMClient()
      expect(model).toBe('llama-3.3-70b-versatile')
    })
  })

  describe('when LLM_PROVIDER is openai', () => {
    beforeEach(() => {
      process.env.LLM_PROVIDER = 'openai'
      process.env.OPENAI_API_KEY = 'sk_test'
    })

    it('returns the gpt-4o-mini model', () => {
      const { model } = createLLMClient()
      expect(model).toBe('gpt-4o-mini')
    })
  })

  describe('when LLM_PROVIDER is ollama', () => {
    beforeEach(() => {
      process.env.LLM_PROVIDER = 'ollama'
    })

    it('returns the default ollama model', () => {
      const { model } = createLLMClient()
      expect(model).toBe('llama3.1:8b')
    })

    it('uses a custom model when OLLAMA_MODEL is set', () => {
      process.env.OLLAMA_MODEL = 'mistral:7b'
      const { model } = createLLMClient()
      expect(model).toBe('mistral:7b')
    })

    it('uses a custom base URL when OLLAMA_BASE_URL is set', () => {
      process.env.OLLAMA_BASE_URL = 'http://localhost:9999/v1'
      createLLMClient()
      expect(MockedOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'http://localhost:9999/v1' })
      )
    })
  })

  describe('when LLM_PROVIDER is unknown', () => {
    it('throws a descriptive error', () => {
      process.env.LLM_PROVIDER = 'gemini'
      expect(() => createLLMClient()).toThrow('Unknown LLM_PROVIDER')
    })
  })
})
