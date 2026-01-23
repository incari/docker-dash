import React from "react";
import {
  Settings,
  Trash2,
  Play,
  Square,
  RefreshCw,
  Star,
  GripVertical,
} from "lucide-react";
import type { ShortcutCardProps } from "../types";
import { DynamicIcon } from "./DynamicIcon";

interface ExtendedShortcutCardProps extends ShortcutCardProps {
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
  isOver?: boolean;
}

/**
 * Shortcut card component displaying a single shortcut
 */
export const ShortcutCard: React.FC<ExtendedShortcutCardProps> = ({
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

  // Determine the link based on use_tailscale setting
  let link: string | null = null;
  let subtitle = "No Link";

  if (shortcut.url) {
    link = shortcut.url;
    // Display the URL with ellipsis if too long
    const maxLength = 40;
    subtitle = shortcut.url.length > maxLength
      ? shortcut.url.substring(0, maxLength) + "..."
      : shortcut.url;
  } else if (shortcut.port) {
    if ((shortcut as any).use_tailscale && tailscaleIP) {
      link = `http://${tailscaleIP}:${shortcut.port}`;
      subtitle = `Tailscale 📎 ${shortcut.port}`;
    } else {
      link = `http://${window.location.hostname}:${shortcut.port}`;
      subtitle = `📎 ${shortcut.port}`;
    }
  } else if (container) {
    subtitle = "Container Only";
  }

  const renderIcon = (isMobileHero = false) => {
    if (
      shortcut.icon &&
      (shortcut.icon.startsWith("http") || shortcut.icon.includes("/"))
    ) {
      const src = shortcut.icon.startsWith("http")
        ? shortcut.icon
        : `/${shortcut.icon}`;
      return (
        <img
          src={src}
          alt={shortcut.name}
          className="w-full h-full object-cover"
        />
      );
    }
    return (
      <DynamicIcon
        name={shortcut.icon || "Server"}
        className="w-full h-full"
        style={{ color: "var(--color-primary)" }}
      />
    );
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
      className={`group relative border rounded-2xl sm:rounded-3xl overflow-hidden transition-all duration-300 h-full flex flex-col ${
        isEditMode
          ? "cursor-grab active:cursor-grabbing"
          : link
          ? "cursor-pointer"
          : "cursor-default"
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
        boxShadow: isOver || !isEditMode ? `0 25px 50px -12px rgba(var(--color-primary-rgb), 0.05)` : undefined,
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
      {/* Drag indicator - Only visible in edit mode */}
      {isEditMode && (
        <div className="absolute top-2 left-2 z-10 p-1.5 rounded-lg bg-slate-900/90 backdrop-blur-sm border border-white/10 pointer-events-none">
          <GripVertical className="w-4 h-4 text-slate-400" />
        </div>
      )}
      {/* Mobile: Full-width Icon/Image with overlay */}
      <div
        className="sm:hidden relative w-full aspect-video flex items-center justify-center"
        style={{
          background: `linear-gradient(to bottom right, rgba(var(--color-primary-rgb), 0.2), rgba(var(--color-primary-rgb), 0.05))`
        }}
      >
        {/* Icon/Image - Full size */}
        <div className="w-32 h-32">{renderIcon(true)}</div>

        {/* Overlay: Title, Subtitle, and Star */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent flex flex-col justify-between p-4">
          {/* Star in top-right - Only visible in edit/reorder mode */}
          {isEditMode && (
            <div className="flex justify-end">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite();
                }}
                className="p-2 rounded-lg bg-slate-900/80 backdrop-blur-sm transition-colors"
                style={{
                  color: shortcut.is_favorite ? "var(--color-primary)" : "rgb(148, 163, 184)"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--color-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = shortcut.is_favorite ? "var(--color-primary)" : "rgb(148, 163, 184)";
                }}
                title={
                  shortcut.is_favorite
                    ? "Remove from Favorites"
                    : "Add to Favorites"
                }
              >
                <Star
                  className={`w-5 h-5 ${
                    shortcut.is_favorite ? "fill-current" : ""
                  }`}
                />
              </button>
            </div>
          )}

          {/* Title and Subtitle at bottom */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              {container && (
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isRunning
                      ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                      : "bg-red-500"
                  }`}
                />
              )}
              <h3 className="text-white font-bold text-base leading-tight uppercase truncate">
                {shortcut.name}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-mono text-slate-300 bg-slate-950/80 backdrop-blur-sm px-2 py-1 rounded border border-white/10 tracking-wider uppercase truncate"
                title={link || undefined}
              >
                {subtitle}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: Horizontal layout (original) */}
      <div className="hidden sm:flex items-start gap-3 sm:gap-4 p-4 sm:p-5 md:p-6">
        {/* Icon */}
        <div
          className="w-14 h-14 md:w-16 md:h-16 rounded-xl sm:rounded-2xl flex items-center border border-white/5 shrink-0 overflow-hidden"
          style={{
            background: `linear-gradient(to bottom right, rgba(var(--color-primary-rgb), 0.2), rgba(var(--color-primary-rgb), 0.05))`
          }}
        >
          {renderIcon()}
        </div>

        {/* Title and Subtitle */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {container && (
              <div
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isRunning
                    ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                    : "bg-red-500"
                }`}
              />
            )}
            <h3
              className="font-bold text-sm sm:text-base md:text-lg leading-tight transition-colors uppercase truncate"
              style={{
                color: "var(--color-background-contrast)"
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = "var(--color-primary)"}
              onMouseLeave={(e) => e.currentTarget.style.color = "var(--color-background-contrast)"}
            >
              {shortcut.name}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 mt-1 sm:mt-1.5">
            <span
              className="text-[10px] sm:text-xs font-mono px-2 sm:px-2.5 py-0.5 sm:py-1 rounded border border-white/5 tracking-wider uppercase truncate"
              style={{
                color: "rgba(var(--color-background-contrast), 0.6)",
                backgroundColor: "rgba(0, 0, 0, 0.3)"
              }}
              title={link || undefined}
            >
              {subtitle}
            </span>
          </div>
        </div>

        {/* Favorite Star - Only visible in edit/reorder mode */}
        {isEditMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="p-1.5 sm:p-2 transition-colors shrink-0"
            style={{
              color: shortcut.is_favorite ? "var(--color-primary)" : "rgb(100, 116, 139)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = shortcut.is_favorite ? "var(--color-primary)" : "rgb(100, 116, 139)";
            }}
            title={
              shortcut.is_favorite ? "Remove from Favorites" : "Add to Favorites"
            }
          >
            <Star
              className={`w-5 h-5 ${shortcut.is_favorite ? "fill-current" : ""}`}
            />
          </button>
        )}
      </div>

      {/* Description - Below image on mobile, in card on desktop */}
      {shortcut.description && (
        <p
          className="text-xs sm:text-sm leading-relaxed line-clamp-2 sm:line-clamp-3 px-4 sm:px-0 sm:mx-5 md:mx-6 mb-3 sm:mb-3 flex-1"
          style={{ color: "rgba(var(--color-background-contrast), 0.6)" }}
        >
          {shortcut.description}
        </p>
      )}

      {/* Action Buttons - Full width on mobile, inline on desktop - Hidden in edit mode */}
      {!isEditMode && (
        <div className="px-4 pb-5 sm:px-5 sm:pb-5 md:px-6 md:pb-6 sm:flex sm:items-center sm:justify-between sm:gap-2 sm:mt-auto space-y-2 sm:space-y-0">
          <div className="flex items-center gap-2 sm:gap-1.5">
            {container && (
              <div className="flex gap-2 sm:gap-1.5 flex-1 sm:flex-initial">
                {isRunning ? (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStop();
                      }}
                      className="flex-1 sm:flex-initial p-2.5 sm:p-2 rounded-lg sm:rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/10"
                      title="Stop Container"
                    >
                      <Square
                        className="w-4 h-4 sm:w-3.5 sm:h-3.5 mx-auto"
                        fill="currentColor"
                      />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestart();
                      }}
                      className="flex-1 sm:flex-initial p-2.5 sm:p-2 rounded-lg sm:rounded-xl bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500 hover:text-white transition-all border border-yellow-500/10"
                      title="Restart Container"
                    >
                      <RefreshCw className="w-4 h-4 sm:w-3.5 sm:h-3.5 mx-auto" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStart();
                    }}
                    className="flex-1 sm:flex-initial p-2.5 sm:p-2 rounded-lg sm:rounded-xl bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white transition-all border border-green-500/10"
                    title="Start Container"
                  >
                    <Play
                      className="w-4 h-4 sm:w-3.5 sm:h-3.5 mx-auto"
                      fill="currentColor"
                    />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="flex-1 sm:flex-initial p-2.5 sm:p-2 text-slate-400 hover:text-white transition-colors rounded-lg sm:rounded-none bg-slate-800/50 sm:bg-transparent"
              title="Edit Shortcut"
            >
              <Settings className="w-4 h-4 mx-auto" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="flex-1 sm:flex-initial p-2.5 sm:p-2 text-slate-400 hover:text-red-400 transition-colors rounded-lg sm:rounded-none bg-slate-800/50 sm:bg-transparent"
              title="Delete Shortcut"
            >
              <Trash2 className="w-4 h-4 mx-auto" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
