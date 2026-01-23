import React from "react";
import { Settings, Trash2, Play, Square, RefreshCw, Star, GripVertical } from "lucide-react";
import type { ShortcutCardProps } from "../types";
import { DynamicIcon } from "./DynamicIcon";

interface ExtendedShortcutCardProps extends ShortcutCardProps {
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
  isOver?: boolean;
}

/**
 * Compact shortcut card - smaller version with less details
 */
export const ShortcutCardCompact: React.FC<ExtendedShortcutCardProps> = ({
  shortcut,
  container,
  tailscaleIP,
  onEdit,
  onDelete,
  onStart,
  onStop,
  onRestart,
  onToggleFavorite,
  dragHandleProps,
  isEditMode,
  isOver,
}) => {
  const isRunning = container?.state === "running";

  let link: string | null = null;

  if (shortcut.url) {
    link = shortcut.url;
  } else if (shortcut.port) {
    if ((shortcut as any).use_tailscale && tailscaleIP) {
      link = `http://${tailscaleIP}:${shortcut.port}`;
    } else {
      link = `http://${window.location.hostname}:${shortcut.port}`;
    }
  }

  const renderIcon = () => {
    if (shortcut.icon && (shortcut.icon.startsWith("http") || shortcut.icon.includes("/"))) {
      const src = shortcut.icon.startsWith("http") ? shortcut.icon : `/${shortcut.icon}`;
      return <img src={src} alt={shortcut.name} className="w-full h-full object-cover" />;
    }
    return <DynamicIcon name={shortcut.icon || "Server"} className="w-full h-full" style={{ color: "var(--color-primary)" }} />;
  };

  const handleCardClick = () => {
    if (!isEditMode && link) {
      window.open(link, "_blank");
    }
  };

  return (
    <div
      {...(isEditMode && dragHandleProps ? dragHandleProps : {})}
      onClick={handleCardClick}
      className={`group relative border rounded-xl overflow-hidden transition-all duration-300 ${
        isEditMode ? "cursor-grab active:cursor-grabbing" : link ? "cursor-pointer" : "cursor-default"
      }`}
      style={{
        backgroundColor: isOver
          ? "rgba(var(--color-primary-rgb), 0.1)"
          : "var(--color-card-background)",
        borderColor: isOver
          ? "var(--color-primary)"
          : isEditMode
          ? "rgba(var(--color-primary-rgb), 0.5)"
          : "rgba(255, 255, 255, 0.05)",
        boxShadow: isOver || !isEditMode ? `0 10px 15px -3px rgba(var(--color-primary-rgb), 0.05)` : undefined,
        color: "var(--color-background-contrast)",
      }}
      onMouseEnter={(e) => {
        if (!isEditMode) {
          e.currentTarget.style.borderColor = `rgba(var(--color-primary-rgb), 0.3)`;
        } else {
          e.currentTarget.style.borderColor = `var(--color-primary)`;
        }
      }}
      onMouseLeave={(e) => {
        if (!isEditMode) {
          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.05)";
        } else {
          e.currentTarget.style.borderColor = `rgba(var(--color-primary-rgb), 0.5)`;
        }
      }}
    >
      {isEditMode && (
        <div className="absolute top-1.5 left-1.5 z-10 p-1 rounded-lg bg-slate-900/90 backdrop-blur-sm border border-white/10 pointer-events-none">
          <GripVertical className="w-3 h-3 text-slate-400" />
        </div>
      )}

      <div className="flex items-center gap-3 p-3">
        {/* Icon */}
        <div
          className="w-10 h-10 rounded-lg flex items-center border border-white/5 shrink-0 overflow-hidden"
          style={{
            background: `linear-gradient(to bottom right, rgba(var(--color-primary-rgb), 0.2), rgba(var(--color-primary-rgb), 0.05))`
          }}
        >
          {renderIcon()}
        </div>

        {/* Title */}
        <div className="min-w-0 flex-1">
          <h3
            className="font-bold text-sm leading-tight truncate"
            style={{ color: "var(--color-background-contrast)" }}
          >
            {shortcut.name}
          </h3>
          {container && (
            <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isRunning ? "bg-green-500" : "bg-red-500"}`} />
          )}
        </div>

        {/* Star */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="p-1 transition-colors shrink-0"
          style={{
            color: shortcut.is_favorite ? "var(--color-primary)" : "rgb(100, 116, 139)"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--color-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = shortcut.is_favorite ? "var(--color-primary)" : "rgb(100, 116, 139)";
          }}
        >
          <Star className={`w-4 h-4 ${shortcut.is_favorite ? "fill-current" : ""}`} />
        </button>
      </div>

      {/* Action Buttons - Hidden in edit mode */}
      {!isEditMode && (
        <div className="px-3 pb-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {container && (
            <div className="flex gap-1 flex-1">
              {isRunning ? (
                <>
                  <button onClick={(e) => { e.stopPropagation(); onStop(); }} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all" title="Stop">
                    <Square className="w-3 h-3" fill="currentColor" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onRestart(); }} className="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500 hover:text-white transition-all" title="Restart">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); onStart(); }} className="p-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white transition-all" title="Start">
                  <Play className="w-3 h-3" fill="currentColor" />
                </button>
              )}
            </div>
          )}
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1.5 text-slate-400 hover:text-white transition-colors" title="Edit">
            <Settings className="w-3 h-3" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1.5 text-slate-400 hover:text-red-400 transition-colors" title="Delete">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};

