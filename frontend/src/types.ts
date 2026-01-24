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
}

// Shortcut Types
export interface Shortcut {
  id: number;
  name: string;
  description: string | null;
  url: string | null;
  port: number | null;
  icon: string | null;
  icon_type: "lucide" | "image" | "upload" | null;
  container_id: string | null;
  position: number;
  is_favorite: boolean;
  section_id: number | null;
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
  name: string;
  description: string;
  url: string;
  port: string;
  icon: string;
  icon_type: "lucide" | "image" | "upload";
  container_id: string;
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
  message: string;
  onClose: () => void;
}

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
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
