import { motion } from "framer-motion";
import {
    Plus,
    Bookmark,
    Edit2,
    Trash2,
    ChevronDown,
    ChevronRight,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useDragAndDrop } from "@formkit/drag-and-drop/react";
import { animations } from "@formkit/drag-and-drop";

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
    Section,
    TailscaleInfo,
    ViewMode,
    MobileColumns,
} from "../types";

interface TailscaleInfoExtended extends TailscaleInfo {
    available: boolean;
}

// Type for pending changes during edit mode
interface PendingChange {
    type: 'reorder' | 'move';
    shortcutId: number;
    sectionId: number | null;
    position: number;
}

// Ref handle for DashboardView to expose save function
export interface DashboardViewHandle {
    getPendingChanges: () => PendingChange[];
    clearPendingChanges: () => void;
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
function getGridLayoutClasses(viewMode: ViewMode, mobileColumns: MobileColumns): string {
    const mobileClass = mobileColumns === 1 ? "grid-cols-1" : "grid-cols-2";

    switch (viewMode) {
        case "compact":
            return `grid ${mobileClass} md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`;
        case "icon":
            return `grid ${mobileClass} md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3`;
        case "list":
            return `grid grid-cols-1 gap-3`;
        case "table":
            return `grid grid-cols-1 gap-2`;
        default:
            return `grid ${mobileClass} md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6`;
    }
}

/**
 * Get minimum height for section content area based on view mode
 * This ensures empty sections in edit mode have enough space for drag-and-drop
 */
function getMinHeightForViewMode(viewMode: ViewMode): string {
    switch (viewMode) {
        case "compact":
            return "4rem"; // ~64px - compact card height
        case "icon":
            return "8rem"; // ~128px - icon card is square aspect ratio
        case "list":
            return "4.5rem"; // ~72px - list card height
        case "table":
            return "3.5rem"; // ~56px - table row height
        default:
            return "8rem"; // ~128px - default card height (desktop horizontal layout)
    }
}

/**
 * Edit mode banner with section creation button
 */
function EditModeBanner({ handleCreateSection }: { handleCreateSection: () => void }) {
    return (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-3 mb-3">
                <Edit2 className="w-5 h-5 text-blue-400" />
                <div className="flex-1">
                    <h3 className="text-blue-400 font-semibold text-sm">
                        Edit Mode Active
                    </h3>
                    <p className="text-slate-400 text-xs mt-0.5">
                        Drag and drop shortcuts to reorder or move between sections.
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
    );
}

/**
 * Empty state component when no favorites exist
 */
function EmptyDashboardState({ setView }: { setView: (view: "dashboard" | "add") => void }) {
    return (
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
    );
}

/**
 * Section block component with header and shortcuts
 */
interface SectionBlockProps {
    section: Section;
    shortcuts: Shortcut[];
    isEditMode: boolean;
    gridClasses: string;
    minHeight: string;
    handleToggleSection: (sectionId: number, isCollapsed: boolean) => void;
    handleEditSection: (section: Section) => void;
    handleDeleteSection: (sectionId: number, sectionName: string) => void;
    renderShortcutCard: (shortcut: Shortcut) => React.ReactElement;
    onShortcutMoved: (shortcutId: number, sectionId: number | null, position: number) => void;
}

function SectionBlock({
    section,
    shortcuts,
    isEditMode,
    gridClasses,
    minHeight,
    handleToggleSection,
    handleEditSection,
    handleDeleteSection,
    renderShortcutCard,
    onShortcutMoved,
}: SectionBlockProps) {
    // Don't render empty sections unless in edit mode
    if (shortcuts.length === 0 && !isEditMode) return null;

    // In edit mode, always show content (ignore collapsed state)
    const shouldShowContent = isEditMode || !section.is_collapsed;

    // Setup FormKit drag-and-drop for this section
    const [parent, list, setList] = useDragAndDrop<HTMLDivElement, Shortcut>(
        shortcuts,
        {
            disabled: !isEditMode,
            group: "shortcuts",
            plugins: [animations()],
        }
    );

    // Track the previous list to detect changes
    const prevListRef = useRef<Shortcut[]>(shortcuts);

    // Sync props to FormKit's internal state when shortcuts change from parent
    useEffect(() => {
        setList(shortcuts);
        prevListRef.current = shortcuts;
    }, [shortcuts, setList]);

    // Detect changes in FormKit's list and report them
    useEffect(() => {
        // Check if there are any differences
        const hasChanges = list.length !== prevListRef.current.length ||
            list.some((s, i) => prevListRef.current[i]?.id !== s.id);

        if (hasChanges && isEditMode) {
            // Record position for all items currently in this section
            list.forEach((shortcut, index) => {
                onShortcutMoved(shortcut.id, section.id, index);
            });

            prevListRef.current = [...list];
        }
    }, [list, isEditMode, section.id, onShortcutMoved]);

    return (
        <div className="space-y-4">
            {/* Section Header */}
            <div className="flex items-center gap-3 group">
                {isEditMode ? (
                    // In edit mode: just show the section name without collapse button
                    <h2 className="text-lg font-semibold text-white">
                        {section.name}
                    </h2>
                ) : (
                    // Normal mode: show collapse button
                    <button
                        onClick={() => handleToggleSection(section.id, section.is_collapsed)}
                        className="flex items-center gap-2 text-lg font-semibold text-white hover:text-blue-400 transition-colors"
                    >
                        {section.is_collapsed ? (
                            <ChevronRight className="w-5 h-5" />
                        ) : (
                            <ChevronDown className="w-5 h-5" />
                        )}
                        {section.name}
                    </button>
                )}
                <span className="text-sm text-slate-500">
                    ({shortcuts.length})
                </span>
                {isEditMode && (
                    <div className="flex items-center gap-2 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => handleEditSection(section)}
                            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                            title="Edit section"
                        >
                            <Edit2 className="w-4 h-4 text-slate-400 hover:text-blue-400" />
                        </button>
                        <button
                            onClick={() => handleDeleteSection(section.id, section.name)}
                            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                            title="Delete section"
                        >
                            <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400" />
                        </button>
                    </div>
                )}
            </div>

            {/* Section Content */}
            {shouldShowContent && (
                <div
                    ref={parent}
                    className={`${gridClasses} ${
                        isEditMode
                            ? `border-2 border-blue-500/30 bg-blue-500/5 rounded-xl transition-all ${
                                list.length === 0 ? "p-8" : "p-4"
                            }`
                            : ""
                    }`}
                    style={isEditMode ? { minHeight } : undefined}
                >
                    {list.length === 0 && isEditMode ? (
                        <div className="col-span-full flex items-center justify-center text-slate-500 text-sm italic">
                            Drag items here to reorganize
                        </div>
                    ) : (
                        list.map((shortcut) => (
                            <div key={shortcut.id}>{renderShortcutCard(shortcut)}</div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
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
    const CardComponent = getCardComponentForViewMode(viewMode);
    const gridClasses = getGridLayoutClasses(viewMode, mobileColumns);

    // Track pending changes during edit mode
    const pendingChangesRef = useRef<Map<number, PendingChange>>(new Map());

    // Handler for when a shortcut is moved/reordered (memoized to prevent useEffect re-runs)
    const handleShortcutMoved = useCallback((shortcutId: number, sectionId: number | null, position: number) => {
        pendingChangesRef.current.set(shortcutId, {
            type: 'move',
            shortcutId,
            sectionId,
            position,
        });
    }, []);

    // When edit mode is turned off, save all pending changes
    const prevIsEditMode = useRef(isEditMode);
    useEffect(() => {
        if (prevIsEditMode.current && !isEditMode) {
            // Edit mode was just turned off - save changes
            const changes = Array.from(pendingChangesRef.current.values());
            if (changes.length > 0) {
                onSaveChanges(changes).then(() => {
                    pendingChangesRef.current.clear();
                });
            }
        }
        prevIsEditMode.current = isEditMode;
    }, [isEditMode, onSaveChanges]);

    // Setup FormKit drag-and-drop for unsectioned shortcuts
    const [unsectionedParent, unsectionedList, setUnsectionedList] = useDragAndDrop<HTMLDivElement, Shortcut>(
        unsectionedShortcuts,
        {
            disabled: !isEditMode,
            group: "shortcuts",
            plugins: [animations()],
        }
    );

    // Track the previous unsectioned list to detect changes
    const prevUnsectionedListRef = useRef<Shortcut[]>(unsectionedShortcuts);

    // Sync props to FormKit's internal state when unsectionedShortcuts change from parent
    useEffect(() => {
        setUnsectionedList(unsectionedShortcuts);
        prevUnsectionedListRef.current = unsectionedShortcuts;
    }, [unsectionedShortcuts, setUnsectionedList]);

    // Detect changes in FormKit's unsectioned list and report them
    useEffect(() => {
        // Check if there are any differences
        const hasChanges = unsectionedList.length !== prevUnsectionedListRef.current.length ||
            unsectionedList.some((s, i) => prevUnsectionedListRef.current[i]?.id !== s.id);

        if (hasChanges && isEditMode) {
            // Record position for all items currently in unsectioned area
            unsectionedList.forEach((shortcut, index) => {
                handleShortcutMoved(shortcut.id, null, index);
            });

            prevUnsectionedListRef.current = [...unsectionedList];
        }
    }, [unsectionedList, isEditMode, handleShortcutMoved]);

    /**
     * Render a single shortcut card with all necessary props
     */
    const renderShortcutCard = (shortcut: Shortcut) => {
        const container = shortcut.container_id
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
                onToggleFavorite={() => handleToggleFavorite(shortcut.id, shortcut.is_favorite)}
                isEditMode={isEditMode}
            />
        );
    };

    const hasNoFavorites = dashboardShortcuts.length === 0 && !loading;
    const showEditModeBanner = isEditMode && dashboardShortcuts.length > 0;
    const showUnsectionedWithHeader = (unsectionedShortcuts.length > 0 || (isEditMode && sections.length > 0)) && sections.length > 0;
    const showUnsectionedWithoutHeader = unsectionedShortcuts.length > 0 && sections.length === 0;

    return (
        <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
        >
            {/* Edit Mode Banner */}
            {showEditModeBanner && <EditModeBanner handleCreateSection={handleCreateSection} />}

            {hasNoFavorites ? (
                <EmptyDashboardState setView={setView} />
            ) : (
                <div className="space-y-8">
                    {/* Unsectioned Shortcuts */}
                    {showUnsectionedWithHeader && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <h2 className="text-lg font-semibold text-slate-400">
                                    No Section
                                </h2>
                                <span className="text-sm text-slate-500">
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
                                style={isEditMode ? { minHeight: getMinHeightForViewMode(viewMode) } : undefined}
                            >
                                {unsectionedList.length === 0 && isEditMode ? (
                                    <div className="col-span-full flex items-center justify-center text-slate-500 text-sm italic">
                                        Drag items here to reorganize
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
                            style={isEditMode ? { minHeight: getMinHeightForViewMode(viewMode) } : undefined}
                        >
                            {unsectionedList.length === 0 && isEditMode ? (
                                <div className="col-span-full flex items-center justify-center text-slate-500 text-sm italic">
                                    Drag items here to reorganize
                                </div>
                            ) : (
                                unsectionedList.map((shortcut) => (
                                    <div key={shortcut.id}>{renderShortcutCard(shortcut)}</div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Sectioned Shortcuts */}
                    {sections.map((section) => (
                        <SectionBlock
                            key={section.id}
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
                        />
                    ))}
                </div>
            )}
        </motion.div>
    );
}
