import { useCallback } from "react";
import { sectionsApi } from "../services/api";
import type { Section } from "../types";
import type { OptimisticUpdate } from "./useSWRData";

interface SectionActionsOptions {
  onRefresh: () => void;
  onError: (title: string, message: string) => void;
  showDeleteConfirm: (
    sectionName: string,
    onConfirm: () => Promise<void>,
  ) => void;
  // Paints the change first and sends the request after; rejects and restores
  // the previous list when the server refuses it.
  applyOptimistic: OptimisticUpdate<Section>;
}

interface SectionActions {
  handleSaveSection: (
    name: string,
    editingSection: Section | null,
  ) => Promise<void>;
  handleDeleteSection: (sectionId: number, sectionName: string) => void;
  handleToggleSection: (
    sectionId: number,
    isCollapsed: boolean,
  ) => Promise<void>;
  handleReorderSections: (sections: Section[]) => Promise<void>;
}

export function useSectionActions(
  options: SectionActionsOptions,
): SectionActions {
  const { onRefresh, onError, showDeleteConfirm, applyOptimistic } = options;

  const handleSaveSection = useCallback(
    async (name: string, editingSection: Section | null) => {
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
          err.response?.data?.error || "Failed to save section",
        );
        throw err; // Re-throw to allow caller to handle
      }
    },
    [onRefresh, onError],
  );

  const handleDeleteSection = useCallback(
    (sectionId: number, sectionName: string) => {
      showDeleteConfirm(sectionName, async () => {
        try {
          await sectionsApi.delete(sectionId);
          onRefresh();
        } catch (err: any) {
          console.error("Failed to delete section:", err);
          onError(
            "Error Deleting Section",
            err.response?.data?.error || "Failed to delete section",
          );
        }
      });
    },
    [onRefresh, onError, showDeleteConfirm],
  );

  const handleToggleSection = useCallback(
    async (sectionId: number, isCollapsed: boolean) => {
      try {
        await applyOptimistic(
          (current) =>
            current.map((s) =>
              s.id === sectionId ? { ...s, is_collapsed: !isCollapsed } : s,
            ),
          () => sectionsApi.update(sectionId, { is_collapsed: !isCollapsed }),
        );
      } catch (err: any) {
        console.error("Failed to toggle section:", err);
        onError(
          "Error Updating Section",
          err.response?.data?.error || "Failed to save the section state",
        );
      }
    },
    [applyOptimistic, onError],
  );

  const handleReorderSections = useCallback(
    async (sections: Section[]) => {
      const reorderData = sections.map((section, index) => ({
        id: section.id,
        position: index,
      }));

      try {
        await applyOptimistic(
          () =>
            sections.map((section, index) => ({ ...section, position: index })),
          () => sectionsApi.reorder(reorderData),
        );
      } catch (err: any) {
        console.error("Failed to reorder sections:", err);
        onError(
          "Error Reordering Sections",
          err.response?.data?.error || "Failed to save the new order",
        );
      }
    },
    [applyOptimistic, onError],
  );

  return {
    handleSaveSection,
    handleDeleteSection,
    handleToggleSection,
    handleReorderSections,
  };
}
