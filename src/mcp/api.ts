/**
 * The dashboard's own REST API, called from the MCP tools.
 *
 * The tools go through HTTP rather than the database because the routes are
 * where the rules live: deleting a container's shortcut records the dismissal
 * so auto-sync does not bring it back, an icon the user uploaded is never
 * replaced by a guessed one, a new server invalidates the sync throttle. Doing
 * the same writes from here would mean keeping two copies of all of that.
 *
 * The calls go to the server that received the MCP request, over loopback, so
 * they reach exactly the routes the browser uses.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface DashboardApi {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
  upload<T = unknown>(path: string, form: FormData): Promise<T>;
}

export function createDashboardApi(baseUrl: string): DashboardApi {
  async function send<T>(
    method: string,
    path: string,
    init: { body?: BodyInit; headers?: Record<string, string> } = {},
  ): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { method, ...init });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON - keep the text, it is still the best explanation there is.
    }

    if (!res.ok) {
      const message =
        body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : `${method} ${path} failed with ${res.status}`;
      throw new ApiError(res.status, message, body);
    }
    return body as T;
  }

  function json<T>(method: string, path: string, body?: unknown) {
    return send<T>(method, path, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  return {
    get: (path) => send("GET", path),
    post: (path, body) => json("POST", path, body ?? {}),
    put: (path, body) => json("PUT", path, body ?? {}),
    delete: (path) => send("DELETE", path),
    upload: (path, form) => send("POST", path, { body: form }),
  };
}
