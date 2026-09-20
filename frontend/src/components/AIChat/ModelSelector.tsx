import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Check,
  Download,
  HardDrive,
  Zap,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  AVAILABLE_MODELS,
  isModelCached,
  deleteModelFromCache,
  type AvailableModel,
} from "../../services/ai/availableModels";

interface ModelSelectorProps {
  /** Currently selected model ID */
  selectedModelId: string;
  /** Callback when model is selected */
  onModelSelect: (model: AvailableModel) => void;
  /** Whether a model is currently loading */
  isLoading?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * Model Selector Component
 * Allows users to choose between available AI models
 */
export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModelId,
  onModelSelect,
  isLoading = false,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [isCheckingCache, setIsCheckingCache] = useState(true);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);

  const selectedModel =
    AVAILABLE_MODELS.find((m) => m.id === selectedModelId) ||
    AVAILABLE_MODELS[0];

  // Check cache status on mount
  useEffect(() => {
    checkCacheStatus();
  }, []);

  const checkCacheStatus = async () => {
    setIsCheckingCache(true);
    const statusMap = new Map<string, boolean>();

    for (const model of AVAILABLE_MODELS) {
      const isCached = await isModelCached(model.modelName);
      statusMap.set(model.id, isCached);
    }

    setCacheStatus(statusMap);
    setIsCheckingCache(false);
  };

  const handleModelSelect = (model: AvailableModel) => {
    onModelSelect(model);
    setIsOpen(false);
  };

  const handleDeleteCache = async (
    model: AvailableModel,
    event: React.MouseEvent,
  ) => {
    // Prevent model selection when clicking delete
    event.stopPropagation();

    if (deletingModel) return; // Prevent multiple deletes

    setDeletingModel(model.id);

    try {
      console.log(`[ModelSelector] Deleting cache for: ${model.name}`);
      const success = await deleteModelFromCache(model.modelName);

      if (success) {
        console.log(
          `[ModelSelector] Successfully deleted cache for: ${model.name}`,
        );
        // Update cache status
        await checkCacheStatus();
      } else {
        console.warn(
          `[ModelSelector] Failed to delete cache for: ${model.name}`,
        );
      }
    } catch (error) {
      console.error(`[ModelSelector] Error deleting cache:`, error);
    } finally {
      setDeletingModel(null);
    }
  };

  const getSpeedIcon = (speed: string) => {
    switch (speed) {
      case "fast":
        return <Zap className="w-3 h-3" />;
      default:
        return <Sparkles className="w-3 h-3" />;
    }
  };

  return (
    <div className="relative">
      {/* Selector Button */}
      <button
        onClick={() => !disabled && !isLoading && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0" />
          <div className="flex flex-col items-start min-w-0">
            <span className="text-sm font-medium text-white truncate">
              {selectedModel.name}
            </span>
            <span className="text-xs text-slate-400">
              {selectedModel.size}MB
              {cacheStatus.get(selectedModel.id) && (
                <span className="ml-1 text-green-400">• Cached</span>
              )}
            </span>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50"
            >
              <div className="p-2 border-b border-slate-700">
                <p className="text-xs font-semibold text-slate-400 px-2">
                  Select AI Model
                </p>
              </div>

              <div className="max-h-[300px] overflow-y-auto p-2">
                {AVAILABLE_MODELS.map((model) => {
                  const isSelected = model.id === selectedModelId;
                  const isCached = cacheStatus.get(model.id);
                  const isDeleting = deletingModel === model.id;

                  return (
                    <div
                      key={model.id}
                      className={`relative group rounded-lg transition-colors ${
                        isSelected
                          ? "bg-purple-500/20 border border-purple-500/50"
                          : "hover:bg-slate-700 border border-transparent"
                      }`}
                    >
                      <button
                        onClick={() => handleModelSelect(model)}
                        className="w-full flex items-start gap-3 p-3"
                      >
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-white">
                              {model.name}
                            </span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-purple-400" />
                            )}
                          </div>

                          <p className="text-xs text-slate-400 mb-2">
                            {model.description}
                          </p>

                          <div className="flex items-center gap-3 text-xs">
                            <span className="flex items-center gap-1 text-slate-500">
                              {getSpeedIcon(model.performance.speed)}
                              {model.performance.speed}
                            </span>
                            <span className="text-slate-600">•</span>
                            <span className="text-slate-500">
                              {model.size}MB
                            </span>
                            {isCached && (
                              <>
                                <span className="text-slate-600">•</span>
                                <span className="flex items-center gap-1 text-green-400">
                                  <HardDrive className="w-3 h-3" />
                                  Cached
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Delete Cache Button - Only show if cached */}
                      {isCached && (
                        <button
                          onClick={(e) => handleDeleteCache(model, e)}
                          disabled={isDeleting}
                          className="absolute top-3 right-3 p-1.5 rounded-md bg-slate-800/80 hover:bg-red-500/20 border border-slate-600 hover:border-red-500/50 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                          title="Delete from cache"
                        >
                          {isDeleting ? (
                            <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-400" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
