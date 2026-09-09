/**
 * Docker AI Agent Orchestrator
 * Combines model + tools + safety + prompts to process user queries
 */

import type {
  AgentResponse,
  ConfirmationRequest,
  DashboardContext,
  FunctionCall,
  ToolExecutionResult,
} from "../types";
import { SafetyLevel } from "../types";
import { dockerTools, getToolByName } from "../tools/dockerTools";
import { validateAction, sanitizeInput } from "../safety/guardrails";
import { getSystemPromptWithContext } from "../prompts/systemPrompt";
import { parseAndValidateFunctionCalls } from "../parsers/functionCallParser";
import {
  formatContextForLLM,
  optimizeContextForTokenLimit,
} from "../context/contextBuilder";
import AIService from "../AIService";

/**
 * Docker AI Agent
 * Main orchestrator for processing user queries with safety checks
 */
export class DockerAgent {
  private context: DashboardContext | null = null;

  /**
   * Set the current dashboard context
   * @param context - Dashboard context
   */
  setContext(context: DashboardContext): void {
    this.context = context;
  }

  /**
   * Process a user query
   * @param userInput - User's natural language query
   * @returns Agent response with actions or confirmations
   */
  async processQuery(userInput: string): Promise<AgentResponse> {
    try {
      // Sanitize input
      const sanitizedInput = sanitizeInput(userInput);

      // Validate the query for safety
      const safetyCheck = validateAction(sanitizedInput);

      if (!safetyCheck.allowed) {
        return {
          message: `I cannot perform this action: ${safetyCheck.reason}`,
          success: false,
          error: safetyCheck.reason,
        };
      }

      // Generate LLM response (mock for now - would integrate with actual LLM)
      const llmResponse = await this.generateLLMResponse(sanitizedInput);

      // Parse function calls from response
      const { message, functionCalls, errors } =
        parseAndValidateFunctionCalls(llmResponse);

      if (errors.length > 0) {
        console.error("Function call parsing errors:", errors);
      }

      // If no function calls, return message only
      if (functionCalls.length === 0) {
        return {
          message:
            message ||
            "I'm not sure how to help with that. Can you rephrase your question?",
          success: true,
        };
      }

      // Execute function calls
      const results = await this.executeFunctionCalls(functionCalls);

      // Check if any function requires confirmation
      const confirmationRequired = results.some((r) => r.requiresConfirmation);

      if (confirmationRequired) {
        const confirmationRequest = this.createConfirmationRequest(
          functionCalls[0],
          message,
        );

        return {
          message: message || "This action requires your confirmation.",
          success: true,
          confirmationRequest,
        };
      }

      // All functions executed successfully
      const successfulResults = results.filter((r) => r.success);
      const failedResults = results.filter((r) => !r.success);

      if (failedResults.length > 0) {
        const errorMessages = failedResults.map((r) => r.error).join(", ");
        return {
          message: `${message}\n\nSome operations failed: ${errorMessages}`,
          success: false,
          error: errorMessages,
          executedFunctions: functionCalls,
        };
      }

      // Format response with results
      const responseMessage = this.formatResponseWithResults(
        message,
        successfulResults,
      );

      return {
        message: responseMessage,
        success: true,
        executedFunctions: functionCalls,
        data: successfulResults.map((r) => r.data),
      };
    } catch (error) {
      console.error("Error processing query:", error);
      return {
        message:
          "I encountered an error processing your request. Please try again.",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Execute a confirmed action
   * @param confirmationRequest - Confirmation request to execute
   * @returns Agent response
   */
  async executeConfirmedAction(
    confirmationRequest: ConfirmationRequest,
  ): Promise<AgentResponse> {
    try {
      const result = await this.executeSingleFunction(
        confirmationRequest.functionCall,
      );

      if (!result.success) {
        return {
          message: `Failed to execute action: ${result.error}`,
          success: false,
          error: result.error,
        };
      }

      return {
        message: `Action completed successfully: ${confirmationRequest.action}`,
        success: true,
        executedFunctions: [confirmationRequest.functionCall],
        data: result.data,
      };
    } catch (error) {
      console.error("Error executing confirmed action:", error);
      return {
        message: "Failed to execute the confirmed action.",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Generate LLM response using transformer.js model
   * @param userInput - User query
   * @returns LLM response text
   */
  private async generateLLMResponse(userInput: string): Promise<string> {
    // Get context
    const contextStr = this.context
      ? optimizeContextForTokenLimit(this.context, 500)
      : "";

    const systemPrompt = getSystemPromptWithContext(contextStr);

    // Check if model is loaded
    if (!AIService.isModelLoaded()) {
      // Fall back to mock response if model not loaded
      console.warn("AI model not loaded, using mock response");
      return this.mockLLMResponse(userInput);
    }

    try {
      console.log("[DockerAgent] Generating LLM response for:", userInput);

      // Construct the full prompt with system context and user input
      const fullPrompt = `${systemPrompt}\n\nUser: ${userInput}\n\nAssistant:`;

      console.log("[DockerAgent] Full prompt length:", fullPrompt.length);

      // Generate response using the loaded transformer.js model
      // REDUCED maxTokens to 50 for faster generation and to prevent freezing
      const response = await AIService.generateResponse(fullPrompt, {
        maxTokens: 50,
        temperature: 0.7,
        topP: 0.9,
      });

      console.log("[DockerAgent] AIService response:", response);

      if (response.success && response.text) {
        console.log(
          "[DockerAgent] Successfully generated text:",
          response.text,
        );
        return response.text;
      } else {
        console.error("Model generation failed:", response.error);
        console.log("[DockerAgent] Falling back to mock response");
        // Fall back to mock response on error
        return this.mockLLMResponse(userInput);
      }
    } catch (error) {
      console.error("Error generating LLM response:", error);
      console.log("[DockerAgent] Falling back to mock response due to error");
      // Fall back to mock response on error
      return this.mockLLMResponse(userInput);
    }
  }

  /**
   * Mock LLM response for testing
   * @param userInput - User query
   * @returns Mock response
   */
  private mockLLMResponse(userInput: string): string {
    const input = userInput.toLowerCase();

    // List containers
    if (input.includes("list") && input.includes("container")) {
      return `I'll list all your containers for you.\n\nFUNCTION_CALL: listAllContainers\nPARAMETERS: {}`;
    }

    // Find container
    if (input.includes("find") || input.includes("search")) {
      const match = input.match(/find|search.*?(\w+)/);
      const searchTerm = match ? match[1] : "container";
      return `I'll search for containers matching "${searchTerm}".\n\nFUNCTION_CALL: findContainersByName\nPARAMETERS: {"name": "${searchTerm}"}`;
    }

    // Start container
    if (input.includes("start")) {
      return `I'll start the container for you. This requires confirmation.\n\nFUNCTION_CALL: startContainer\nPARAMETERS: {"containerId": "mock_container_id"}`;
    }

    // Stop container
    if (input.includes("stop")) {
      return `I'll stop the container for you. This requires confirmation.\n\nFUNCTION_CALL: stopContainer\nPARAMETERS: {"containerId": "mock_container_id"}`;
    }

    // List shortcuts
    if (input.includes("shortcut")) {
      return `I'll show you all your shortcuts.\n\nFUNCTION_CALL: listShortcuts\nPARAMETERS: {}`;
    }

    // Default response
    return "I can help you manage your Docker containers and shortcuts. Try asking me to list containers, find a specific container, or show your shortcuts.";
  }

  /**
   * Execute multiple function calls
   * @param functionCalls - Function calls to execute
   * @returns Execution results
   */
  private async executeFunctionCalls(
    functionCalls: FunctionCall[],
  ): Promise<Array<ToolExecutionResult & { requiresConfirmation: boolean }>> {
    const results = [];

    for (const functionCall of functionCalls) {
      const result = await this.executeSingleFunction(functionCall);
      results.push(result);
    }

    return results;
  }

  /**
   * Execute a single function call
   * @param functionCall - Function call to execute
   * @returns Execution result
   */
  private async executeSingleFunction(
    functionCall: FunctionCall,
  ): Promise<ToolExecutionResult & { requiresConfirmation: boolean }> {
    const tool = getToolByName(functionCall.functionName);

    if (!tool) {
      return {
        success: false,
        error: `Unknown function: ${functionCall.functionName}`,
        toolName: functionCall.functionName,
        requiresConfirmation: false,
      };
    }

    // Check if confirmation is required
    if (tool.safetyLevel === SafetyLevel.REQUIRES_CONFIRMATION) {
      return {
        success: true,
        toolName: tool.name,
        requiresConfirmation: true,
      };
    }

    // Execute the tool
    try {
      const data = await tool.execute(functionCall.parameters);
      return {
        success: true,
        data,
        toolName: tool.name,
        requiresConfirmation: false,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Execution failed",
        toolName: tool.name,
        requiresConfirmation: false,
      };
    }
  }

  /**
   * Create a confirmation request
   * @param functionCall - Function call requiring confirmation
   * @param description - Description of the action
   * @returns Confirmation request
   */
  private createConfirmationRequest(
    functionCall: FunctionCall,
    description: string,
  ): ConfirmationRequest {
    const tool = getToolByName(functionCall.functionName);
    const action = tool?.description || functionCall.functionName;

    // Determine affected resources
    const affectedResources: string[] = [];
    if (functionCall.parameters.containerId) {
      affectedResources.push(
        `Container: ${functionCall.parameters.containerId}`,
      );
    }
    if (functionCall.parameters.url) {
      affectedResources.push(`URL: ${functionCall.parameters.url}`);
    }

    return {
      id: `confirm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      action,
      description: description || action,
      affectedResources,
      functionCall,
      timestamp: new Date(),
    };
  }

  /**
   * Format response message with execution results
   * @param message - Base message
   * @param results - Execution results
   * @returns Formatted message
   */
  private formatResponseWithResults(
    message: string,
    results: ToolExecutionResult[],
  ): string {
    if (results.length === 0) {
      return message;
    }

    let formattedMessage = message;

    for (const result of results) {
      if (result.data) {
        formattedMessage += `\n\n${this.formatResultData(result.data)}`;
      }
    }

    return formattedMessage.trim();
  }

  /**
   * Format result data for display
   * @param data - Result data
   * @returns Formatted string
   */
  private formatResultData(data: any): string {
    if (typeof data === "string") {
      return data;
    }

    if (data.containers && Array.isArray(data.containers)) {
      const containerList = data.containers
        .map((c: any) => `• ${c.name} (${c.state})`)
        .join("\n");
      return `Found ${data.found || data.containers.length} container(s):\n${containerList}`;
    }

    if (data.shortcuts && Array.isArray(data.shortcuts)) {
      const shortcutList = data.shortcuts
        .map((s: any) => `• ${s.name}${s.isFavorite ? " ⭐" : ""}`)
        .join("\n");
      return `Found ${data.total || data.shortcuts.length} shortcut(s):\n${shortcutList}`;
    }

    return JSON.stringify(data, null, 2);
  }
}

/**
 * Singleton instance of DockerAgent
 */
export const dockerAgent = new DockerAgent();
