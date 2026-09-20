/**
 * Example: Using the Model Selection System
 * 
 * This file demonstrates how to use the available models system
 * programmatically in your application.
 */

import AIService from './AIService';
import { 
  AVAILABLE_MODELS, 
  getModelById, 
  getDefaultModel,
  isModelCached,
  getAllModelsCacheStatus 
} from './availableModels';

/**
 * Example 1: List all available models
 */
export function listAvailableModels() {
  console.log('Available AI Models:');
  AVAILABLE_MODELS.forEach(model => {
    console.log(`
      ID: ${model.id}
      Name: ${model.name}
      Size: ${model.size}MB
      Description: ${model.description}
      Speed: ${model.performance.speed}
      Quality: ${model.performance.quality}
      Use Cases: ${model.useCases.join(', ')}
    `);
  });
}

/**
 * Example 2: Check which models are cached
 */
export async function checkCachedModels() {
  console.log('Checking cache status...');
  
  const cacheStatus = await getAllModelsCacheStatus();
  
  AVAILABLE_MODELS.forEach(model => {
    const isCached = cacheStatus.get(model.id);
    console.log(`${model.name}: ${isCached ? '✓ Cached' : '✗ Not cached'}`);
  });
}

/**
 * Example 3: Initialize with default model
 */
export async function initializeDefaultModel() {
  const defaultModel = getDefaultModel();
  
  console.log(`Initializing ${defaultModel.name}...`);
  
  await AIService.initializeModel({
    modelName: defaultModel.modelName,
    onProgress: (progress) => {
      console.log(`${progress.status}: ${progress.progress}%`);
    }
  });
  
  console.log('Model ready!');
}

/**
 * Example 4: Switch to a specific model
 */
export async function switchToQwen2() {
  const qwen2 = getModelById('qwen2-0.5b');
  
  if (!qwen2) {
    console.error('Qwen2 model not found');
    return;
  }
  
  console.log(`Switching to ${qwen2.name}...`);
  
  await AIService.switchModel(qwen2.modelName, {
    onProgress: (progress) => {
      console.log(`${progress.status}: ${progress.progress}%`);
    }
  });
  
  console.log('Switched successfully!');
}

/**
 * Example 5: Check if a specific model is cached before loading
 */
export async function loadModelIfCached(modelId: string) {
  const model = getModelById(modelId);
  
  if (!model) {
    console.error(`Model ${modelId} not found`);
    return;
  }
  
  const cached = await isModelCached(model.modelName);
  
  if (cached) {
    console.log(`${model.name} is cached, loading instantly...`);
    await AIService.initializeModel({
      modelName: model.modelName
    });
    console.log('Loaded from cache!');
  } else {
    console.log(`${model.name} is not cached. Download required (~${model.size}MB)`);
    console.log('Use initializeModel() to download and load.');
  }
}

/**
 * Example 6: Get current model information
 */
export function getCurrentModelInfo() {
  const currentModelName = AIService.getCurrentModelName();
  
  if (!currentModelName) {
    console.log('No model currently loaded');
    return;
  }
  
  const model = AVAILABLE_MODELS.find(m => m.modelName === currentModelName);
  
  if (model) {
    console.log(`Current Model: ${model.name}`);
    console.log(`Size: ${model.size}MB`);
    console.log(`Best for: ${model.useCases.join(', ')}`);
  }
}

/**
 * Example 7: Choose best model for a task
 */
export function recommendModelForTask(task: 'function-calling' | 'general-chat' | 'quick-response') {
  let recommendedModel;
  
  switch (task) {
    case 'function-calling':
      recommendedModel = getModelById('functiongemma-270m');
      console.log('Recommended: FunctionGemma 270M');
      console.log('Reason: Optimized for function calling and tool use');
      break;
      
    case 'general-chat':
      recommendedModel = getModelById('qwen2-0.5b');
      console.log('Recommended: Qwen2 0.5B');
      console.log('Reason: Good balance of speed and quality for chat');
      break;
      
    case 'quick-response':
      recommendedModel = getModelById('qwen2-0.5b');
      console.log('Recommended: Qwen2 0.5B');
      console.log('Reason: Smallest size, fastest inference');
      break;
  }
  
  return recommendedModel;
}

/**
 * Example 8: Complete workflow - check cache, load, and use
 */
export async function completeWorkflow() {
  // 1. List available models
  console.log('=== Available Models ===');
  listAvailableModels();
  
  // 2. Check cache status
  console.log('\n=== Cache Status ===');
  await checkCachedModels();
  
  // 3. Get recommendation
  console.log('\n=== Recommendation ===');
  const recommended = recommendModelForTask('function-calling');
  
  // 4. Load the model
  if (recommended) {
    console.log('\n=== Loading Model ===');
    await AIService.initializeModel({
      modelName: recommended.modelName,
      onProgress: (progress) => {
        if (progress.progress % 20 === 0) { // Log every 20%
          console.log(`Progress: ${progress.progress}%`);
        }
      }
    });
  }
  
  // 5. Use the model
  console.log('\n=== Using Model ===');
  const response = await AIService.generateResponse('List all Docker containers');
  console.log('Response:', response.text);
  
  // 6. Get current model info
  console.log('\n=== Current Model ===');
  getCurrentModelInfo();
}

