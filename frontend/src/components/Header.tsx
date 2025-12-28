import { Download, LayoutDashboard, Layers, Edit3 } from "lucide-react";

interface HeaderProps {
    view: "dashboard" | "add";
    setView: (view: "dashboard" | "add") => void;
    showInstallPrompt: boolean;
    handleInstallClick: () => void;
    isEditMode: boolean;
    setIsEditMode: (mode: boolean) => void;
}

export function Header({
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
                        className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg ${view === "dashboard"
                                ? "text-blue-400 bg-blue-500/10"
                                : "text-slate-400 hover:text-white hover:bg-slate-800"
                            }`}
                    >
                        <LayoutDashboard className="w-4 h-4" />
                        <span className="hidden sm:inline">Dashboard</span>
                    </button>
                    <button
                        onClick={() => setView("add")}
                        className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg ${view === "add"
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
                            className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg ${isEditMode
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
