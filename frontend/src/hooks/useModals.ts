import { useState, useCallback } from "react";
import type { Section, Shortcut } from "../types";
import type {
  ConfirmModalState,
  ErrorModalState,
  SectionModalState,
} from "../appTypes";

interface ShortcutModalState {
  isOpen: boolean;
  shortcut: Shortcut | null;
}

interface ModalsState {
  confirmModal: ConfirmModalState;
  errorModal: ErrorModalState;
  sectionModal: SectionModalState;
  shortcutModal: ShortcutModalState;
}

interface ModalsActions {
  // Confirm modal
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    type?: "danger" | "warning",
  ) => void;
  closeConfirm: () => void;
  confirmAndClose: () => void;
  // Error modal
  showError: (
    title: string,
    message: string,
    type?: "error" | "success",
  ) => void;
  closeError: () => void;
  // Section modal
  openSectionModal: (section?: Section | null) => void;
  closeSectionModal: () => void;
  // Shortcut modal
  openShortcutModal: (shortcut?: Shortcut | null) => void;
  closeShortcutModal: () => void;
}

const INITIAL_CONFIRM_MODAL: ConfirmModalState = {
  isOpen: false,
  title: "",
  message: "",
  onConfirm: null,
  type: "danger",
};

const INITIAL_ERROR_MODAL: ErrorModalState = {
  isOpen: false,
  title: "",
  message: "",
  type: "error",
};

const INITIAL_SECTION_MODAL: SectionModalState = {
  isOpen: false,
  section: null,
};

const INITIAL_SHORTCUT_MODAL: ShortcutModalState = {
  isOpen: false,
  shortcut: null,
};

export function useModals(): ModalsState & ModalsActions {
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(
    INITIAL_CONFIRM_MODAL,
  );
  const [errorModal, setErrorModal] =
    useState<ErrorModalState>(INITIAL_ERROR_MODAL);
  const [sectionModal, setSectionModal] = useState<SectionModalState>(
    INITIAL_SECTION_MODAL,
  );
  const [shortcutModal, setShortcutModal] = useState<ShortcutModalState>(
    INITIAL_SHORTCUT_MODAL,
  );

  // Confirm modal actions
  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void,
      type: "danger" | "warning" = "danger",
    ) => {
      setConfirmModal({ isOpen: true, title, message, onConfirm, type });
    },
    [],
  );

  const closeConfirm = useCallback(() => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const confirmAndClose = useCallback(() => {
    confirmModal.onConfirm?.();
    closeConfirm();
  }, [confirmModal.onConfirm, closeConfirm]);

  // Error modal actions
  const showError = useCallback(
    (title: string, message: string, type: "error" | "success" = "error") => {
      setErrorModal({ isOpen: true, title, message, type });
    },
    [],
  );

  const closeError = useCallback(() => {
    setErrorModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Section modal actions
  const openSectionModal = useCallback((section: Section | null = null) => {
    setSectionModal({ isOpen: true, section });
  }, []);

  const closeSectionModal = useCallback(() => {
    setSectionModal({ isOpen: false, section: null });
  }, []);

  // Shortcut modal actions
  const openShortcutModal = useCallback((shortcut: Shortcut | null = null) => {
    setShortcutModal({ isOpen: true, shortcut });
  }, []);

  const closeShortcutModal = useCallback(() => {
    setShortcutModal({ isOpen: false, shortcut: null });
  }, []);

  return {
    // State
    confirmModal,
    errorModal,
    sectionModal,
    shortcutModal,
    // Actions
    showConfirm,
    closeConfirm,
    confirmAndClose,
    showError,
    closeError,
    openSectionModal,
    closeSectionModal,
    openShortcutModal,
    closeShortcutModal,
  };
}
