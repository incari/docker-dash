import { useCallback } from "react";
import { shortcutsApi } from "../services/api";
import type { DockerContainer, Shortcut } from "../types";
import { getContainerIcon } from "../utils/dockerIconVault";

interface ShortcutActionsOptions {
  onRefresh: () => void;
  onError: (title: string, message: string) => void;
  showDeleteConfirm: (onConfirm: () => Promise<void>) => void;
}

interface ShortcutActions {
  handleDelete: (id: number) => void;
  handleQuickAdd: (container: DockerContainer) => Promise<void>;
  handleQuickAddAsFavorite: (container: DockerContainer) => Promise<void>;
  handleToggleFavorite: (
    id: number,
    currentStatus: boolean | number,
  ) => Promise<void>;
  handleSaveChanges: (
    changes: Array<{
      type: string;
      shortcutId: number;
      sectionId: number | null;
      position: number;
    }>,
  ) => Promise<void>;
}

export function useShortcutActions(
  options: ShortcutActionsOptions,
  setShortcuts: React.Dispatch<React.SetStateAction<Shortcut[]>>,
): ShortcutActions {
  const { onRefresh, onError, showDeleteConfirm } = options;

  const handleDelete = useCallback(
    (id: number) => {
      showDeleteConfirm(async () => {
        try {
          await shortcutsApi.delete(id);
          onRefresh();
        } catch (err) {
          console.error("Failed to delete shortcut:", err);
        }
      });
    },
    [onRefresh, showDeleteConfirm],
  );

  const handleQuickAdd = useCallback(
    async (container: DockerContainer) => {
      const ports = container.ports.map((p) => p.public).filter(Boolean);
      const port = ports[0] || "";

      const formData = new FormData();
      formData.append("name", container.name);
      if (port) formData.append("port", String(port));
      formData.append("container_id", container.id);
      // Auto-select icon from docker-icon-vault based on container name
      const icon = getContainerIcon(container.name, "Server");
      formData.append("icon", icon);
      if (container.description && container.description.trim()) {
        formData.append("description", container.description.trim());
      }

      try {
        await shortcutsApi.create(formData);
        onRefresh();
      } catch (err: any) {
        console.error("Failed to quick add shortcut:", err);
        onError(
          "Error Adding Shortcut",
          err.response?.data?.error || "Failed to add shortcut",
        );
      }
    },
    [onRefresh, onError],
  );

  const handleQuickAddAsFavorite = useCallback(
    async (container: DockerContainer) => {
      const ports = container.ports.map((p) => p.public).filter(Boolean);
      const port = ports[0] || "";

      const formData = new FormData();
      formData.append("name", container.name);
      if (port) formData.append("port", String(port));
      formData.append("container_id", container.id);
      // Auto-select icon from docker-icon-vault based on container name
      const icon = getContainerIcon(container.name, "Server");
      formData.append("icon", icon);
      formData.append("is_favorite", "true"); // Mark as favorite (use "true" string to match backend logic)
      if (container.description && container.description.trim()) {
        formData.append("description", container.description.trim());
      }

      try {
        await shortcutsApi.create(formData);
        onRefresh();
      } catch (err: any) {
        console.error("Failed to add shortcut as favorite:", err);
        onError(
          "Error Adding Favorite",
          err.response?.data?.error || "Failed to add favorite",
        );
      }
    },
    [onRefresh, onError],
  );

  const handleToggleFavorite = useCallback(
    async (id: number, currentStatus: boolean | number) => {
      try {
        await shortcutsApi.toggleFavorite(id, !currentStatus);
        // Pass false to avoid showing loading spinner (prevents flickering)
        await onRefresh(false);
      } catch (err) {
        console.error("Failed to toggle favorite:", err);
      }
    },
    [onRefresh],
  );

  const handleSaveChanges = useCallback(
    async (
      changes: Array<{
        type: string;
        shortcutId: number;
        sectionId: number | null;
        position: number;
      }>,
    ) => {
      if (changes.length === 0) return;

      // Optimistic update
      setShortcuts((prevShortcuts) => {
        const updated = prevShortcuts.map((shortcut) => {
          const change = changes.find((c) => c.shortcutId === shortcut.id);
          if (change) {
            return {
              ...shortcut,
              section_id: change.sectionId,
              position: change.position,
            };
          }
          return shortcut;
        });
        return updated.sort((a, b) => {
          if (a.section_id === b.section_id) {
            return (a.position ?? 0) - (b.position ?? 0);
          }
          return 0;
        });
      });

      try {
        await Promise.all(
          changes.map((change) =>
            shortcutsApi.updateSection(
              change.shortcutId,
              change.sectionId,
              change.position,
            ),
          ),
        );
      } catch (err) {
        // On error, refetch to restore correct state
        onRefresh();
      }
    },
    [onRefresh, setShortcuts],
  );

  return {
    handleDelete,
    handleQuickAdd,
    handleQuickAddAsFavorite,
    handleToggleFavorite,
    handleSaveChanges,
  };
}
