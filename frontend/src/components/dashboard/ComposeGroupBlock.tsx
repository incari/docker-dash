import React, { useState } from "react";
import { ChevronDown, ChevronRight, Layers } from "../../constants/icons";
import type { Shortcut } from "../../types";

interface ComposeGroupBlockProps {
  projectName: string;
  shortcuts: Shortcut[];
  gridClasses: string;
  renderShortcutCard: (shortcut: Shortcut) => React.ReactElement;
  defaultCollapsed?: boolean;
}

/**
 * Compose group block component for grouping shortcuts by Docker Compose project
 * This is a read-only grouping based on the compose_project field
 */
export function ComposeGroupBlock({
  projectName,
  shortcuts,
  gridClasses,
  renderShortcutCard,
  defaultCollapsed = false,
}: ComposeGroupBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // Don't render empty groups
  if (shortcuts.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Group Header */}
      <div className="flex items-center gap-3 group">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 text-lg font-semibold transition-colors"
          style={{ color: "var(--color-background-contrast)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--color-primary)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "var(--color-background-contrast)")
          }
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
          <Layers className="w-5 h-5 opacity-60" />
          <span className="capitalize">{projectName}</span>
        </button>
        <span
          className="text-sm px-2 py-0.5 rounded-full"
          style={{
            color: "var(--color-background-contrast)",
            opacity: 0.6,
            backgroundColor: "rgba(var(--color-primary-rgb), 0.1)",
          }}
        >
          {shortcuts.length} {shortcuts.length === 1 ? "container" : "containers"}
        </span>
      </div>

      {/* Group Content */}
      {!isCollapsed && (
        <div
          className={`${gridClasses} pl-4 border-l-2`}
          style={{
            borderColor: "rgba(var(--color-primary-rgb), 0.3)",
          }}
        >
          {shortcuts.map((shortcut) => (
            <div key={shortcut.id}>{renderShortcutCard(shortcut)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

