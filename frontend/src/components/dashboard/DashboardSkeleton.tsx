import React from "react";
import { useTranslation } from "react-i18next";

interface DashboardSkeletonProps {
  gridClasses: string;
  /** Matches the real card height for the active view mode, so nothing jumps. */
  minHeight: string;
  count?: number;
}

/**
 * Placeholder cards shown while the dashboard data is in flight.
 * Previously `loading` only gated the empty state, so the first paint was a
 * blank page followed by a layout jump once the data arrived.
 */
export const DashboardSkeleton: React.FC<DashboardSkeletonProps> = ({
  gridClasses,
  minHeight,
  count = 6,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={gridClasses}
      role="status"
      aria-busy="true"
      aria-label={t("common.loading")}
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="skeleton border border-white/5"
          style={{ minHeight }}
        />
      ))}
    </div>
  );
};
