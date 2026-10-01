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

  // Containers. Actions are addressed by server as well as by container: a
  // Docker ID is only unique within the daemon that issued it.
  CONTAINERS: `${API_BASE}/containers`,
  CONTAINER_ACTION: (hostId: number, id: string, action: string) =>
    `${API_BASE}/hosts/${hostId}/containers/${id}/${action}`,

  // Hosts (servers)
  HOSTS: `${API_BASE}/hosts`,
  HOST_BY_ID: (id: number) => `${API_BASE}/hosts/${id}`,
  HOSTS_TEST: `${API_BASE}/hosts/test`,
  HOST_RETRY: (id: number) => `${API_BASE}/hosts/${id}/retry`,

  // Tailscale
  TAILSCALE: `${API_BASE}/tailscale`,

  // Uploads
  UPLOADS: `${API_BASE}/uploads`,
} as const;
