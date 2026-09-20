# AI i18n Quick Reference Card

## Import

```typescript
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
```

## Common Patterns

### Chat Interface
```typescript
{t('ai.chat.title')}                    // "AI Assistant" / "Asistente IA"
{t('ai.chat.placeholder')}              // "Ask me about your containers..."
{t('ai.chat.welcomeMessage')}           // Welcome message
{t('ai.chat.thinking')}                 // "Thinking..." / "Pensando..."
{t('ai.chat.send')}                     // "Send" / "Enviar"
```

### Confirmation Modal
```typescript
{t('ai.confirmation.title')}            // "Confirm Action" / "Confirmar Acción"
{t('ai.confirmation.action')}           // "Action" / "Acción"
{t('ai.confirmation.description')}      // "Description" / "Descripción"
{t('ai.confirmation.affectedResources')} // "Affected Resources"
{t('ai.confirmation.warning')}          // Warning message
```

### Responses (with interpolation)
```typescript
{t('ai.responses.containersFound', { count: 5 })}
// "I found 5 container(s):" / "Encontré 5 contenedor(es):"

{t('ai.responses.containerStarted')}
// "✅ Container started successfully."

{t('ai.responses.shortcutsFound', { count: shortcuts.length })}
// "I found X shortcut(s):"
```

### Errors (with interpolation)
```typescript
{t('ai.errors.containerNotFound', { name: 'nginx' })}
// "Container not found: nginx" / "Contenedor no encontrado: nginx"

{t('ai.errors.operationFailed', { error: errorMsg })}
// "Operation failed: [error]" / "Operación fallida: [error]"

{t('ai.errors.general')}
// "An error occurred..." / "Ocurrió un error..."
```

### Status
```typescript
{t('ai.status.processing')}             // "Processing..." / "Procesando..."
{t('ai.status.executing')}              // "Executing action..."
{t('ai.status.completed')}              // "Completed" / "Completado"
{t('ai.status.waiting')}                // "Waiting for confirmation..."
```

### Safety
```typescript
{t('ai.safety.blocked')}                // "Blocked" / "Bloqueado"
{t('ai.safety.requiresConfirmation')}   // "Requires Confirmation"
{t('ai.safety.safe')}                   // "Safe" / "Seguro"
{t('ai.safety.dangerousOperation')}     // Warning message
```

### Common (Reusable)
```typescript
{t('common.save')}                      // "Save" / "Guardar"
{t('common.cancel')}                    // "Cancel" / "Cancelar"
{t('common.confirm')}                   // "Confirm" / "Confirmar"
{t('common.close')}                     // "Close" / "Cerrar"
{t('common.loading')}                   // "Loading..." / "Cargando..."
{t('common.error')}                     // "Error"
{t('common.success')}                   // "Success" / "Éxito"
```

## Full Component Example

```typescript
import { useTranslation } from 'react-i18next';

export const MyAIComponent: React.FC = () => {
  const { t } = useTranslation();
  const [containers, setContainers] = useState([]);
  
  return (
    <div>
      <h1>{t('ai.chat.title')}</h1>
      
      {/* Welcome message */}
      <p>{t('ai.chat.welcomeMessage')}</p>
      
      {/* Input */}
      <input placeholder={t('ai.chat.placeholder')} />
      
      {/* Loading state */}
      {isLoading && <span>{t('ai.chat.thinking')}</span>}
      
      {/* Response with count */}
      <p>{t('ai.responses.containersFound', { count: containers.length })}</p>
      
      {/* Error with name */}
      {error && <p>{t('ai.errors.containerNotFound', { name: 'nginx' })}</p>}
      
      {/* Buttons */}
      <button>{t('common.confirm')}</button>
      <button>{t('common.cancel')}</button>
    </div>
  );
};
```

## All AI Translation Keys

### ai.chat.*
- title, placeholder, welcomeMessage, thinking, clearChat, close, send
- tryAsking, exampleQueries, modelLoading, modelLoadingProgress
- modelReady, modelError, initializeModel, errorProcessing, actionCancelled

### ai.confirmation.*
- title, message, action, description, affectedResources
- confirm, cancel, warning, safetyWarning

### ai.tools.*
- findContainersByName, getContainerHealth, listAllContainers
- getContainerLogs, listShortcuts, startContainer, stopContainer
- restartContainer, openContainerUrl

### ai.examples.*
- showAllContainers, whichRunning, howManyContainers, containerStatus
- findPostgres, findNginx, searchByName, listShortcuts, showFavorites
- startNginx, stopContainer, restartPostgres

### ai.responses.*
- containersFound, noContainersFound, containerStarted, containerStopped
- containerRestarted, shortcutsFound, noShortcutsFound, containerRunning
- containerStopped, containerHealthy, containerUnhealthy

### ai.errors.*
- general, containerNotFound, invalidParameters, operationFailed
- blockedOperation, confirmationRequired, modelNotLoaded, noContainerId
- invalidUrl, executionError

### ai.safety.*
- blocked, requiresConfirmation, safe, dangerousOperation
- reviewCarefully, cannotExecute, blockedReason

### ai.status.*
- processing, executing, completed, failed, cancelled, waiting

## Interpolation Variables

| Key | Variables | Example |
|-----|-----------|---------|
| ai.responses.containersFound | count | `{ count: 5 }` |
| ai.responses.shortcutsFound | count | `{ count: 3 }` |
| ai.errors.containerNotFound | name | `{ name: 'nginx' }` |
| ai.errors.operationFailed | error | `{ error: 'timeout' }` |
| ai.errors.blockedOperation | reason | `{ reason: 'unsafe' }` |
| ai.errors.executionError | error | `{ error: 'failed' }` |
| ai.safety.blockedReason | reason | `{ reason: 'dangerous' }` |
| ai.examples.searchByName | name | `{ name: 'postgres' }` |
| ai.examples.stopContainer | name | `{ name: 'nginx' }` |

## Testing

```bash
# Switch language in browser
# Use LanguageSelector component in footer

# Or programmatically
import { useTranslation } from 'react-i18next';
const { i18n } = useTranslation();
i18n.changeLanguage('es'); // Switch to Spanish
i18n.changeLanguage('en'); // Switch to English
```

## Tips

1. ✅ Always use `t()` for user-facing text
2. ✅ Use `common.*` keys for standard actions
3. ✅ Use interpolation for dynamic values
4. ✅ Test in both languages
5. ✅ Keep keys organized by namespace
6. ❌ Never hardcode text in components
7. ❌ Don't forget to add translations to both en.json and es.json

## See Also

- **Full Guide**: `frontend/src/services/ai/I18N_GUIDE.md`
- **Example Component**: `frontend/src/components/AIChat/AIChat.i18n.example.tsx`
- **Summary**: `AI_I18N_SUMMARY.md`

