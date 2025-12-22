import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  ChevronDown,
  ChevronUp,
  Edit,
  Trash2,
} from "lucide-react";
import type { Section } from "../types";

interface SortableSectionProps {
  section: Section;
  shortcutCount: number;
  isEditMode: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}

/**
 * Sortable wrapper for Section headers with drag handle
 */
export const SortableSection: React.FC<SortableSectionProps> = ({
  section,
  shortcutCount,
  isEditMode,
  onToggle,
  onEdit,
  onDelete,
  children,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `section-sort-${section.id}`,
    data: {
      type: "section-sort",
      sectionId: section.id,
    },
    disabled: !isEditMode,
  });

  const style: React.CSSProperties = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    transition: transition || "transform 200ms ease",
    zIndex: isDragging ? 50 : 0,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`space-y-4 ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-3">
        {/* Drag handle - only visible in edit mode */}
        {isEditMode && (
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 -ml-2 text-slate-500 hover:text-slate-300 transition-colors touch-none"
          >
            <GripVertical className="w-5 h-5" />
          </div>
        )}
        {/* Edit/Delete buttons - at the beginning, only in edit mode */}
        {isEditMode && (
          <>
            <button
              onClick={onEdit}
              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
              title="Edit section"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Delete section"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
        <button
          onClick={onToggle}
          className="text-slate-400 hover:text-white transition-colors"
        >
          {section.is_collapsed ? (
            <ChevronDown className="w-5 h-5" />
          ) : (
            <ChevronUp className="w-5 h-5" />
          )}
        </button>
        <h2 className="text-lg font-semibold text-white">{section.name}</h2>
        <span className="text-sm text-slate-500">({shortcutCount})</span>
      </div>
      {children}
    </div>
  );
};
