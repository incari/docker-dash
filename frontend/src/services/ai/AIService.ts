/**
 * AI Service
 * Main service for interacting with the Transformers.js model
 */

import ModelLoader from "./modelLoader";
import { getDefaultModel } from "./availableModels";
import type {
  ModelConfig,
  AIResponse,
  ModelStatus,
  GenerationOptions,
  AIMessage,
} from "./types";

/**
 * Default model configuration
 */
const DEFAULT_CONFIG: ModelConfig = {
  modelName:
    (import.meta.env?.VITE_AI_MODEL_NAME as string) ||
    getDefaultModel().modelName,
  device: "wasm",
  cacheEnabled: (import.meta.env?.VITE_AI_CACHE_ENABLED as string) === "true",
  maxTokens: 512,
  temperature: 0.7,
  topP: 0.9,
  quantized: true,
};

/**
 * AI Service class
 */
class AIService {
  private modelLoader: ModelLoader;
  private conversationHistory: AIMessage[] = [];

  constructor() {
    this.modelLoader = ModelLoader.getInstance();
  }

  /**
   * Initialize the model with optional configuration
   */
  public async initializeModel(config?: Partial<ModelConfig>): Promise<void> {
    const finalConfig: ModelConfig = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    await this.modelLoader.loadModel(finalConfig);
  }

  /**
   * Generate a response from a prompt
   * Wrapped in setTimeout to prevent UI freezing
   */
  public async generateResponse(
    prompt: string,
    options?: GenerationOptions,
  ): Promise<AIResponse> {
    const startTime = performance.now();

    try {
      console.log(
        "[AIService] generateResponse called with prompt:",
        prompt.substring(0, 100) + "...",
      );

      // Check if model is loaded
      if (!this.modelLoader.isLoaded()) {
        throw new Error("Model not loaded. Call initializeModel() first.");
      }

      const model = this.modelLoader.getModel();
      if (!model) {
        throw new Error("Model instance not available.");
      }

      console.log(
        "[AIService] Model is loaded, preparing generation config...",
      );

      // Prepare generation options with REDUCED max_tokens to prevent hanging
      const generationConfig = {
        max_new_tokens: Math.min(options?.maxTokens || 50, 50), // Reduced to 50 tokens for faster generation
        temperature: options?.temperature || DEFAULT_CONFIG.temperature,
        top_p: options?.topP || DEFAULT_CONFIG.topP,
        do_sample: true,
        return_full_text: false,
      };

      // Add stop sequences if provided
      if (options?.stopSequences && options.stopSequences.length > 0) {
        Object.assign(generationConfig, {
          stop_strings: options.stopSequences,
        });
      }

      console.log("[AIService] Generation config:", generationConfig);
      console.log(
        "[AIService] Calling model() - THIS IS WHERE IT MIGHT HANG...",
      );

      // Wrap model call in a promise that yields to the event loop
      // This prevents the UI from freezing during generation
      const generateWithYield = () => {
        return new Promise((resolve, reject) => {
          // Use setTimeout to yield to the event loop
          setTimeout(async () => {
            try {
              console.log(
                "[AIService] Starting generation (yielded to event loop)...",
              );
              const result = await model(prompt, generationConfig);
              resolve(result);
            } catch (error) {
              reject(error);
            }
          }, 0);
        });
      };

      // Add timeout to prevent infinite hanging (20 seconds)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Text generation timed out after 20 seconds"));
        }, 20000);
      });

      // Generate response with timeout
      const result = await Promise.race([generateWithYield(), timeoutPromise]);

      console.log("[AIService] Model() returned! Result:", result);

      // Extract generated text
      const generatedText =
        result[0]?.generated_text || result.generated_text || "";

      console.log("[AIService] Generated text:", generatedText);

      const endTime = performance.now();
      const generationTime = endTime - startTime;

      // Add to conversation history
      this.conversationHistory.push(
        { role: "user", content: prompt, timestamp: Date.now() },
        { role: "assistant", content: generatedText, timestamp: Date.now() },
      );

      return {
        text: generatedText,
        success: true,
        metadata: {
          generationTime,
          model: DEFAULT_CONFIG.modelName,
        },
      };
    } catch (error) {
      console.error("[AIService] Error in generateResponse:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        text: "",
        success: false,
        error: errorMessage,
        metadata: {
          generationTime: performance.now() - startTime,
        },
      };
    }
  }

  /**
   * Check if the model is loaded
   */
  public isModelLoaded(): boolean {
    return this.modelLoader.isLoaded();
  }

  /**
   * Get the current model status
   */
  public getModelStatus(): ModelStatus {
    return this.modelLoader.getStatus();
  }

  /**
   * Get conversation history
   */
  public getConversationHistory(): AIMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Clear conversation history
   */
  public clearConversationHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Add a system message to the conversation
   */
  public addSystemMessage(content: string): void {
    this.conversationHistory.push({
      role: "system",
      content,
      timestamp: Date.now(),
    });
  }

  /**
   * Switch to a different model
   * This will unload the current model and load the new one
   */
  public async switchModel(
    modelName: string,
    config?: Partial<ModelConfig>,
  ): Promise<void> {
    // Clear conversation history when switching models
    this.clearConversationHistory();

    // Initialize with new model
    await this.initializeModel({
      ...config,
      modelName,
    });
  }

  /**
   * Get the currently loaded model name
   */
  public getCurrentModelName(): string | undefined {
    return this.modelLoader.getStatus().config?.modelName;
  }
}

// Export singleton instance
export default new AIService();
