import React, { useState, useRef, useEffect } from "react";
import { Palette, Check } from "../constants/icons";
import { useTranslation } from "react-i18next";
import { PRESET_THEMES } from "../types/themeTypes";
import type { ThemeColors } from "../types/themeTypes";

interface ThemeSelectorProps {
  currentTheme: ThemeColors;
  onThemeChange: (theme: ThemeColors) => void;
  dropdownDirection?: "up" | "down";
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  currentTheme,
  onThemeChange,
  dropdownDirection = "down",
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customPrimary, setCustomPrimary] = useState(currentTheme.primary);
  const [customBackground, setCustomBackground] = useState(
    currentTheme.background,
  );
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowCustom(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const isThemeActive = (themeColors: ThemeColors) => {
    return (
      themeColors.primary === currentTheme.primary &&
      themeColors.background === currentTheme.background
    );
  };

  const handlePresetSelect = (themeColors: ThemeColors) => {
    onThemeChange(themeColors);
    setIsOpen(false);
    setShowCustom(false);
  };

  const handleCustomApply = () => {
    onThemeChange({
      primary: customPrimary,
      background: customBackground,
    });
    setShowCustom(false);
    setIsOpen(false);
  };

  return (
    <div
      className="relative"
      ref={menuRef}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
        title={t("theme.title")}
      >
        <Palette className="w-4 h-4" />
        <span className="hidden sm:inline">{t("theme.title")}</span>
      </button>

      {isOpen && (
        <div
          className={`absolute right-0 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-[100] min-w-[280px] max-w-[320px] overflow-hidden ${
            dropdownDirection === "up" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {!showCustom ? (
            <>
              <div className="px-3 py-2 border-b border-slate-700">
                <h3 className="text-sm font-semibold text-white">
                  {t("theme.chooseTheme")}
                </h3>
              </div>
              <div className="max-h-[400px] overflow-y-auto p-2">
                {PRESET_THEMES.map((theme) => (
                  <button
                    key={theme.name}
                    onClick={() => handlePresetSelect(theme.colors)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-700 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <div
                          className="w-6 h-6 rounded border border-white/10"
                          style={{ backgroundColor: theme.colors.primary }}
                        />
                        <div
                          className="w-6 h-6 rounded border border-white/10"
                          style={{ backgroundColor: theme.colors.background }}
                        />
                      </div>
                      <span className="text-sm text-slate-200">
                        {theme.name}
                      </span>
                    </div>
                    {isThemeActive(theme.colors) && (
                      <Check className="w-4 h-4 text-green-400" />
                    )}
                  </button>
                ))}
              </div>
              <div className="border-t border-slate-700 p-2">
                <button
                  onClick={() => setShowCustom(true)}
                  className="w-full px-3 py-2 text-sm text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  {t("theme.customColors")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="px-3 py-2 border-b border-slate-700">
                <h3 className="text-sm font-semibold text-white">
                  {t("theme.customTheme")}
                </h3>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    {t("theme.primaryColor")}
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={customPrimary}
                      onChange={(e) => setCustomPrimary(e.target.value)}
                      className="w-12 h-10 rounded border border-slate-600 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={customPrimary}
                      onChange={(e) => setCustomPrimary(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white font-mono"
                      placeholder="#3b82f6"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    {t("theme.backgroundColor")}
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={customBackground}
                      onChange={(e) => setCustomBackground(e.target.value)}
                      className="w-12 h-10 rounded border border-slate-600 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={customBackground}
                      onChange={(e) => setCustomBackground(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white font-mono"
                      placeholder="#0f172a"
                    />
                  </div>
                </div>
              </div>
              <div className="border-t border-slate-700 p-2 flex gap-2">
                <button
                  onClick={() => setShowCustom(false)}
                  className="flex-1 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  {t("common.back")}
                </button>
                <button
                  onClick={handleCustomApply}
                  className="flex-1 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                >
                  {t("theme.apply")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
