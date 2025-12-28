import type { Section, Shortcut, TailscaleInfo } from "./types";

export interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: (() => void) | null;
  type: "danger" | "warning";
}

export interface ErrorModalState {
  isOpen: boolean;
  title: string;
  message: string;
}

export interface SectionModalState {
  isOpen: boolean;
  section: Section | null;
}

export interface TailscaleInfoExtended extends TailscaleInfo {
  available: boolean;
}

export interface ShortcutsBySection {
  [sectionId: number]: Shortcut[];
}
