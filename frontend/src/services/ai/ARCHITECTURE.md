# AI Agent System Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE                             │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    AIChat Component                          │   │
│  │  • Message display                                           │   │
│  │  • Input handling                                            │   │
│  │  • Example queries                                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                ↓                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              AIConfirmationModal Component                   │   │
│  │  • Shows action details                                      │   │
│  │  • Lists affected resources                                  │   │
│  │  • Confirm/Cancel buttons                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      INTEGRATION LAYER                               │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  chatIntegration.ts                          │   │
│  │  • State management (isProcessing, pendingConfirmation)      │   │
│  │  • processMessage(userInput)                                 │   │
│  │  • confirmPendingAction()                                    │   │
│  │  • cancelPendingAction()                                     │   │
│  │  • formatResponse(response)                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         AGENT LAYER                                  │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    DockerAgent.ts                            │   │
│  │  • setContext(context)                                       │   │
│  │  • processQuery(userInput) → AgentResponse                   │   │
│  │  • executeConfirmedAction(confirmationRequest)               │   │
│  │  • generateLLMResponse(userInput)                            │   │
│  │  • executeFunctionCalls(functionCalls)                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────┬──────────┬──────────┬──────────┬──────────────────────────────┘
      │          │          │          │
      ▼          ▼          ▼          ▼
┌──────────┐ ┌────────┐ ┌────────┐ ┌──────────┐
│  TOOLS   │ │ SAFETY │ │PROMPTS │ │ CONTEXT  │
└──────────┘ └────────┘ └────────┘ └──────────┘
```

## Component Details

### 1. Tools Layer (`tools/dockerTools.ts`)

```
┌─────────────────────────────────────────┐
│           Docker Tools                   │
├─────────────────────────────────────────┤
│ Safe Operations:                         │
│  • findContainersByName                  │
│  • getContainerHealth                    │
│  • listAllContainers                     │
│  • getContainerLogs                      │
│  • listShortcuts                         │
├─────────────────────────────────────────┤
│ Requires Confirmation:                   │
│  • startContainer                        │
│  • stopContainer                         │
│  • restartContainer                      │
│  • openContainerUrl                      │
└─────────────────────────────────────────┘
```

### 2. Safety Layer (`safety/guardrails.ts`)

```
┌─────────────────────────────────────────┐
│         Safety Guardrails                │
├─────────────────────────────────────────┤
│ Input Sanitization:                      │
│  • Remove HTML tags                      │
│  • Strip shell metacharacters            │
│  • Trim whitespace                       │
├─────────────────────────────────────────┤
│ Validation:                              │
│  • validateAction(action)                │
│  • isBlockedOperation(action)            │
│  • requiresConfirmation(action)          │
│  • validateParameters(fn, params)        │
├─────────────────────────────────────────┤
│ Blocked Patterns:                        │
│  • delete all, remove all                │
│  • drop database, truncate               │
│  • rm -rf, format, wipe                  │
├─────────────────────────────────────────┤
│ Confirmation Patterns:                   │
│  • start/stop/restart container          │
│  • open url                              │
│  • modify settings                       │
└─────────────────────────────────────────┘
```

### 3. Prompts Layer (`prompts/systemPrompt.ts`)

```
┌─────────────────────────────────────────┐
│          System Prompts                  │
├─────────────────────────────────────────┤
│ SYSTEM_PROMPT:                           │
│  • AI role and personality               │
│  • Available capabilities                │
│  • Safety constraints                    │
│  • Function calling format               │
│  • Example interactions                  │
├─────────────────────────────────────────┤
│ Helper Prompts:                          │
│  • ERROR_PROMPT                          │
│  • FORMAT_CONTAINER_PROMPT               │
│  • CONFIRMATION_PROMPT                   │
└─────────────────────────────────────────┘
```

### 4. Context Layer (`context/contextBuilder.ts`)

```
┌─────────────────────────────────────────┐
│         Context Builder                  │
├─────────────────────────────────────────┤
│ buildDashboardContext():                 │
│  • containers: DockerContainer[]         │
│  • shortcuts: Shortcut[]                 │
│  • runningContainers: number             │
│  • stoppedContainers: number             │
│  • timestamp: Date                       │
├─────────────────────────────────────────┤
│ formatContextForLLM():                   │
│  • Token-aware formatting                │
│  • Limits containers/shortcuts           │
│  • Concise summaries                     │
├─────────────────────────────────────────┤
│ optimizeContextForTokenLimit():          │
│  • Reduces data to fit token limit       │
│  • Progressive reduction                 │
│  • Maintains essential info              │
└─────────────────────────────────────────┘
```

## Data Flow

### Query Processing Flow

```
User Input
    ↓
sanitizeInput()
    ↓
validateAction()
    ↓
┌─────────────────┐
│ Is Blocked?     │ → YES → Return error
└─────────────────┘
    ↓ NO
generateLLMResponse()
    ↓
parseFunctionCalls()
    ↓
validateFunctionCall()
    ↓
┌─────────────────┐
│ Needs Confirm?  │ → YES → Return ConfirmationRequest
└─────────────────┘
    ↓ NO
executeFunctionCalls()
    ↓
formatResponse()
    ↓
Return AgentResponse
```

### Confirmation Flow

```
User confirms action
    ↓
executeConfirmedAction()
    ↓
executeSingleFunction()
    ↓
tool.execute(parameters)
    ↓
Return result
```

## Type Hierarchy

```
AgentResponse
├── message: string
├── success: boolean
├── executedFunctions?: FunctionCall[]
├── confirmationRequest?: ConfirmationRequest
├── error?: string
└── data?: any

ConfirmationRequest
├── id: string
├── action: string
├── description: string
├── affectedResources: string[]
├── functionCall: FunctionCall
└── timestamp: Date

FunctionCall
├── functionName: string
├── parameters: Record<string, any>
└── rawText?: string

Tool
├── name: string
├── description: string
├── parameters: Record<string, ParameterSchema>
├── safetyLevel: SafetyLevel
└── execute: (params) => Promise<any>
```

## Safety Validation Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    User Input                                │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Sanitize Input                                       │
│  • Remove HTML tags: <script> → ""                          │
│  • Strip shell chars: ; | & $ ` → ""                        │
│  • Trim whitespace                                           │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Check Blocked Patterns                               │
│  • "delete all" → BLOCKED                                    │
│  • "drop database" → BLOCKED                                 │
│  • "rm -rf" → BLOCKED                                        │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Check Confirmation Patterns                          │
│  • "start container" → REQUIRES_CONFIRMATION                 │
│  • "open url" → REQUIRES_CONFIRMATION                        │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Parse Function Calls                                 │
│  • Extract FUNCTION_CALL and PARAMETERS                      │
│  • Validate JSON format                                      │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 5: Validate Parameters                                  │
│  • Check required parameters                                 │
│  • Validate types                                            │
│  • Validate URLs, IDs, etc.                                  │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 6: Check Tool Safety Level                              │
│  • SAFE → Execute immediately                                │
│  • REQUIRES_CONFIRMATION → Request approval                  │
│  • BLOCKED → Reject                                          │
└───────────────────────────┬─────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 7: Execute or Request Confirmation                      │
└─────────────────────────────────────────────────────────────┘
```

## Integration Points

### With Existing AIChat UI

```typescript
// In your AIChat component
import { chatIntegration } from '@/services/ai';
import { AIConfirmationModal } from '@/components/AIChat/ConfirmationModal';

// Update context
useEffect(() => {
  chatIntegration.updateContext(containers, shortcuts);
}, [containers, shortcuts]);

// Process messages
const handleMessage = async (text: string) => {
  const response = await chatIntegration.processMessage(text);
  // Handle response
};
```

### With Docker API

```typescript
// Tools call existing API methods
import { containersApi, shortcutsApi } from '../../api';

async function listAllContainers() {
  const containers = await containersApi.getAll();
  // Process and return
}
```

## Extension Points

1. **Add New Tools**: Extend `dockerTools` array
2. **Custom Safety Rules**: Add patterns to `guardrails.ts`
3. **Enhanced Context**: Extend `DashboardContext` interface
4. **Custom Prompts**: Modify `systemPrompt.ts`
5. **Additional Parsers**: Add to `parsers/` directory

