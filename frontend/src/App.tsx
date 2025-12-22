import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Plus,
  ArrowLeft,
  Bookmark,
  Link as LinkIcon,
  GripVertical,
  Edit3,
  LayoutDashboard,
  Layers,
  Download,
  Server,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import {
  ShortcutCard,
  SortableShortcutCard,
  SortableSection,
  DroppableSection,
  SectionDropZone,
  ConfirmModal,
  ErrorModal,
  ShortcutModal,
  SectionModal,
  ContainerCard,
} from "./components";
import { API_BASE } from "./constants/api";
import type {
  DockerContainer,
  Shortcut,
  Section,
  TailscaleInfo,
} from "./types";

interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: (() => void) | null;
  type: "danger" | "warning";
}

// Header Component
interface HeaderProps {
  view: "dashboard" | "add";
  setView: (view: "dashboard" | "add") => void;
  showInstallPrompt: boolean;
  handleInstallClick: () => void;
  isEditMode: boolean;
  setIsEditMode: (mode: boolean) => void;
}

function Header({
  view,
  setView,
  showInstallPrompt,
  handleInstallClick,
  isEditMode,
  setIsEditMode,
}: HeaderProps) {
  return (
    <header className="bg-slate-900/50 backdrop-blur-md border-b border-white/5 sticky top-0 z-40">
      <div className="container mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        <button
          onClick={() => setView("dashboard")}
          className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity cursor-pointer"
        >
          <div className="bg-blue-600 p-1.5 sm:p-2 rounded-lg">
            <img
              src="/dockericon.png"
              alt="Docker"
              className="w-4 h-4 sm:w-5 sm:h-5"
            />
          </div>
          <h1 className="text-sm sm:text-base md:text-xl font-bold tracking-tight text-white">
            Docker<span className="text-blue-500">Dash</span>
          </h1>
        </button>
        <div className="flex items-center gap-1 sm:gap-2 md:gap-4">
          {showInstallPrompt && (
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white"
              title="Install DockerDash"
            >
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">Install</span>
            </button>
          )}
          <button
            onClick={() => setView("dashboard")}
            className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg ${
              view === "dashboard"
                ? "text-blue-400 bg-blue-500/10"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
          <button
            onClick={() => setView("add")}
            className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg ${
              view === "add"
                ? "text-blue-400 bg-blue-500/10"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span className="hidden sm:inline">Management</span>
          </button>
          {view === "dashboard" && (
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg ${
                isEditMode
                  ? "text-green-400 bg-green-500/10"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
              title={isEditMode ? "Done Editing" : "Edit Dashboard"}
            >
              <Edit3 className="w-4 h-4" />
              <span className="hidden sm:inline">
                {isEditMode ? "Done" : "Edit"}
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

interface ErrorModalState {
  isOpen: boolean;
  title: string;
  message: string;
}

interface SectionModalState {
  isOpen: boolean;
  section: Section | null;
}

interface TailscaleInfoExtended extends TailscaleInfo {
  available: boolean;
}

// DashboardView Component
interface DashboardViewProps {
  isEditMode: boolean;
  dashboardShortcuts: Shortcut[];
  unsectionedShortcuts: Shortcut[];
  sections: Section[];
  shortcutsBySection: Record<number, Shortcut[]>;
  containers: DockerContainer[];
  tailscaleInfo: TailscaleInfoExtended;
  sensors: ReturnType<typeof useSensors>;
  customCollisionDetection: (args: any) => any;
  activeId: number | null;
  shortcuts: Shortcut[];
  loading: boolean;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragOver: (event: DragOverEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleDragCancel: () => void;
  handleCreateSection: () => void;
  handleEditSection: (section: Section) => void;
  handleDeleteSection: (sectionId: number, sectionName: string) => void;
  handleToggleSection: (sectionId: number, isCollapsed: boolean) => void;
  openEditModal: (shortcut: Shortcut) => void;
  handleDelete: (id: number) => void;
  handleStart: (id: string) => void;
  handleStop: (id: string) => void;
  handleRestart: (id: string) => void;
  handleToggleFavorite: (id: number, currentStatus: boolean | number) => void;
  setView: (view: "dashboard" | "add") => void;
}

function DashboardView({
  isEditMode,
  dashboardShortcuts,
  unsectionedShortcuts,
  sections,
  shortcutsBySection,
  containers,
  tailscaleInfo,
  sensors,
  customCollisionDetection,
  activeId,
  shortcuts,
  loading,
  handleDragStart,
  handleDragOver,
  handleDragEnd,
  handleDragCancel,
  handleCreateSection,
  handleEditSection,
  handleDeleteSection,
  handleToggleSection,
  openEditModal,
  handleDelete,
  handleStart,
  handleStop,
  handleRestart,
  handleToggleFavorite,
  setView,
}: DashboardViewProps) {
  const renderShortcutCard = (s: Shortcut, isEditModeActive: boolean) => {
    const container = s.container_id
      ? containers.find((c) => c.id === s.container_id)
      : null;
    const CardComponent = isEditModeActive
      ? SortableShortcutCard
      : ShortcutCard;

    return (
      <CardComponent
        key={s.id}
        shortcut={s}
        container={container || null}
        tailscaleIP={tailscaleInfo.ip}
        onEdit={() => openEditModal(s)}
        onDelete={() => handleDelete(s.id)}
        onStart={() => handleStart(s.container_id!)}
        onStop={() => handleStop(s.container_id!)}
        onRestart={() => handleRestart(s.container_id!)}
        onToggleFavorite={() => handleToggleFavorite(s.id, s.is_favorite)}
        isEditMode={isEditModeActive}
      />
    );
  };

  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-8"
    >
      {/* Edit Mode Banner */}
      {isEditMode && dashboardShortcuts.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <GripVertical className="w-5 h-5 text-blue-400" />
            <div className="flex-1">
              <h3 className="text-blue-400 font-semibold text-sm">
                Edit Mode Active
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">
                Drag and drop cards to reorder. Create sections to organize your
                dashboard.
              </p>
            </div>
          </div>
          <button
            onClick={handleCreateSection}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-blue-400 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Section
          </button>
        </div>
      )}

      {dashboardShortcuts.length === 0 && !loading ? (
        <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-3xl bg-white/[0.02]">
          <div className="bg-slate-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Bookmark className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-white">
            No favorites found
          </h3>
          <p className="text-slate-400 mt-2 mb-6">
            Star your containers or URLs in the management page to see them
            here.
          </p>
          <button
            onClick={() => setView("add")}
            className="text-blue-400 hover:text-blue-300 font-medium underline underline-offset-4"
          >
            Manage your shortcuts
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={customCollisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={dashboardShortcuts.map((s) => s.id)}
            strategy={rectSortingStrategy}
          >
            <div className="space-y-8">
              {/* Unsectioned Shortcuts */}
              {(unsectionedShortcuts.length > 0 || isEditMode) &&
                sections.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold text-slate-400">
                        No Section
                      </h2>
                      <span className="text-sm text-slate-500">
                        ({unsectionedShortcuts.length})
                      </span>
                    </div>
                    <DroppableSection
                      sectionId={null}
                      isActive={isEditMode && !!activeId}
                    >
                      {unsectionedShortcuts.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {unsectionedShortcuts.map((s) =>
                            renderShortcutCard(s, isEditMode)
                          )}
                        </div>
                      ) : (
                        <SectionDropZone
                          sectionId={null}
                          isActive={!!activeId}
                        />
                      )}
                    </DroppableSection>
                  </div>
                )}

              {/* Unsectioned without header if no sections */}
              {unsectionedShortcuts.length > 0 && sections.length === 0 && (
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {unsectionedShortcuts.map((s) =>
                    renderShortcutCard(s, isEditMode)
                  )}
                </div>
              )}

              {/* Sectioned Shortcuts */}
              <SortableContext
                items={sections.map((s) => `section-sort-${s.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {sections.map((section) => {
                  const sectionShortcuts = shortcutsBySection[section.id] || [];
                  if (sectionShortcuts.length === 0 && !isEditMode) return null;

                  return (
                    <SortableSection
                      key={section.id}
                      section={section}
                      shortcutCount={sectionShortcuts.length}
                      isEditMode={isEditMode}
                      onToggle={() =>
                        handleToggleSection(section.id, section.is_collapsed)
                      }
                      onEdit={() => handleEditSection(section)}
                      onDelete={() =>
                        handleDeleteSection(section.id, section.name)
                      }
                    >
                      {!section.is_collapsed && (
                        <DroppableSection
                          sectionId={section.id}
                          isActive={isEditMode && !!activeId}
                        >
                          {sectionShortcuts.length > 0 ? (
                            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                              {sectionShortcuts.map((s) =>
                                renderShortcutCard(s, isEditMode)
                              )}
                            </div>
                          ) : (
                            <SectionDropZone
                              sectionId={section.id}
                              isActive={!!activeId}
                            />
                          )}
                        </DroppableSection>
                      )}
                    </SortableSection>
                  );
                })}
              </SortableContext>
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeId ? (
              <div className="opacity-90 scale-105 rotate-3 shadow-2xl">
                <ShortcutCard
                  shortcut={shortcuts.find((s) => s.id === activeId)!}
                  container={
                    shortcuts.find((s) => s.id === activeId)?.container_id
                      ? containers.find(
                          (c) =>
                            c.id ===
                            shortcuts.find((s) => s.id === activeId)
                              ?.container_id
                        ) || null
                      : null
                  }
                  tailscaleIP={tailscaleInfo.ip}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onStart={() => {}}
                  onStop={() => {}}
                  onRestart={() => {}}
                  onToggleFavorite={() => {}}
                  isEditMode={false}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </motion.div>
  );
}

// ManagementView Component
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
  handleQuickAdd: (container: DockerContainer) => void;
  handleToggleFavorite: (id: number, currentStatus: boolean | number) => void;
}

function ManagementView({
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
  handleQuickAdd,
  handleToggleFavorite,
}: ManagementViewProps) {
  const customShortcuts = shortcuts.filter((s) => !s.container_id);

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
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <LinkIcon className="text-blue-500 w-6 h-6" /> Custom Shortcuts
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Manual entries not linked to local containers.
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
            <span className="hidden md:inline">Add Custom</span>
          </button>
        </div>

        {customShortcuts.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
            <LinkIcon className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No custom shortcuts yet.</p>
            <p className="text-slate-500 text-sm mt-1">
              Add URLs that aren't linked to containers.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {customShortcuts.map((s) => (
              <ShortcutCard
                key={s.id}
                shortcut={s}
                container={null}
                tailscaleIP={tailscaleInfo.ip}
                onEdit={() => openEditModal(s)}
                onDelete={() => handleDelete(s.id)}
                onToggleFavorite={() =>
                  handleToggleFavorite(s.id, s.is_favorite)
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Docker Containers Section */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Server className="text-green-500 w-6 h-6" /> Docker Containers
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Containers running on your system.
          </p>
        </div>

        {containers.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
            <Server className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No containers found.</p>
            <p className="text-slate-500 text-sm mt-1">
              Start some Docker containers to see them here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {containers.map((container) => {
              const existingShortcut = shortcuts.find(
                (s) => s.container_id === container.id
              );
              const isAdded = !!existingShortcut;
              const isFavorite = existingShortcut?.is_favorite || false;

              return (
                <ContainerCard
                  key={container.id}
                  container={container}
                  isAdded={isAdded}
                  isFavorite={!!isFavorite}
                  onQuickAdd={() => handleQuickAdd(container)}
                  onToggleFavorite={() =>
                    existingShortcut &&
                    handleToggleFavorite(
                      existingShortcut.id,
                      existingShortcut.is_favorite
                    )
                  }
                  onCustomize={() =>
                    existingShortcut
                      ? openEditModal(existingShortcut)
                      : handleQuickAdd(container)
                  }
                  onStart={() => handleStart(container.id)}
                  onStop={() => handleStop(container.id)}
                />
              );
            })}
          </div>
        )}
      </section>
    </motion.div>
  );
}

function App() {
  const [view, setView] = useState<"dashboard" | "add">("dashboard");
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<Shortcut | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: null,
    type: "danger",
  });
  const [errorModal, setErrorModal] = useState<ErrorModalState>({
    isOpen: false,
    title: "",
    message: "",
  });
  const [tailscaleInfo, setTailscaleInfo] = useState<TailscaleInfoExtended>({
    available: false,
    enabled: false,
    ip: null,
  });
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [_activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const [sectionModal, setSectionModal] = useState<SectionModalState>({
    isOpen: false,
    section: null,
  });

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Custom collision detection
  const customCollisionDetection = useCallback((args: any) => {
    // First check for direct pointer collisions
    const pointerCollisions = pointerWithin(args);

    // If we're dragging a section, only allow section-sort collisions
    const activeData = args.active?.data?.current;
    if (activeData?.type === "section-sort") {
      const sectionSortCollisions = pointerCollisions.filter(
        ({ id }: { id: any }) => String(id).startsWith("section-sort-")
      );
      if (sectionSortCollisions.length > 0) {
        return sectionSortCollisions;
      }
      return closestCenter(args);
    }

    // For shortcut dragging, check for shortcut collisions first (for reordering within same section)
    const shortcutCollisions = pointerCollisions.filter(
      ({ id }: { id: any }) =>
        !String(id).startsWith("section-") &&
        !String(id).startsWith("section-sort-")
    );

    if (shortcutCollisions.length > 0) {
      return shortcutCollisions;
    }

    // Then check for section droppable collisions (for moving between sections)
    const sectionCollisions = pointerCollisions.filter(
      ({ id }: { id: any }) =>
        String(id).startsWith("section-") &&
        !String(id).startsWith("section-sort-")
    );

    if (sectionCollisions.length > 0) {
      return sectionCollisions;
    }

    // Fallback to closest center for any remaining cases
    return closestCenter(args);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [shortcutsRes, containersRes, sectionsRes] = await Promise.all([
        axios.get(`${API_BASE}/shortcuts`),
        axios.get(`${API_BASE}/containers`),
        axios.get(`${API_BASE}/sections`),
      ]);
      setShortcuts(shortcutsRes.data);
      setContainers(containersRes.data);
      setSections(sectionsRes.data);

      if (shortcutsRes.data.length === 0 && view === "dashboard") {
        setView("add");
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
    } finally {
      setLoading(false);
    }
  }, [view]);

  const fetchTailscaleInfo = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/tailscale`);
      setTailscaleInfo(res.data);
    } catch (err) {
      console.error("Failed to fetch Tailscale info", err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchTailscaleInfo();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
    };
  }, [fetchData, fetchTailscaleInfo]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowInstallPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleStart = async (id: string) => {
    try {
      await axios.post(`${API_BASE}/containers/${id}/start`);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStop = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Stop Container",
      message:
        "Are you sure you want to stop this container? This will terminate all active processes.",
      type: "danger",
      onConfirm: async () => {
        try {
          await axios.post(`${API_BASE}/containers/${id}/stop`);
          fetchData();
        } catch (err) {
          console.error(err);
        }
      },
    });
  };

  const handleRestart = async (id: string) => {
    try {
      await axios.post(`${API_BASE}/containers/${id}/restart`);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Shortcut",
      message:
        "Are you sure you want to delete this shortcut? This action cannot be undone.",
      type: "danger",
      onConfirm: async () => {
        try {
          await axios.delete(`${API_BASE}/shortcuts/${id}`);
          fetchData();
        } catch (err) {
          console.error(err);
        }
      },
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const activeData = (event.active as any).data?.current;
    if (activeData?.type === "section-sort") {
      setActiveSectionId(activeData.sectionId);
      setActiveId(null);
    } else {
      setActiveId(event.active.id as number);
      setActiveSectionId(null);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Skip if dragging a section
    const activeData = (active as any).data?.current;
    if (activeData?.type === "section-sort") {
      // Handle section reorder preview
      const overData = (over as any).data?.current;
      if (overData?.type === "section-sort") {
        const oldIndex = sections.findIndex(
          (s) => s.id === activeData.sectionId
        );
        const newIndex = sections.findIndex((s) => s.id === overData.sectionId);
        if (oldIndex !== newIndex) {
          setSections(arrayMove(sections, oldIndex, newIndex));
        }
      }
      return;
    }

    const activeShortcut = shortcuts.find((s) => s.id === active.id);
    if (!activeShortcut) return;

    // Check if dragging over a section droppable
    const overData = (over as any).data?.current;
    if (overData?.type === "section") {
      // Dragging over an empty section area - no preview needed, handled in dragEnd
      return;
    }

    const overShortcut = shortcuts.find((s) => s.id === over.id);
    if (overShortcut) {
      const activeSectionIdVal = activeShortcut.section_id;
      const overSectionId = overShortcut.section_id;
      const isSameSection =
        (activeSectionIdVal === null && overSectionId === null) ||
        activeSectionIdVal === overSectionId;

      if (isSameSection) {
        // Same section - reorder within section
        const oldIndex = shortcuts.findIndex((s) => s.id === active.id);
        const newIndex = shortcuts.findIndex((s) => s.id === over.id);
        setShortcuts(arrayMove(shortcuts, oldIndex, newIndex));
      }
      // Different section - don't do live preview, just handle in dragEnd
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveSectionId(null);
    if (!over) return;

    // Handle section drag end
    const activeData = (active as any).data?.current;
    if (activeData?.type === "section-sort") {
      // Always save the current section order when a section drag ends
      try {
        const reorderedSections = sections.map((s, index) => ({
          id: s.id,
          position: index,
        }));
        await axios.put(`${API_BASE}/sections/reorder`, {
          sections: reorderedSections,
        });
      } catch (err) {
        console.error("Failed to reorder sections:", err);
        fetchData();
      }
      return;
    }

    const activeShortcut = shortcuts.find((s) => s.id === active.id);
    if (!activeShortcut) return;

    try {
      if ((over as any).data?.current?.type === "section") {
        const targetSectionId = (over as any).data.current.sectionId;
        const currentSectionId = activeShortcut.section_id;
        const isSameSection =
          (currentSectionId === null && targetSectionId === null) ||
          currentSectionId === targetSectionId;

        if (!isSameSection) {
          // Update local state first
          setShortcuts((prev) =>
            prev.map((s) =>
              s.id === active.id ? { ...s, section_id: targetSectionId } : s
            )
          );
          await axios.put(`${API_BASE}/shortcuts/${active.id}/section`, {
            section_id: targetSectionId,
          });
        }
      } else if (active.id !== over.id) {
        const overShortcut = shortcuts.find((s) => s.id === over.id);
        if (!overShortcut) return;

        const currentSectionId = activeShortcut.section_id;
        const targetSectionId = overShortcut.section_id;
        const isSameSection =
          (currentSectionId === null && targetSectionId === null) ||
          currentSectionId === targetSectionId;

        if (!isSameSection) {
          // Update local state first
          setShortcuts((prev) =>
            prev.map((s) =>
              s.id === active.id
                ? { ...s, section_id: overShortcut.section_id }
                : s
            )
          );
          await axios.put(`${API_BASE}/shortcuts/${active.id}/section`, {
            section_id: overShortcut.section_id,
          });
        } else {
          const oldIndex = shortcuts.findIndex((s) => s.id === active.id);
          const newIndex = shortcuts.findIndex((s) => s.id === over.id);
          const reordered = arrayMove(shortcuts, oldIndex, newIndex);
          setShortcuts(reordered);
          const reorderedShortcuts = reordered.map((s, index) => ({
            id: s.id,
            position: index,
          }));
          await axios.put(`${API_BASE}/shortcuts/reorder`, {
            shortcuts: reorderedShortcuts,
          });
        }
      }
    } catch (err) {
      console.error("Failed to save changes:", err);
      fetchData();
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setActiveSectionId(null);
    fetchData();
  };

  // Section management
  const handleCreateSection = () => {
    setSectionModal({ isOpen: true, section: null });
  };

  const handleEditSection = (section: Section) => {
    setSectionModal({ isOpen: true, section });
  };

  const handleSaveSection = async (name: string) => {
    try {
      if (sectionModal.section) {
        await axios.put(`${API_BASE}/sections/${sectionModal.section.id}`, {
          name,
        });
      } else {
        await axios.post(`${API_BASE}/sections`, { name });
      }
      setSectionModal({ isOpen: false, section: null });
      fetchData();
    } catch (err: any) {
      console.error("Failed to save section:", err);
      setErrorModal({
        isOpen: true,
        title: sectionModal.section
          ? "Error Updating Section"
          : "Error Creating Section",
        message: err.response?.data?.error || "Failed to save section",
      });
    }
  };

  const handleDeleteSection = async (
    sectionId: number,
    sectionName: string
  ) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Section",
      message: `Are you sure you want to delete "${sectionName}"? Shortcuts in this section will be moved to "No Section".`,
      type: "danger",
      onConfirm: async () => {
        try {
          await axios.delete(`${API_BASE}/sections/${sectionId}`);
          fetchData();
        } catch (err: any) {
          console.error("Failed to delete section:", err);
          setErrorModal({
            isOpen: true,
            title: "Error Deleting Section",
            message: err.response?.data?.error || "Failed to delete section",
          });
        }
      },
    });
  };

  const handleToggleSection = async (
    sectionId: number,
    isCollapsed: boolean
  ) => {
    try {
      await axios.put(`${API_BASE}/sections/${sectionId}`, {
        is_collapsed: !isCollapsed,
      });
      setSections(
        sections.map((s) =>
          s.id === sectionId ? { ...s, is_collapsed: !isCollapsed } : s
        )
      );
    } catch (err) {
      console.error("Failed to toggle section:", err);
      fetchData();
    }
  };

  const handleQuickAdd = async (container: DockerContainer) => {
    const ports = container.ports.map((p) => p.public).filter(Boolean);
    const port = ports[0] || "";

    const formData = new FormData();
    formData.append("name", container.name);
    if (port) {
      formData.append("port", String(port));
    }
    formData.append("container_id", container.id);
    formData.append("icon", "Server");
    if (container.description?.trim()) {
      formData.append("description", container.description.trim());
    }

    try {
      await axios.post(`${API_BASE}/shortcuts`, formData);
      fetchData();
    } catch (err: any) {
      console.error(err);
      setErrorModal({
        isOpen: true,
        title: "Error Adding Shortcut",
        message: err.response?.data?.error || "Failed to add shortcut",
      });
    }
  };

  const handleToggleFavorite = async (
    id: number,
    currentStatus: boolean | number
  ) => {
    try {
      await axios.post(`${API_BASE}/shortcuts/${id}/favorite`, {
        is_favorite: !currentStatus,
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const openEditModal = (shortcut: Shortcut) => {
    setEditingShortcut(shortcut);
    setIsModalOpen(true);
  };

  const handleError = (title: string, message: string) => {
    setErrorModal({ isOpen: true, title, message });
  };

  // Derived state
  const dashboardShortcuts = shortcuts.filter((s) => s.is_favorite);
  const shortcutsBySection: Record<number, Shortcut[]> = {};
  const unsectionedShortcuts: Shortcut[] = [];

  dashboardShortcuts.forEach((shortcut) => {
    const sectionId = shortcut.section_id;
    if (sectionId != null) {
      if (!shortcutsBySection[sectionId]) {
        shortcutsBySection[sectionId] = [];
      }
      shortcutsBySection[sectionId].push(shortcut);
    } else {
      unsectionedShortcuts.push(shortcut);
    }
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <Header
        view={view}
        setView={setView}
        showInstallPrompt={showInstallPrompt}
        handleInstallClick={handleInstallClick}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
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
              sensors={sensors}
              customCollisionDetection={customCollisionDetection}
              activeId={activeId}
              shortcuts={shortcuts}
              loading={loading}
              handleDragStart={handleDragStart}
              handleDragOver={handleDragOver}
              handleDragEnd={handleDragEnd}
              handleDragCancel={handleDragCancel}
              handleCreateSection={handleCreateSection}
              handleEditSection={handleEditSection}
              handleDeleteSection={handleDeleteSection}
              handleToggleSection={handleToggleSection}
              openEditModal={openEditModal}
              handleDelete={handleDelete}
              handleStart={handleStart}
              handleStop={handleStop}
              handleRestart={handleRestart}
              handleToggleFavorite={handleToggleFavorite}
              setView={setView}
            />
          ) : (
            <ManagementView
              containers={containers}
              shortcuts={shortcuts}
              tailscaleInfo={tailscaleInfo}
              setView={setView}
              setEditingShortcut={setEditingShortcut}
              setIsModalOpen={setIsModalOpen}
              openEditModal={openEditModal}
              handleDelete={handleDelete}
              handleStart={handleStart}
              handleStop={handleStop}
              handleQuickAdd={handleQuickAdd}
              handleToggleFavorite={handleToggleFavorite}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {isModalOpen && (
          <ShortcutModal
            isOpen={isModalOpen}
            shortcut={editingShortcut}
            containers={containers}
            tailscaleInfo={tailscaleInfo}
            onSave={fetchData}
            onClose={() => {
              setIsModalOpen(false);
              setEditingShortcut(null);
            }}
            onError={handleError}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sectionModal.isOpen && (
          <SectionModal
            isOpen={sectionModal.isOpen}
            mode={sectionModal.section ? "edit" : "add"}
            section={sectionModal.section}
            onSave={handleSaveSection}
            onClose={() => setSectionModal({ isOpen: false, section: null })}
          />
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={() => {
          confirmModal.onConfirm?.();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />

      <ErrorModal
        isOpen={errorModal.isOpen}
        message={`${errorModal.title}\n\n${errorModal.message}`}
        onClose={() => setErrorModal({ ...errorModal, isOpen: false })}
      />
    </div>
  );
}

export default App;
