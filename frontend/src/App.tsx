import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { AnimatePresence } from "framer-motion";

import {
  Header,
  Footer,
  ConfirmModal,
  ErrorModal,
  ShortcutModal,
  SectionModal,
} from "./components";
import { DashboardView, ManagementView } from "./views";
import { API_BASE } from "./constants/api";
import { useTheme } from "./hooks";
import type {
  DockerContainer,
  Shortcut,
  Section,
  ViewMode,
  MobileColumns,
} from "./types";
import type {
  ConfirmModalState,
  ErrorModalState,
  SectionModalState,
  TailscaleInfoExtended,
  ShortcutsBySection,
} from "./appTypes";

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
  const [sectionModal, setSectionModal] = useState<SectionModalState>({
    isOpen: false,
    section: null,
  });
  const [viewMode, setViewMode] = useState<ViewMode>("default");
  const [mobileColumns, setMobileColumns] = useState<MobileColumns>(2);

  // Theme hook
  const { theme, updateTheme } = useTheme();

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
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
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
      message: "Are you sure you want to stop this container? This will terminate all active processes.",
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
      message: "Are you sure you want to delete this shortcut? This action cannot be undone.",
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


  const handleCreateSection = () => {
    setSectionModal({ isOpen: true, section: null });
  };

  const handleEditSection = (section: Section) => {
    setSectionModal({ isOpen: true, section });
  };

  const handleSaveSection = async (name: string) => {
    try {
      if (sectionModal.section) {
        await axios.put(`${API_BASE}/sections/${sectionModal.section.id}`, { name });
      } else {
        await axios.post(`${API_BASE}/sections`, { name });
      }
      setSectionModal({ isOpen: false, section: null });
      fetchData();
    } catch (err: any) {
      console.error("Failed to save section:", err);
      setErrorModal({
        isOpen: true,
        title: sectionModal.section ? "Error Updating Section" : "Error Creating Section",
        message: err.response?.data?.error || "Failed to save section",
      });
    }
  };

  const handleDeleteSection = async (sectionId: number, sectionName: string) => {
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

  const handleToggleSection = async (sectionId: number, isCollapsed: boolean) => {
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
    if (port) formData.append("port", String(port));
    formData.append("container_id", container.id);
    formData.append("icon", "Server");
    // Description is optional - only add if it exists and is not empty
    if (container.description && container.description.trim()) {
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

  const handleToggleFavorite = async (id: number, currentStatus: boolean | number) => {
    try {
      await axios.post(`${API_BASE}/shortcuts/${id}/favorite`, {
        is_favorite: !currentStatus,
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReorderShortcuts = async (reorderedShortcuts: Array<{ id: number; position: number }>) => {
    try {
      await axios.put(`${API_BASE}/shortcuts/reorder`, { shortcuts: reorderedShortcuts });
      // Delay refetch slightly to let FormKit finish its animation
      setTimeout(() => fetchData(), 100);
    } catch (err) {
      console.error("Failed to reorder shortcuts:", err);
      fetchData();
    }
  };

  const handleMoveShortcutToSection = async (shortcutId: number, sectionId: number | null, newPosition: number) => {
    try {
      console.log(`[App] Moving shortcut ${shortcutId} to section ${sectionId} at position ${newPosition}`);
      await axios.put(`${API_BASE}/shortcuts/${shortcutId}/section`, {
        section_id: sectionId,
        position: newPosition
      });
      // Delay refetch slightly to let FormKit finish its animation
      setTimeout(() => fetchData(), 100);
    } catch (err) {
      console.error("Failed to move shortcut to section:", err);
      fetchData();
    }
  };

  const handleReorderSections = async (reorderedSections: Array<{ id: number; position: number }>) => {
    try {
      await axios.put(`${API_BASE}/sections/reorder`, { sections: reorderedSections });
      // Refetch to get the latest state from server
      await fetchData();
    } catch (err) {
      console.error("Failed to reorder sections:", err);
      fetchData();
    }
  };

  const openEditModal = (shortcut: Shortcut) => {
    setEditingShortcut(shortcut);
    setIsModalOpen(true);
  };

  const handleError = (title: string, message: string) => {
    setErrorModal({ isOpen: true, title, message });
  };

  // Compute derived state
  const dashboardShortcuts = shortcuts.filter((s) => s.is_favorite);
  const shortcutsBySection: ShortcutsBySection = {};
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
        currentTheme={theme}
        onThemeChange={updateTheme}
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
              openEditModal={openEditModal}
              handleDelete={handleDelete}
              handleStart={handleStart}
              handleStop={handleStop}
              handleRestart={handleRestart}
              handleToggleFavorite={handleToggleFavorite}
              setView={setView}
              viewMode={viewMode}
              mobileColumns={mobileColumns}
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

      <Footer />

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
