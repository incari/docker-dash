/**
 * API Service Layer
 * Centralized API calls for the Docker Dashboard
 */
import axios from "axios";
import { API_BASE, API_ENDPOINTS } from "../constants/api";
import type { DockerContainer, Shortcut, Section } from "../types";
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

  toggleFavorite: async (id: number, isFavorite: boolean): Promise<void> => {
    await axios.post(API_ENDPOINTS.SHORTCUT_FAVORITE(id), {
      is_favorite: isFavorite,
    });
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
  getAll: async (): Promise<DockerContainer[]> => {
    const response = await axios.get(API_ENDPOINTS.CONTAINERS);
    return response.data;
  },

  start: async (id: string): Promise<void> => {
    await axios.post(API_ENDPOINTS.CONTAINER_START(id));
  },

  stop: async (id: string): Promise<void> => {
    await axios.post(API_ENDPOINTS.CONTAINER_STOP(id));
  },

  restart: async (id: string): Promise<void> => {
    await axios.post(API_ENDPOINTS.CONTAINER_RESTART(id));
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
