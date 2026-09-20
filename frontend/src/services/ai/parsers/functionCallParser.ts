/**
 * Function Call Parser for AI Agent
 * Parses LLM output to extract function calls and validates parameters
 */

import type { FunctionCall } from "../types";
import { validateParameters } from "../safety/guardrails";

/**
 * Parse LLM output to extract function calls
 * Expected format:
 * FUNCTION_CALL: functionName
 * PARAMETERS: {"param1": "value1", "param2": "value2"}
 *
 * @param output - Raw LLM output text
 * @returns Array of parsed function calls
 */
export function parseFunctionCalls(output: string): FunctionCall[] {
  const functionCalls: FunctionCall[] = [];

  // Match FUNCTION_CALL and PARAMETERS patterns
  const functionCallRegex = /FUNCTION_CALL:\s*(\w+)\s*\n\s*PARAMETERS:\s*(\{[^}]*\})/gi;
  
  let match;
  while ((match = functionCallRegex.exec(output)) !== null) {
    const functionName = match[1].trim();
    const parametersStr = match[2].trim();

    try {
      const parameters = JSON.parse(parametersStr);
      
      functionCalls.push({
        functionName,
        parameters,
        rawText: match[0],
      });
    } catch (error) {
      console.error(`Failed to parse parameters for ${functionName}:`, error);
      // Continue parsing other function calls
    }
  }

  return functionCalls;
}

/**
 * Extract the message text from LLM output (excluding function calls)
 * @param output - Raw LLM output text
 * @returns Clean message text
 */
export function extractMessage(output: string): string {
  // Remove FUNCTION_CALL and PARAMETERS blocks
  const cleanedOutput = output
    .replace(/FUNCTION_CALL:\s*\w+\s*\n\s*PARAMETERS:\s*\{[^}]*\}/gi, "")
    .trim();

  return cleanedOutput;
}

/**
 * Validate a function call
 * @param functionCall - Function call to validate
 * @returns Validation result
 */
export function validateFunctionCall(functionCall: FunctionCall): {
  valid: boolean;
  error?: string;
} {
  // Validate function name
  if (!functionCall.functionName || typeof functionCall.functionName !== "string") {
    return { valid: false, error: "Function name is required" };
  }

  // Validate parameters
  const paramValidation = validateParameters(
    functionCall.functionName,
    functionCall.parameters
  );

  if (!paramValidation.valid) {
    return { valid: false, error: paramValidation.error };
  }

  return { valid: true };
}

/**
 * Parse and validate function calls from LLM output
 * @param output - Raw LLM output text
 * @returns Object containing message and validated function calls
 */
export function parseAndValidateFunctionCalls(output: string): {
  message: string;
  functionCalls: FunctionCall[];
  errors: string[];
} {
  const message = extractMessage(output);
  const rawFunctionCalls = parseFunctionCalls(output);
  const functionCalls: FunctionCall[] = [];
  const errors: string[] = [];

  for (const functionCall of rawFunctionCalls) {
    const validation = validateFunctionCall(functionCall);
    
    if (validation.valid) {
      functionCalls.push(functionCall);
    } else {
      errors.push(
        `Invalid function call '${functionCall.functionName}': ${validation.error}`
      );
    }
  }

  return {
    message,
    functionCalls,
    errors,
  };
}

/**
 * Check if output contains function calls
 * @param output - Raw LLM output text
 * @returns True if output contains function calls
 */
export function hasFunctionCalls(output: string): boolean {
  return /FUNCTION_CALL:/i.test(output);
}

/**
 * Format function call for display
 * @param functionCall - Function call to format
 * @returns Formatted string
 */
export function formatFunctionCall(functionCall: FunctionCall): string {
  const params = Object.entries(functionCall.parameters)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ");

  return `${functionCall.functionName}(${params})`;
}

/**
 * Parse a single function call from text
 * @param text - Text containing a function call
 * @returns Parsed function call or null
 */
export function parseSingleFunctionCall(text: string): FunctionCall | null {
  const calls = parseFunctionCalls(text);
  return calls.length > 0 ? calls[0] : null;
}

