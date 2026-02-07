import { useState, useEffect, useCallback, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ConfirmModal } from "./components/ConfirmModal";
import { ErrorModal } from "./components/ErrorModal";
import { ShortcutModal } from "./components/ShortcutModal";
import { SectionModal } from "./components/SectionModal";
import { DashboardView } from "./views/DashboardView";
import { ManagementView } from "./views/ManagementView";
import { useTheme } from "./hooks/useTheme";
import { useDashboardData } from "./hooks/useDashboardData";
import { useContainerActions } from "./hooks/useContainerActions";
import { useShortcutActions } from "./hooks/useShortcutActions";
import { useSectionActions } from "./hooks/useSectionActions";
import { useModals } from "./hooks/useModals";
import { useInstallPrompt } from "./hooks/useInstallPrompt";
import { useViewSettings } from "./hooks/useViewSettings";
import type { Section, Shortcut } from "./types";

function App() {
  // ==================== View State ====================
  const [view, setView] = useState<"dashboard" | "add">("dashboard");
  const [isEditMode, setIsEditMode] = useState(false);

  // ==================== Custom Hooks ====================
  const { t } = useTranslation();
  const { theme, updateTheme } = useTheme();
  const { viewMode, mobileColumns, setViewMode, setMobileColumns } =
    useViewSettings();
  const { showInstallPrompt, handleInstallClick } = useInstallPrompt();
  const {
    shortcuts,
    sections,
    containers,
    tailscaleInfo,
    loading,
    fetchData,
    fetchTailscaleInfo,
    setShortcuts,
    setSections,
  } = useDashboardData();

  const modals = useModals();

  // ==================== Action Hooks Configuration ====================
  // Memoize action hook options to prevent unnecessary re-initialization
  const shortcutActionsOptions = useMemo(
    () => ({
      onRefresh: fetchData,
      onError: modals.showError,
      showDeleteConfirm: (onConfirm: () => Promise<void>) => {
        modals.showConfirm(
          t("modals.confirm.deleteShortcut"),
          t("modals.confirm.deleteShortcutMessage"),
          onConfirm,
        );
      },
    }),
    [fetchData, modals, t],
  );

  const sectionActionsOptions = useMemo(
    () => ({
      onRefresh: fetchData,
      onError: modals.showError,
      showDeleteConfirm: (
        sectionName: string,
        onConfirm: () => Promise<void>,
      ) => {
        modals.showConfirm(
          t("modals.confirm.deleteSection"),
          t("modals.confirm.deleteSectionMessage", { sectionName }),
          onConfirm,
        );
      },
    }),
    [fetchData, modals, t],
  );

  // ==================== Action Hooks ====================
  const containerActions = useContainerActions(fetchData);
  const shortcutActions = useShortcutActions(
    shortcutActionsOptions,
    setShortcuts,
  );
  const sectionActions = useSectionActions(sectionActionsOptions, setSections);

  // ==================== Effects ====================
  useEffect(() => {
    fetchData();
    fetchTailscaleInfo();
  }, [fetchData, fetchTailscaleInfo]);

  // Redirect to add view if no shortcuts
  useEffect(() => {
    if (!loading && shortcuts.length === 0 && view === "dashboard") {
      setView("add");
    }
  }, [loading, shortcuts.length, view]);

  // ==================== Container Action Handlers ====================
  const handleStart = useCallback(
    (id: string) => {
      containerActions.handleStart(id);
    },
    [containerActions],
  );

  const handleStop = useCallback(
    (id: string) => {
      containerActions.handleStop(id, (onConfirm) => {
        modals.showConfirm(
          t("modals.confirm.stopContainer"),
          t("modals.confirm.stopContainerMessage"),
          onConfirm,
        );
      });
    },
    [containerActions, modals, t],
  );

  const handleRestart = useCallback(
    (id: string) => {
      containerActions.handleRestart(id);
    },
    [containerActions],
  );

  // ==================== Section Handlers ====================
  const handleCreateSection = useCallback(() => {
    modals.openSectionModal(null);
  }, [modals]);

  const handleEditSection = useCallback(
    (section: Section) => {
      modals.openSectionModal(section);
    },
    [modals],
  );

  const handleSaveSection = useCallback(
    async (name: string) => {
      try {
        await sectionActions.handleSaveSection(
          name,
          modals.sectionModal.section,
        );
        modals.closeSectionModal();
      } catch {
        // Error already handled in hook
      }
    },
    [sectionActions, modals],
  );

  // ==================== Computed Data ====================
  // Memoize dashboard shortcuts to avoid recomputing on every render
  const dashboardShortcuts = useMemo(
    () => shortcuts.filter((s) => s.is_favorite),
    [shortcuts],
  );

  // Memoize formatted data for FormKit drag-and-drop
  // Note: We use useMemo here as the computation is expensive and the result
  // is used in multiple places. FormKit handles its own internal state.
  const { shortcutsBySection, unsectionedShortcuts } = useMemo(() => {
    // Group shortcuts by section
    const formattedSections: Record<number, typeof shortcuts> = {};
    const formattedUnsectioned: typeof shortcuts = [];

    // Initialize all sections with empty arrays (for empty sections)
    sections.forEach((section) => {
      formattedSections[section.id] = [];
    });

    // Populate sections with shortcuts
    dashboardShortcuts.forEach((shortcut) => {
      const sectionId = shortcut.section_id;
      if (sectionId != null) {
        if (!formattedSections[sectionId]) {
          formattedSections[sectionId] = [];
        }
        formattedSections[sectionId].push(shortcut);
      } else {
        formattedUnsectioned.push(shortcut);
      }
    });

    return {
      shortcutsBySection: formattedSections,
      unsectionedShortcuts: formattedUnsectioned,
    };
  }, [dashboardShortcuts, sections]);

  // ==================== Shortcut/Section Handlers (wrapped for component props) ====================
  const handleDeleteSection = useCallback(
    (sectionId: number, sectionName: string) => {
      sectionActions.handleDeleteSection(sectionId, sectionName);
    },
    [sectionActions],
  );

  const handleToggleSection = useCallback(
    (sectionId: number, isCollapsed: boolean) => {
      sectionActions.handleToggleSection(sectionId, isCollapsed);
    },
    [sectionActions],
  );

  const handleReorderSections = useCallback(
    async (sections: Section[]) => {
      await sectionActions.handleReorderSections(sections);
    },
    [sectionActions],
  );

  const openEditModal = useCallback(
    (shortcut: (typeof shortcuts)[0]) => {
      modals.openShortcutModal(shortcut);
    },
    [modals],
  );

  const handleDelete = useCallback(
    (id: number) => {
      shortcutActions.handleDelete(id);
    },
    [shortcutActions],
  );

  const handleToggleFavorite = useCallback(
    (id: number, currentStatus: boolean | number) => {
      shortcutActions.handleToggleFavorite(id, currentStatus);
    },
    [shortcutActions],
  );

  const handleQuickAdd = useCallback(
    (container: (typeof containers)[0]) => {
      shortcutActions.handleQuickAdd(container);
    },
    [shortcutActions],
  );

  const handleSaveChanges = useCallback(
    async (
      changes: Array<{
        type: string;
        shortcutId: number;
        sectionId: number | null;
        position: number;
      }>,
    ) => {
      await shortcutActions.handleSaveChanges(changes);
    },
    [shortcutActions],
  );

  // ==================== ManagementView Handlers ====================
  // Memoize inline callbacks for ManagementView to prevent re-renders
  const handleSetEditingShortcut = useCallback(
    (shortcut: Shortcut | null) => {
      modals.openShortcutModal(shortcut);
    },
    [modals],
  );

  const handleSetIsModalOpen = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        modals.openShortcutModal();
      } else {
        modals.closeShortcutModal();
      }
    },
    [modals],
  );

  return (
    <div
      className="min-h-screen text-slate-200 font-sans selection:bg-blue-500/30 flex flex-col"
      style={{ backgroundColor: theme.background }}
    >
      <Header
        view={view}
        setView={setView}
        showInstallPrompt={showInstallPrompt}
        handleInstallClick={handleInstallClick}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
        viewMode={viewMode}
        mobileColumns={mobileColumns}
        onViewModeChange={setViewMode}
        onMobileColumnsChange={setMobileColumns}
      />

      <main className="container mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {view === "dashboard" ? (
            <DashboardView
              isEditMode={isEditMode}
              dashboardShortcuts={dashboardShortcuts}
              unsectionedShortcuts={unsectionedShortcuts}
              sections={sections}
              shortcutsBySection={shortcutsBySection}
              containers={containers}
              tailscaleInfo={tailscaleInfo}
              loading={loading}
              handleCreateSection={handleCreateSection}
              handleEditSection={handleEditSection}
              handleDeleteSection={handleDeleteSection}
              handleToggleSection={handleToggleSection}
              handleReorderSections={handleReorderSections}
              openEditModal={openEditModal}
              handleDelete={handleDelete}
              handleStart={handleStart}
              handleStop={handleStop}
              handleRestart={handleRestart}
              handleToggleFavorite={handleToggleFavorite}
              setView={setView}
              viewMode={viewMode}
              mobileColumns={mobileColumns}
              onSaveChanges={handleSaveChanges}
            />
          ) : (
            <ManagementView
              containers={containers}
              shortcuts={shortcuts}
              tailscaleInfo={tailscaleInfo}
              setView={setView}
              setEditingShortcut={handleSetEditingShortcut}
              setIsModalOpen={handleSetIsModalOpen}
              openEditModal={openEditModal}
              handleDelete={handleDelete}
              handleStart={handleStart}
              handleStop={handleStop}
              handleQuickAdd={handleQuickAdd}
              handleToggleFavorite={handleToggleFavorite}
              viewMode={viewMode}
              mobileColumns={mobileColumns}
            />
          )}
        </AnimatePresence>
      </main>

      <Footer
        currentTheme={theme}
        onThemeChange={updateTheme}
      />

      <AnimatePresence>
        {modals.shortcutModal.isOpen && (
          <ShortcutModal
            isOpen={modals.shortcutModal.isOpen}
            shortcut={modals.shortcutModal.shortcut}
            containers={containers}
            tailscaleInfo={tailscaleInfo}
            onSave={fetchData}
            onClose={modals.closeShortcutModal}
            onError={modals.showError}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modals.sectionModal.isOpen && (
          <SectionModal
            isOpen={modals.sectionModal.isOpen}
            mode={modals.sectionModal.section ? "edit" : "add"}
            section={modals.sectionModal.section}
            onSave={handleSaveSection}
            onClose={modals.closeSectionModal}
          />
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={modals.confirmModal.isOpen}
        title={modals.confirmModal.title}
        message={modals.confirmModal.message}
        onConfirm={modals.confirmAndClose}
        onCancel={modals.closeConfirm}
      />

      <ErrorModal
        isOpen={modals.errorModal.isOpen}
        message={`${modals.errorModal.title}\n\n${modals.errorModal.message}`}
        onClose={modals.closeError}
      />
    </div>
  );
}

export default App;
