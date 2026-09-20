/**
 * TypeScript interfaces for AI Agent System
 * Defines types for tools, function calls, agent responses, and safety levels
 */

import type { DockerContainer, Shortcut } from "../../types";

/**
 * Safety level for operations
 */
export enum SafetyLevel {
  /** Safe operations that can be executed without confirmation */
  SAFE = "safe",
  /** Operations that require user confirmation */
  REQUIRES_CONFIRMATION = "requires_confirmation",
  /** Blocked operations that should never be executed */
  BLOCKED = "blocked",
}

/**
 * Parameter schema for tool functions
 */
export interface ParameterSchema {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required?: boolean;
  enum?: string[];
  properties?: Record<string, ParameterSchema>;
  items?: ParameterSchema;
}

/**
 * Tool definition with metadata and safety information
 */
export interface Tool {
  /** Unique identifier for the tool */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** Parameter schema defining expected inputs */
  parameters: Record<string, ParameterSchema>;
  /** Safety level for this tool */
  safetyLevel: SafetyLevel;
  /** Function to execute when tool is called */
  execute: (params: Record<string, any>) => Promise<any>;
}

/**
 * Parsed function call from LLM output
 */
export interface FunctionCall {
  /** Name of the function to call */
  functionName: string;
  /** Parameters to pass to the function */
  parameters: Record<string, any>;
  /** Raw text that was parsed */
  rawText?: string;
}

/**
 * Request for user confirmation before executing an action
 */
export interface ConfirmationRequest {
  /** Unique ID for this confirmation request */
  id: string;
  /** Action being requested */
  action: string;
  /** Detailed description of what will happen */
  description: string;
  /** Resources that will be affected */
  affectedResources: string[];
  /** Function call to execute if confirmed */
  functionCall: FunctionCall;
  /** Timestamp when request was created */
  timestamp: Date;
}

/**
 * Response from the AI agent
 */
export interface AgentResponse {
  /** Response message to display to user */
  message: string;
  /** Whether the operation was successful */
  success: boolean;
  /** Function calls that were executed */
  executedFunctions?: FunctionCall[];
  /** Confirmation request if action requires approval */
  confirmationRequest?: ConfirmationRequest;
  /** Error message if operation failed */
  error?: string;
  /** Additional data returned from function execution */
  data?: any;
}

/**
 * Context information about the current dashboard state
 */
export interface DashboardContext {
  /** All Docker containers */
  containers: DockerContainer[];
  /** All shortcuts */
  shortcuts: Shortcut[];
  /** Number of running containers */
  runningContainers: number;
  /** Number of stopped containers */
  stoppedContainers: number;
  /** Timestamp when context was built */
  timestamp: Date;
}

/**
 * Safety validation result
 */
export interface SafetyValidationResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Safety level of the action */
  safetyLevel: SafetyLevel;
  /** Reason for blocking (if blocked) */
  reason?: string;
  /** Whether confirmation is required */
  requiresConfirmation: boolean;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  /** Whether execution was successful */
  success: boolean;
  /** Result data from the tool */
  data?: any;
  /** Error message if execution failed */
  error?: string;
  /** Name of the tool that was executed */
  toolName: string;
}

/**
 * AI model configuration
 */
export interface AIModelConfig {
  /** Model name/identifier */
  model: string;
  /** API endpoint */
  endpoint?: string;
  /** API key */
  apiKey?: string;
  /** Temperature for response generation */
  temperature?: number;
  /** Maximum tokens in response */
  maxTokens?: number;
}

/**
 * Represents a message in the AI conversation
 */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

/**
 * Configuration for the Transformers.js model
 */
export interface ModelConfig {
  /** Model identifier (e.g., 'google/functiongemma-270m-it') */
  modelName: string;

  /** Device to run the model on ('webgpu' | 'wasm') */
  device?: 'webgpu' | 'wasm';

  /** Whether to use caching (IndexedDB) */
  cacheEnabled?: boolean;

  /** Maximum number of tokens to generate */
  maxTokens?: number;

  /** Temperature for generation (0.0 - 1.0) */
  temperature?: number;

  /** Top-p sampling parameter */
  topP?: number;

  /** Whether to use quantization */
  quantized?: boolean;

  /** Progress callback for model loading */
  onProgress?: (progress: ModelLoadProgress) => void;
}

/**
 * Progress information during model loading
 */
export interface ModelLoadProgress {
  /** Current loading status */
  status: 'downloading' | 'loading' | 'ready' | 'error';

  /** Progress percentage (0-100) */
  progress: number;

  /** Current file being loaded */
  file?: string;

  /** Loaded bytes */
  loaded?: number;

  /** Total bytes */
  total?: number;

  /** Error message if status is 'error' */
  error?: string;
}

/**
 * Response from the AI model
 */
export interface AIResponse {
  /** Generated text response */
  text: string;

  /** Whether the generation was successful */
  success: boolean;

  /** Error message if generation failed */
  error?: string;

  /** Generation metadata */
  metadata?: {
    /** Time taken to generate (ms) */
    generationTime?: number;

    /** Number of tokens generated */
    tokensGenerated?: number;

    /** Model used for generation */
    model?: string;
  };
}

/**
 * Status of the AI model
 */
export interface ModelStatus {
  /** Whether the model is loaded and ready */
  loaded: boolean;

  /** Current loading progress (0-100) */
  progress: number;

  /** Current status */
  status: 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

  /** Error message if status is 'error' */
  error?: string;

  /** Model configuration */
  config?: ModelConfig;
}

/**
 * Generation options for text generation
 */
export interface GenerationOptions {
  /** Maximum number of tokens to generate */
  maxTokens?: number;

  /** Temperature for generation (0.0 - 1.0) */
  temperature?: number;

  /** Top-p sampling parameter */
  topP?: number;

  /** Whether to stream the response */
  stream?: boolean;

  /** Stop sequences */
  stopSequences?: string[];
}

