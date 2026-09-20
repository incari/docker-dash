# AI Models Guide

This document describes the available AI models and how to use them in the Docker Dashboard.

## Available Models

The Docker Dashboard supports multiple AI models that run entirely in your browser using Transformers.js. No data is sent to external servers.

### 1. Gemma 3 270M (Default) ⚡

- **Model ID**: `onnx-community/gemma-3-270m-it-ONNX`
- **Size**: ~270MB
- **Speed**: Fast
- **Quality**: High
- **Best For**:
  - Function calling and tool use
  - Docker container management
  - Chat and conversation
  - Quick responses with low resource usage

**Recommended Use**: This is the default model and is optimized for the Docker Dashboard's primary use case - managing containers through natural language commands with excellent speed and quality.

### 2. Qwen1.5 0.5B Chat

- **Model ID**: `Xenova/Qwen1.5-0.5B-Chat`
- **Size**: ~500MB
- **Speed**: Medium
- **Quality**: High
- **Best For**:
  - Chat and conversation
  - Function calling
  - Docker management
  - General queries

**Recommended Use**: A well-balanced model for conversational AI and function calling. Great for general Docker management tasks.

### 3. SmolLM2 1.7B Instruct

- **Model ID**: `HuggingFaceTB/SmolLM2-1.7B-Instruct`
- **Size**: ~1.7GB
- **Speed**: Medium
- **Quality**: High (Best)
- **Best For**:
  - Complex reasoning tasks
  - Detailed responses
  - Advanced Docker operations
  - Multi-step workflows

**Recommended Use**: Choose this model when you need the best quality responses and have sufficient bandwidth/storage. Ideal for complex Docker management scenarios.

## Model Selection

### In the UI

1. Open the AI Chat panel
2. At the top of the chat, you'll see the Model Selector dropdown
3. Click to view available models
4. Models that are already cached will show a "Cached" indicator
5. Select a model to download and use it

### Programmatically

```typescript
import AIService from "@/services/ai/AIService";
import { AVAILABLE_MODELS } from "@/services/ai/availableModels";

// Initialize with a specific model
await AIService.initializeModel({
  modelName: "onnx-community/gemma-3-270m-it-ONNX",
  onProgress: (progress) => {
    console.log(`Loading: ${progress.progress}%`);
  },
});

// Switch models
await AIService.switchModel("google/functiongemma-270m-it");
```

## Model Caching

Models are automatically cached in your browser's IndexedDB storage after the first download. This means:

- **First Load**: Downloads the model from HuggingFace (~50-100MB)
- **Subsequent Loads**: Loads instantly from local cache
- **Storage**: Models persist across browser sessions
- **Clearing**: Clear browser data to remove cached models

### Checking Cache Status

```typescript
import {
  isModelCached,
  getAllModelsCacheStatus,
} from "@/services/ai/availableModels";

// Check if a specific model is cached
const isCached = await isModelCached("onnx-community/gemma-3-270m-it-ONNX");

// Get cache status for all models
const statusMap = await getAllModelsCacheStatus();
console.log(statusMap.get("gemma-3-270m")); // true/false
```

## Performance Comparison

| Model                 | Size  | Download Time\* | Inference Speed | Memory Usage | Quality   |
| --------------------- | ----- | --------------- | --------------- | ------------ | --------- |
| Gemma 3 270M          | 270MB | ~20s            | Fast            | ~350MB       | High      |
| Qwen1.5 0.5B Chat     | 500MB | ~40s            | Medium          | ~600MB       | High      |
| SmolLM2 1.7B Instruct | 1.7GB | ~2-3min         | Medium          | ~2GB         | Very High |

\*Approximate times on a 25 Mbps connection

## Configuration

### Environment Variables

Set in `frontend/.env`:

```env
# Default model to use
VITE_AI_MODEL_NAME=onnx-community/gemma-3-270m-it-ONNX

# Enable caching (recommended)
VITE_AI_CACHE_ENABLED=true
```

### Adding New Models

To add a new model to the available list:

1. Edit `frontend/src/services/ai/availableModels.ts`
2. Add a new entry to the `AVAILABLE_MODELS` array:

```typescript
{
  id: 'my-model',
  name: 'My Model Name',
  modelName: 'org/model-name-on-huggingface',
  description: 'Description of the model',
  size: 75, // Size in MB
  useCases: ['Use case 1', 'Use case 2'],
  performance: {
    speed: 'fast',
    quality: 'high'
  }
}
```

## Browser Compatibility

- **Chrome/Edge**: Full support with WebGPU acceleration (if available)
- **Firefox**: Full support with WASM backend
- **Safari**: Full support with WASM backend
- **Mobile**: Supported but may be slower on older devices

## Troubleshooting

### Model Won't Download

- Check your internet connection
- Ensure you have enough disk space (~500MB free recommended)
- Try clearing browser cache and reloading

### Model Loads Slowly

- First load requires downloading - this is normal
- Subsequent loads should be instant if caching is enabled
- Check `VITE_AI_CACHE_ENABLED=true` in `.env`

### Out of Memory Errors

- Try using the smaller Qwen2 0.5B model
- Close other browser tabs
- Restart your browser

## Technical Details

- **Framework**: Transformers.js (ONNX Runtime)
- **Backend**: WebAssembly (WASM) with optional WebGPU acceleration
- **Quantization**: INT8 quantization for reduced size and faster inference
- **Storage**: IndexedDB for model caching
- **Privacy**: All inference happens locally in the browser

## Resources

- [Transformers.js Documentation](https://huggingface.co/docs/transformers.js)
- [FunctionGemma Model Card](https://huggingface.co/google/functiongemma-270m-it)
- [Qwen2 Model Card](https://huggingface.co/Qwen/Qwen2-0.5B-Instruct)
