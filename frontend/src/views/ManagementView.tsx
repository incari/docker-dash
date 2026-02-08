import { motion } from "framer-motion";
import { Plus, ArrowLeft, Link as LinkIcon, Server } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ShortcutCard,
  ShortcutCardCompact,
  ShortcutCardIcon,
  ShortcutCardList,
  ShortcutCardTable,
} from "../components";
import type {
  DockerContainer,
  Shortcut,
  ViewMode,
  MobileColumns,
} from "../types";

interface ManagementViewProps {
  containers: DockerContainer[];
  shortcuts: Shortcut[];
  tailscaleInfo: { available: boolean; ip: string | null };
  setView: (view: "dashboard" | "add") => void;
  setEditingShortcut: (shortcut: Shortcut | null) => void;
  setIsModalOpen: (open: boolean) => void;
  openEditModal: (shortcut: Shortcut) => void;
  handleDelete: (id: number) => void;
  handleStart: (id: string) => void;
  handleStop: (id: string) => void;
  handleRestart?: (id: string) => void;
  handleQuickAdd: (container: DockerContainer) => void;
  handleQuickAddAsFavorite: (container: DockerContainer) => void;
  handleToggleFavorite: (id: number, currentStatus: boolean | number) => void;
  viewMode: ViewMode;
  mobileColumns: MobileColumns;
}

/**
 * Get the appropriate card component based on view mode
 */
function getCardComponentForViewMode(viewMode: ViewMode) {
  switch (viewMode) {
    case "compact":
      return ShortcutCardCompact;
    case "icon":
      return ShortcutCardIcon;
    case "list":
      return ShortcutCardList;
    case "table":
      return ShortcutCardTable;
    default:
      return ShortcutCard;
  }
}

/**
 * Get grid layout classes based on view mode and mobile columns setting
 */
function getGridLayoutClasses(
  viewMode: ViewMode,
  mobileColumns: MobileColumns,
): string {
  const mobileClass = mobileColumns === 1 ? "grid-cols-1" : "grid-cols-2";

  switch (viewMode) {
    case "compact":
      return `grid ${mobileClass} md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`;
    case "icon":
      return `grid ${mobileClass} md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3`;
    case "list":
      return `grid ${mobileClass} md:grid-cols-1 gap-3`;
    case "table":
      return `grid ${mobileClass} md:grid-cols-1 gap-2`;
    default:
      return `grid ${mobileClass} md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6`;
  }
}

export function ManagementView({
  containers,
  shortcuts,
  tailscaleInfo,
  setView,
  setEditingShortcut,
  setIsModalOpen,
  openEditModal,
  handleDelete,
  handleStart,
  handleStop,
  handleRestart,
  handleQuickAdd,
  handleQuickAddAsFavorite,
  handleToggleFavorite,
  viewMode,
  mobileColumns,
}: ManagementViewProps) {
  const { t } = useTranslation();
  const customShortcuts = shortcuts.filter((s) => !s.container_id);
  const CardComponent = getCardComponentForViewMode(viewMode);
  const gridClasses = getGridLayoutClasses(viewMode, mobileColumns);

  return (
    <motion.div
      key="add"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-12"
    >
      {/* Manual URL Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView("dashboard")}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2
                className="text-2xl font-bold flex items-center gap-2"
                style={{ color: "var(--color-background-contrast)" }}
              >
                <LinkIcon className="text-blue-500 w-6 h-6" />{" "}
                {t("shortcuts.title")}
              </h2>
              <p
                className="text-sm mt-1"
                style={{
                  color: "rgba(var(--color-background-contrast-rgb), 1)",
                }}
              >
                {t("shortcuts.description")}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingShortcut(null);
              setIsModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 md:px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20 font-medium"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden md:inline">{t("shortcuts.addCustom")}</span>
          </button>
        </div>

        {customShortcuts.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
            <LinkIcon className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">{t("shortcuts.noShortcuts")}</p>
            <p className="text-slate-500 text-sm mt-1">
              {t("shortcuts.noShortcutsDescription")}
            </p>
          </div>
        ) : (
          <div className={gridClasses}>
            {customShortcuts.map((s) => (
              <CardComponent
                key={s.id}
                shortcut={s}
                container={null}
                tailscaleIP={tailscaleInfo.ip}
                onEdit={() => openEditModal(s)}
                onDelete={() => handleDelete(s.id)}
                onToggleFavorite={() =>
                  handleToggleFavorite(s.id, s.is_favorite)
                }
                alwaysShowStar={true}
              />
            ))}
          </div>
        )}
      </section>

      {/* Docker Containers Section */}
      <section className="space-y-6">
        <div>
          <h2
            className="text-2xl font-bold flex items-center gap-2"
            style={{ color: "var(--color-background-contrast)" }}
          >
            <Server className="text-green-500 w-6 h-6" />{" "}
            {t("containers.title")}
          </h2>
          <p
            className="text-sm mt-1"
            style={{
              color: "rgba(var(--color-background-contrast-rgb), 0.75)",
            }}
          >
            {t("containers.description")}
          </p>
        </div>

        {containers.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
            <Server className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">{t("containers.noContainers")}</p>
            <p className="text-slate-500 text-sm mt-1">
              {t("containers.noContainersDescription")}
            </p>
          </div>
        ) : (
          <div className={gridClasses}>
            {containers.map((container) => {
              const existingShortcut = shortcuts.find(
                (s) => s.container_id === container.id,
              );

              // If no shortcut exists, create a temporary one for display
              const displayShortcut = existingShortcut || {
                id: -1, // Temporary ID
                name: container.name,
                container_id: container.id,
                port: null,
                url: null,
                icon: null,
                icon_type: null,
                description: null,
                is_favorite: false,
                section_id: null,
                position: 0,
              };

              return (
                <CardComponent
                  key={container.id}
                  shortcut={displayShortcut}
                  container={container}
                  tailscaleIP={tailscaleInfo.ip}
                  onEdit={() =>
                    existingShortcut
                      ? openEditModal(existingShortcut)
                      : handleQuickAdd(container)
                  }
                  onDelete={
                    existingShortcut
                      ? () => handleDelete(existingShortcut.id)
                      : () => {} // No-op for containers without shortcuts
                  }
                  onStart={() => handleStart(container.id)}
                  onStop={() => handleStop(container.id)}
                  onRestart={
                    handleRestart
                      ? () => handleRestart(container.id)
                      : undefined
                  }
                  onToggleFavorite={
                    existingShortcut
                      ? () =>
                          handleToggleFavorite(
                            existingShortcut.id,
                            existingShortcut.is_favorite,
                          )
                      : () => handleQuickAddAsFavorite(container)
                  }
                  alwaysShowStar={true}
                />
              );
            })}
          </div>
        )}
      </section>
    </motion.div>
  );
}
