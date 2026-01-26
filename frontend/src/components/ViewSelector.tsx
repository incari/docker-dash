import React, { useState, useRef, useEffect } from "react";
import { LayoutGrid, LayoutList, Grid2x2, Maximize2, ChevronDown, Table } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ViewMode, MobileColumns } from "../types/viewTypes";

interface ViewSelectorProps {
  viewMode: ViewMode;
  mobileColumns: MobileColumns;
  onViewModeChange: (mode: ViewMode) => void;
  onMobileColumnsChange: (columns: MobileColumns) => void;
}

export const ViewSelector: React.FC<ViewSelectorProps> = ({
  viewMode,
  mobileColumns,
  onViewModeChange,
  onMobileColumnsChange,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const viewModes: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
    { mode: "default", label: t("view.default"), icon: <LayoutGrid className="w-4 h-4" /> },
    { mode: "compact", label: t("view.compact"), icon: <Grid2x2 className="w-4 h-4" /> },
    { mode: "icon", label: t("view.iconOnly"), icon: <Maximize2 className="w-4 h-4" /> },
    { mode: "list", label: t("view.list"), icon: <LayoutList className="w-4 h-4" /> },
    { mode: "table", label: t("view.table"), icon: <Table className="w-4 h-4" /> },
  ];

  const currentView = viewModes.find((v) => v.mode === viewMode) || viewModes[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 whitespace-nowrap"
        title={t("view.title")}
      >
        {currentView.icon}
        <span className="hidden md:inline">{currentView.label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-100">
          {/* View Modes */}
          <div className="p-2">
            <div className="text-xs font-semibold text-slate-500 px-2 py-1">{t("view.viewMode")}</div>
            {viewModes.map((view) => (
              <button
                key={view.mode}
                onClick={() => {
                  onViewModeChange(view.mode);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  viewMode === view.mode
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                {view.icon}
                <span className="text-sm">{view.label}</span>
              </button>
            ))}
          </div>

          {/* Mobile Columns */}
          <div className="border-t border-white/5 p-2">
            <div className="text-xs font-semibold text-slate-500 px-2 py-1">{t("view.mobileColumns")}</div>
            <div className="flex gap-2 px-2">
              <button
                onClick={() => {
                  onMobileColumnsChange(1);
                  setIsOpen(false);
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  mobileColumns === 1
                    ? "bg-blue-600/20 text-blue-400"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {t("view.oneCol")}
              </button>
              <button
                onClick={() => {
                  onMobileColumnsChange(2);
                  setIsOpen(false);
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  mobileColumns === 2
                    ? "bg-blue-600/20 text-blue-400"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {t("view.twoCol")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

