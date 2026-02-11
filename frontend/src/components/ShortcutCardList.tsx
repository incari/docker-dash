import React from "react";
import {
  Settings,
  Trash2,
  Play,
  Square,
  RefreshCw,
  Star,
  GripVertical,
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
 * List view shortcut card - horizontal layout
 */
export const ShortcutCardList: React.FC<ExtendedShortcutCardProps> = ({
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

  // Determine if star should be shown
  const showStar = isEditMode || alwaysShowStar;

  // Get link and subtitle using shared utility
  const { link, subtitle } = getShortcutLink(
    shortcut,
    container,
    tailscaleIP,
    60,
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
      className={`group relative border rounded-xl overflow-hidden transition-all duration-300 ${
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
        <div className="absolute top-1/2 -translate-y-1/2 left-2 z-10 p-1.5 rounded-lg bg-slate-900/90 backdrop-blur-sm border border-white/10 pointer-events-none">
          <GripVertical className="w-4 h-4 text-slate-400" />
        </div>
      )}

      <div
        className={`flex items-start gap-3 p-3 sm:p-4 ${isEditMode ? "pl-12" : ""}`}
      >
        {/* Icon */}
        <div
          className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center border border-white/5 shrink-0 overflow-hidden"
          style={{
            background: `linear-gradient(to bottom right, rgba(var(--color-primary-rgb), 0.2), rgba(var(--color-primary-rgb), 0.05))`,
          }}
        >
          {renderShortcutIcon(shortcut)}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {renderContainerStatus(container)}
            <h3
              className="font-bold text-sm sm:text-base leading-tight truncate"
              style={{ color: "var(--color-background-contrast)" }}
            >
              {shortcut.display_name}
            </h3>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="text-[10px] sm:text-xs font-mono truncate flex items-center gap-1.5"
              style={{
                color: "rgba(var(--color-background-contrast-rgb), 0.75)",
              }}
              title={link || undefined}
            >
              {getLinkIcon(shortcut, "lg")}
              {subtitle}
            </span>
          </div>
          {shortcut.description && (
            <p className="text-slate-500 text-[10px] sm:text-xs mt-1 line-clamp-1">
              {shortcut.description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-2 shrink-0">
          {/* Star - Visible in edit/reorder mode or when alwaysShowStar is true */}
          {showStar && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              className="p-2 transition-colors"
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
                className={`w-5 h-5 ${shortcut.is_favorite ? "fill-current" : ""}`}
              />
            </button>
          )}

          {/* Container controls */}
          {!isEditMode && container && (
            <div className="flex flex-col sm:flex-row gap-1">
              {isRunning ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStop?.();
                    }}
                    className="p-1.5 sm:p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all"
                    title={t("containers.stop")}
                  >
                    <Square
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                      fill="currentColor"
                    />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestart?.();
                    }}
                    className="p-1.5 sm:p-2 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500 hover:text-white transition-all"
                    title={t("containers.restart")}
                  >
                    <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                </>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onStart?.();
                  }}
                  className="p-1.5 sm:p-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white transition-all"
                  title={t("containers.start")}
                >
                  <Play
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                    fill="currentColor"
                  />
                </button>
              )}
            </div>
          )}

          {/* Edit/Delete */}
          {!isEditMode && (
            <div className="flex flex-col sm:flex-row gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-white transition-colors"
                title={t("common.edit")}
              >
                <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-red-400 transition-colors"
                title={t("common.delete")}
              >
                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
