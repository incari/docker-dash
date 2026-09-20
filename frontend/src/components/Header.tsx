import { Download, LayoutDashboard, Layers, Edit3 } from "../constants/icons";
import { useTranslation } from "react-i18next";
import { ViewSelector } from "./ViewSelector";
import { SearchInput } from "./SearchInput";
import type { ViewMode, MobileColumns } from "../types";

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
  searchQuery: string;
  onSearchChange: (query: string) => void;
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
  searchQuery,
  onSearchChange,
}: HeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="bg-slate-900 border-b border-white/5 sticky top-0 z-50">
      {/* From lg up the side groups grow from a zero basis, so they always claim
          the same width and the search stays centred even though the right group
          only renders the view controls on the dashboard; min-w-fit keeps that
          growth from squeezing either group below its own content. Narrower than
          lg the groups stay shrink-0 and the search takes what is left over —
          reserving half the row for a couple of icons would leave nothing to
          type in. */}
      <div className="container mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-4 shrink-0 lg:grow lg:basis-0 lg:min-w-fit">
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
              Docker<span className="text-blue-500">Dash</span>
            </h1>
          </button>
          <button
            onClick={() => setView("dashboard")}
            className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg whitespace-nowrap ${
              view === "dashboard"
                ? "text-blue-500 bg-blue-500/10"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{t("header.dashboard")}</span>
          </button>
          <button
            onClick={() => setView("add")}
            className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg whitespace-nowrap ${
              view === "add"
                ? "text-blue-500 bg-blue-500/10"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{t("header.shortcuts")}</span>
          </button>
        </div>
        {/* Filtering is disabled while reordering: the drag lists hold their own
            state, so a filtered subset would compute wrong drop positions. */}
        <SearchInput
          value={searchQuery}
          onChange={onSearchChange}
          disabled={isEditMode}
        />

        <div className="flex items-center justify-end gap-1 sm:gap-2 md:gap-4 shrink-0 lg:grow lg:basis-0 lg:min-w-fit">
          {showInstallPrompt && (
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white"
              title="Install DockerDash"
            >
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">{t("common.install")}</span>
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
                className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg whitespace-nowrap ${
                  isEditMode
                    ? "text-green-400 bg-green-500/10"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
                title={
                  isEditMode
                    ? t("header.doneReordering")
                    : t("header.reorderDashboard")
                }
              >
                <Edit3 className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline">
                  {isEditMode ? t("common.done") : t("header.reorder")}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
