import { useCallback } from "react";
import { sectionsApi } from "../services/api";
import type { Section } from "../types";

interface SectionActionsOptions {
  onRefresh: () => void;
  onError: (title: string, message: string) => void;
  showDeleteConfirm: (sectionName: string, onConfirm: () => Promise<void>) => void;
}

interface SectionActions {
  handleSaveSection: (name: string, editingSection: Section | null) => Promise<void>;
  handleDeleteSection: (sectionId: number, sectionName: string) => void;
  handleToggleSection: (sectionId: number, isCollapsed: boolean) => Promise<void>;
}

export function useSectionActions(
  options: SectionActionsOptions,
  setSections: React.Dispatch<React.SetStateAction<Section[]>>
): SectionActions {
  const { onRefresh, onError, showDeleteConfirm } = options;

  const handleSaveSection = useCallback(async (name: string, editingSection: Section | null) => {
    try {
      if (editingSection) {
        await sectionsApi.update(editingSection.id, { name });
      } else {
        await sectionsApi.create(name);
      }
      onRefresh();
    } catch (err: any) {
      console.error("Failed to save section:", err);
      onError(
        editingSection ? "Error Updating Section" : "Error Creating Section",
        err.response?.data?.error || "Failed to save section"
      );
      throw err; // Re-throw to allow caller to handle
    }
  }, [onRefresh, onError]);

  const handleDeleteSection = useCallback((sectionId: number, sectionName: string) => {
    showDeleteConfirm(sectionName, async () => {
      try {
        await sectionsApi.delete(sectionId);
        onRefresh();
      } catch (err: any) {
        console.error("Failed to delete section:", err);
        onError("Error Deleting Section", err.response?.data?.error || "Failed to delete section");
      }
    });
  }, [onRefresh, onError, showDeleteConfirm]);

  const handleToggleSection = useCallback(async (sectionId: number, isCollapsed: boolean) => {
    try {
      await sectionsApi.update(sectionId, { is_collapsed: !isCollapsed });
      // Optimistic update
      setSections(prev =>
        prev.map(s => s.id === sectionId ? { ...s, is_collapsed: !isCollapsed } : s)
      );
    } catch (err) {
      console.error("Failed to toggle section:", err);
      onRefresh();
    }
  }, [onRefresh, setSections]);

  return {
    handleSaveSection,
    handleDeleteSection,
    handleToggleSection,
  };
}

