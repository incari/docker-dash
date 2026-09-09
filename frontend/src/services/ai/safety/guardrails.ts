/**
 * Safety Guardrails for AI Agent
 * Implements validation and safety checks for AI operations
 */

import { SafetyLevel, type SafetyValidationResult } from "../types";

/**
 * Patterns that indicate dangerous operations that should be blocked
 */
const BLOCKED_PATTERNS = [
  /\b(delete|remove|destroy|drop|truncate|rm)\b.*\b(all|everything|\*)\b/i,
  /\b(delete|remove|destroy)\b.*\b(database|db|data)\b/i,
  /\b(format|wipe|erase)\b/i,
  /\b(drop|truncate)\b.*\b(table|database)\b/i,
  /\brm\s+-rf\b/i,
  /\b(delete|remove)\b.*\b(production|prod)\b/i,
];

/**
 * Patterns that require user confirmation before execution
 */
const CONFIRMATION_PATTERNS = [
  /\b(start|stop|restart|kill)\b.*\b(container|service)\b/i,
  /\bopen\b.*\b(url|link|website)\b/i,
  /\b(delete|remove)\b.*\b(container|shortcut)\b/i,
  /\b(modify|update|change)\b.*\b(settings|config)\b/i,
];

/**
 * Function names that require confirmation
 */
const CONFIRMATION_FUNCTIONS = [
  "startContainer",
  "stopContainer",
  "restartContainer",
  "openContainerUrl",
  "deleteShortcut",
  "updateSettings",
];

/**
 * Function names that are blocked
 */
const BLOCKED_FUNCTIONS = [
  "deleteAllContainers",
  "removeAllShortcuts",
  "dropDatabase",
  "formatDisk",
  "deleteEverything",
];

/**
 * Validate if an action is safe to execute
 * @param action - The action description or function name
 * @returns Validation result with safety level and permissions
 */
export function validateAction(action: string): SafetyValidationResult {
  const normalizedAction = action.toLowerCase().trim();

  // Check if action is blocked
  if (isBlockedOperation(normalizedAction)) {
    return {
      allowed: false,
      safetyLevel: SafetyLevel.BLOCKED,
      reason: "This operation is blocked for safety reasons",
      requiresConfirmation: false,
    };
  }

  // Check if action requires confirmation
  if (requiresConfirmation(normalizedAction)) {
    return {
      allowed: true,
      safetyLevel: SafetyLevel.REQUIRES_CONFIRMATION,
      requiresConfirmation: true,
    };
  }

  // Action is safe
  return {
    allowed: true,
    safetyLevel: SafetyLevel.SAFE,
    requiresConfirmation: false,
  };
}

/**
 * Check if an operation requires user confirmation
 * @param action - The action description or function name
 * @returns True if confirmation is required
 */
export function requiresConfirmation(action: string): boolean {
  const normalizedAction = action.toLowerCase().trim();

  // Check function names
  if (CONFIRMATION_FUNCTIONS.some((fn) => normalizedAction.includes(fn.toLowerCase()))) {
    return true;
  }

  // Check patterns
  return CONFIRMATION_PATTERNS.some((pattern) => pattern.test(normalizedAction));
}

/**
 * Check if an operation is blocked
 * @param action - The action description or function name
 * @returns True if operation is blocked
 */
export function isBlockedOperation(action: string): boolean {
  const normalizedAction = action.toLowerCase().trim();

  // Check function names
  if (BLOCKED_FUNCTIONS.some((fn) => normalizedAction.includes(fn.toLowerCase()))) {
    return true;
  }

  // Check patterns
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(normalizedAction));
}

/**
 * Sanitize user input to prevent injection attacks
 * @param input - User input string
 * @returns Sanitized input
 */
export function sanitizeInput(input: string): string {
  // Remove potentially dangerous characters
  return input
    .replace(/[<>]/g, "") // Remove HTML tags
    .replace(/[;|&$`]/g, "") // Remove shell metacharacters
    .trim();
}

/**
 * Validate function parameters
 * @param functionName - Name of the function
 * @param params - Parameters to validate
 * @returns True if parameters are valid
 */
export function validateParameters(
  functionName: string,
  params: Record<string, any>
): { valid: boolean; error?: string } {
  // Basic validation
  if (!params || typeof params !== "object") {
    return { valid: false, error: "Parameters must be an object" };
  }

  // Function-specific validation
  switch (functionName) {
    case "findContainersByName":
      if (!params.name || typeof params.name !== "string") {
        return { valid: false, error: "Parameter 'name' must be a string" };
      }
      break;

    case "getContainerHealth":
    case "startContainer":
    case "stopContainer":
    case "restartContainer":
      if (!params.containerId || typeof params.containerId !== "string") {
        return { valid: false, error: "Parameter 'containerId' must be a string" };
      }
      break;

    case "openContainerUrl":
      if (!params.url || typeof params.url !== "string") {
        return { valid: false, error: "Parameter 'url' must be a string" };
      }
      // Validate URL format
      try {
        new URL(params.url);
      } catch {
        return { valid: false, error: "Parameter 'url' must be a valid URL" };
      }
      break;
  }

  return { valid: true };
}

