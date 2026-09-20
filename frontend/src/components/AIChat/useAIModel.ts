import { useState, useEffect, useCallback } from "react";
import AIService from "../../services/ai/AIService";
import { getDefaultModel, type AvailableModel } from "../../services/ai/availableModels";
import type { ModelStatus, ModelLoadProgress } from "../../services/ai/types";

/**
 * Custom hook for managing AI model state
 * Handles model initialization, loading progress, and status
 */
export const useAIModel = () => {
  const [modelStatus, setModelStatus] = useState<ModelStatus>({
    loaded: false,
    progress: 0,
    status: "idle",
  });
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<AvailableModel>(getDefaultModel());

  // Check initial model status
  useEffect(() => {
    const status = AIService.getModelStatus();
    setModelStatus(status);
  }, []);

  /**
   * Initialize the AI model
   */
  const initializeModel = useCallback(async (modelToLoad?: AvailableModel) => {
    if (isInitializing || modelStatus.loaded) {
      return;
    }

    const targetModel = modelToLoad || selectedModel;
    setIsInitializing(true);
    setError(null);

    try {
      await AIService.initializeModel({
        modelName: targetModel.modelName,
        onProgress: (progress: ModelLoadProgress) => {
          setModelStatus({
            loaded: progress.status === "ready",
            progress: progress.progress,
            status: progress.status,
            error: progress.error,
          });
        },
      });

      if (modelToLoad) {
        setSelectedModel(modelToLoad);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load model";
      setError(errorMessage);
      setModelStatus({
        loaded: false,
        progress: 0,
        status: "error",
        error: errorMessage,
      });
    } finally {
      setIsInitializing(false);
    }
  }, [isInitializing, modelStatus.loaded, selectedModel]);

  /**
   * Generate a response from the AI
   */
  const generateResponse = useCallback(
    async (prompt: string) => {
      if (!modelStatus.loaded) {
        throw new Error("Model not loaded. Please initialize the model first.");
      }

      return await AIService.generateResponse(prompt);
    },
    [modelStatus.loaded]
  );

  /**
   * Switch to a different model
   */
  const switchModel = useCallback(async (model: AvailableModel) => {
    setIsInitializing(true);
    setError(null);

    try {
      await AIService.switchModel(model.modelName, {
        onProgress: (progress: ModelLoadProgress) => {
          setModelStatus({
            loaded: progress.status === "ready",
            progress: progress.progress,
            status: progress.status,
            error: progress.error,
          });
        },
      });

      setSelectedModel(model);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to switch model";
      setError(errorMessage);
      setModelStatus({
        loaded: false,
        progress: 0,
        status: "error",
        error: errorMessage,
      });
    } finally {
      setIsInitializing(false);
    }
  }, []);

  return {
    modelStatus,
    isInitializing,
    error,
    initializeModel,
    generateResponse,
    switchModel,
    selectedModel,
    isModelLoaded: modelStatus.loaded,
  };
};

