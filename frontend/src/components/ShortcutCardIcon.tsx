import React from "react";
import { Settings, Trash2, Star, GripVertical } from "lucide-react";
import type { ShortcutCardProps } from "../types";
import { DynamicIcon } from "./DynamicIcon";

interface ExtendedShortcutCardProps extends ShortcutCardProps {
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
  isOver?: boolean;
}

/**
 * Icon-only shortcut card - just icon/image and name
 */
export const ShortcutCardIcon: React.FC<ExtendedShortcutCardProps> = ({
  shortcut,
  container,
  tailscaleIP,
  onEdit,
  onDelete,
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
      className={`group relative border rounded-2xl overflow-hidden transition-all duration-300 ${
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
        <div className="absolute top-2 left-2 z-10 p-1 rounded-lg bg-slate-900/90 backdrop-blur-sm border border-white/10 pointer-events-none">
          <GripVertical className="w-3 h-3 text-slate-400" />
        </div>
      )}

      {/* Icon/Image */}
      <div
        className="relative aspect-square flex items-center overflow-hidden"
        style={{
          background: `linear-gradient(to bottom right, rgba(var(--color-primary-rgb), 0.2), rgba(var(--color-primary-rgb), 0.05))`
        }}
      >
        {renderIcon()}

        {/* Status indicator */}
        {container && (
          <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${isRunning ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-red-500"}`} />
        )}

        {/* Star button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-slate-900/80 backdrop-blur-sm transition-colors"
          style={{
            color: shortcut.is_favorite ? "var(--color-primary)" : "rgb(148, 163, 184)"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--color-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = shortcut.is_favorite ? "var(--color-primary)" : "rgb(148, 163, 184)";
          }}
        >
          <Star className={`w-4 h-4 ${shortcut.is_favorite ? "fill-current" : ""}`} />
        </button>
      </div>

      {/* Name */}
      <div className="p-3" style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}>
        <h3
          className="font-bold text-sm text-center truncate"
          style={{ color: "var(--color-background-contrast)" }}
        >
          {shortcut.name}
        </h3>
      </div>

      {/* Action Buttons - Hidden in edit mode */}
      {!isEditMode && (
        <div className="absolute inset-0 bg-slate-950/95 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-3 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all" title="Edit">
            <Settings className="w-5 h-5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-3 rounded-full bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-all" title="Delete">
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};

