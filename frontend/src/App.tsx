import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
} from "react";
import { AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ConfirmModal } from "./components/ConfirmModal";
import { ErrorModal } from "./components/ErrorModal";
import { MigrationModal } from "./components/MigrationModal";
import { SectionModal } from "./components/SectionModal";

// Lazy-loaded components for better initial bundle size
const ShortcutModal = lazy(() =>
  import("./components/ShortcutModal").then((module) => ({
    default: module.ShortcutModal,
  })),
);
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
import { useMigrationSettings } from "./hooks/useMigrationSettings";
import { shortcutsApi, containersApi } from "./services/api";
import type { Section, Shortcut } from "./types";

function App() {
  // ==================== View State ====================
  const [view, setView] = useState<"dashboard" | "add">("dashboard");
  const [isEditMode, setIsEditMode] = useState(false);

  // Migration modal state
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);
  const [migrationShortcuts, setMigrationShortcuts] = useState<
    Array<{
      id: number;
      display_name: string;
      description: string;
      icon: string;
    }>
  >([]);

  // ==================== Custom Hooks ====================
  const { t } = useTranslation();
  const { theme, updateTheme } = useTheme();
  const { viewMode, mobileColumns, setViewMode, setMobileColumns } =
    useViewSettings();
  const {
    migrationDismissed,
    isLoaded: migrationSettingsLoaded,
    setMigrationDismissed,
  } = useMigrationSettings();
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

  // ==================== Migration Handler ====================
  const handleMigration = useCallback(async () => {
    try {
      // Get all container shortcuts
      const containerShortcuts = shortcuts.filter((s) => s.container_id);
      const allIds = containerShortcuts.map((s) => s.id);

      // Migrate all shortcuts (icons only)
      const migrationResult = await shortcutsApi.migrateIcons(allIds);

      // Refresh data to show updated icons
      await fetchData();

      // Show success message
      modals.showError(
        "Migration Complete",
        migrationResult.message,
        "success",
      );
    } catch (error) {
      console.error("Migration failed:", error);
      modals.showError(
        "Migration Failed",
        "Failed to migrate icons. Please try again later.",
      );
    }
  }, [fetchData, modals, shortcuts]);

  // Show migration modal with list of shortcuts
  const showMigrationModal = useCallback(
    (
      shortcuts: Array<{
        id: number;
        display_name: string;
        description: string;
        icon: string;
      }>,
      isManualTrigger = false,
    ) => {
      // If it's an automatic trigger and user has dismissed it before, don't show
      if (!isManualTrigger && migrationDismissed) {
        console.log("Migration modal dismissed previously, skipping auto-show");
        return;
      }

      setMigrationShortcuts(shortcuts);
      setMigrationModalOpen(true);
    },
    [migrationDismissed],
  );

  // Handle migration confirmation with selected shortcuts
  const handleMigrationConfirm = useCallback(
    async (iconIds: number[]) => {
      setMigrationModalOpen(false);
      // Mark migration as dismissed so it doesn't auto-show again
      setMigrationDismissed(true);

      try {
        const migrationResult = await shortcutsApi.migrateIcons(iconIds);

        // Check if migration was successful
        if (migrationResult.success === false) {
          // Docker is not running or no options selected
          modals.showError(
            "Migration Failed",
            migrationResult.message ||
              "Failed to migrate. Please check your settings and try again.",
          );
          return;
        }

        // Refresh data to show updated icons
        await fetchData();

        // Show success message
        modals.showError(
          "Migration Complete",
          migrationResult.message,
          "success",
        );
      } catch (error) {
        console.error("Migration failed:", error);
        modals.showError(
          "Migration Failed",
          "Failed to migrate icons. Please try again later.",
        );
      }
    },
    [modals, fetchData, setMigrationDismissed],
  );

  // Handle migration cancel
  const handleMigrationCancel = useCallback(() => {
    setMigrationModalOpen(false);
    // Mark migration as dismissed so it doesn't auto-show again
    setMigrationDismissed(true);
  }, [setMigrationDismissed]);

  // ==================== Effects ====================
  // Use ref to ensure startup tasks only run once
  const hasRunStartupTasks = useRef(false);

  useEffect(() => {
    // Wait for migration settings to load before running startup tasks
    if (!migrationSettingsLoaded) {
      return;
    }

    // Only run startup tasks once
    if (hasRunStartupTasks.current) {
      return;
    }
    hasRunStartupTasks.current = true;

    // Run auto-sync and check for migration on app startup
    // Optimized: Run independent operations in parallel for faster startup
    const runStartupTasks = async () => {
      try {
        // Run auto-sync and container fetch in parallel (they're independent)
        console.log("Running startup tasks in parallel...");
        const [syncResult, containersData] = await Promise.all([
          shortcutsApi.autoSync(),
          containersApi.getAll(),
        ]);
        console.log("Auto-sync completed:", syncResult);

        // Refresh data to show all shortcuts (depends on autoSync completing)
        await fetchData();

        // Check if migration is needed (only if Docker is running)
        // If Docker is not running, containers will be empty, so skip migration check
        const isDockerRunning =
          Array.isArray(containersData) && containersData.length > 0;

        if (isDockerRunning) {
          const migrationCheck = await shortcutsApi.checkMigration();
          if (migrationCheck.needsMigration) {
            console.log(
              `Migration needed for ${migrationCheck.count} shortcut(s)`,
            );

            // Show migration modal with list of shortcuts
            showMigrationModal(migrationCheck.shortcuts);
          }
        }
      } catch (error) {
        console.error("Startup tasks failed:", error);
        // Still try to fetch data even if migration/sync fails
        fetchData();
      }
    };

    runStartupTasks();
    fetchTailscaleInfo();
  }, [
    fetchData,
    fetchTailscaleInfo,
    showMigrationModal,
    migrationSettingsLoaded,
  ]);

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
  // In edit mode: show ALL shortcuts (so we can toggle favorites without items disappearing)
  // Not in edit mode: show only favorites
  const dashboardShortcuts = useMemo(() => {
    const filtered = isEditMode
      ? shortcuts
      : shortcuts.filter((s) => s.is_favorite);
    return filtered;
  }, [shortcuts, isEditMode]);

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

  const handleQuickAddAsFavorite = useCallback(
    (container: (typeof containers)[0]) => {
      shortcutActions.handleQuickAddAsFavorite(container);
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

      {/* Docker Not Running Warning */}
      {!loading &&
        containers.length === 0 &&
        shortcuts.some((s) => s.container_id) && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 px-4 py-3 mx-6 mt-4 rounded-lg">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-yellow-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span className="text-sm">
                <strong>Docker is not running.</strong> Start Docker Desktop to
                see and manage your containers.
              </span>
            </div>
          </div>
        )}

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
              handleRestart={handleRestart}
              handleQuickAdd={handleQuickAdd}
              handleQuickAddAsFavorite={handleQuickAddAsFavorite}
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
        onMigrate={handleMigration}
        onShowMigrationModal={showMigrationModal}
      />

      <AnimatePresence>
        {modals.shortcutModal.isOpen && (
          <Suspense fallback={null}>
            <ShortcutModal
              isOpen={modals.shortcutModal.isOpen}
              shortcut={modals.shortcutModal.shortcut}
              containers={containers}
              tailscaleInfo={tailscaleInfo}
              onSave={fetchData}
              onClose={modals.closeShortcutModal}
              onError={modals.showError}
            />
          </Suspense>
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
        type={modals.confirmModal.type}
      />

      <ErrorModal
        isOpen={modals.errorModal.isOpen}
        title={modals.errorModal.title}
        message={modals.errorModal.message}
        onClose={modals.closeError}
        type={modals.errorModal.type}
      />

      <MigrationModal
        isOpen={migrationModalOpen}
        shortcuts={migrationShortcuts}
        onConfirm={handleMigrationConfirm}
        onCancel={handleMigrationCancel}
      />
    </div>
  );
}

export default App;
