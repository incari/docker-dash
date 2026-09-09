# AI Chat Component

A floating AI chat interface for the Docker Dashboard with a modern, animated UI and integrated Transformers.js AI model running entirely in the browser.

## Features

- **Floating Chat Button**: Bottom-right corner with gradient styling and smooth animations
- **Expandable Panel**: 400px × 600px chat panel that slides up from the bottom-right
- **Message History**: Displays user messages (blue) and AI responses (gray/purple)
- **Auto-scroll**: Automatically scrolls to the latest message
- **Typing Indicator**: Shows animated dots when AI is processing
- **Clear Chat**: Button to clear all messages
- **Suggested Queries**: Clickable query cards to help users get started
- **Welcome Message**: Friendly greeting when model is loaded
- **Model Status Badge**: Shows "Ready" indicator in header when model is loaded
- **AI Model Integration**:
  - Browser-based AI using Transformers.js (Qwen1.5 0.5B Chat)
  - Model download progress tracking with visual progress bar
  - Automatic model initialization
  - Docker context awareness (containers & shortcuts)
  - Fallback to mock responses if model not loaded
- **Confirmation Requests**: Interactive UI for dangerous operations
- **Keyboard Support**:
  - Enter to send message
  - Shift+Enter for new line
  - Auto-resizing textarea

## Components

### AIChat (Main Component)
The main floating chat interface with state management and AI integration.

**Features:**
- Integrates with `chatIntegration` for AI processing
- Updates Docker context automatically
- Handles confirmation requests
- Manages model initialization state

### ChatMessage
Individual message component with:
- User/AI avatar icons
- Message bubbles with different styling
- Timestamps
- **Confirmation UI**: Interactive buttons for dangerous operations
- Support for formatted responses (✅, ❌, 🔒 indicators)

### ChatInput
Input field with:
- Auto-resizing textarea
- Send button
- Keyboard shortcuts
- Disabled state during AI processing

### ModelStatus
Model initialization and progress component:
- Download progress bar
- Model status indicators
- Initialize/retry buttons
- Compact display when model is ready

### useAIModel (Hook)
Custom hook for managing AI model state:
- Model initialization
- Progress tracking
- Error handling
- Response generation

## Usage

```tsx
import { AIChat } from "./components/AIChat/AIChat";

function App() {
  return (
    <div>
      {/* Your app content */}
      <AIChat />
    </div>
  );
}
```

## AI Integration

The AI chat is fully integrated with the transformer.js-based AI service layer:

### Architecture

```
AIChat Component
    ↓
useAIModel Hook → AIService (transformer.js)
    ↓
chatIntegration → DockerAgent → Tools + Safety + Prompts
    ↓
Docker API / Dashboard Context
```

### How It Works

1. **Model Initialization**: User clicks "Download & Initialize Model" button
2. **Model Download**: Progress is tracked and displayed in real-time
3. **Context Updates**: Dashboard context (containers, shortcuts) is automatically synced
4. **Message Processing**:
   - User sends message
   - `chatIntegration.processMessage()` processes it through DockerAgent
   - Agent parses function calls, validates safety, and executes tools
   - Response is formatted and displayed
5. **Confirmations**: Dangerous operations require user confirmation via interactive UI

### Model Configuration

The AI uses the FunctionGemma 270M model by default. Configuration can be changed via environment variables:

```env
VITE_AI_MODEL_NAME=google/functiongemma-270m-it
VITE_AI_CACHE_ENABLED=true
```

### Example Flow

```tsx
// User: "Stop the nginx container"
// ↓
// chatIntegration.processMessage("Stop the nginx container")
// ↓
// DockerAgent parses: stopContainer({ containerId: "nginx" })
// ↓
// Safety check: REQUIRES_CONFIRMATION
// ↓
// UI shows confirmation request
// ↓
// User clicks "Confirm"
// ↓
// chatIntegration.confirmPendingAction()
// ↓
// Container stopped, success message displayed
```

## Styling

The component uses:
- **Tailwind CSS** for styling
- **Framer Motion** for animations
- **Lucide React** for icons
- Matches the existing dashboard dark theme
- Custom scrollbar styles from `index.css`

## Available Docker Commands

The AI can help with:

- **Container Management**: Start, stop, restart containers
- **Information Queries**: List containers, get container details
- **Shortcut Management**: Create, edit, delete shortcuts
- **Dashboard Navigation**: Help with UI features

Example queries:
- "Show me all running containers"
- "Stop the nginx container"
- "Create a shortcut for my postgres database"
- "What containers are using the most resources?"

## Safety Features

- **Input Sanitization**: All user inputs are sanitized
- **Action Validation**: Dangerous operations require confirmation
- **Safety Levels**:
  - `SAFE`: Execute immediately (read operations)
  - `REQUIRES_CONFIRMATION`: Ask user first (stop, restart)
  - `BLOCKED`: Never execute (destructive operations)

## Future Enhancements

- [ ] Persist chat history to localStorage or database
- [ ] Add streaming responses for real-time output
- [ ] Add markdown rendering for AI responses
- [ ] Add code syntax highlighting
- [ ] Add file/image upload support
- [ ] Add voice input
- [ ] Add chat history management (multiple conversations)
- [ ] Add settings panel (model selection, temperature, etc.)
- [ ] Add WebGPU support for faster inference
- [ ] Add multi-turn conversation context

