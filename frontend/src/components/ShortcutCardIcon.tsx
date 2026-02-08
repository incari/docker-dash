import React, { useState } from "react";
import {
  Settings,
  Trash2,
  Star,
  GripVertical,
  Play,
  Square,
  RefreshCw,
  MoreVertical,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ShortcutCardProps } from "../types";
import {
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
 * Icon-only shortcut card - just icon/image and name
 */
export const ShortcutCardIcon: React.FC<ExtendedShortcutCardProps> = ({
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

  // Get link using shared utility
  const { link } = getShortcutLink(shortcut, container, tailscaleIP);

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
        <div className="absolute top-2 left-2 z-10 p-1 rounded-lg bg-slate-900/90 backdrop-blur-sm border border-white/10 pointer-events-none">
          <GripVertical className="w-3 h-3 text-slate-400" />
        </div>
      )}

      {/* Icon/Image */}
      <div
        className="relative aspect-square flex items-center overflow-hidden p-4"
        style={{
          background: `linear-gradient(to bottom right, rgba(var(--color-primary-rgb), 0.2), rgba(var(--color-primary-rgb), 0.05))`,
        }}
      >
        <div className="w-full h-full">{renderShortcutIcon(shortcut)}</div>

        {/* Status indicator */}
        {container && (
          <div className="absolute top-2 right-2">
            {renderContainerStatus(container)}
          </div>
        )}
      </div>

      {/* Name and Menu */}
      <div
        className="p-1.5 flex items-center justify-between gap-1.5"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}
      >
        <h3
          className="font-bold text-[10px] truncate flex-1"
          style={{ color: "var(--color-background-contrast)" }}
        >
          {shortcut.name}
        </h3>

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
                className={`w-3 h-3 ${shortcut.is_favorite ? "fill-current" : ""}`}
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
                <MoreVertical className="w-3.5 h-3.5" />
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
