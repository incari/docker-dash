import { Bookmark } from "../../constants/icons";

interface EmptyDashboardStateProps {
  setView: (view: "dashboard" | "add") => void;
  t: (key: string) => string;
}

/**
 * Empty state component when no favorites exist
 */
export function EmptyDashboardState({ setView, t }: EmptyDashboardStateProps) {
  return (
    <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-3xl bg-white/2">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{
          backgroundColor: "rgba(var(--color-primary-rgb), 0.1)",
          color: "var(--color-background-contrast)",
          opacity: 0.5,
        }}
      >
        <Bookmark className="w-8 h-8" />
      </div>
      <h3
        className="text-lg font-semibold"
        style={{ color: "var(--color-background-contrast)" }}
      >
        {t("dashboard.noFavorites")}
      </h3>
      <p
        className="mt-2 mb-6"
        style={{ color: "var(--color-background-contrast)", opacity: 0.6 }}
      >
        {t("dashboard.noFavoritesDescription")}
      </p>
      <button
        onClick={() => setView("add")}
        className="font-medium underline underline-offset-4 transition-colors"
        style={{ color: "var(--color-primary)" }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        {t("dashboard.manageShortcuts")}
      </button>
    </div>
  );
}
