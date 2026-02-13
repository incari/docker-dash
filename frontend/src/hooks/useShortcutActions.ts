import { useCallback } from "react";
import { shortcutsApi } from "../services/api";
import type { DockerContainer, Shortcut } from "../types";
import { getContainerIcon } from "../utils/dockerIconVault";

interface ShortcutActionsOptions {
  onRefresh: (showLoading?: boolean) => void;
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
  shortcuts: Shortcut[],
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

  // Helper to get container base name (without instance number suffix)
  // e.g., "jellyfin-1" → "jellyfin", "supabase-spinmania-vector-1" → "supabase-spinmania-vector"
  const getContainerBaseName = (name: string): string => {
    if (!name) return name;
    return name.replace(/-\d+$/, "").toLowerCase();
  };

  const handleQuickAdd = useCallback(
    async (container: DockerContainer) => {
      const ports = container.ports.map((p) => p.public).filter(Boolean);
      const port = ports[0] || "";

      // Use container base name for stable matching (removes instance number suffix)
      const containerBaseName = getContainerBaseName(container.name);

      // Check if a shortcut already exists for this container
      const existingShortcut = shortcuts.find(
        (s) =>
          s.container_name === containerBaseName ||
          s.container_match_name === containerBaseName,
      );

      if (existingShortcut) {
        // If shortcut exists, just refresh to show it (or optionally show a message)
        onError(
          "Shortcut Already Exists",
          `A shortcut for "${container.name}" already exists.`,
        );
        return;
      }

      const formData = new FormData();
      formData.append("display_name", container.name);
      if (port) formData.append("port", String(port));
      formData.append("container_name", containerBaseName); // Use container_name for stable matching
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
    [shortcuts, onRefresh, onError],
  );

  const handleQuickAddAsFavorite = useCallback(
    async (container: DockerContainer) => {
      const ports = container.ports.map((p) => p.public).filter(Boolean);
      const port = ports[0] || "";

      // Use container base name for stable matching (removes instance number suffix)
      const containerBaseName = getContainerBaseName(container.name);

      // Check if a shortcut already exists for this container
      const existingShortcut = shortcuts.find(
        (s) =>
          s.container_name === containerBaseName ||
          s.container_match_name === containerBaseName,
      );

      if (existingShortcut) {
        // If shortcut exists, update it to mark as favorite
        try {
          await shortcutsApi.toggleFavorite(existingShortcut.id, true);
          onRefresh();
        } catch (err: any) {
          console.error("Failed to mark shortcut as favorite:", err);
          onError(
            "Error Updating Favorite",
            err.response?.data?.error || "Failed to update favorite status",
          );
        }
        return;
      }

      const formData = new FormData();
      formData.append("display_name", container.name);
      if (port) formData.append("port", String(port));
      formData.append("container_name", containerBaseName); // Use container_name for stable matching
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
    [shortcuts, onRefresh, onError],
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
