import { useCallback } from "react";
import { shortcutsApi } from "../services/api";
import type { DockerContainer, Shortcut } from "../types";
import type { OptimisticUpdate } from "./useSWRData";
import { getContainerIcon } from "../utils/dockerIconVault";
import { selectBestContainerPort } from "../utils/containerPorts";

interface ShortcutActionsOptions {
  onRefresh: (showLoading?: boolean) => void;
  onError: (title: string, message: string) => void;
  showDeleteConfirm: (onConfirm: () => Promise<void>) => void;
  // Paints the change first and sends the request after; rejects and restores
  // the previous list when the server refuses it.
  applyOptimistic: OptimisticUpdate<Shortcut>;
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
  shortcuts: Shortcut[],
): ShortcutActions {
  const { onRefresh, onError, showDeleteConfirm, applyOptimistic } = options;

  const handleDelete = useCallback(
    (id: number) => {
      showDeleteConfirm(async () => {
        try {
          await applyOptimistic(
            (current) => current.filter((s) => s.id !== id),
            () => shortcutsApi.delete(id),
          );
        } catch (err: any) {
          console.error("Failed to delete shortcut:", err);
          onError(
            "Error Deleting Shortcut",
            err.response?.data?.error || "Failed to delete shortcut",
          );
        }
      });
    },
    [applyOptimistic, onError, showDeleteConfirm],
  );

  // Helper to get container base name (without instance number suffix)
  // e.g., "jellyfin-1" → "jellyfin", "supabase-spinmania-vector-1" → "supabase-spinmania-vector"
  const getContainerBaseName = (name: string): string => {
    if (!name) return name;
    return name.replace(/-\d+$/, "").toLowerCase();
  };

  const handleQuickAdd = useCallback(
    async (container: DockerContainer) => {
      // Best published port, not ports[0]: Docker reports ports in arbitrary
      // order and the first entry is often a peer/data port, not the web UI.
      const port = selectBestContainerPort(container.ports) ?? "";

      // Use container base name for stable matching (removes instance number suffix)
      const containerBaseName = getContainerBaseName(container.name);

      // Check if a shortcut already exists for this container, on its own
      // server: the same container name on another machine is a different
      // container and must get its own shortcut.
      const existingShortcut = shortcuts.find(
        (s) =>
          s.host_id === container.hostId &&
          (s.container_name === containerBaseName ||
            s.container_match_name === containerBaseName),
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
      formData.append("host_id", String(container.hostId));
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
      // Best published port, not ports[0]: see handleQuickAdd above.
      const port = selectBestContainerPort(container.ports) ?? "";

      // Use container base name for stable matching (removes instance number suffix)
      const containerBaseName = getContainerBaseName(container.name);

      // Check if a shortcut already exists for this container, on its own
      // server: the same container name on another machine is a different
      // container and must get its own shortcut.
      const existingShortcut = shortcuts.find(
        (s) =>
          s.host_id === container.hostId &&
          (s.container_name === containerBaseName ||
            s.container_match_name === containerBaseName),
      );

      if (existingShortcut) {
        // If shortcut exists, update it to mark as favorite
        try {
          await applyOptimistic(
            (current) =>
              current.map((s) =>
                s.id === existingShortcut.id ? { ...s, is_favorite: true } : s,
              ),
            () => shortcutsApi.toggleFavorite(existingShortcut.id, true),
          );
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
      formData.append("host_id", String(container.hostId));
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
    [shortcuts, onRefresh, onError, applyOptimistic],
  );

  const handleToggleFavorite = useCallback(
    async (id: number, currentStatus: boolean | number) => {
      const isFavorite = !currentStatus;

      try {
        await applyOptimistic(
          (current) =>
            current.map((s) =>
              s.id === id ? { ...s, is_favorite: isFavorite } : s,
            ),
          () => shortcutsApi.toggleFavorite(id, isFavorite),
        );
      } catch (err: any) {
        console.error("Failed to toggle favorite:", err);
        onError(
          "Error Updating Favorite",
          err.response?.data?.error || "Failed to update favorite status",
        );
      }
    },
    [applyOptimistic, onError],
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

      const applyChanges = (current: Shortcut[]) => {
        const updated = current.map((shortcut) => {
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
      };

      try {
        await applyOptimistic(applyChanges, () =>
          Promise.all(
            changes.map((change) =>
              shortcutsApi.updateSection(
                change.shortcutId,
                change.sectionId,
                change.position,
              ),
            ),
          ),
        );
      } catch (err: any) {
        console.error("Failed to save layout changes:", err);
        onError(
          "Error Saving Layout",
          err.response?.data?.error || "Failed to save the new order",
        );
      }
    },
    [applyOptimistic, onError],
  );

  return {
    handleDelete,
    handleQuickAdd,
    handleQuickAddAsFavorite,
    handleToggleFavorite,
    handleSaveChanges,
  };
}
