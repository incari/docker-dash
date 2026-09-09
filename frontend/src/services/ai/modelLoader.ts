/**
 * Model Loader for Transformers.js
 * Handles loading and initialization of the FunctionGemma model
 */

import type { ModelConfig, ModelStatus } from "./types";

// Transformers.js pulls in onnxruntime-web (~1.2 MB minified), which is only
// needed once the user actually loads a model. Importing it on demand keeps it
// out of the initial bundle.
type Transformers = typeof import("@xenova/transformers");

let transformersPromise: Promise<Transformers> | null = null;

function getTransformers(): Promise<Transformers> {
  if (!transformersPromise) {
    transformersPromise = import("@xenova/transformers").then((mod) => {
      mod.env.allowLocalModels = false;
      mod.env.useBrowserCache = true;
      return mod;
    });
  }
  return transformersPromise;
}

/**
 * Model loader class with singleton pattern
 */
class ModelLoader {
  private static instance: ModelLoader | null = null;
  private model: any = null;
  private modelConfig: ModelConfig | null = null;
  private loadingPromise: Promise<void> | null = null;
  private status: ModelStatus = {
    loaded: false,
    progress: 0,
    status: "idle",
  };

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): ModelLoader {
    if (!ModelLoader.instance) {
      ModelLoader.instance = new ModelLoader();
    }
    return ModelLoader.instance;
  }

  /**
   * Initialize and load the model
   */
  public async loadModel(config: ModelConfig): Promise<void> {
    // If already loading, return the existing promise
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    // If already loaded with same config, return immediately
    if (this.model && this.modelConfig?.modelName === config.modelName) {
      return Promise.resolve();
    }

    this.modelConfig = config;
    this.updateStatus("downloading", 0);

    this.loadingPromise = this.performLoad(config);
    return this.loadingPromise;
  }

  /**
   * Perform the actual model loading
   */
  private async performLoad(config: ModelConfig): Promise<void> {
    try {
      const {
        modelName,
        device = "wasm",
        quantized = true,
        onProgress,
      } = config;

      console.log(`[ModelLoader] Starting to load model: ${modelName}`);

      // Set initial loading status
      this.updateStatus("loading", 0);
      onProgress?.({
        status: "loading",
        progress: 0,
      });

      // Configure device
      const deviceConfig = device === "webgpu" ? { device: "webgpu" } : {};

      // Load the model using text-generation pipeline
      // The progress_callback will provide real download/loading progress
      console.log("[ModelLoader] Calling pipeline()...");

      const { pipeline } = await getTransformers();

      try {
        this.model = await pipeline("text-generation", modelName, {
          ...deviceConfig,
          quantized,
          progress_callback: (progress: any) => {
            console.log("[ModelLoader] Progress callback:", progress);

            // Determine status based on progress data
            let status: "downloading" | "loading" = "downloading";

            // Transformers.js progress object structure:
            // { status: 'initiate', file: '...' } - Starting to load a file
            // { status: 'download', file: '...' } - Starting download
            // { status: 'progress', file: '...', progress: 0.5, loaded: 1000, total: 2000 } - Download progress
            // { status: 'done', file: '...' } - File downloaded/loaded
            // { status: 'ready' } - All files ready

            // Calculate actual progress (0-100)
            let actualProgress = 0;

            if (progress.status === "progress") {
              // Active download/loading with progress data
              status = "downloading";

              if (progress.progress !== undefined) {
                const rawProgress = progress.progress;
                // If progress is between 0-1, convert to percentage
                actualProgress =
                  rawProgress <= 1
                    ? Math.round(rawProgress * 100)
                    : Math.round(rawProgress);
              } else if (progress.loaded && progress.total) {
                // Calculate from bytes if available
                actualProgress = Math.round(
                  (progress.loaded / progress.total) * 100,
                );
              }
            } else if (progress.status === "done") {
              // File completed - show as loading/initializing
              status = "loading";
              actualProgress = 50; // Show 50% to indicate we're initializing
            } else if (progress.status === "ready") {
              // Everything ready
              status = "loading";
              actualProgress = 90; // Almost done
            } else if (
              progress.status === "initiate" ||
              progress.status === "download"
            ) {
              // Starting to download
              status = "downloading";
              actualProgress = 5; // Show small progress to indicate activity
            }

            actualProgress = Math.min(100, Math.max(0, actualProgress));

            console.log(
              `[ModelLoader] Status: ${status}, Progress: ${actualProgress}%`,
            );

            this.updateStatus(status, actualProgress);
            onProgress?.({
              status,
              progress: actualProgress,
              file: progress.file,
              loaded: progress.loaded,
              total: progress.total,
            });
          },
        });

        console.log(
          "[ModelLoader] Pipeline completed! Model instance:",
          this.model ? "✓ Created" : "✗ NULL",
        );
      } catch (pipelineError) {
        console.error("[ModelLoader] Pipeline error:", pipelineError);
        throw pipelineError;
      }

      // Model loaded successfully
      console.log("[ModelLoader] Setting status to 'ready'");
      this.updateStatus("ready", 100);
      onProgress?.({
        status: "ready",
        progress: 100,
      });

      console.log(
        "[ModelLoader] Model loaded successfully! isLoaded():",
        this.isLoaded(),
      );
      this.loadingPromise = null;
    } catch (error) {
      console.error("[ModelLoader] Error loading model:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.updateStatus("error", 0, errorMessage);
      config.onProgress?.({
        status: "error",
        progress: 0,
        error: errorMessage,
      });
      this.loadingPromise = null;
      throw error;
    }
  }

  /**
   * Update internal status
   */
  private updateStatus(
    status: ModelStatus["status"],
    progress: number,
    error?: string,
  ): void {
    this.status = {
      loaded: status === "ready",
      progress,
      status,
      error,
      config: this.modelConfig || undefined,
    };
  }

  /**
   * Get the loaded model
   */
  public getModel(): any {
    return this.model;
  }

  /**
   * Get current model status
   */
  public getStatus(): ModelStatus {
    return { ...this.status };
  }

  /**
   * Check if model is loaded
   */
  public isLoaded(): boolean {
    return this.status.loaded && this.model !== null;
  }
}

export default ModelLoader;
