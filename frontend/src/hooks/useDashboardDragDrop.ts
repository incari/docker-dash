import { useRef, useEffect, useCallback, useState } from "react";
import { useDragAndDrop, dragAndDrop } from "@formkit/drag-and-drop/react";
import { animations } from "@formkit/drag-and-drop";
import type { Shortcut, Section } from "../types";

// Type for pending changes during edit mode
export interface PendingChange {
  type: "reorder" | "move";
  shortcutId: number;
  sectionId: number | null;
  position: number;
}

interface UseDashboardDragDropProps {
  isEditMode: boolean;
  unsectionedShortcuts: Shortcut[];
  sections: Section[];
  onSaveChanges: (changes: PendingChange[]) => Promise<void>;
  handleReorderSections: (sections: Section[]) => Promise<void>;
}

/**
 * Custom hook to manage drag-and-drop state and pending changes for the dashboard
 */
export function useDashboardDragDrop({
  isEditMode,
  unsectionedShortcuts,
  sections,
  onSaveChanges,
  handleReorderSections,
}: UseDashboardDragDropProps) {
  // Track pending changes during edit mode
  const pendingChangesRef = useRef<Map<number, PendingChange>>(new Map());

  // Handler for when a shortcut is moved/reordered (memoized to prevent useEffect re-runs)
  const handleShortcutMoved = useCallback(
    (shortcutId: number, sectionId: number | null, position: number) => {
      pendingChangesRef.current.set(shortcutId, {
        type: "move",
        shortcutId,
        sectionId,
        position,
      });
    },
    [],
  );

  // When edit mode is turned off, save all pending changes
  const prevIsEditMode = useRef(isEditMode);
  useEffect(() => {
    if (prevIsEditMode.current && !isEditMode) {
      // Edit mode was just turned off - save changes
      const changes = Array.from(pendingChangesRef.current.values());
      if (changes.length > 0) {
        onSaveChanges(changes).then(() => {
          pendingChangesRef.current.clear();
        });
      }
    }
    prevIsEditMode.current = isEditMode;
  }, [isEditMode, onSaveChanges]);

  // Setup FormKit drag-and-drop for unsectioned shortcuts
  // Use manual initialization to avoid timing issues with empty drop zones
  const unsectionedParentRef = useRef<HTMLDivElement>(null);
  const [unsectionedList, setUnsectionedList] =
    useState<Shortcut[]>(unsectionedShortcuts);

  // Track the previous unsectioned list to detect changes
  const prevUnsectionedListRef = useRef<Shortcut[]>(unsectionedShortcuts);

  // Initialize drag-and-drop after DOM is ready
  useEffect(() => {
    if (!unsectionedParentRef.current) return;

    // Initialize drag-and-drop using the dragAndDrop function
    // This ensures the drop zone is active even when empty
    dragAndDrop({
      parent: unsectionedParentRef.current,
      state: [unsectionedList, setUnsectionedList],
      disabled: !isEditMode,
      group: "shortcuts",
      plugins: [animations()],
    });

    // No cleanup needed - dragAndDrop handles it internally
  }, [isEditMode, unsectionedList]);

  // Sync props to local state when unsectionedShortcuts change from parent
  useEffect(() => {
    if (!isEditMode) {
      // Not in edit mode: fully replace the list
      setUnsectionedList(unsectionedShortcuts);
      prevUnsectionedListRef.current = unsectionedShortcuts;
    } else {
      // In edit mode: update properties (like is_favorite) without changing order
      setUnsectionedList((currentList) => {
        const updated = currentList.map((item) => {
          const updatedItem = unsectionedShortcuts.find(
            (s) => s.id === item.id,
          );
          if (updatedItem) {
            return { ...updatedItem };
          }
          return item;
        });
        return updated;
      });
    }
  }, [unsectionedShortcuts, isEditMode]);

  // Detect changes in the unsectioned list and report them
  useEffect(() => {
    // Check if there are any differences
    const hasChanges =
      unsectionedList.length !== prevUnsectionedListRef.current.length ||
      unsectionedList.some(
        (s, i) => prevUnsectionedListRef.current[i]?.id !== s.id,
      );

    if (hasChanges && isEditMode) {
      // Record position for all items currently in unsectioned area
      unsectionedList.forEach((shortcut, index) => {
        handleShortcutMoved(shortcut.id, null, index);
      });

      prevUnsectionedListRef.current = [...unsectionedList];
    }
  }, [unsectionedList, isEditMode, handleShortcutMoved]);

  // Setup FormKit drag-and-drop for sections
  const [sectionsParent, sectionsList, setSectionsList] = useDragAndDrop<
    HTMLDivElement,
    Section
  >(sections, {
    disabled: !isEditMode,
    group: "sections",
    plugins: [animations()],
  });

  // Track the previous sections list to detect changes
  const prevSectionsListRef = useRef<Section[]>(sections);

  // Ensure the parent ref is properly initialized
  useEffect(() => {
    if (sectionsParent.current) {
      // Force a re-render to ensure FormKit picks up the DOM element
      setSectionsList([...sections]);
    }
  }, [sectionsParent, sections, setSectionsList, isEditMode]);

  // Sync props to FormKit's internal state when sections change from parent
  useEffect(() => {
    setSectionsList(sections);
    prevSectionsListRef.current = sections;
  }, [sections, setSectionsList]);

  // Detect changes in FormKit's sections list and save them
  useEffect(() => {
    // Check if there are any differences
    const hasChanges =
      sectionsList.length !== prevSectionsListRef.current.length ||
      sectionsList.some((s, i) => prevSectionsListRef.current[i]?.id !== s.id);

    if (hasChanges && isEditMode) {
      // Save the new order immediately
      handleReorderSections(sectionsList);
      prevSectionsListRef.current = [...sectionsList];
    }
  }, [sectionsList, isEditMode, handleReorderSections]);

  return {
    handleShortcutMoved,
    unsectionedParent: unsectionedParentRef,
    unsectionedList,
    sectionsParent,
    sectionsList,
  };
}
