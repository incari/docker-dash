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

  const handleCardClick = () => {
    if (!isEditMode && link) {
      window.open(link, "_blank");
    }
  };

  return (
    <div
      {...(isEditMode && dragHandleProps ? dragHandleProps : {})}
      onClick={handleCardClick}
      className={`group relative border rounded-xl transition-all duration-300 ${
        isEditMode
          ? "cursor-grab active:cursor-grabbing"
          : link
            ? "cursor-pointer"
            : "cursor-default"
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
            ? `0 10px 15px -3px rgba(var(--color-primary-rgb), 0.05)`
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
            background: `linear-gradient(to bottom right, rgba(var(--color-primary-rgb), 0.2), rgba(var(--color-primary-rgb), 0.05))`,
          }}
        >
          {renderShortcutIcon(shortcut)}
        </div>

        {/* Title and Status */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {renderContainerStatus(container)}
            <h3
              className="font-bold text-sm leading-tight truncate"
              style={{ color: "var(--color-background-contrast)" }}
            >
              {shortcut.display_name}
            </h3>
          </div>
          <span
            className="text-[10px] font-mono mt-0.5 truncate flex items-center gap-1.5"
            style={{
              color: "rgba(var(--color-background-contrast-rgb), 0.75)",
            }}
            title={link || undefined}
          >
            {getLinkIcon(shortcut, "sm")}
            {subtitle}
          </span>
        </div>

        {/* Star and Menu button */}
        <div className="flex items-center gap-1 shrink-0">
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
    </div>
  );
};
