// Docker Container Types
export interface ContainerPort {
  private: number;
  public?: number;
  type: string;
}

export interface DockerContainer {
  id: string;
  name: string;
  state: string;
  status: string;
  image: string;
  description?: string;
  ports: ContainerPort[];
  // Docker Compose grouping info
  composeProject: string | null;
  composeService: string | null;
  /**
   * The server this container runs on. A Docker ID is only unique within one
   * daemon, so every action has to name the host as well as the container.
   */
  hostId: number;
  hostName: string;
}

// Host (server) Types
export type HostType = "local" | "agent";

export interface HostStatus {
  online: boolean;
  checked_at: string | null;
  container_count: number | null;
  /** The backend's own wording, used when the code is not one we know. */
  error: string | null;
  /** Looked up in hosts.errors so the reason is shown in the UI language. */
  error_code: string | null;
  /** Consecutive failures; the backoff grows on this. */
  failures: number;
  /** When this server will be tried again, while it is being skipped. */
  retry_after: string | null;
}

export interface Host {
  id: number;
  name: string;
  type: HostType;
  url: string | null;
  /** Hostname a port-based link opens; null means "this machine". */
  hostname: string | null;
  color: string | null;
  position: number;
  enabled: boolean;
  has_api_key: boolean;
  status: HostStatus;
  /**
   * Only on the local host: whether a hub may read this installation, and the
   * key it would have to present. This is the key the user copies into a hub.
   */
  agent?: AgentAccess;
}

export interface AgentAccess {
  enabled: boolean;
  /** True when API_KEY is set, which makes the key read-only in the UI. */
  managed_by_env: boolean;
  api_key: string;
}

export interface HostFormData {
  name: string;
  url: string;
  api_key: string;
  hostname: string;
  color: string;
  enabled: boolean;
}

// Shortcut Types
export interface Shortcut {
  id: number;
  /** The server this shortcut belongs to; 1 is the local one. */
  host_id: number;
  /** Joined by the API so a card can label itself without a second lookup. */
  host_name?: string | null;
  /** Hostname a port-based link opens; null means the browser's own host. */
  host_hostname?: string | null;
  display_name: string;
  description: string | null;
  url: string | null;
  port: number | null;
  icon: string | null;
  icon_type: "lucide" | "image" | "upload" | null;
  container_id: string | null;
  container_name: string | null;
  container_match_name: string | null; // Stable identifier for matching across container restarts
  position: number;
  is_favorite: boolean;
  section_id: number | null;
  // Docker Compose grouping
  compose_project: string | null;
}

// Section Types
export interface Section {
  id: number;
  name: string;
  position: number;
  is_collapsed: boolean;
}

// Tailscale Info Types
export interface TailscaleInfo {
  enabled: boolean;
  ip: string | null;
}

// Modal Types
export interface ModalState {
  isOpen: boolean;
  mode: "add" | "edit";
  shortcut: Shortcut | null;
}

// Form Data Types
export interface ShortcutFormData {
  host_id: string;
  display_name: string;
  description: string;
  url: string;
  port: string;
  icon: string;
  icon_type: "lucide" | "image" | "upload";
  container_id: string;
  container_name: string;
  section_id: string;
}

// Component Props Types
export interface ShortcutCardProps {
  shortcut: Shortcut;
  container: DockerContainer | null;
  tailscaleIP: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onStart?: () => void;
  onStop?: () => void;
  onRestart?: () => void;
  onToggleFavorite: () => void;
  isEditMode?: boolean;
  alwaysShowStar?: boolean;
}

export interface SortableShortcutCardProps extends ShortcutCardProps {}

export interface ContainerCardProps {
  container: DockerContainer;
  isAdded: boolean;
  isFavorite: boolean;
  onQuickAdd: () => void;
  onToggleFavorite: () => void;
  onCustomize: () => void;
  onStart: () => void;
  onStop: () => void;
}

export interface DroppableSectionProps {
  sectionId: number | null;
  isActive: boolean;
  children: React.ReactNode;
}

export interface SectionDropZoneProps {
  sectionId: number | null;
  isActive: boolean;
}

export interface ErrorModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onClose: () => void;
  type?: "error" | "success";
}

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: "danger" | "warning";
}

export interface SectionModalProps {
  isOpen: boolean;
  mode: "add" | "edit";
  section: Section | null;
  onSave: (name: string) => void;
  onClose: () => void;
}

export interface ShortcutModalProps {
  isOpen: boolean;
  shortcut: Shortcut | null;
  containers: DockerContainer[];
  hosts: Host[];
  tailscaleInfo: TailscaleInfo & { available: boolean };
  onSave: () => void;
  onClose: () => void;
  onError: (title: string, message: string) => void;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// Drag and Drop Types
export interface DragEndEvent {
  active: { id: number };
  over: {
    id: number;
    data?: { current?: { type: string; sectionId: number | null } };
  } | null;
}

export interface DragOverEvent {
  active: { id: number };
  over: { id: number } | null;
}

export interface DragStartEvent {
  active: { id: number };
}

// Utility Types
export type IconType = "lucide" | "image" | "upload" | null;
export type ModalMode = "add" | "edit";

// View Types
export type ViewMode = "default" | "compact" | "icon" | "list" | "table";
export type MobileColumns = 1 | 2;

export interface ViewSettings {
  mode: ViewMode;
  mobileColumns: MobileColumns;
}
