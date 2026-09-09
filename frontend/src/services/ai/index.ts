/**
 * AI Service Exports
 * Main entry point for the AI service layer
 */

// Core AI Service (Transformers.js)
export { default as AIService } from './AIService';
export { default as ModelLoader } from './modelLoader';
export * from './availableModels';

// AI Agent System (Function Calling & Safety)
export * from './types';
export * from './tools/dockerTools';
export * from './safety/guardrails';
export * from './prompts/systemPrompt';
export * from './parsers/functionCallParser';
export * from './context/contextBuilder';
export * from './agent/DockerAgent';
export * from './integration/chatIntegration';
export * from './examples';

