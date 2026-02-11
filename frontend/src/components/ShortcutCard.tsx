import React, { useState } from "react";
import {
  Settings,
  Trash2,
  Play,
  Square,
  RefreshCw,
  Star,
  GripVertical,
  MoreVertical,
} from "../constants/icons";
import { useTranslation } from "react-i18next";
import type { ShortcutCardProps } from "../types";
import {
  getLinkIcon,
  renderShortcutIcon,
  renderContainerStatus,
  getShortcutLink,
} from "../utils/cardHelpers";

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
  alwaysShowStar,
  isOver,
}) => {
  const { t } = useTranslation();
  const isRunning = container?.state === "running";
  const [showMenu, setShowMenu] = useState(false);

  // Determine if star should be shown
  const showStar = isEditMode || alwaysShowStar;

  // Get link and subtitle using shared utility
  const { link, subtitle } = getShortcutLink(
    shortcut,
    container,
    tailscaleIP,
    40,
  );

  const handleCardClick = (e: React.MouseEvent) => {
    if (!isEditMode && link) {
      window.open(link, "_blank");
    } else if (isEditMode) {
      // Prevent click in edit mode to allow dragging
      e.preventDefault();
    }
  };

  return (
    <div
      {...(isEditMode && dragHandleProps ? dragHandleProps : {})}
      onClick={isEditMode ? undefined : handleCardClick}
      className={`group relative border rounded-2xl sm:rounded-3xl transition-all duration-300 h-full flex flex-col ${
        isEditMode ? "" : link ? "cursor-pointer" : "cursor-default"
      } ${showMenu ? "overflow-visible" : "overflow-hidden"}`}
      style={{
        backgroundColor: isOver
          ? "rgba(var(--color-primary-rgb), 0.1)"
          : "var(--color-card-background)",
        borderColor: isOver
          ? "var(--color-primary)"
          : isEditMode
            ? "rgba(var(--color-primary-rgb), 0.5)"
            : "rgba(255, 255, 255, 0.05)",
        boxShadow:
          isOver || !isEditMode
            ? `0 25px 50px -12px rgba(var(--color-primary-rgb), 0.05)`
            : undefined,
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
          background: `linear-gradient(to bottom right, rgba(var(--color-primary-rgb), 0.2), rgba(var(--color-primary-rgb), 0.05))`,
        }}
      >
        {/* Icon/Image - Full size */}

        <div className="w-32 h-32">{renderShortcutIcon(shortcut)}</div>

        {/* Overlay: Title, Subtitle, and Star */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent flex flex-col justify-between p-4">
          {/* Star in top-right - Visible in edit/reorder mode or when alwaysShowStar is true */}
          {showStar && (
            <div className="flex justify-end">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite();
                }}
                className="p-2 rounded-lg bg-slate-900/80 backdrop-blur-sm transition-colors"
                style={{
                  color: shortcut.is_favorite
                    ? "var(--color-primary)"
                    : "rgb(148, 163, 184)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--color-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = shortcut.is_favorite
                    ? "var(--color-primary)"
                    : "rgb(148, 163, 184)";
                }}
                title={
                  shortcut.is_favorite
                    ? t("shortcuts.removeFromFavorites")
                    : t("shortcuts.addToFavorites")
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
                {shortcut.display_name}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-mono text-slate-300 bg-slate-950/80 backdrop-blur-sm px-2 py-1 rounded border border-white/10 tracking-wider uppercase truncate flex items-center gap-1.5"
                title={link || undefined}
              >
                {getLinkIcon(shortcut, "md")}
                {subtitle}
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* Desktop: Horizontal layout (original) */}
      <div className="hidden sm:flex items-start gap-4 sm:gap-5 p-4 sm:p-5 md:p-6">
        {/* Icon */}
        <div
          className="w-16 h-16 md:w-20 md:h-20 rounded-xl sm:rounded-2xl flex items-center border border-white/5 shrink-0 overflow-hidden"
          style={{
            background: `linear-gradient(to bottom right, rgba(var(--color-primary-rgb), 0.2), rgba(var(--color-primary-rgb), 0.05))`,
          }}
        >
          {renderShortcutIcon(shortcut)}
        </div>

        {/* Title and Subtitle */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 mb-2">
            {renderContainerStatus(container)}
            <h3
              className="font-bold text-base sm:text-lg md:text-xl leading-tight transition-colors uppercase truncate"
              style={{
                color: "var(--color-background-contrast)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--color-primary)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color =
                  "var(--color-background-contrast)")
              }
            >
              {shortcut.display_name}
            </h3>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className="text-xs sm:text-sm font-mono px-2.5 sm:px-3 py-1 sm:py-1.5 rounded border border-white/5 tracking-wider uppercase truncate flex items-center gap-2"
              style={{
                color: "rgba(var(--color-background-contrast-rgb), 0.75)",
                backgroundColor: "rgba(0, 0, 0, 0.3)",
              }}
              title={link || undefined}
            >
              {getLinkIcon(shortcut, "md")}
              {subtitle}
            </span>
          </div>
        </div>

        {/* Star and Menu button */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {/* Star - Visible in edit/reorder mode or when alwaysShowStar is true */}
          {showStar && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              className="p-1 transition-colors"
              style={{
                color: shortcut.is_favorite
                  ? "var(--color-primary)"
                  : "rgb(100, 116, 139)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--color-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = shortcut.is_favorite
                  ? "var(--color-primary)"
                  : "rgb(100, 116, 139)";
              }}
            >
              <Star
                className={`w-4 h-4 ${shortcut.is_favorite ? "fill-current" : ""}`}
              />
            </button>
          )}

          {/* Three-dot menu - Hidden in edit mode */}
          {!isEditMode && (
            <div className={`relative ${showMenu ? "z-50" : ""}`}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="p-1 text-slate-400 hover:text-white transition-colors"
                title="More actions"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* Menu overlay */}
              {showMenu && (
                <>
                  {/* Backdrop to close menu */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                    }}
                  />

                  {/* Menu content */}
                  <div
                    className="absolute right-0 top-full mt-1 z-50 rounded-lg border shadow-xl overflow-hidden min-w-[140px]"
                    style={{
                      backgroundColor: "var(--color-card-background)",
                      borderColor: "rgba(var(--color-primary-rgb), 0.3)",
                      boxShadow:
                        "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Container controls */}
                    {container && (
                      <>
                        {isRunning ? (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onStop?.();
                                setShowMenu(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-red-500/10 text-red-400 transition-colors"
                            >
                              <Square
                                className="w-3.5 h-3.5"
                                fill="currentColor"
                              />
                              {t("containers.stop")}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRestart?.();
                                setShowMenu(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-yellow-500/10 text-yellow-400 transition-colors"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              {t("containers.restart")}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onStart?.();
                              setShowMenu(false);
                            }}
                            className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-green-500/10 text-green-400 transition-colors"
                          >
                            <Play
                              className="w-3.5 h-3.5"
                              fill="currentColor"
                            />
                            {t("containers.start")}
                          </button>
                        )}
                        <div className="h-px bg-white/5" />
                      </>
                    )}

                    {/* Edit and Delete */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      {t("common.edit")}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-slate-400 hover:text-red-400 hover:bg-slate-800/50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t("common.delete")}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Description - Below image on mobile, in card on desktop */}
      {shortcut.description && (
        <p
          className="text-xs sm:text-sm leading-relaxed line-clamp-2 sm:line-clamp-3 px-4 sm:px-0 sm:mx-5 md:mx-6 mb-3 sm:mb-3 flex-1"
          style={{ color: "rgba(var(--color-background-contrast-rgb), 0.75)" }}
        >
          {shortcut.description}
        </p>
      )}
    </div>
  );
};
