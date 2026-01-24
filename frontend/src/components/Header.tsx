import { Download, LayoutDashboard, Layers, Edit3 } from "lucide-react";
import { ViewSelector } from "./ViewSelector";
import { ThemeSelector } from "./ThemeSelector";
import type { ViewMode, MobileColumns } from "../types";
import type { ThemeColors } from "../types/themeTypes";

interface HeaderProps {
    view: "dashboard" | "add";
    setView: (view: "dashboard" | "add") => void;
    showInstallPrompt: boolean;
    handleInstallClick: () => void;
    isEditMode: boolean;
    setIsEditMode: (mode: boolean) => void;
    viewMode: ViewMode;
    mobileColumns: MobileColumns;
    onViewModeChange: (mode: ViewMode) => void;
    onMobileColumnsChange: (columns: MobileColumns) => void;
    currentTheme: ThemeColors;
    onThemeChange: (theme: ThemeColors) => void;
}

export function Header({
    view,
    setView,
    showInstallPrompt,
    handleInstallClick,
    isEditMode,
    setIsEditMode,
    viewMode,
    mobileColumns,
    onViewModeChange,
    onMobileColumnsChange,
    currentTheme,
    onThemeChange,
}: HeaderProps) {
    return (
        <header className="bg-slate-900 border-b border-white/5 sticky top-0 z-40">
            <div className="container mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-4">
                    <button
                        onClick={() => setView("dashboard")}
                        className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity cursor-pointer shrink-0"
                    >
                        <div className="p-1.5 sm:p-2 rounded-lg bg-blue-600 shrink-0">
                            <img
                                src="/dockericon.png"
                                alt="Docker"
                                className="w-4 h-4 sm:w-5 sm:h-5 shrink-0"
                            />
                        </div>
                        <h1 className="text-sm sm:text-base md:text-xl font-bold tracking-tight text-white whitespace-nowrap">
                            Docker<span style={{ color: "var(--color-primary)" }}>Dash</span>
                        </h1>
                    </button>
                    <button
                        onClick={() => setView("dashboard")}
                        className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg whitespace-nowrap ${
                            view === "dashboard"
                                ? ""
                                : "text-slate-400 hover:text-white hover:bg-slate-800"
                        }`}
                        style={view === "dashboard" ? {
                            color: "var(--color-primary)",
                            backgroundColor: "rgba(var(--color-primary-rgb), 0.1)"
                        } : undefined}
                    >
                        <LayoutDashboard className="w-4 h-4 shrink-0" />
                        <span className="hidden sm:inline">Dashboard</span>
                    </button>
                    <button
                        onClick={() => setView("add")}
                        className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg whitespace-nowrap ${
                            view === "add"
                                ? ""
                                : "text-slate-400 hover:text-white hover:bg-slate-800"
                        }`}
                        style={view === "add" ? {
                            color: "var(--color-primary)",
                            backgroundColor: "rgba(var(--color-primary-rgb), 0.1)"
                        } : undefined}
                    >
                        <Layers className="w-4 h-4 shrink-0" />
                        <span className="hidden sm:inline">Shortcuts</span>
                    </button>
                </div>
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
                    {view === "dashboard" && (
                        <>
                            <ViewSelector
                                viewMode={viewMode}
                                mobileColumns={mobileColumns}
                                onViewModeChange={onViewModeChange}
                                onMobileColumnsChange={onMobileColumnsChange}
                            />
                            <button
                                onClick={() => setIsEditMode(!isEditMode)}
                                className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg whitespace-nowrap ${isEditMode
                                        ? "text-green-400 bg-green-500/10"
                                        : "text-slate-400 hover:text-white hover:bg-slate-800"
                                    }`}
                                title={isEditMode ? "Done Reordering" : "Reorder Dashboard"}
                            >
                                <Edit3 className="w-4 h-4 shrink-0" />
                                <span className="hidden lg:inline">
                                    {isEditMode ? "Done" : "Reorder"}
                                </span>
                            </button>
                        </>
                    )}
                     <ThemeSelector
                        currentTheme={currentTheme}
                        onThemeChange={onThemeChange}
                    />
                </div>
            </div>
        </header>
    );
}
