# AI Service Layer

This directory contains the AI service infrastructure for the Docker Dashboard, powered by Transformers.js and the FunctionGemma 270M model.

## Overview

The AI service provides a complete infrastructure for running AI models directly in the browser using WebAssembly (WASM) or WebGPU, with no server-side dependencies.

## Architecture

### Files

- **`AIService.ts`** - Main service class with singleton pattern
- **`modelLoader.ts`** - Model loading and initialization with caching
- **`types.ts`** - TypeScript type definitions
- **`index.ts`** - Public exports
- **`__tests__/AIService.test.ts`** - Unit tests

## Usage

### Basic Usage

```typescript
import AIService from '@/services/ai/AIService';

// Initialize the model (do this once, typically on app startup)
await AIService.initializeModel({
  onProgress: (progress) => {
    console.log(`Loading: ${progress.progress}%`);
  }
});

// Generate a response
const response = await AIService.generateResponse('Hello, how are you?');
if (response.success) {
  console.log(response.text);
}
```

### Advanced Configuration

```typescript
import AIService from '@/services/ai/AIService';

// Initialize with custom configuration
await AIService.initializeModel({
  modelName: 'google/functiongemma-270m-it',
  device: 'webgpu', // or 'wasm'
  temperature: 0.7,
  maxTokens: 512,
  quantized: true,
  cacheEnabled: true,
  onProgress: (progress) => {
    console.log(`Status: ${progress.status}, Progress: ${progress.progress}%`);
  }
});

// Generate with custom options
const response = await AIService.generateResponse(
  'Explain Docker containers',
  {
    maxTokens: 256,
    temperature: 0.5,
    topP: 0.9,
    stopSequences: ['\n\n']
  }
);
```

### Conversation Management

```typescript
// Add system message
AIService.addSystemMessage('You are a helpful Docker assistant.');

// Get conversation history
const history = AIService.getConversationHistory();

// Clear history
AIService.clearConversationHistory();
```

### Model Status

```typescript
// Check if model is loaded
const isLoaded = AIService.isModelLoaded();

// Get detailed status
const status = AIService.getModelStatus();
console.log(status.loaded, status.progress, status.status);
```

## Configuration

Environment variables in `frontend/.env`:

```env
# Model name (HuggingFace identifier)
VITE_AI_MODEL_NAME=google/functiongemma-270m-it

# Enable IndexedDB caching
VITE_AI_CACHE_ENABLED=true
```

## Features

### ✅ Implemented

- **Model Loading**: Automatic download and initialization
- **WebGPU Support**: Hardware acceleration with WASM fallback
- **Caching**: IndexedDB-based model caching
- **Progress Tracking**: Real-time loading progress callbacks
- **Singleton Pattern**: Single model instance across the app
- **Conversation History**: Track user/assistant messages
- **TypeScript**: Full type safety
- **Error Handling**: Comprehensive error management

### 🚧 Not Yet Implemented (UI Integration)

- UI components for chat interface
- Integration with Docker Dashboard views
- Streaming responses
- Multi-turn conversations with context

## Performance

- **Model Size**: ~270M parameters (quantized)
- **First Load**: ~30-60 seconds (downloads model)
- **Subsequent Loads**: Instant (cached in IndexedDB)
- **Inference**: Depends on device (WebGPU faster than WASM)

## Browser Compatibility

- **WebGPU**: Chrome 113+, Edge 113+
- **WASM**: All modern browsers
- **Caching**: Browsers with IndexedDB support

## Testing

Run tests:

```bash
npm test src/services/ai/__tests__/AIService.test.ts
```

## AI Agent System (NEW)

A comprehensive AI agent system with function calling and safety guardrails has been added to enable natural language Docker management.

### Architecture

```
User Interface (AIChat)
        ↓
Chat Integration Layer (chatIntegration.ts)
        ↓
Docker AI Agent (DockerAgent.ts)
        ↓
    ┌───┴───┬────────┬──────────┐
    ↓       ↓        ↓          ↓
  Tools  Safety  Prompts   Context
```

### Components

#### 1. **Docker Tools** (`tools/dockerTools.ts`)
Available functions with safety levels:
- **Safe**: `findContainersByName`, `getContainerHealth`, `listAllContainers`, `getContainerLogs`, `listShortcuts`
- **Requires Confirmation**: `startContainer`, `stopContainer`, `restartContainer`, `openContainerUrl`

#### 2. **Safety Guardrails** (`safety/guardrails.ts`)
Three-tier safety system:
- **SAFE**: Execute immediately (read-only operations)
- **REQUIRES_CONFIRMATION**: User approval needed (container control, URLs)
- **BLOCKED**: Never execute (bulk deletions, database ops, shell commands)

Features:
- Pattern-based blocking (delete all, drop database, etc.)
- Input sanitization (prevents injection attacks)
- Parameter validation

#### 3. **System Prompts** (`prompts/systemPrompt.ts`)
Defines AI personality, capabilities, and constraints:
- Role definition
- Available functions
- Safety rules
- Response format
- Example interactions

#### 4. **Function Call Parser** (`parsers/functionCallParser.ts`)
Parses LLM output to extract function calls:
```
FUNCTION_CALL: functionName
PARAMETERS: {"param1": "value1"}
```

#### 5. **Context Builder** (`context/contextBuilder.ts`)
Manages dashboard state:
- Builds context from containers and shortcuts
- Token-aware formatting
- Optimizes for LLM token limits

#### 6. **Docker Agent** (`agent/DockerAgent.ts`)
Main orchestrator:
- Processes user queries
- Validates safety
- Executes functions
- Handles confirmations

#### 7. **Chat Integration** (`integration/chatIntegration.ts`)
UI integration layer:
- State management
- Confirmation handling
- Response formatting

#### 8. **Example Queries** (`examples.ts`)
Pre-built queries categorized by:
- Containers (list, status)
- Search (find specific containers)
- Shortcuts (list, favorites)
- Control (start/stop/restart)

### Usage Example

```typescript
import { chatIntegration } from '@/services/ai';

// Update context with current data
chatIntegration.updateContext(containers, shortcuts);

// Process user message
const response = await chatIntegration.processMessage("Show me all containers");

// Handle confirmation if needed
if (response.confirmationRequest) {
  // Show AIConfirmationModal
  // On confirm:
  const result = await chatIntegration.confirmPendingAction();
}
```

### Safety Features

**Blocked Operations:**
- Delete/remove all containers
- Drop database
- Shell command execution
- File system access

**Confirmation Required:**
- Start/stop/restart containers
- Open URLs
- Modify settings

**Input Sanitization:**
- Removes HTML tags
- Strips shell metacharacters
- Validates parameters

### Example Queries

Users can try:
- "Show me all my containers"
- "Find my postgres database"
- "Which containers are running?"
- "Start the nginx container" (requires confirmation)
- "List all my shortcuts"

### Components

**AIConfirmationModal** (`components/AIChat/ConfirmationModal.tsx`):
- Shows action details
- Lists affected resources
- Requires explicit user confirmation
- Displays safety warnings

## Next Steps

1. ✅ ~~Implement function calling for Docker operations~~ (DONE)
2. ✅ ~~Add safety guardrails~~ (DONE)
3. Integrate AI agent with existing AIChat UI component
4. Connect to real LLM API (replace mock responses)
5. Add streaming support
6. Add conversation persistence
7. Implement container logs retrieval backend endpoint

