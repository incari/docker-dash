/**
 * API configuration and endpoints
 */

export const API_BASE = "/api";

export const API_ENDPOINTS = {
  // Shortcuts
  SHORTCUTS: `${API_BASE}/shortcuts`,
  SHORTCUT_BY_ID: (id: number) => `${API_BASE}/shortcuts/${id}`,
  SHORTCUT_SECTION: (id: number) => `${API_BASE}/shortcuts/${id}/section`,
  SHORTCUTS_REORDER: `${API_BASE}/shortcuts/reorder`,
  SHORTCUT_FAVORITE: (id: number) => `${API_BASE}/shortcuts/${id}/favorite`,

  // Sections
  SECTIONS: `${API_BASE}/sections`,
  SECTION_BY_ID: (id: number) => `${API_BASE}/sections/${id}`,
  SECTION_TOGGLE: (id: number) => `${API_BASE}/sections/${id}/toggle`,
  SECTIONS_REORDER: `${API_BASE}/sections/reorder`,

  // Containers
  CONTAINERS: `${API_BASE}/containers`,
  CONTAINER_START: (id: string) => `${API_BASE}/containers/${id}/start`,
  CONTAINER_STOP: (id: string) => `${API_BASE}/containers/${id}/stop`,
  CONTAINER_RESTART: (id: string) => `${API_BASE}/containers/${id}/restart`,

  // Tailscale
  TAILSCALE: `${API_BASE}/tailscale`,

  // Uploads
  UPLOADS: `${API_BASE}/uploads`,
} as const;
