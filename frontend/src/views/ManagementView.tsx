import { motion } from "framer-motion";
import { Plus, ArrowLeft, Link as LinkIcon, Server } from "lucide-react";
import { ShortcutCard, ContainerCard } from "../components";
import type { DockerContainer, Shortcut } from "../types";

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
