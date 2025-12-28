import React from "react";
import { useDroppable } from "@dnd-kit/core";
import type { DroppableSectionProps } from "../types";

/**
 * Droppable Section Wrapper - Makes entire section droppable
 */
export const DroppableSection: React.FC<DroppableSectionProps> = ({
  sectionId,
  isActive,
  children,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `section-${sectionId}`,
    data: {
      type: "section",
      sectionId: sectionId,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className="relative"
    >
      {/* Subtle border when dragging - shows on hover */}
      {isActive && isOver && (
        <div className="absolute inset-0 border-2 border-blue-500 rounded-2xl pointer-events-none z-10"></div>
      )}
      {/* Subtle border when dragging but not hovering over this section */}
      {isActive && !isOver && (
        <div className="absolute inset-0 border-2 border-dashed border-blue-500/30 rounded-2xl pointer-events-none z-10"></div>
      )}
      {/* Children rendered normally - section adapts to content height */}
      <div className="min-h-[120px]">{children}</div>
    </div>
  );
};
