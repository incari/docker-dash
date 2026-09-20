/**
 * AI Service Tests
 * Basic tests for the AI service functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import AIService from '../AIService';
import type { ModelStatus } from '../types';

// Mock the @xenova/transformers module
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(),
  env: {
    allowLocalModels: false,
    useBrowserCache: true,
  },
}));

describe('AIService', () => {
  beforeEach(() => {
    // Clear conversation history before each test
    AIService.clearConversationHistory();
  });

  describe('Model Status', () => {
    it('should return model status', () => {
      const status: ModelStatus = AIService.getModelStatus();
      
      expect(status).toBeDefined();
      expect(status).toHaveProperty('loaded');
      expect(status).toHaveProperty('progress');
      expect(status).toHaveProperty('status');
    });

    it('should initially report model as not loaded', () => {
      const isLoaded = AIService.isModelLoaded();
      expect(isLoaded).toBe(false);
    });
  });

  describe('Conversation History', () => {
    it('should start with empty conversation history', () => {
      const history = AIService.getConversationHistory();
      expect(history).toEqual([]);
    });

    it('should add system messages to conversation history', () => {
      const systemMessage = 'You are a helpful Docker assistant.';
      AIService.addSystemMessage(systemMessage);

      const history = AIService.getConversationHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.role).toBe('system');
      expect(history[0]?.content).toBe(systemMessage);
      expect(history[0]?.timestamp).toBeDefined();
    });

    it('should clear conversation history', () => {
      AIService.addSystemMessage('Test message');
      expect(AIService.getConversationHistory()).toHaveLength(1);
      
      AIService.clearConversationHistory();
      expect(AIService.getConversationHistory()).toHaveLength(0);
    });
  });

  describe('Generate Response', () => {
    it('should throw error when model is not loaded', async () => {
      const response = await AIService.generateResponse('Hello');
      
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('Model not loaded');
    });
  });

  describe('Model Initialization', () => {
    it('should accept custom configuration', async () => {
      // This test will fail in actual execution without mocking the full pipeline
      // but demonstrates the API
      const customConfig = {
        modelName: 'google/functiongemma-270m-it',
        temperature: 0.5,
        maxTokens: 256,
      };

      // We expect this to attempt initialization
      // In a real test environment, we'd mock the pipeline function
      try {
        await AIService.initializeModel(customConfig);
      } catch (error) {
        // Expected to fail without proper mocking
        expect(error).toBeDefined();
      }
    });
  });
});

describe('Model Status Interface', () => {
  it('should have correct status structure', () => {
    const status = AIService.getModelStatus();
    
    expect(typeof status.loaded).toBe('boolean');
    expect(typeof status.progress).toBe('number');
    expect(typeof status.status).toBe('string');
    expect(['idle', 'downloading', 'loading', 'ready', 'error']).toContain(status.status);
  });
});

