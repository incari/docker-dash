/**
 * Context Builder for AI Agent
 * Gathers current dashboard state and formats it for LLM context
 */

import type { DockerContainer, Shortcut } from "../../../types";
import type { DashboardContext } from "../types";

/**
 * Maximum number of containers to include in context
 * Prevents token limit issues
 */
const MAX_CONTAINERS_IN_CONTEXT = 20;

/**
 * Maximum number of shortcuts to include in context
 */
const MAX_SHORTCUTS_IN_CONTEXT = 15;

/**
 * Build context from current dashboard state
 * @param containers - All Docker containers
 * @param shortcuts - All shortcuts
 * @returns Dashboard context object
 */
export function buildDashboardContext(
  containers: DockerContainer[],
  shortcuts: Shortcut[]
): DashboardContext {
  const runningContainers = containers.filter((c) => c.state === "running").length;
  const stoppedContainers = containers.filter((c) => c.state !== "running").length;

  return {
    containers,
    shortcuts,
    runningContainers,
    stoppedContainers,
    timestamp: new Date(),
  };
}

/**
 * Format dashboard context as a concise string for LLM
 * @param context - Dashboard context
 * @returns Formatted context string
 */
export function formatContextForLLM(context: DashboardContext): string {
  const { containers, shortcuts, runningContainers, stoppedContainers } = context;

  // Limit containers to prevent token overflow
  const limitedContainers = containers.slice(0, MAX_CONTAINERS_IN_CONTEXT);
  const limitedShortcuts = shortcuts.slice(0, MAX_SHORTCUTS_IN_CONTEXT);

  const containersList = limitedContainers
    .map(
      (c) =>
        `- ${c.name} (${c.state}) - ID: ${c.id.substring(0, 12)} - Image: ${c.image}`
    )
    .join("\n");

  const shortcutsList = limitedShortcuts
    .map(
      (s) =>
        `- ${s.display_name}${s.container_name ? ` (${s.container_name})` : ""}${s.is_favorite ? " ⭐" : ""}`
    )
    .join("\n");

  return `
Dashboard Status:
- Total Containers: ${containers.length}
- Running: ${runningContainers}
- Stopped: ${stoppedContainers}
- Total Shortcuts: ${shortcuts.length}

Containers${containers.length > MAX_CONTAINERS_IN_CONTEXT ? ` (showing first ${MAX_CONTAINERS_IN_CONTEXT})` : ""}:
${containersList || "No containers"}

Shortcuts${shortcuts.length > MAX_SHORTCUTS_IN_CONTEXT ? ` (showing first ${MAX_SHORTCUTS_IN_CONTEXT})` : ""}:
${shortcutsList || "No shortcuts"}
`.trim();
}

/**
 * Get container summary for context
 * @param containers - Docker containers
 * @returns Summary string
 */
export function getContainerSummary(containers: DockerContainer[]): string {
  const running = containers.filter((c) => c.state === "running");
  const stopped = containers.filter((c) => c.state !== "running");

  const runningNames = running.map((c) => c.name).join(", ");
  const stoppedNames = stopped.map((c) => c.name).join(", ");

  let summary = `You have ${containers.length} container(s) total.\n`;
  
  if (running.length > 0) {
    summary += `Running (${running.length}): ${runningNames}\n`;
  }
  
  if (stopped.length > 0) {
    summary += `Stopped (${stopped.length}): ${stoppedNames}`;
  }

  return summary.trim();
}

/**
 * Get shortcut summary for context
 * @param shortcuts - Shortcuts
 * @returns Summary string
 */
export function getShortcutSummary(shortcuts: Shortcut[]): string {
  const favorites = shortcuts.filter((s) => s.is_favorite);
  const withContainers = shortcuts.filter((s) => s.container_name);

  let summary = `You have ${shortcuts.length} shortcut(s) total.\n`;
  
  if (favorites.length > 0) {
    summary += `Favorites: ${favorites.length}\n`;
  }
  
  if (withContainers.length > 0) {
    summary += `Linked to containers: ${withContainers.length}`;
  }

  return summary.trim();
}

/**
 * Find container by name or partial name
 * @param containers - All containers
 * @param searchTerm - Name to search for
 * @returns Matching containers
 */
export function findContainersByName(
  containers: DockerContainer[],
  searchTerm: string
): DockerContainer[] {
  const term = searchTerm.toLowerCase();
  return containers.filter((c) => c.name.toLowerCase().includes(term));
}

/**
 * Get token count estimate for context
 * Rough estimate: 1 token ≈ 4 characters
 * @param context - Context string
 * @returns Estimated token count
 */
export function estimateTokenCount(context: string): number {
  return Math.ceil(context.length / 4);
}

/**
 * Optimize context to fit within token limit
 * @param context - Dashboard context
 * @param maxTokens - Maximum tokens allowed
 * @returns Optimized context string
 */
export function optimizeContextForTokenLimit(
  context: DashboardContext,
  maxTokens: number = 500
): string {
  let formattedContext = formatContextForLLM(context);
  let tokenCount = estimateTokenCount(formattedContext);

  // If within limit, return as is
  if (tokenCount <= maxTokens) {
    return formattedContext;
  }

  // Reduce containers and shortcuts progressively
  const reducedContext = { ...context };
  reducedContext.containers = context.containers.slice(0, 10);
  reducedContext.shortcuts = context.shortcuts.slice(0, 5);

  formattedContext = formatContextForLLM(reducedContext);
  tokenCount = estimateTokenCount(formattedContext);

  if (tokenCount <= maxTokens) {
    return formattedContext;
  }

  // Last resort: just summary
  return `${getContainerSummary(context.containers)}\n${getShortcutSummary(context.shortcuts)}`;
}

