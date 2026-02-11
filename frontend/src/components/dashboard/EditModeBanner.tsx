import { Plus, Edit2 } from "../../constants/icons";

interface EditModeBannerProps {
  handleCreateSection: () => void;
  t: (key: string) => string;
}

/**
 * Edit mode banner with section creation button
 */
export function EditModeBanner({
  handleCreateSection,
  t,
}: EditModeBannerProps) {
  return (
    <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 mb-6">
      <div className="flex items-center gap-3 mb-3">
        <Edit2
          className="w-5 h-5"
          style={{ color: "var(--color-primary)" }}
        />
        <div className="flex-1">
          <h3
            className="font-semibold text-sm"
            style={{ color: "var(--color-primary)" }}
          >
            {t("dashboard.editModeActive")}
          </h3>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--color-background-contrast)", opacity: 0.6 }}
          >
            {t("dashboard.editModeDescription")}
          </p>
        </div>
      </div>
      <button
        onClick={handleCreateSection}
        className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-sm font-medium transition-colors"
        style={{ color: "var(--color-primary)" }}
      >
        <Plus className="w-4 h-4" />
        {t("dashboard.createSection")}
      </button>
    </div>
  );
}
