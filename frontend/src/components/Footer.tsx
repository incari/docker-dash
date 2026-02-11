import {
  Github,
  Linkedin,
  BatteryCharging,
  Zap,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "./LanguageSelector";
import { ThemeSelector } from "./ThemeSelector";
import type { ThemeColors } from "../types/themeTypes";
import { shortcutsApi } from "../services/api";

interface FooterProps {
  currentTheme: ThemeColors;
  onThemeChange: (theme: ThemeColors) => void;
  onMigrate: () => Promise<void>;
  onShowMigrationModal: (
    shortcuts: Array<{
      id: number;
      name: string;
      description: string;
      icon: string;
    }>,
    isManualTrigger?: boolean,
  ) => void;
}

export function Footer({
  currentTheme,
  onThemeChange,
  onMigrate,
  onShowMigrationModal,
}: FooterProps) {
  const { t } = useTranslation();

  const handleMigrationClick = async () => {
    // Check if migration is needed first
    try {
      const migrationCheck = await shortcutsApi.checkMigration();
      if (migrationCheck.needsMigration) {
        // Show the modal with the list of shortcuts (manual trigger)
        onShowMigrationModal(migrationCheck.shortcuts, true);
      } else {
        // Show info that no migration is needed
        alert("All shortcuts are already using docker-icon-vault icons!");
      }
    } catch (error) {
      console.error("Failed to check migration:", error);
    }
  };

  return (
    <footer className="border-t border-white/5 bg-slate-900 mt-auto">
      <div className="container mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 sm:gap-6">
          {/* Left: Creator Info + Feedback Button */}
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
            <div className="flex flex-col items-center sm:items-start gap-1.5 sm:gap-2">
              <p className="text-slate-400 text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap">
                {t("footer.madeWith")}{" "}
                <BatteryCharging className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-300 fill-text-emerald-500/20" />{" "}
                {t("footer.by")}{" "}
                <span className="text-slate-200 font-medium">Incari</span>
              </p>
              <div className="flex items-center gap-3 sm:gap-4">
                <a
                  href="https://github.com/incari"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-white transition-colors flex items-center gap-1 sm:gap-1.5 text-xs"
                >
                  <Github className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>GitHub</span>
                </a>
                <a
                  href="https://www.linkedin.com/in/racana/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-500 hover:text-blue-400 transition-colors flex items-center gap-1 sm:gap-1.5 text-xs"
                >
                  <Linkedin className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>LinkedIn</span>
                </a>
              </div>
            </div>

            {/* Feedback Button */}
            <a
              href="https://pslg.app/docker-dash-feedback"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 sm:gap-2 bg-slate-800/50 hover:bg-slate-800 border border-white/5 hover:border-purple-500/30 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-all duration-300"
            >
              <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400" />
              <span className="text-slate-300 text-xs sm:text-sm hover:text-purple-400 transition-colors">
                {t("footer.feedback")}
              </span>
            </a>

            {/* Migration Button */}
            <button
              onClick={handleMigrationClick}
              className="flex items-center gap-1.5 sm:gap-2 bg-slate-800/50 hover:bg-slate-800 border border-white/5 hover:border-blue-500/30 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-all duration-300"
              title="Update shortcuts to use official Docker icons"
            >
              <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
              <span className="text-slate-300 text-xs sm:text-sm hover:text-blue-400 transition-colors">
                Update Icons
              </span>
            </button>
          </div>

          {/* Right: Theme, Language Selector + PowerSlug */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <ThemeSelector
              currentTheme={currentTheme}
              onThemeChange={onThemeChange}
              dropdownDirection="up"
            />
            <LanguageSelector />

            {/* PowerSlug Promotion */}
            <a
              href="https://www.powerslug.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 sm:gap-3 bg-slate-800/50 hover:bg-slate-800 border border-white/5 hover:border-yellow-500/30 px-2.5 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl transition-all duration-300"
            >
              <div className="bg-yellow-500/10 p-1.5 sm:p-2 rounded-lg group-hover:scale-110 transition-transform duration-300">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
              </div>
              <div className="text-left">
                <p className="text-slate-200 text-xs sm:text-sm font-medium group-hover:text-yellow-400 transition-colors whitespace-nowrap">
                  {t("footer.tryPowerSlug")}
                </p>
                <p className="text-slate-500 text-[10px] sm:text-xs whitespace-nowrap">
                  {t("footer.bestUrlShortener")}
                </p>
              </div>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
