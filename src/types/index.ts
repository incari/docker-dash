/**
 * Core type definitions for Docker Dashboard
 */

// Database row types

/**
 * A Docker host the dashboard reads containers from.
 *
 * `local` is the daemon this process talks to over its own socket; there is
 * exactly one, it is row 1, and it cannot be deleted. `agent` is another
 * docker-dash installation reached over HTTP with a shared token.
 */
export type HostType = "local" | "agent";

export interface HostRow {
  id: number;
  name: string;
  type: HostType;
  /** Base URL of the remote docker-dash, e.g. https://nas.tailnet.ts.net:3080 */
  url: string | null;
  /** Key sent as `Authorization: Bearer <key>` to the agent. */
  api_key: string | null;
  /**
   * Hostname port-based shortcuts on this host are opened against. Empty for
   * the local host (the browser's own hostname is used) and derived from `url`
   * for agents that do not set it.
   */
  hostname: string | null;
  /** Badge colour, so servers stay distinguishable at a glance. */
  color: string | null;
  position: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface HostResponse {
  id: number;
  name: string;
  type: HostType;
  url: string | null;
  hostname: string | null;
  color: string | null;
  position: number;
  enabled: boolean;
  /** The key itself is never sent to the browser. */
  has_api_key: boolean;
  status: HostStatus;
  /**
   * Only on the local host: whether a hub may read this installation, and the
   * key it would have to present. Absent for remote servers, whose own access
   * settings are their business.
   */
  agent?: {
    enabled: boolean;
    managed_by_env: boolean;
    api_key: string;
  };
}

export interface HostStatus {
  online: boolean;
  /** null until the host has been contacted once in this process. */
  checked_at: string | null;
  container_count: number | null;
  error: string | null;
  /** Lets the browser phrase the failure in the user's language. */
  error_code: string | null;
  /** Consecutive failures, which is what the backoff grows on. */
  failures: number;
  /** When this host will be tried again; null when it is not being skipped. */
  retry_after: string | null;
}

export interface CreateHostBody {
  name?: string;
  url?: string;
  api_key?: string;
  hostname?: string;
  color?: string;
  enabled?: boolean;
}

export interface UpdateHostBody extends CreateHostBody {
  position?: number;
  /** Local host only: allow a hub to read this installation. */
  agent_enabled?: boolean;
}

export interface ShortcutRow {
  id: number;
  host_id: number;
  display_name: string;
  description: string | null;
  icon: string | null;
  port: number | null;
  url: string | null;
  container_id: string | null;
  container_name: string | null;
  container_match_name: string | null; // Stable identifier for matching across container restarts
  is_favorite: number;
  created_at: string;
  updated_at: string;
  position: number;
  section_id: number | null;
  icon_type: string | null;
  use_tailscale: number | null;
  original_container_name: string | null;
  section_name?: string | null;
  compose_project: string | null;
  /** Joined from `hosts` so a card can label and link itself without a lookup. */
  host_name?: string | null;
  host_hostname?: string | null;
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
  host_id: number;
  display_name: string;
  description: string | null;
  icon: string | null;
  port: number | null;
  url: string | null;
  container_id: string | null;
  container_name: string | null;
  container_match_name: string | null;
  is_favorite: boolean;
  position: number;
  section_id: number | null;
  icon_type: string | null;
  use_tailscale: boolean;
  section_name?: string | null;
  compose_project: string | null;
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

/**
 * A container as the dashboard passes it around, normalised so that the local
 * daemon and a remote agent are indistinguishable downstream.
 */
export interface NormalizedContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  description: string;
  ports: Array<{ private: number; public: number; type: string }>;
  /**
   * Ports exactly as Docker reports them, kept because port selection needs the
   * private port and the published/exposed distinction that `ports` drops.
   * Stripped before the list reaches the browser.
   */
  rawPorts: Array<{ PrivatePort: number; PublicPort?: number; Type?: string }>;
  composeProject: string | null;
  composeService: string | null;
  hostId: number;
  hostName: string;
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
  icon_type?: "lucide" | "image" | "upload";
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
