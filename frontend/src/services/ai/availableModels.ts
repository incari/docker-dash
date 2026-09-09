/**
 * Available AI Models Configuration
 * Defines the list of models that can be downloaded and used
 */

export interface AvailableModel {
  /** Unique identifier for the model */
  id: string;
  /** Display name */
  name: string;
  /** HuggingFace model identifier */
  modelName: string;
  /** Description of the model */
  description: string;
  /** Approximate size in MB */
  size: number;
  /** Recommended use cases */
  useCases: string[];
  /** Whether this is the default model */
  isDefault?: boolean;
  /** Performance characteristics */
  performance: {
    speed: "fast" | "medium" | "slow";
    quality: "high" | "medium" | "low";
  };
}

/**
 * List of available models
 *
 * IMPORTANT: Only use models from Xenova that have ONNX files available
 * These models are confirmed to work with Transformers.js in the browser
 */
export const AVAILABLE_MODELS: AvailableModel[] = [
  {
    id: "distilgpt2",
    name: "DistilGPT2",
    modelName: "Xenova/distilgpt2",
    description:
      "Fast and lightweight GPT-2 model. Great for quick text generation and Docker management tasks.",
    size: 82,
    useCases: [
      "Quick responses",
      "Text generation",
      "Docker management",
      "Simple queries",
    ],
    isDefault: true,
    performance: {
      speed: "fast",
      quality: "medium",
    },
  },
  {
    id: "gpt2",
    name: "GPT-2",
    modelName: "Xenova/gpt2",
    description:
      "Standard GPT-2 model with better quality than DistilGPT2. Good balance of speed and capability.",
    size: 137,
    useCases: [
      "Chat and conversation",
      "Docker management",
      "General queries",
      "Text generation",
    ],
    performance: {
      speed: "fast",
      quality: "high",
    },
  },
  {
    id: "gpt-neo-125m",
    name: "GPT-Neo 125M",
    modelName: "Xenova/gpt-neo-125M",
    description:
      "Efficient GPT-Neo model optimized for instruction following and conversations.",
    size: 125,
    useCases: [
      "Conversations",
      "Instruction following",
      "Docker tasks",
      "Quick responses",
    ],
    performance: {
      speed: "fast",
      quality: "high",
    },
  },
];

/**
 * Get model by ID
 */
export function getModelById(id: string): AvailableModel | undefined {
  return AVAILABLE_MODELS.find((model) => model.id === id);
}

/**
 * Get model by HuggingFace model name
 */
export function getModelByName(modelName: string): AvailableModel | undefined {
  return AVAILABLE_MODELS.find((model) => model.modelName === modelName);
}

/**
 * Get default model
 */
export function getDefaultModel(): AvailableModel {
  return (
    AVAILABLE_MODELS.find((model) => model.isDefault) || AVAILABLE_MODELS[0]
  );
}

/**
 * Check if a model is cached in the browser's Cache API
 * This checks if the model files exist in the browser cache
 *
 * Note: Transformers.js uses Cache API (not IndexedDB) when env.useBrowserCache = true
 */
export async function isModelCached(modelName: string): Promise<boolean> {
  try {
    // Check if Cache API is available
    if (!("caches" in window)) {
      return false;
    }

    // Try to open the transformers cache
    // Transformers.js typically uses 'transformers-cache' or 'transformers-v3'
    const cacheNames = await caches.keys();
    const transformersCacheName = cacheNames.find((name) =>
      name.includes("transformers"),
    );

    if (!transformersCacheName) {
      return false;
    }

    const cache = await caches.open(transformersCacheName);
    const requests = await cache.keys();

    // Check if any cached URL contains the model name
    // Model files are cached with URLs like:
    // https://huggingface.co/{modelName}/resolve/main/onnx/model.onnx
    const isCached = requests.some((request) =>
      request.url.includes(modelName),
    );

    return isCached;
  } catch (error) {
    console.error("Error checking model cache:", error);
    return false;
  }
}

/**
 * Get cache status for all available models
 */
export async function getAllModelsCacheStatus(): Promise<Map<string, boolean>> {
  const statusMap = new Map<string, boolean>();

  for (const model of AVAILABLE_MODELS) {
    const isCached = await isModelCached(model.modelName);
    statusMap.set(model.id, isCached);
  }

  return statusMap;
}

/**
 * Delete a specific model from the browser cache
 * This removes all cached files for the specified model
 */
export async function deleteModelFromCache(
  modelName: string,
): Promise<boolean> {
  try {
    console.log(`[Cache] Deleting model from cache: ${modelName}`);

    // Check if Cache API is available
    if (!("caches" in window)) {
      console.warn("[Cache] Cache API not available");
      return false;
    }

    // Find the transformers cache
    const cacheNames = await caches.keys();
    const transformersCacheName = cacheNames.find((name) =>
      name.includes("transformers"),
    );

    if (!transformersCacheName) {
      console.warn("[Cache] Transformers cache not found");
      return false;
    }

    const cache = await caches.open(transformersCacheName);
    const requests = await cache.keys();

    // Find and delete all requests that match the model name
    let deletedCount = 0;
    for (const request of requests) {
      if (request.url.includes(modelName)) {
        const deleted = await cache.delete(request);
        if (deleted) {
          deletedCount++;
          console.log(`[Cache] Deleted: ${request.url}`);
        }
      }
    }

    console.log(
      `[Cache] Deleted ${deletedCount} files for model: ${modelName}`,
    );
    return deletedCount > 0;
  } catch (error) {
    console.error("[Cache] Error deleting model from cache:", error);
    return false;
  }
}

/**
 * Clear all cached models from the browser
 * This deletes the entire transformers cache
 */
export async function clearAllModelsCache(): Promise<boolean> {
  try {
    console.log("[Cache] Clearing all models from cache");

    // Check if Cache API is available
    if (!("caches" in window)) {
      console.warn("[Cache] Cache API not available");
      return false;
    }

    // Find and delete the transformers cache
    const cacheNames = await caches.keys();
    const transformersCacheName = cacheNames.find((name) =>
      name.includes("transformers"),
    );

    if (!transformersCacheName) {
      console.warn("[Cache] Transformers cache not found");
      return false;
    }

    const deleted = await caches.delete(transformersCacheName);
    console.log(`[Cache] Cache deleted: ${deleted}`);
    return deleted;
  } catch (error) {
    console.error("[Cache] Error clearing cache:", error);
    return false;
  }
}
