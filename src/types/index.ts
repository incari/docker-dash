/**
 * Core type definitions for Docker Dashboard
 */

// Database row types
export interface ShortcutRow {
  id: number;
  display_name: string;
  description: string | null;
  icon: string | null;
  port: number | null;
  url: string | null;
  container_id: string | null;
  container_name: string | null;
  is_favorite: number;
  created_at: string;
  updated_at: string;
  position: number;
  section_id: number | null;
  icon_type: string | null;
  use_tailscale: number | null;
  original_container_name: string | null;
  section_name?: string | null;
}

export interface SectionRow {
  id: number;
  name: string;
  position: number;
  is_collapsed: number;
  created_at: string;
}

export interface SettingsRow {
  id: number;
  theme_primary: string;
  theme_background: string;
  view_mode: string;
  mobile_columns: number;
  migration_dismissed: number;
}

// API response types
export interface ShortcutResponse {
  id: number;
  display_name: string;
  description: string | null;
  icon: string | null;
  port: number | null;
  url: string | null;
  container_id: string | null;
  container_name: string | null;
  is_favorite: boolean;
  position: number;
  section_id: number | null;
  icon_type: string | null;
  use_tailscale: boolean;
  section_name?: string | null;
}

export interface SectionResponse {
  id: number;
  name: string;
  position: number;
  is_collapsed: boolean;
}

export interface SettingsResponse {
  theme_primary: string;
  theme_background: string;
  view_mode: string;
  mobile_columns: number;
  migration_dismissed: boolean;
}

// Docker container types
export interface DockerContainerInfo {
  id: string;
  name: string;
  status: string;
  state: string;
  ports: PortMapping[];
  image: string;
  imageName: string;
  description: string;
}

export interface PortMapping {
  PrivatePort: number;
  PublicPort?: number;
  Type: string;
  IP?: string;
}

// Request body types
export interface CreateShortcutBody {
  display_name: string;
  description?: string;
  icon?: string;
  port?: string | number;
  url?: string;
  container_id?: string;
  container_name?: string;
  is_favorite?: string | boolean;
  use_tailscale?: string | boolean;
}

export interface UpdateShortcutBody extends Partial<CreateShortcutBody> {
  icon_type?: 'lucide' | 'image' | 'upload';
  section_id?: string | number | null;
}

export interface CreateSectionBody {
  name: string;
}

export interface UpdateSectionBody {
  name?: string;
  is_collapsed?: boolean;
}

export interface UpdateSettingsBody {
  theme_primary?: string;
  theme_background?: string;
  view_mode?: string;
  mobile_columns?: number;
  migration_dismissed?: boolean;
}

export interface ReorderItem {
  id: number;
  position: number;
}

