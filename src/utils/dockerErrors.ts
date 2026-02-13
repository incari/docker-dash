/**
 * Docker error detection utilities
 * Centralized error handling for Docker connection issues
 */

/**
 * Check if an error indicates Docker is not running or unavailable
 * Handles various error types from dockerode
 */
export function isDockerUnavailable(error: unknown): boolean {
  if (!error) return false;

  const err = error as {
    code?: string;
    errno?: number;
    message?: string;
    syscall?: string;
    statusCode?: number;
    reason?: string;
  };

  // Common error codes when Docker is not running
  const dockerErrorCodes = [
    "ECONNREFUSED", // Connection refused
    "ENOENT", // Socket file not found
    "EACCES", // Permission denied
    "EPIPE", // Broken pipe
  ];

  // Check error code
  if (err.code && dockerErrorCodes.includes(err.code)) {
    return true;
  }

  // Check errno (macOS often uses -61 for ECONNREFUSED)
  if (err.errno === -61 || err.errno === -2) {
    return true;
  }

  // Check HTTP status code (503 = Docker paused or unavailable)
  if (err.statusCode === 503) {
    return true;
  }

  // Check error message for common Docker unavailability patterns
  if (err.message) {
    const message = err.message.toLowerCase();
    if (
      message.includes("connect econnrefused") ||
      message.includes("no such file") ||
      message.includes("cannot connect to the docker daemon") ||
      message.includes("docker socket") ||
      message.includes("is the docker daemon running") ||
      message.includes("docker desktop is manually paused") ||
      message.includes("docker is paused")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Log a Docker unavailability warning with context
 */
export function logDockerUnavailable(context: string): void {
  console.warn(
    `[${context}] Docker is not running or unavailable. Returning graceful fallback.`,
  );
}

