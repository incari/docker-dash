import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw,
  X,
  CheckSquare,
  Square,
  Loader2,
  AlertCircle,
  Server,
  ArrowRight,
} from "../constants/icons";
import { useTranslation } from "react-i18next";
import { shortcutsApi } from "../services/api";

// Debounce delay for URL input (ms)
const URL_DEBOUNCE_DELAY = 500;

interface IconPreview {
  id: number;
  display_name: string;
  container_name: string;
  current_icon: string | null;
  suggested_icon: string | null;
  is_custom_mapping: boolean;
}

interface MigrationModalProps {
  isOpen: boolean;
  shortcuts: Array<{
    id: number;
    display_name: string;
    description: string;
    icon: string;
  }>;
  onConfirm: (updates: Array<{ id: number; icon_url: string }>) => void;
  onCancel: () => void;
}

/**
 * Migration modal component for icon migration
 * Shows icon previews and allows users to customize URLs before applying
 */
export const MigrationModal: React.FC<MigrationModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<IconPreview[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [customUrls, setCustomUrls] = useState<Record<number, string>>({});
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  // Track which new images have successfully loaded (not which are loading)
  const [imageLoaded, setImageLoaded] = useState<Set<number>>(new Set());
  // Track current icon loading state
  const [currentImageLoaded, setCurrentImageLoaded] = useState<Set<number>>(
    new Set(),
  );
  const [currentImageErrors, setCurrentImageErrors] = useState<Set<number>>(
    new Set(),
  );
  // For debouncing URL input - stores the display value while typing
  const [inputUrls, setInputUrls] = useState<Record<number, string>>({});
  const debounceTimers = useRef<Record<number, NodeJS.Timeout>>({});

  // Load icon previews when modal opens
  const loadPreviews = useCallback(async () => {
    setError(null);
    try {
      const result = await shortcutsApi.previewIcons();
      setPreviews(result.shortcuts);

      // Initialize selected IDs - only select shortcuts that need updating
      // (those where current icon differs from suggested, or current is not a Homarr icon)
      const needsUpdate = result.shortcuts.filter((s) => {
        const isCurrentHomarr = s.current_icon?.includes(
          "homarr-labs/dashboard-icons",
        );
        // Need update if: has a suggested icon AND (current is not Homarr OR current differs from suggested)
        return (
          s.suggested_icon &&
          (!isCurrentHomarr || s.current_icon !== s.suggested_icon)
        );
      });
      setSelectedIds(new Set(needsUpdate.map((s) => s.id)));

      // Initialize custom URLs with suggested icons (or current for already-set ones)
      // Only use values that are actual URLs (start with http)
      const urls: Record<number, string> = {};
      result.shortcuts.forEach((s) => {
        if (s.suggested_icon?.startsWith("http")) {
          urls[s.id] = s.suggested_icon;
        } else if (s.current_icon?.startsWith("http")) {
          urls[s.id] = s.current_icon;
        }
      });
      setCustomUrls(urls);
      setInputUrls(urls); // Initialize input display values
      setImageErrors(new Set());
      setCurrentImageErrors(new Set());
      // Pre-populate loaded state with all valid URLs
      // This prevents spinner flash for cached images
      // If an image fails, onError will handle it
      setImageLoaded(new Set(Object.keys(urls).map(Number)));
      // Pre-populate current image loaded state for shortcuts with valid current icons
      const currentIconIds = result.shortcuts
        .filter((s) => s.current_icon?.startsWith("http"))
        .map((s) => s.id);
      setCurrentImageLoaded(new Set(currentIconIds));
    } catch (err) {
      console.error("Failed to load icon previews:", err);
      setError("Failed to load icon previews. Please try again.");
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPreviews();
    }
  }, [isOpen, loadPreviews]);

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === previews.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(previews.map((s) => s.id)));
    }
  };

  // Handle URL input change with debounce for image loading
  const handleUrlChange = (id: number, url: string) => {
    // Update input display immediately
    setInputUrls((prev) => ({ ...prev, [id]: url }));

    // Clear any existing debounce timer for this id
    if (debounceTimers.current[id]) {
      clearTimeout(debounceTimers.current[id]);
    }

    // Debounce the actual URL update and image loading
    debounceTimers.current[id] = setTimeout(() => {
      setCustomUrls((prev) => ({ ...prev, [id]: url }));
      // Clear image error when URL changes
      setImageErrors((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      // Remove from loaded state when URL changes (will show spinner until new image loads)
      setImageLoaded((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }, URL_DEBOUNCE_DELAY);
  };

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  const handleImageLoad = (id: number) => {
    // Mark new image as loaded
    setImageLoaded((prev) => new Set(prev).add(id));
  };

  const handleImageError = (id: number) => {
    setImageErrors((prev) => new Set(prev).add(id));
    // Also mark as "loaded" to stop the spinner (error state is separate)
    setImageLoaded((prev) => new Set(prev).add(id));
  };

  const handleCurrentImageLoad = (id: number) => {
    setCurrentImageLoaded((prev) => new Set(prev).add(id));
  };

  const handleCurrentImageError = (id: number) => {
    setCurrentImageErrors((prev) => new Set(prev).add(id));
    setCurrentImageLoaded((prev) => new Set(prev).add(id));
  };

  const handleConfirm = () => {
    const updates = previews
      .filter((p) => selectedIds.has(p.id) && customUrls[p.id])
      .map((p) => ({
        id: p.id,
        icon_url: customUrls[p.id],
      }));
    onConfirm(updates);
  };

  // Add ESC key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const allSelected = selectedIds.size === previews.length;
  const noneSelected = selectedIds.size === 0;
  const selectedCount = previews.filter(
    (p) => selectedIds.has(p.id) && customUrls[p.id],
  ).length;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 md:p-8 max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-blue-500/20 flex flex-col"
      >
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-blue-500/20 rounded-2xl">
            <RefreshCw className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">
              {t("modals.migration.title")}
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {t("modals.migration.description")}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {error ? (
            <div className="flex-1 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <span className="ml-3 text-red-300">{error}</span>
            </div>
          ) : previews.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              <span className="ml-3 text-slate-300">Loading shortcuts...</span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-700">
              <table className="w-full">
                <thead className="bg-slate-800/80 sticky top-0 z-10">
                  <tr>
                    <th className="p-3 text-center w-12">
                      <button
                        onClick={toggleAll}
                        className="text-slate-300 hover:text-white transition-colors"
                        title={allSelected ? "Deselect all" : "Select all"}
                      >
                        {allSelected ? (
                          <CheckSquare className="w-5 h-5 text-blue-400" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </th>
                    <th className="p-3 text-left text-sm font-semibold text-slate-300">
                      {t("modals.migration.name")}
                    </th>
                    <th className="p-3 text-center text-sm font-semibold text-slate-300 w-16">
                      Current
                    </th>
                    <th className="p-3 text-center text-sm font-semibold text-slate-300 w-8">
                      {/* Arrow column */}
                    </th>
                    <th className="p-3 text-center text-sm font-semibold text-slate-300 w-16">
                      New
                    </th>
                    <th className="p-3 text-left text-sm font-semibold text-slate-300">
                      Icon URL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {previews.map((preview) => {
                    // Check if this shortcut already has the correct Homarr icon
                    const isCurrentHomarr = preview.current_icon?.includes(
                      "homarr-labs/dashboard-icons",
                    );
                    const isAlreadySet =
                      isCurrentHomarr &&
                      preview.current_icon === preview.suggested_icon;

                    return (
                      <tr
                        key={preview.id}
                        className={`border-t border-slate-700 transition-colors ${
                          isAlreadySet
                            ? "bg-green-500/5"
                            : selectedIds.has(preview.id)
                              ? "bg-blue-500/5"
                              : "hover:bg-slate-800/30"
                        }`}
                      >
                        <td className="p-3 text-center">
                          <button
                            onClick={() => toggleSelection(preview.id)}
                            className="mx-auto block"
                          >
                            {selectedIds.has(preview.id) ? (
                              <CheckSquare className="w-5 h-5 text-blue-400" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-500" />
                            )}
                          </button>
                        </td>
                        <td className="p-3">
                          <div className="text-slate-200 font-medium">
                            {preview.display_name}
                          </div>
                          <div className="text-slate-500 text-xs">
                            {preview.container_name}
                          </div>
                          {isAlreadySet && (
                            <span className="text-xs text-green-400">
                              ✓ Already set
                            </span>
                          )}
                        </td>
                        {/* Current Icon Column */}
                        <td className="p-3 text-center">
                          {(() => {
                            const currentUrl = preview.current_icon;
                            const isValidUrl = currentUrl?.startsWith("http");
                            const isLoaded = currentImageLoaded.has(preview.id);
                            const hasError = currentImageErrors.has(preview.id);

                            return (
                              <div className="w-10 h-10 mx-auto rounded-lg bg-slate-700/50 flex items-center justify-center overflow-hidden relative">
                                {isValidUrl && !isLoaded && (
                                  <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                                )}
                                {(!isValidUrl || hasError) && (
                                  <Server className="w-5 h-5 text-slate-500" />
                                )}
                                {isValidUrl && (
                                  <img
                                    src={currentUrl}
                                    alt={`Current: ${preview.display_name}`}
                                    className={`w-8 h-8 object-contain ${
                                      !isLoaded || hasError
                                        ? "absolute opacity-0"
                                        : ""
                                    }`}
                                    onLoad={() =>
                                      handleCurrentImageLoad(preview.id)
                                    }
                                    onError={() =>
                                      handleCurrentImageError(preview.id)
                                    }
                                  />
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        {/* Arrow Column */}
                        <td className="p-1 text-center">
                          <ArrowRight className="w-4 h-4 text-slate-500 mx-auto" />
                        </td>
                        {/* New Icon Column */}
                        <td className="p-3 text-center">
                          {(() => {
                            const url = customUrls[preview.id];
                            const isValidUrl = url?.startsWith("http");
                            const isLoaded = imageLoaded.has(preview.id);
                            const hasError = imageErrors.has(preview.id);

                            return (
                              <div className="w-10 h-10 mx-auto rounded-lg bg-slate-700/50 flex items-center justify-center overflow-hidden relative">
                                {isValidUrl && !isLoaded && (
                                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                                )}
                                {(!isValidUrl || hasError) && (
                                  <Server className="w-5 h-5 text-slate-500" />
                                )}
                                {isValidUrl && (
                                  <img
                                    src={url}
                                    alt={`New: ${preview.display_name}`}
                                    className={`w-8 h-8 object-contain ${
                                      !isLoaded || hasError
                                        ? "absolute opacity-0"
                                        : ""
                                    }`}
                                    onLoad={() => handleImageLoad(preview.id)}
                                    onError={() => handleImageError(preview.id)}
                                  />
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={
                              inputUrls[preview.id] ??
                              customUrls[preview.id] ??
                              ""
                            }
                            onChange={(e) =>
                              handleUrlChange(preview.id, e.target.value)
                            }
                            placeholder="Enter icon URL..."
                            className={`w-full px-3 py-2 bg-slate-800 border rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                              isAlreadySet
                                ? "border-green-500/30"
                                : imageErrors.has(preview.id)
                                  ? "border-red-500/50"
                                  : "border-slate-600"
                            }`}
                          />
                          {preview.is_custom_mapping && (
                            <span className="text-xs text-green-400 mt-1 block">
                              ✓ Custom mapping
                            </span>
                          )}
                          {imageErrors.has(preview.id) && (
                            <span className="text-xs text-red-400 mt-1 block">
                              ⚠ Image failed to load
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-400">
              {t("modals.migration.iconCount")
                .replace("{{selected}}", selectedCount.toString())
                .replace("{{total}}", previews.length.toString())}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-all duration-200"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleConfirm}
              disabled={noneSelected || loading}
              className={`flex-1 py-3 px-6 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg ${
                noneSelected || loading
                  ? "bg-slate-600 cursor-not-allowed opacity-50"
                  : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-blue-500/30"
              }`}
            >
              {t("modals.migration.updateSelected")}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
