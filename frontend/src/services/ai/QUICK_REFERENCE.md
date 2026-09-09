# AI Agent System - Quick Reference

## Import Everything You Need

```typescript
import {
  // Integration
  chatIntegration,
  
  // Types
  AgentResponse,
  ConfirmationRequest,
  SafetyLevel,
  
  // Tools
  dockerTools,
  getToolByName,
  
  // Safety
  validateAction,
  isBlockedOperation,
  requiresConfirmation,
  
  // Examples
  exampleQueries,
  getBeginnerExamples,
} from '@/services/ai';

// Components
import { AIConfirmationModal } from '@/components/AIChat/ConfirmationModal';
```

## Basic Usage (3 Steps)

### 1. Update Context

```typescript
useEffect(() => {
  chatIntegration.updateContext(containers, shortcuts);
}, [containers, shortcuts]);
```

### 2. Process Message

```typescript
const response = await chatIntegration.processMessage(userMessage);
```

### 3. Handle Response

```typescript
if (response.confirmationRequest) {
  // Show confirmation modal
  setConfirmationRequest(response.confirmationRequest);
} else {
  // Display response
  addMessage(chatIntegration.formatResponse(response));
}
```

## Confirmation Flow

```typescript
// Show modal
<AIConfirmationModal
  isOpen={!!confirmationRequest}
  confirmationRequest={confirmationRequest}
  onConfirm={handleConfirm}
  onCancel={handleCancel}
/>

// On confirm
const handleConfirm = async () => {
  const result = await chatIntegration.confirmPendingAction();
  addMessage(chatIntegration.formatResponse(result));
  setConfirmationRequest(null);
};

// On cancel
const handleCancel = () => {
  chatIntegration.cancelPendingAction();
  setConfirmationRequest(null);
};
```

## Available Tools

### Safe (No Confirmation)
- `findContainersByName(name: string)`
- `getContainerHealth(containerId: string)`
- `listAllContainers()`
- `getContainerLogs(containerId: string, lines?: number)`
- `listShortcuts()`

### Requires Confirmation
- `startContainer(containerId: string)`
- `stopContainer(containerId: string)`
- `restartContainer(containerId: string)`
- `openContainerUrl(url: string)`

## Safety Levels

```typescript
SafetyLevel.SAFE                    // Execute immediately
SafetyLevel.REQUIRES_CONFIRMATION   // Ask user first
SafetyLevel.BLOCKED                 // Never execute
```

## Example Queries

```typescript
// Get beginner examples
const examples = getBeginnerExamples();
// Returns: ["Show me all my containers", "Find my postgres database", "List all my shortcuts"]

// Get all examples
exampleQueries.forEach(example => {
  console.log(example.text, example.category);
});

// Filter by category
const containerExamples = exampleQueries.filter(e => e.category === 'containers');
```

## Common Patterns

### Loading State

```typescript
const [isLoading, setIsLoading] = useState(false);

const handleMessage = async (text: string) => {
  setIsLoading(true);
  try {
    const response = await chatIntegration.processMessage(text);
    // Handle response
  } finally {
    setIsLoading(false);
  }
};
```

### Error Handling

```typescript
const response = await chatIntegration.processMessage(text);

if (!response.success) {
  showError(response.error || 'Something went wrong');
  return;
}

// Handle success
```

### Check Processing State

```typescript
if (chatIntegration.isProcessing()) {
  console.log('Already processing a request');
  return;
}
```

## Validation

### Validate Action

```typescript
const validation = validateAction('start container');

if (!validation.allowed) {
  console.log('Blocked:', validation.reason);
}

if (validation.requiresConfirmation) {
  console.log('Needs user approval');
}
```

### Check if Blocked

```typescript
if (isBlockedOperation('delete all containers')) {
  console.log('This operation is blocked');
}
```

### Check if Needs Confirmation

```typescript
if (requiresConfirmation('start nginx')) {
  console.log('This needs confirmation');
}
```

## Adding a New Tool

```typescript
// 1. Add function
async function myTool(params: { param: string }): Promise<any> {
  // Implementation
  return { result: 'success' };
}

// 2. Add to dockerTools array
{
  name: "myTool",
  description: "What it does",
  parameters: {
    param: {
      type: "string",
      description: "Parameter description",
      required: true,
    },
  },
  safetyLevel: SafetyLevel.SAFE,
  execute: myTool,
}

// 3. Update system prompt
```

## Testing

```typescript
import { getToolByName } from '@/services/ai';

// Test a tool
const tool = getToolByName('listAllContainers');
const result = await tool.execute({});
console.log(result);

// Test safety
import { validateAction } from '@/services/ai';
const validation = validateAction('delete all');
expect(validation.allowed).toBe(false);
```

## Troubleshooting

### Functions not executing?
- Check safety level: `tool.safetyLevel`
- Handle confirmations: `if (response.confirmationRequest)`

### Invalid parameters?
- Check parameter schema in tool definition
- Validate: `validateFunctionCall(functionCall)`

### Context not updating?
- Call `chatIntegration.updateContext()` when data changes
- Use `useEffect` to track dependencies

### Response formatting issues?
- Use `chatIntegration.formatResponse(response)`
- Check for `response.success` and `response.error`

## Quick Checklist

- [ ] Import `chatIntegration`
- [ ] Update context in `useEffect`
- [ ] Process message with `processMessage()`
- [ ] Handle `confirmationRequest` if present
- [ ] Show `AIConfirmationModal` for confirmations
- [ ] Format response with `formatResponse()`
- [ ] Handle loading states
- [ ] Handle errors
- [ ] Add example queries for UX

## See Also

- **Full Documentation**: `frontend/src/services/ai/README.md`
- **Usage Guide**: `frontend/src/services/ai/USAGE_GUIDE.md`
- **Example Component**: `frontend/src/components/AIChat/AIChat.example.tsx`
- **Tests**: `frontend/src/services/ai/__tests__/DockerAgent.test.ts`

