import { useState, useCallback } from "react";
import axios from "axios";
import {
  closestCenter,
  pointerWithin,
  KeyboardSensor,

  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";

import { API_BASE } from "../constants/api";
import type { Shortcut, Section } from "../types";

interface UseDragAndDropProps {
  shortcuts: Shortcut[];
  setShortcuts: React.Dispatch<React.SetStateAction<Shortcut[]>>;
  sections: Section[];
  setSections: React.Dispatch<React.SetStateAction<Section[]>>;
  fetchData: () => Promise<void>;
}


export const useDragAndDrop = ({
  shortcuts,
  setShortcuts,
  sections,
  setSections,
  fetchData,
}: UseDragAndDropProps) => {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [_activeSectionId, setActiveSectionId] = useState<number | null>(null);

  const sensors = useSensors(
    // Mouse sensor activates immediately for snappy desktop feel
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    // Touch sensor waits 250ms to distinguish drag from scroll
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const customCollisionDetection = useCallback((args: any) => {
    const pointerCollisions = pointerWithin(args);
    const activeData = args.active?.data?.current;

    if (activeData?.type === "section-sort") {
      const sectionSortCollisions = pointerCollisions.filter(
        ({ id }: { id: any }) => String(id).startsWith("section-sort-")
      );
      if (sectionSortCollisions.length > 0) return sectionSortCollisions;
      return closestCenter(args);
    }

    const shortcutCollisions = pointerCollisions.filter(
      ({ id }: { id: any }) =>
        !String(id).startsWith("section-") &&
        !String(id).startsWith("section-sort-")
    );
    if (shortcutCollisions.length > 0) return shortcutCollisions;

    const sectionCollisions = pointerCollisions.filter(
      ({ id }: { id: any }) =>
        String(id).startsWith("section-") &&
        !String(id).startsWith("section-sort-")
    );
    if (sectionCollisions.length > 0) return sectionCollisions;

    return closestCenter(args);
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const activeData = (event.active as any).data?.current;
    if (activeData?.type === "section-sort") {
      setActiveSectionId(activeData.sectionId);
      setActiveId(null);
    } else {
      setActiveId(event.active.id as number);
      setActiveSectionId(null);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = (active as any).data?.current;
    if (activeData?.type === "section-sort") {
      const overData = (over as any).data?.current;
      if (overData?.type === "section-sort") {
        const oldIndex = sections.findIndex(
          (s) => s.id === activeData.sectionId
        );
        const newIndex = sections.findIndex(
          (s) => s.id === overData.sectionId
        );
        if (oldIndex !== newIndex) {
          setSections(arrayMove(sections, oldIndex, newIndex));
        }
      }
      return;
    }

    const activeShortcut = shortcuts.find((s) => s.id === active.id);
    if (!activeShortcut) return;

    const overData = (over as any).data?.current;
    if (overData?.type === "section") return;

    const overShortcut = shortcuts.find((s) => s.id === over.id);
    if (overShortcut) {
      const isSameSection =
        (activeShortcut.section_id === null &&
          overShortcut.section_id === null) ||
        activeShortcut.section_id === overShortcut.section_id;

      if (isSameSection) {
        const oldIndex = shortcuts.findIndex((s) => s.id === active.id);
        const newIndex = shortcuts.findIndex((s) => s.id === over.id);
        setShortcuts(arrayMove(shortcuts, oldIndex, newIndex));
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveSectionId(null);
    if (!over) return;

    const activeData = (active as any).data?.current;
    if (activeData?.type === "section-sort") {
      try {
        const reorderedSections = sections.map((s, index) => ({
          id: s.id,
          position: index,
        }));
        await axios.put(`${API_BASE}/sections/reorder`, {
          sections: reorderedSections,
        });
      } catch (err) {
        console.error("Failed to reorder sections:", err);
        fetchData();
      }
      return;
    }

    const activeShortcut = shortcuts.find((s) => s.id === active.id);
    if (!activeShortcut) return;

    try {
      if ((over as any).data?.current?.type === "section") {
        const targetSectionId = (over as any).data.current.sectionId;
        const currentSectionId = activeShortcut.section_id;
        const isSameSection =
          (currentSectionId === null && targetSectionId === null) ||
          currentSectionId === targetSectionId;

        if (!isSameSection) {
          setShortcuts((prev) =>
            prev.map((s) =>
              s.id === active.id ? { ...s, section_id: targetSectionId } : s
            )
          );
          await axios.put(`${API_BASE}/shortcuts/${active.id}/section`, {
            section_id: targetSectionId,
          });
          // Refresh to get correct positions
          await fetchData();
        }
      } else if (active.id !== over.id) {
        const overShortcut = shortcuts.find((s) => s.id === over.id);
        if (!overShortcut) return;

        const currentSectionId = activeShortcut.section_id;
        const targetSectionId = overShortcut.section_id;
        const isSameSection =
          (currentSectionId === null && targetSectionId === null) ||
          currentSectionId === targetSectionId;

        if (!isSameSection) {
          setShortcuts((prev) =>
            prev.map((s) =>
              s.id === active.id
                ? { ...s, section_id: overShortcut.section_id }
                : s
            )
          );
          await axios.put(`${API_BASE}/shortcuts/${active.id}/section`, {
            section_id: overShortcut.section_id,
          });
          await fetchData();
        } else {
          const oldIndex = shortcuts.findIndex((s) => s.id === active.id);
          const newIndex = shortcuts.findIndex((s) => s.id === over.id);
          const reordered = arrayMove(shortcuts, oldIndex, newIndex);
          setShortcuts(reordered);
          const reorderedShortcuts = reordered.map((s, index) => ({
            id: s.id,
            position: index,
          }));
          await axios.put(`${API_BASE}/shortcuts/reorder`, {
            shortcuts: reorderedShortcuts,
          });
        }
      }
    } catch (err) {
      console.error("Failed to save changes:", err);
      fetchData();
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setActiveSectionId(null);
    fetchData();
  };

  return {
    sensors,
    activeId,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    customCollisionDetection,
  };
};
