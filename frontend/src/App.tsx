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

import { ErrorBoundary } from "./components/ErrorBoundary";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ConfirmModal } from "./components/ConfirmModal";
import { MigrationModal } from "./components/MigrationModal";
import { useToast } from "./contexts/ToastContext";
import { SectionModal } from "./components/SectionModal";

// Lazy-loaded components for better initial bundle size
const ShortcutModal = lazy(() =>
  import("./components/ShortcutModal").then((module) => ({
    default: module.ShortcutModal,
  })),
);
const AIChat = lazy(() =>
  import("./components/AIChat/AIChat").then((module) => ({
    default: module.AIChat,
  })),
);
import { DashboardView } from "./views/DashboardView";
import { ManagementView } from "./views/ManagementView";
import { useTheme } from "./hooks/useTheme";
import { useDashboardSWR } from "./hooks/useSWRData";
import { useContainerActions } from "./hooks/useContainerActions";
import { useShortcutActions } from "./hooks/useShortcutActions";
import { useSectionActions } from "./hooks/useSectionActions";
import { useModals } from "./hooks/useModals";
import { useInstallPrompt } from "./hooks/useInstallPrompt";
import { useViewSettings } from "./hooks/useViewSettings";
import { useMigrationSettings } from "./hooks/useMigrationSettings";
import { shortcutsApi, dataApi } from "./services/api";
import { parseQuery, matchesShortcut } from "./utils/search";
import { findContainerForShortcut } from "./utils/dashboardHelpers";
import type { Section, Shortcut } from "./types";

function App() {
  // ==================== View State ====================
  const [view, setView] = useState<"dashboard" | "add">("dashboard");
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Docker warning state
  const [dockerWarningDismissed, setDockerWarningDismissed] = useState(false);

  // Migration modal state
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);

  // ==================== Custom Hooks ====================
  const { t } = useTranslation();
  const toast = useToast();
  const { theme, updateTheme } = useTheme();
  const { viewMode, mobileColumns, setViewMode, setMobileColumns } =
    useViewSettings();
  const {
    migrationDismissed,
    isLoaded: migrationSettingsLoaded,
    setMigrationDismissed,
  } = useMigrationSettings();
  const { showInstallPrompt, handleInstallClick } = useInstallPrompt();

  // SWR-based data fetching with automatic revalidation and deduplication
  const {
    shortcuts,
    sections,
    containers,
    hosts,
    tailscaleInfo,
    loading,
    refreshAll,
    mutateShortcuts,
    mutateHosts,
    updateShortcutsOptimistic,
    updateSectionsOptimistic,
  } = useDashboardSWR();

  const modals = useModals();

  // ==================== Action Hooks Configuration ====================
  // Memoize action hook options to prevent unnecessary re-initialization
  const shortcutActionsOptions = useMemo(
    () => ({
      onRefresh: refreshAll,
      onError: (title: string, message: string) => toast.error(title, message),
      applyOptimistic: updateShortcutsOptimistic,
      showDeleteConfirm: (onConfirm: () => Promise<void>) => {
        modals.showConfirm(
          t("modals.confirm.deleteShortcut"),
          t("modals.confirm.deleteShortcutMessage"),
          onConfirm,
        );
      },
    }),
    [refreshAll, updateShortcutsOptimistic, modals, t, toast],
  );

  const sectionActionsOptions = useMemo(
    () => ({
      onRefresh: refreshAll,
      onError: (title: string, message: string) => toast.error(title, message),
      applyOptimistic: updateSectionsOptimistic,
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
    [refreshAll, updateSectionsOptimistic, modals, t, toast],
  );

  // ==================== Action Hooks ====================
  const containerActions = useContainerActions(refreshAll);

  const shortcutActions = useShortcutActions(shortcutActionsOptions, shortcuts);
  const sectionActions = useSectionActions(sectionActionsOptions);

  // The shortcut modal has already written its changes, so only the shortcut
  // list can be stale. Refetching containers and Tailscale too was most of the
  // wait the user saw after saving an edit.
  const handleShortcutSaved = useCallback(() => {
    mutateShortcuts();
  }, [mutateShortcuts]);

  // Entering reorder mode drops any active filter: the drag lists are seeded
  // from the visible set, so reordering a filtered subset would write back
  // positions computed against the wrong list.
  const handleEditModeChange = useCallback((mode: boolean) => {
    if (mode) {
      setSearchQuery("");
    }
    setIsEditMode(mode);
  }, []);

  // ==================== Migration Handler ====================
  // Opens the migration modal to preview and apply icon updates
  const handleMigration = useCallback(() => {
    // Open the migration modal - it will load previews automatically
    setMigrationModalOpen(true);
  }, []);

  // Handle migration confirmation with selected shortcuts and custom URLs
  const handleMigrationConfirm = useCallback(
    async (updates: Array<{ id: number; icon_url: string }>) => {
      setMigrationModalOpen(false);
      // Mark migration as dismissed so it doesn't auto-show again
      setMigrationDismissed(true);

      if (updates.length === 0) {
        return;
      }

      try {
        const migrationResult = await shortcutsApi.migrateIcons(updates);

        // Check if migration was successful
        if (migrationResult.success === false) {
          toast.error(
            t("modals.migration.failedTitle"),
            migrationResult.message || t("modals.migration.failedMessage"),
          );
          return;
        }

        // Refresh data to show updated icons
        await refreshAll();

        // Show success message
        toast.success(
          t("modals.migration.completeTitle"),
          migrationResult.message,
        );
      } catch (error) {
        console.error("Migration failed:", error);
        toast.error(
          t("modals.migration.failedTitle"),
          t("modals.migration.failedRetry"),
        );
      }
    },
    [toast, refreshAll, setMigrationDismissed, t],
  );

  // Handle migration cancel
  const handleMigrationCancel = useCallback(() => {
    setMigrationModalOpen(false);
    // Mark migration as dismissed so it doesn't auto-show again
    setMigrationDismissed(true);
  }, [setMigrationDismissed]);

  // Import replaces every shortcut and section, so it is confirmed first. The
  // server writes its own backup before applying it.
  const handleImport = useCallback(
    (payload: unknown, fileName: string) => {
      modals.showConfirm(
        t("data.confirmImportTitle"),
        t("data.confirmImportMessage", { file: fileName }),
        async () => {
          try {
            const result = await dataApi.importData(payload);
            await refreshAll();
            toast.success(t("data.importComplete"), result.message);
          } catch (error) {
            console.error("Import failed:", error);
            toast.error(t("data.importFailed"), t("data.importFailedMessage"));
          }
        },
      );
    },
    [modals, t, toast, refreshAll],
  );

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
    // SWR will automatically fetch data, so we only need to run auto-sync
    const runStartupTasks = async () => {
      try {
        // Run auto-sync - SWR will automatically fetch containers in parallel
        console.log("Running auto-sync...");
        const syncResult = await shortcutsApi.autoSync();
        console.log("Auto-sync completed:", syncResult);

        // Refresh SWR data to show all shortcuts (depends on autoSync completing)
        await refreshAll();

        // Check if migration is needed (only if Docker is running)
        // SWR has already fetched containers, so we can use them directly
        const isDockerRunning = containers.length > 0;

        if (isDockerRunning && !migrationDismissed) {
          const migrationCheck = await shortcutsApi.checkMigration();
          if (migrationCheck.needsMigration) {
            console.log(
              `Migration needed for ${migrationCheck.count} shortcut(s)`,
            );

            // Open migration modal - it will load previews automatically
            setMigrationModalOpen(true);
          }
        }
      } catch (error) {
        console.error("Startup tasks failed:", error);
        // SWR will automatically retry failed requests
      }
    };

    runStartupTasks();
  }, [
    refreshAll,
    containers,
    migrationDismissed,
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
    (hostId: number, id: string) => {
      containerActions.handleStart(hostId, id);
    },
    [containerActions],
  );

  const handleStop = useCallback(
    (hostId: number, id: string) => {
      containerActions.handleStop(hostId, id, (onConfirm) => {
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
    (hostId: number, id: string) => {
      containerActions.handleRestart(hostId, id);
    },
    [containerActions],
  );

  // ==================== Server Handlers ====================
  /**
   * Adding, editing or removing a server changes which containers exist, so
   * the whole dashboard is refetched rather than only the server list.
   *
   * The server list is then read a second time, on purpose: reading the
   * containers is what discovers whether a server answers, and a list fetched
   * in parallel with it would still say "not read yet" about the server that
   * was just added - for up to a polling interval.
   */
  const handleHostsChanged = useCallback(async () => {
    // A server that was just added has containers with no shortcuts yet, and
    // waiting for the next page load to notice is a poor first impression. The
    // backend reuses a recent sweep, so calling this after a change that needs
    // no sweep - the agent toggle, a colour - costs nothing.
    try {
      await shortcutsApi.autoSync();
    } catch (err) {
      console.warn("Auto-sync after a server change failed:", err);
    }
    await refreshAll();
    await mutateHosts();
  }, [mutateHosts, refreshAll]);

  // Removing a server and replacing its key are both one-way, so both ask
  // first. The title is generic because the message says which one it is.
  const showHostConfirm = useCallback(
    (message: string, onConfirm: () => Promise<void>) => {
      modals.showConfirm(t("hosts.confirmTitle"), message, onConfirm);
    },
    [modals, t],
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
  // The dashboard is the favourites board, in reorder mode as much as outside
  // it: reordering a list that also holds every non-favourite meant arranging
  // items that vanish as soon as reorder mode ends. Favourites are starred from
  // the "Accesos" screen, which shows the star without needing reorder mode.
  const searchTerms = useMemo(() => parseQuery(searchQuery), [searchQuery]);

  const dashboardShortcuts = useMemo(() => {
    const favorites = shortcuts.filter((s) => s.is_favorite);

    // Search is off during edit mode; see the note on the Header's SearchInput.
    if (isEditMode || searchTerms.length === 0) {
      return favorites;
    }

    return favorites.filter((s) =>
      matchesShortcut(s, findContainerForShortcut(s, containers), searchTerms),
    );
  }, [shortcuts, isEditMode, searchTerms, containers]);

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
        setIsEditMode={handleEditModeChange}
        viewMode={viewMode}
        mobileColumns={mobileColumns}
        onViewModeChange={setViewMode}
        onMobileColumnsChange={setMobileColumns}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Docker Not Running Warning */}
      {!loading &&
        !dockerWarningDismissed &&
        containers.length === 0 &&
        shortcuts.some((s) => s.container_name || s.container_match_name) && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 px-4 py-3 mx-6 mt-4 rounded-lg">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-yellow-400 flex-shrink-0"
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
                  <strong>{t("dashboard.dockerNotRunning")}</strong>{" "}
                  {t("dashboard.dockerNotRunningHint")}
                </span>
              </div>
              <button
                onClick={() => setDockerWarningDismissed(true)}
                className="text-yellow-400 hover:text-yellow-300 transition-colors flex-shrink-0"
                aria-label={t("common.dismiss")}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

      <main className="container mx-auto px-6 py-8">
        {/* Scoped to the views: a card that throws leaves the header, the
            search and the navigation working, so there is somewhere to go. */}
        <ErrorBoundary label="view">
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
              searchQuery={searchQuery}
            />
          ) : (
            <ManagementView
              containers={containers}
              shortcuts={shortcuts}
              hosts={hosts}
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
              searchQuery={searchQuery}
              onHostsChanged={handleHostsChanged}
              onError={(title: string, message: string) =>
                toast.error(title, message)
              }
              showHostConfirm={showHostConfirm}
            />
          )}
        </AnimatePresence>
        </ErrorBoundary>
      </main>

      <Footer
        currentTheme={theme}
        onThemeChange={updateTheme}
        onMigrate={handleMigration}
        onImport={handleImport}
        onImportError={(title, message) => toast.error(title, message)}
      />

      <AnimatePresence>
        {modals.shortcutModal.isOpen && (
          <Suspense fallback={null}>
            <ShortcutModal
              isOpen={modals.shortcutModal.isOpen}
              shortcut={modals.shortcutModal.shortcut}
              containers={containers}
              hosts={hosts}
              tailscaleInfo={tailscaleInfo}
              onSave={handleShortcutSaved}
              onClose={modals.closeShortcutModal}
              onError={(title: string, message: string) =>
                toast.error(title, message)
              }
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

      <MigrationModal
        isOpen={migrationModalOpen}
        shortcuts={[]} // No longer used - modal loads its own data
        onConfirm={handleMigrationConfirm}
        onCancel={handleMigrationCancel}
      />

      {/* AI Chat Interface - loaded on its own chunk, it is not needed to paint the dashboard */}
      <Suspense fallback={null}>
        <AIChat />
      </Suspense>
    </div>
  );
}

export default App;
