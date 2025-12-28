import { motion } from "framer-motion";
import {
    Plus,
    Bookmark,
    GripVertical,
} from "lucide-react";
import {
    DndContext,
    DragOverlay,
    DragStartEvent,
    DragOverEvent,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    rectSortingStrategy,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import {
    ShortcutCard,
    SortableShortcutCard,
    SortableSection,
    DroppableSection,
    SectionDropZone,
} from "../components";
import type {
    DockerContainer,
    Shortcut,
    Section,
    TailscaleInfo,
} from "../types";

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
    sensors: ReturnType<typeof import("@dnd-kit/core").useSensors>;
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

export function DashboardView({
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

    // Helper to check if section should show drop zone
    const shouldShowDropZone = (shortcuts: Shortcut[]) => {
        // Filter out the currently dragged item
        const visibleShortcuts = shortcuts.filter(s => s.id !== activeId);
        return visibleShortcuts.length === 0;
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
                            {(unsectionedShortcuts.length > 0 || (isEditMode && sections.length > 0)) &&
                                sections.length > 0 && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <h2 className="text-lg font-semibold text-slate-400">
                                                No Section
                                            </h2>
                                            <span className="text-sm text-slate-500">
                                                ({unsectionedShortcuts.filter(s => s.id !== activeId).length})
                                            </span>
                                        </div>
                                        <DroppableSection
                                            sectionId={null}
                                            isActive={isEditMode && !!activeId}
                                        >
                                            {shouldShowDropZone(unsectionedShortcuts) ? (
                                                <SectionDropZone
                                                    sectionId={null}
                                                    isActive={!!activeId}
                                                />
                                            ) : (
                                                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                                    {unsectionedShortcuts
                                                        .filter(s => s.id !== activeId)
                                                        .map((s) => renderShortcutCard(s, isEditMode))
                                                    }
                                                </div>
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
                                                    {shouldShowDropZone(sectionShortcuts) ? (
                                                        <SectionDropZone
                                                            sectionId={section.id}
                                                            isActive={!!activeId}
                                                        />
                                                    ) : (
                                                        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                                            {sectionShortcuts
                                                                .filter(s => s.id !== activeId)
                                                                .map((s) => renderShortcutCard(s, isEditMode))
                                                            }
                                                        </div>
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
                                    onEdit={() => { }}
                                    onDelete={() => { }}
                                    onStart={() => { }}
                                    onStop={() => { }}
                                    onRestart={() => { }}
                                    onToggleFavorite={() => { }}
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
