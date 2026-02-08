import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

import {
  EditModeBanner,
  EmptyDashboardState,
  SectionBlock,
} from "../components/dashboard";
import type {
  DockerContainer,
  Shortcut,
  Section,
  TailscaleInfo,
  ViewMode,
  MobileColumns,
} from "../types";
import {
  getCardComponentForViewMode,
  getGridLayoutClasses,
  getMinHeightForViewMode,
} from "../utils/dashboardHelpers";
import {
  useDashboardDragDrop,
  type PendingChange,
} from "../hooks/useDashboardDragDrop";

interface TailscaleInfoExtended extends TailscaleInfo {
  available: boolean;
}

interface DashboardViewProps {
  isEditMode: boolean;
  dashboardShortcuts: Shortcut[];
  unsectionedShortcuts: Shortcut[];
  sections: Section[];
  shortcutsBySection: Record<number, Shortcut[]>;
  containers: DockerContainer[];
  tailscaleInfo: TailscaleInfoExtended;
  loading: boolean;
  handleCreateSection: () => void;
  handleEditSection: (section: Section) => void;
  handleDeleteSection: (sectionId: number, sectionName: string) => void;
  handleToggleSection: (sectionId: number, isCollapsed: boolean) => void;
  handleReorderSections: (sections: Section[]) => Promise<void>;
  openEditModal: (shortcut: Shortcut) => void;
  handleDelete: (id: number) => void;
  handleStart: (id: string) => void;
  handleStop: (id: string) => void;
  handleRestart: (id: string) => void;
  handleToggleFavorite: (id: number, currentStatus: boolean | number) => void;
  setView: (view: "dashboard" | "add") => void;
  viewMode: ViewMode;
  mobileColumns: MobileColumns;
  onSaveChanges: (changes: PendingChange[]) => Promise<void>;
}

export function DashboardView({
  isEditMode,
  dashboardShortcuts,
  unsectionedShortcuts,
  sections,
  shortcutsBySection,
  containers,
  tailscaleInfo,
  loading,
  handleCreateSection,
  handleEditSection,
  handleDeleteSection,
  handleToggleSection,
  handleReorderSections,
  openEditModal,
  handleDelete,
  handleStart,
  handleStop,
  handleRestart,
  handleToggleFavorite,
  setView,
  viewMode,
  mobileColumns,
  onSaveChanges,
}: DashboardViewProps) {
  const { t } = useTranslation();
  const CardComponent = getCardComponentForViewMode(viewMode);
  const gridClasses = getGridLayoutClasses(viewMode, mobileColumns);

  // Use custom hook for drag-and-drop logic
  const {
    handleShortcutMoved,
    unsectionedParent,
    unsectionedList,
    sectionsParent,
    sectionsList,
  } = useDashboardDragDrop({
    isEditMode,
    unsectionedShortcuts,
    sections,
    onSaveChanges,
    handleReorderSections,
  });

  /**
   * Render a single shortcut card with all necessary props
   */
  const renderShortcutCard = (shortcut: Shortcut) => {
    const container =
      shortcut.container_id && Array.isArray(containers)
        ? containers.find((c) => c.id === shortcut.container_id)
        : null;

    return (
      <CardComponent
        shortcut={shortcut}
        container={container || null}
        tailscaleIP={tailscaleInfo.ip}
        onEdit={() => openEditModal(shortcut)}
        onDelete={() => handleDelete(shortcut.id)}
        onStart={() => handleStart(shortcut.container_id!)}
        onStop={() => handleStop(shortcut.container_id!)}
        onRestart={() => handleRestart(shortcut.container_id!)}
        onToggleFavorite={() =>
          handleToggleFavorite(shortcut.id, shortcut.is_favorite)
        }
        isEditMode={isEditMode}
      />
    );
  };

  const hasNoFavorites = dashboardShortcuts.length === 0 && !loading;
  const showEditModeBanner = isEditMode && dashboardShortcuts.length > 0;
  const showUnsectionedWithHeader =
    (unsectionedShortcuts.length > 0 || (isEditMode && sections.length > 0)) &&
    sections.length > 0;
  const showUnsectionedWithoutHeader =
    unsectionedShortcuts.length > 0 && sections.length === 0;

  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-8"
    >
      {/* Edit Mode Banner */}
      {showEditModeBanner && (
        <EditModeBanner
          handleCreateSection={handleCreateSection}
          t={t}
        />
      )}

      {hasNoFavorites ? (
        <EmptyDashboardState
          setView={setView}
          t={t}
        />
      ) : (
        <div className="space-y-8">
          {/* Unsectioned Shortcuts */}
          {showUnsectionedWithHeader && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <h2
                  className="text-lg font-semibold"
                  style={{
                    color: "var(--color-background-contrast)",
                    opacity: 0.7,
                  }}
                >
                  {t("dashboard.noSection")}
                </h2>
                <span
                  className="text-sm"
                  style={{
                    color: "var(--color-background-contrast)",
                    opacity: 0.5,
                  }}
                >
                  ({unsectionedList.length})
                </span>
              </div>
              <div
                ref={unsectionedParent}
                className={`${gridClasses} ${
                  isEditMode
                    ? `border-2 border-blue-500/30 bg-blue-500/5 rounded-xl transition-all ${
                        unsectionedList.length === 0 ? "p-8" : "p-4"
                      }`
                    : ""
                }`}
                style={
                  isEditMode
                    ? { minHeight: getMinHeightForViewMode(viewMode) }
                    : undefined
                }
              >
                {unsectionedList.length === 0 && isEditMode ? (
                  <div
                    className="col-span-full flex items-center justify-center text-sm italic"
                    style={{
                      color: "var(--color-background-contrast)",
                      opacity: 0.4,
                    }}
                  >
                    {t("dashboard.dragItemsHere")}
                  </div>
                ) : (
                  unsectionedList.map((shortcut) => (
                    <div key={shortcut.id}>{renderShortcutCard(shortcut)}</div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Unsectioned without header if no sections */}
          {showUnsectionedWithoutHeader && (
            <div
              ref={unsectionedParent}
              className={`${gridClasses} ${
                isEditMode
                  ? `border-2 border-blue-500/30 bg-blue-500/5 rounded-xl transition-all ${
                      unsectionedList.length === 0 ? "p-8" : "p-4"
                    }`
                  : ""
              }`}
              style={
                isEditMode
                  ? { minHeight: getMinHeightForViewMode(viewMode) }
                  : undefined
              }
            >
              {unsectionedList.length === 0 && isEditMode ? (
                <div
                  className="col-span-full flex items-center justify-center text-sm italic"
                  style={{
                    color: "var(--color-background-contrast)",
                    opacity: 0.4,
                  }}
                >
                  {t("dashboard.dragItemsHere")}
                </div>
              ) : (
                unsectionedList.map((shortcut) => (
                  <div key={shortcut.id}>{renderShortcutCard(shortcut)}</div>
                ))
              )}
            </div>
          )}

          {/* Sectioned Shortcuts */}
          <div
            ref={sectionsParent}
            className="space-y-8"
          >
            {sectionsList.map((section) => (
              <div key={section.id}>
                <SectionBlock
                  section={section}
                  shortcuts={shortcutsBySection[section.id] || []}
                  isEditMode={isEditMode}
                  gridClasses={gridClasses}
                  minHeight={getMinHeightForViewMode(viewMode)}
                  handleToggleSection={handleToggleSection}
                  handleEditSection={handleEditSection}
                  handleDeleteSection={handleDeleteSection}
                  renderShortcutCard={renderShortcutCard}
                  onShortcutMoved={handleShortcutMoved}
                  t={t}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
