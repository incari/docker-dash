/**
 * API Service Layer
 * Centralized API calls for the Docker Dashboard
 */
import axios from "axios";
import { API_BASE, API_ENDPOINTS } from "../constants/api";
import type {
  DockerContainer,
  Host,
  HostFormData,
  Shortcut,
  Section,
} from "../types";
import type { TailscaleInfoExtended } from "../appTypes";

// ==================== Shortcuts API ====================

export const shortcutsApi = {
  getAll: async (): Promise<Shortcut[]> => {
    const response = await axios.get(API_ENDPOINTS.SHORTCUTS);
    return response.data;
  },

  create: async (formData: FormData): Promise<Shortcut> => {
    const response = await axios.post(API_ENDPOINTS.SHORTCUTS, formData);
    return response.data;
  },

  update: async (id: number, formData: FormData): Promise<Shortcut> => {
    const response = await axios.put(
      API_ENDPOINTS.SHORTCUT_BY_ID(id),
      formData,
    );
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await axios.delete(API_ENDPOINTS.SHORTCUT_BY_ID(id));
  },

  toggleFavorite: async (id: number, isFavorite: boolean): Promise<any> => {
    const response = await axios.post(API_ENDPOINTS.SHORTCUT_FAVORITE(id), {
      is_favorite: isFavorite,
    });
    return response.data;
  },

  updateSection: async (
    id: number,
    sectionId: number | null,
    position: number,
  ): Promise<void> => {
    await axios.put(API_ENDPOINTS.SHORTCUT_SECTION(id), {
      section_id: sectionId,
      position,
    });
  },

  reorder: async (
    shortcuts: Array<{ id: number; position: number }>,
  ): Promise<void> => {
    await axios.put(API_ENDPOINTS.SHORTCUTS_REORDER, { shortcuts });
  },

  migrateIcons: async (
    updates: Array<{ id: number; icon_url: string }>,
  ): Promise<{
    success: boolean;
    updated: number;
    skipped: number;
    total: number;
    message: string;
  }> => {
    const response = await axios.post(`${API_BASE}/shortcuts/migrate-icons`, {
      updates,
    });
    return response.data;
  },

  autoSync: async (): Promise<{
    success: boolean;
    created: number;
    total: number;
    message: string;
  }> => {
    const response = await axios.post(`${API_BASE}/shortcuts/auto-sync`);
    return response.data;
  },

  checkMigration: async (): Promise<{
    needsMigration: boolean;
    count: number;
    shortcuts: Array<{
      id: number;
      display_name: string;
      description: string;
      icon: string;
    }>;
  }> => {
    const response = await axios.get(`${API_BASE}/shortcuts/check-migration`);
    return response.data;
  },

  previewIcons: async (): Promise<{
    count: number;
    shortcuts: Array<{
      id: number;
      display_name: string;
      container_name: string;
      current_icon: string | null;
      suggested_icon: string | null;
      is_custom_mapping: boolean;
    }>;
  }> => {
    const response = await axios.get(`${API_BASE}/shortcuts/preview-icons`);
    return response.data;
  },
};

// ==================== Sections API ====================

export const sectionsApi = {
  getAll: async (): Promise<Section[]> => {
    const response = await axios.get(API_ENDPOINTS.SECTIONS);
    return response.data;
  },

  create: async (name: string): Promise<Section> => {
    const response = await axios.post(API_ENDPOINTS.SECTIONS, { name });
    return response.data;
  },

  update: async (
    id: number,
    data: { name?: string; is_collapsed?: boolean },
  ): Promise<void> => {
    await axios.put(API_ENDPOINTS.SECTION_BY_ID(id), data);
  },

  delete: async (id: number): Promise<void> => {
    await axios.delete(API_ENDPOINTS.SECTION_BY_ID(id));
  },

  reorder: async (
    sections: Array<{ id: number; position: number }>,
  ): Promise<void> => {
    await axios.put(API_ENDPOINTS.SECTIONS_REORDER, { sections });
  },
};

// ==================== Containers API ====================

export const containersApi = {
  /** Every container on every enabled server, in one list. */
  getAll: async (): Promise<DockerContainer[]> => {
    const response = await axios.get(API_ENDPOINTS.CONTAINERS);
    return response.data;
  },

  start: async (hostId: number, id: string): Promise<void> => {
    await axios.post(API_ENDPOINTS.CONTAINER_ACTION(hostId, id, "start"));
  },

  stop: async (hostId: number, id: string): Promise<void> => {
    await axios.post(API_ENDPOINTS.CONTAINER_ACTION(hostId, id, "stop"));
  },

  restart: async (hostId: number, id: string): Promise<void> => {
    await axios.post(API_ENDPOINTS.CONTAINER_ACTION(hostId, id, "restart"));
  },
};

// ==================== Hosts (servers) API ====================

export interface HostTestResult {
  ok: boolean;
  containers?: number;
  name?: string;
  version?: string;
  error?: string;
  error_code?: string;
}

export const hostsApi = {
  getAll: async (): Promise<Host[]> => {
    const response = await axios.get(API_ENDPOINTS.HOSTS);
    return response.data;
  },

  create: async (data: Partial<HostFormData>): Promise<Host> => {
    const response = await axios.post(API_ENDPOINTS.HOSTS, data);
    return response.data;
  },

  update: async (id: number, data: Partial<HostFormData>): Promise<Host> => {
    const response = await axios.put(API_ENDPOINTS.HOST_BY_ID(id), data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await axios.delete(API_ENDPOINTS.HOST_BY_ID(id));
  },

  /**
   * Check an address and key before saving them, so a typo is caught while the
   * form is still open. An omitted key means "use the saved one".
   */
  test: async (data: {
    id?: number;
    url?: string;
    api_key?: string;
  }): Promise<HostTestResult> => {
    const response = await axios.post(API_ENDPOINTS.HOSTS_TEST, data);
    return response.data;
  },

  /** Let a hub read this installation, or stop it. */
  setAgentEnabled: async (id: number, enabled: boolean): Promise<Host> => {
    const response = await axios.put(API_ENDPOINTS.HOST_BY_ID(id), {
      agent_enabled: enabled,
    });
    return response.data;
  },

  /**
   * Try a server that is being skipped, right now.
   * A failing server is left alone for up to a minute at a time, which is wrong
   * the moment someone switches it back on.
   */
  retry: async (id: number): Promise<Host> => {
    const response = await axios.post(API_ENDPOINTS.HOST_RETRY(id));
    return response.data;
  },

  /**
   * This machine's own key, for copying into a hub. Fetched when the person
   * asks to see or copy it, not with every host listing.
   */
  getApiKey: async (id: number): Promise<string> => {
    const response = await axios.get<{ api_key: string }>(
      API_ENDPOINTS.HOST_API_KEY(id),
    );
    return response.data.api_key;
  },

  /** Replace this machine's key, locking out whoever held the old one. */
  rotateApiKey: async (id: number): Promise<Host> => {
    const response = await axios.post(API_ENDPOINTS.HOST_API_KEY(id));
    return response.data;
  },
};

// ==================== Tailscale API ====================

export const tailscaleApi = {
  getInfo: async (): Promise<TailscaleInfoExtended> => {
    const response = await axios.get(API_ENDPOINTS.TAILSCALE);
    return response.data;
  },
};

// ==================== Settings API ====================

export interface Settings {
  theme_primary: string;
  theme_background: string;
  view_mode: string;
  mobile_columns: number;
}

export const settingsApi = {
  get: async (): Promise<Settings> => {
    const response = await axios.get(`${API_BASE}/settings`);
    return response.data;
  },

  update: async (settings: Partial<Settings>): Promise<Settings> => {
    const response = await axios.put(`${API_BASE}/settings`, settings);
    return response.data;
  },
};

// ==================== Uploads API ====================

export interface UploadedImage {
  filename: string;
  url: string;
  uploadedAt: string;
}

export const uploadsApi = {
  getAll: async (): Promise<UploadedImage[]> => {
    const response = await axios.get(API_ENDPOINTS.UPLOADS);
    return response.data;
  },
  delete: async (filename: string, force: boolean = false): Promise<void> => {
    await axios.delete(`${API_ENDPOINTS.UPLOADS}/${filename}`, {
      params: { force: force ? "true" : "false" },
    });
  },
};

/**
 * Export and import of the dashboard's own data. Upgrades migrate the database
 * in place and cannot be undone, so users need a copy they control.
 */
export const dataApi = {
  /** The browser downloads this directly; the server sets Content-Disposition. */
  exportUrl: `${API_BASE}/export`,

  importData: async (
    payload: unknown,
  ): Promise<{
    success: boolean;
    shortcuts: number;
    sections: number;
    message: string;
  }> => {
    const response = await axios.post(`${API_BASE}/import`, payload);
    return response.data;
  },
};
