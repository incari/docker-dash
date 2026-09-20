# AI Agent System - Usage Guide

Complete guide for using and extending the AI agent system in the Docker Dashboard.

## Quick Start

### 1. Basic Integration

```typescript
import { chatIntegration } from '@/services/ai';
import { DockerContainer, Shortcut } from '@/types';

// In your component
const [containers, setContainers] = useState<DockerContainer[]>([]);
const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);

// Update context whenever data changes
useEffect(() => {
  chatIntegration.updateContext(containers, shortcuts);
}, [containers, shortcuts]);

// Process user message
const handleUserMessage = async (message: string) => {
  const response = await chatIntegration.processMessage(message);
  
  if (response.confirmationRequest) {
    // Show confirmation modal
    setConfirmationRequest(response.confirmationRequest);
  } else {
    // Display response
    addMessage({
      role: 'assistant',
      content: chatIntegration.formatResponse(response),
    });
  }
};
```

### 2. Handling Confirmations

```typescript
import { AIConfirmationModal } from '@/components/AIChat/ConfirmationModal';

const [confirmationRequest, setConfirmationRequest] = useState(null);

const handleConfirm = async () => {
  const result = await chatIntegration.confirmPendingAction();
  
  addMessage({
    role: 'assistant',
    content: chatIntegration.formatResponse(result),
  });
  
  setConfirmationRequest(null);
};

const handleCancel = () => {
  chatIntegration.cancelPendingAction();
  setConfirmationRequest(null);
};

// In JSX
<AIConfirmationModal
  isOpen={!!confirmationRequest}
  confirmationRequest={confirmationRequest}
  onConfirm={handleConfirm}
  onCancel={handleCancel}
/>
```

### 3. Using Example Queries

```typescript
import { exampleQueries, getBeginnerExamples } from '@/services/ai';

// Show example queries to users
const examples = getBeginnerExamples();

examples.map(example => (
  <button onClick={() => handleUserMessage(example.text)}>
    {example.text}
  </button>
));
```

## Advanced Usage

### Custom Tool Creation

Add a new tool to `tools/dockerTools.ts`:

```typescript
// 1. Create the function
async function getContainerStats(params: { containerId: string }): Promise<any> {
  // Your implementation
  const stats = await containersApi.getStats(params.containerId);
  return {
    cpu: stats.cpu_percent,
    memory: stats.memory_usage,
    network: stats.network_io,
  };
}

// 2. Add to dockerTools array
export const dockerTools: Tool[] = [
  // ... existing tools
  {
    name: "getContainerStats",
    description: "Get CPU, memory, and network statistics for a container",
    parameters: {
      containerId: {
        type: "string",
        description: "The ID of the container",
        required: true,
      },
    },
    safetyLevel: SafetyLevel.SAFE,
    execute: getContainerStats,
  },
];

// 3. Update system prompt to include new function
```

### Custom Safety Rules

Add patterns to `safety/guardrails.ts`:

```typescript
// Block dangerous operations
const BLOCKED_PATTERNS = [
  /\b(delete|remove|destroy|drop|truncate|rm)\b.*\b(all|everything|\*)\b/i,
  /\byour-custom-pattern\b/i, // Add your pattern
];

// Require confirmation
const CONFIRMATION_PATTERNS = [
  /\b(start|stop|restart|kill)\b.*\b(container|service)\b/i,
  /\byour-confirmation-pattern\b/i, // Add your pattern
];
```

### Custom Context

Extend context builder in `context/contextBuilder.ts`:

```typescript
export interface ExtendedDashboardContext extends DashboardContext {
  customData: any;
}

export function buildExtendedContext(
  containers: DockerContainer[],
  shortcuts: Shortcut[],
  customData: any
): ExtendedDashboardContext {
  const baseContext = buildDashboardContext(containers, shortcuts);
  return {
    ...baseContext,
    customData,
  };
}
```

## Testing

### Unit Testing Tools

```typescript
import { getToolByName } from '@/services/ai';

test('findContainersByName returns matching containers', async () => {
  const tool = getToolByName('findContainersByName');
  const result = await tool.execute({ name: 'nginx' });
  
  expect(result.found).toBeGreaterThan(0);
  expect(result.containers[0].name).toContain('nginx');
});
```

### Testing Safety Guardrails

```typescript
import { validateAction, isBlockedOperation } from '@/services/ai';

test('blocks dangerous operations', () => {
  const result = validateAction('delete all containers');
  
  expect(result.allowed).toBe(false);
  expect(result.safetyLevel).toBe(SafetyLevel.BLOCKED);
});

test('requires confirmation for container control', () => {
  const result = validateAction('start container');
  
  expect(result.allowed).toBe(true);
  expect(result.requiresConfirmation).toBe(true);
});
```

### Testing Function Parser

```typescript
import { parseFunctionCalls } from '@/services/ai';

test('parses function calls correctly', () => {
  const output = `
    I'll list your containers.
    
    FUNCTION_CALL: listAllContainers
    PARAMETERS: {}
  `;
  
  const calls = parseFunctionCalls(output);
  
  expect(calls).toHaveLength(1);
  expect(calls[0].functionName).toBe('listAllContainers');
});
```

## Best Practices

### 1. Always Update Context

```typescript
// ✅ Good: Update context when data changes
useEffect(() => {
  chatIntegration.updateContext(containers, shortcuts);
}, [containers, shortcuts]);

// ❌ Bad: Stale context
chatIntegration.updateContext(containers, shortcuts); // Only once
```

### 2. Handle All Response Types

```typescript
const response = await chatIntegration.processMessage(message);

// Check for confirmation
if (response.confirmationRequest) {
  handleConfirmation(response.confirmationRequest);
}

// Check for errors
if (!response.success) {
  handleError(response.error);
}

// Handle success
if (response.success && response.data) {
  handleSuccess(response.data);
}
```

### 3. Provide User Feedback

```typescript
// Show loading state
setIsLoading(true);

try {
  const response = await chatIntegration.processMessage(message);
  // Handle response
} catch (error) {
  showError('Failed to process message');
} finally {
  setIsLoading(false);
}
```

### 4. Use Example Queries

```typescript
// Help users discover capabilities
import { exampleQueries, getCategoryColorClass } from '@/services/ai';

const ExampleQueries = () => (
  <div>
    {exampleQueries.map(example => (
      <button
        key={example.text}
        className={getCategoryColorClass(example.category)}
        onClick={() => handleUserMessage(example.text)}
      >
        {example.text}
      </button>
    ))}
  </div>
);
```

## Troubleshooting

### Issue: Functions not executing

**Solution**: Check safety level and ensure confirmation is handled:

```typescript
const tool = getToolByName('startContainer');
console.log(tool.safetyLevel); // REQUIRES_CONFIRMATION

// Must handle confirmation
if (response.confirmationRequest) {
  // Show modal and get user approval
}
```

### Issue: Invalid function calls

**Solution**: Validate parameters before execution:

```typescript
import { validateFunctionCall } from '@/services/ai';

const validation = validateFunctionCall(functionCall);
if (!validation.valid) {
  console.error(validation.error);
}
```

### Issue: Context too large

**Solution**: Use token optimization:

```typescript
import { optimizeContextForTokenLimit } from '@/services/ai';

const optimizedContext = optimizeContextForTokenLimit(context, 500);
```

## Performance Tips

1. **Lazy load AI service**: Only initialize when chat is opened
2. **Debounce context updates**: Don't update on every keystroke
3. **Cache responses**: Store common queries
4. **Limit context size**: Use `optimizeContextForTokenLimit`
5. **Batch operations**: Execute multiple safe operations together

## Security Considerations

1. **Never bypass safety checks**: Always use `validateAction`
2. **Sanitize all inputs**: Use `sanitizeInput` on user messages
3. **Validate parameters**: Use `validateParameters` before execution
4. **Require confirmation**: For any state-changing operations
5. **Log security events**: Track blocked operations

## Next Steps

- Integrate with real LLM API (OpenAI, Anthropic, etc.)
- Add conversation history persistence
- Implement streaming responses
- Add multi-step workflows
- Create backend endpoint for container logs

