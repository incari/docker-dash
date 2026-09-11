import React, { useState, useMemo } from "react";
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
import { CardShell } from "./CardShell";
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
 * Table view shortcut card - row layout with actions at the end
 * Memoized to prevent unnecessary re-renders
 */
export const ShortcutCardTable: React.FC<ExtendedShortcutCardProps> = React.memo(({
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
  const [showMenu, setShowMenu] = useState(false);

  // Memoize derived state
  const isRunning = useMemo(() => container?.state === "running", [container?.state]);
  const showStar = useMemo(() => isEditMode || alwaysShowStar, [isEditMode, alwaysShowStar]);

  // Memoize link calculation (expensive operation)
  const { link, subtitle: linkDisplay } = useMemo(
    () => getShortcutLink(shortcut, container, tailscaleIP, 50),
    [shortcut, container, tailscaleIP],
  );

  return (
    <CardShell
      link={link}
      linkLabel={t("shortcuts.openShortcut", { name: shortcut.display_name })}
      isEditMode={isEditMode}
      isOver={isOver}
      dragHandleProps={dragHandleProps}
      shadow="0 10px 15px -3px rgba(var(--color-primary-rgb), 0.05)"
      className={`rounded-lg ${
        isEditMode ? "cursor-grab active:cursor-grabbing" : ""
      } ${showMenu ? "overflow-visible" : "overflow-hidden"}`}
    >
      {isEditMode && (
        <div className="absolute top-1/2 -translate-y-1/2 left-2 z-10 p-1.5 rounded-lg bg-slate-900/90 backdrop-blur-sm border border-white/10 pointer-events-none">
          <GripVertical className="w-4 h-4 text-slate-400" />
        </div>
      )}

      <div
        className={`flex items-center gap-3 p-3 ${isEditMode ? "pl-12" : ""}`}
      >
        {/* Icon */}
        <div
          className="w-10 h-10 rounded-lg flex items-center border border-white/5 shrink-0 overflow-hidden"
          style={{
            background: `linear-gradient(to bottom right, rgba(var(--color-primary-rgb), 0.2), rgba(var(--color-primary-rgb), 0.05))`,
          }}
        >
          {renderShortcutIcon(shortcut)}
        </div>

        {/* Name */}
        <div className="min-w-0 flex-[0_0_200px] md:flex-[0_0_250px]">
          <div className="flex items-center gap-2">
            {renderContainerStatus(container)}
            <h3
              className="font-bold text-sm leading-tight truncate"
              style={{ color: "var(--color-background-contrast)" }}
            >
              {shortcut.display_name}
            </h3>
          </div>
        </div>

        {/* Link */}
        <div className="hidden md:flex items-center gap-1.5 min-w-0 flex-[0_0_200px] lg:flex-[0_0_300px]">
          <span
            className="text-xs font-mono truncate flex items-center gap-1.5"
            style={{
              color: "rgba(var(--color-background-contrast-rgb), 0.75)",
            }}
            title={link || undefined}
          >
            {getLinkIcon(shortcut, "lg")}
            {linkDisplay}
          </span>
        </div>

        {/* Description */}
        <div className="hidden lg:block min-w-0 flex-1">
          {shortcut.description && (
            <p
              className="text-xs truncate"
              style={{
                color: "rgba(var(--color-background-contrast-rgb), 0.75)",
              }}
            >
              {shortcut.description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="card-actions flex items-center gap-1 shrink-0">
          {/* Star - Visible in edit/reorder mode or when alwaysShowStar is true */}
          {showStar && (
            <button
                aria-label={
                  shortcut.is_favorite
                    ? t("shortcuts.removeFromFavorites")
                    : t("shortcuts.addToFavorites")
                }
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              className="p-2 cursor-pointer transition-colors"
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

          {/* Container controls */}
          {!isEditMode && container && (
            <div className="flex gap-1">
              {isRunning ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStop?.();
                    }}
                    className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all"
                    title={t("containers.stop")}
                  >
                    <Square
                      className="w-3.5 h-3.5"
                      fill="currentColor"
                    />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestart?.();
                    }}
                    className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500 hover:text-white transition-all"
                    title={t("containers.restart")}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onStart?.();
                  }}
                  className="p-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white transition-all"
                  title={t("containers.start")}
                >
                  <Play
                    className="w-3.5 h-3.5"
                    fill="currentColor"
                  />
                </button>
              )}
            </div>
          )}

          {/* Edit/Delete */}
          {!isEditMode && (
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-2 text-slate-400 hover:text-white transition-colors"
                title={t("common.edit")}
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                title={t("common.delete")}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </CardShell>
  );
});
