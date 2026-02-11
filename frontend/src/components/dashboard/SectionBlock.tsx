import React, { useEffect, useRef, useState } from "react";
import {
  Edit2,
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical,
} from "../../constants/icons";
import { dragAndDrop } from "@formkit/drag-and-drop/react";
import { animations } from "@formkit/drag-and-drop";
import type { Section, Shortcut } from "../../types";

interface SectionBlockProps {
  section: Section;
  shortcuts: Shortcut[];
  isEditMode: boolean;
  gridClasses: string;
  minHeight: string;
  handleToggleSection: (sectionId: number, isCollapsed: boolean) => void;
  handleEditSection: (section: Section) => void;
  handleDeleteSection: (sectionId: number, sectionName: string) => void;
  renderShortcutCard: (shortcut: Shortcut) => React.ReactElement;
  onShortcutMoved: (
    shortcutId: number,
    sectionId: number | null,
    position: number,
  ) => void;
  t: (key: string) => string;
}

/**
 * Section block component with header and shortcuts
 */
export function SectionBlock({
  section,
  shortcuts,
  isEditMode,
  gridClasses,
  minHeight,
  handleToggleSection,
  handleEditSection,
  handleDeleteSection,
  renderShortcutCard,
  onShortcutMoved,
  t,
}: SectionBlockProps) {
  // Don't render empty sections unless in edit mode
  if (shortcuts.length === 0 && !isEditMode) return null;

  // In edit mode, always show content (ignore collapsed state)
  const shouldShowContent = isEditMode || !section.is_collapsed;

  // Ref for the parent container
  const parentRef = useRef<HTMLDivElement>(null);

  // State to track the current list of shortcuts
  const [list, setList] = useState<Shortcut[]>(shortcuts);

  // Track the previous list to detect changes
  const prevListRef = useRef<Shortcut[]>(shortcuts);

  // Initialize drag-and-drop after DOM is ready
  useEffect(() => {
    if (!parentRef.current) return;

    // Initialize drag-and-drop using the dragAndDrop function
    // This ensures initialization happens after the DOM is fully ready
    dragAndDrop({
      parent: parentRef.current,
      state: [list, setList],
      disabled: !isEditMode,
      group: "shortcuts",
      plugins: [animations()],
    });

    // No cleanup needed - dragAndDrop handles it internally
  }, [isEditMode, list]); // Re-initialize when edit mode or list changes

  // Sync props to local state when shortcuts change from parent
  useEffect(() => {
    if (!isEditMode) {
      // Not in edit mode: fully replace the list
      setList(shortcuts);
      prevListRef.current = shortcuts;
    } else {
      // In edit mode: update properties (like is_favorite) without changing order
      setList((currentList) => {
        const updated = currentList.map((item) => {
          const updatedItem = shortcuts.find((s) => s.id === item.id);
          if (updatedItem) {
            return { ...updatedItem };
          }
          return item;
        });
        return updated;
      });
    }
  }, [shortcuts, isEditMode, section.id]);

  // Detect changes in the list and report them
  useEffect(() => {
    // Check if there are any differences
    const hasChanges =
      list.length !== prevListRef.current.length ||
      list.some((s, i) => prevListRef.current[i]?.id !== s.id);

    if (hasChanges && isEditMode) {
      // Record position for all items currently in this section
      list.forEach((shortcut, index) => {
        onShortcutMoved(shortcut.id, section.id, index);
      });

      prevListRef.current = [...list];
    }
  }, [list, isEditMode, section.id, onShortcutMoved]);

  return (
    <div
      className={`space-y-4 ${
        isEditMode
          ? "border-2 border-blue-500/40 rounded-xl p-4 bg-blue-500/10 hover:border-blue-500/60 transition-all"
          : ""
      }`}
    >
      {/* Section Header */}
      <div className="flex items-center gap-3 group">
        {isEditMode && (
          <div
            className="cursor-grab active:cursor-grabbing transition-colors"
            style={{ color: "var(--color-background-contrast)", opacity: 0.5 }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
          >
            <GripVertical className="w-5 h-5" />
          </div>
        )}
        {isEditMode ? (
          // In edit mode: show section name with drag handle
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--color-background-contrast)" }}
          >
            {section.name}
          </h2>
        ) : (
          // Normal mode: show collapse button
          <button
            onClick={() =>
              handleToggleSection(section.id, section.is_collapsed)
            }
            className="flex items-center gap-2 text-lg font-semibold transition-colors"
            style={{ color: "var(--color-background-contrast)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--color-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--color-background-contrast)")
            }
          >
            {section.is_collapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
            {section.name}
          </button>
        )}
        <span
          className="text-sm"
          style={{ color: "var(--color-background-contrast)", opacity: 0.5 }}
        >
          ({shortcuts.length})
        </span>
        {isEditMode && (
          <div className="flex items-center gap-2 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => handleEditSection(section)}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              title="Edit section"
              style={{
                color: "var(--color-background-contrast)",
                opacity: 0.6,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--color-primary)";
                e.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color =
                  "var(--color-background-contrast)";
                e.currentTarget.style.opacity = "0.6";
              }}
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDeleteSection(section.id, section.name)}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              title="Delete section"
              style={{
                color: "var(--color-background-contrast)",
                opacity: 0.6,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#ef4444";
                e.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color =
                  "var(--color-background-contrast)";
                e.currentTarget.style.opacity = "0.6";
              }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Section Content */}
      {shouldShowContent && (
        <div
          ref={parentRef}
          className={`${gridClasses} ${
            isEditMode
              ? `border-2 border-blue-500/30 bg-blue-500/5 rounded-xl transition-all ${
                  list.length === 0 ? "p-8" : "p-4"
                }`
              : ""
          }`}
          style={isEditMode ? { minHeight } : undefined}
        >
          {list.length === 0 && isEditMode ? (
            <div
              className="col-span-full flex items-center justify-center text-sm italic"
              style={{
                color: "var(--color-background-contrast)",
                opacity: 0.4,
              }}
            >
              {t("dashboard.dragItemsHere")}
            </div>
          ) : (
            list.map((shortcut) => (
              <div key={shortcut.id}>{renderShortcutCard(shortcut)}</div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
