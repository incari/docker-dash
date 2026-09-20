/**
 * Chat Integration Layer
 * Connects AIChat UI with DockerAgent
 */

import { dockerAgent } from "../agent/DockerAgent";
import { buildDashboardContext } from "../context/contextBuilder";
import type { DockerContainer, Shortcut } from "../../../types";
import type { AgentResponse, ConfirmationRequest } from "../types";

/**
 * Chat integration state
 */
interface ChatState {
  isProcessing: boolean;
  pendingConfirmation: ConfirmationRequest | null;
}

/**
 * Chat integration class
 * Manages communication between UI and AI agent
 */
export class ChatIntegration {
  private state: ChatState = {
    isProcessing: false,
    pendingConfirmation: null,
  };

  /**
   * Update dashboard context
   * @param containers - Current containers
   * @param shortcuts - Current shortcuts
   */
  updateContext(containers: DockerContainer[], shortcuts: Shortcut[]): void {
    const context = buildDashboardContext(containers, shortcuts);
    dockerAgent.setContext(context);
  }

  /**
   * Process user message
   * @param message - User's message
   * @returns Agent response
   */
  async processMessage(message: string): Promise<AgentResponse> {
    if (this.state.isProcessing) {
      return {
        message: "Please wait, I'm still processing your previous request.",
        success: false,
        error: "Already processing",
      };
    }

    this.state.isProcessing = true;

    try {
      const response = await dockerAgent.processQuery(message);

      // Store pending confirmation if needed
      if (response.confirmationRequest) {
        this.state.pendingConfirmation = response.confirmationRequest;
      }

      return response;
    } catch (error) {
      console.error("Error processing message:", error);
      return {
        message: "I encountered an error processing your request. Please try again.",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      this.state.isProcessing = false;
    }
  }

  /**
   * Confirm pending action
   * @returns Agent response
   */
  async confirmPendingAction(): Promise<AgentResponse> {
    if (!this.state.pendingConfirmation) {
      return {
        message: "No pending action to confirm.",
        success: false,
        error: "No pending confirmation",
      };
    }

    this.state.isProcessing = true;

    try {
      const response = await dockerAgent.executeConfirmedAction(
        this.state.pendingConfirmation
      );

      // Clear pending confirmation
      this.state.pendingConfirmation = null;

      return response;
    } catch (error) {
      console.error("Error confirming action:", error);
      return {
        message: "Failed to execute the confirmed action.",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      this.state.isProcessing = false;
    }
  }

  /**
   * Cancel pending action
   */
  cancelPendingAction(): void {
    this.state.pendingConfirmation = null;
  }

  /**
   * Get pending confirmation
   * @returns Pending confirmation request or null
   */
  getPendingConfirmation(): ConfirmationRequest | null {
    return this.state.pendingConfirmation;
  }

  /**
   * Check if currently processing
   * @returns True if processing
   */
  isProcessing(): boolean {
    return this.state.isProcessing;
  }

  /**
   * Format agent response for display
   * @param response - Agent response
   * @returns Formatted message
   */
  formatResponse(response: AgentResponse): string {
    if (!response.success && response.error) {
      return `❌ ${response.message}`;
    }

    if (response.confirmationRequest) {
      return `🔒 ${response.message}`;
    }

    if (response.executedFunctions && response.executedFunctions.length > 0) {
      return `✅ ${response.message}`;
    }

    return response.message;
  }

  /**
   * Get loading message
   * @returns Loading message
   */
  getLoadingMessage(): string {
    return "Thinking...";
  }
}

/**
 * Singleton instance of ChatIntegration
 */
export const chatIntegration = new ChatIntegration();

