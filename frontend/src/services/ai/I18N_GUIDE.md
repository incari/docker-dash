# AI Agent System - i18n Integration Guide

## Overview

All AI agent system text has been internationalized with support for English (en) and Spanish (es). This guide shows how to use the translation keys in your components.

## Translation Keys Structure

All AI-related translations are under the `ai` namespace:

```json
{
  "ai": {
    "title": "AI Assistant",
    "chat": { ... },
    "confirmation": { ... },
    "tools": { ... },
    "examples": { ... },
    "responses": { ... },
    "errors": { ... },
    "safety": { ... },
    "status": { ... }
  }
}
```

## Usage in React Components

### Basic Usage

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  
  return (
    <div>
      <h1>{t('ai.title')}</h1>
      <p>{t('ai.chat.welcomeMessage')}</p>
    </div>
  );
}
```

### With Interpolation

```typescript
// For dynamic values
const count = 5;
<p>{t('ai.responses.containersFound', { count })}</p>
// Output (en): "I found 5 container(s):"
// Output (es): "Encontré 5 contenedor(es):"

const name = 'nginx';
<p>{t('ai.errors.containerNotFound', { name })}</p>
// Output (en): "Container not found: nginx"
// Output (es): "Contenedor no encontrado: nginx"
```

## Available Translation Keys

### Chat Interface (`ai.chat`)

| Key | English | Spanish |
|-----|---------|---------|
| `ai.chat.title` | AI Assistant | Asistente IA |
| `ai.chat.placeholder` | Ask me about your containers... | Pregúntame sobre tus contenedores... |
| `ai.chat.welcomeMessage` | 👋 Hello! I'm your Docker Dashboard AI assistant... | 👋 ¡Hola! Soy tu asistente IA del Panel Docker... |
| `ai.chat.thinking` | Thinking... | Pensando... |
| `ai.chat.clearChat` | Clear Chat | Limpiar Chat |
| `ai.chat.send` | Send | Enviar |
| `ai.chat.tryAsking` | Try asking: | Prueba preguntando: |
| `ai.chat.modelLoading` | Loading AI model... | Cargando modelo IA... |
| `ai.chat.modelReady` | AI Ready | IA Lista |
| `ai.chat.errorProcessing` | ❌ I encountered an error... | ❌ Encontré un error... |

### Confirmation Modal (`ai.confirmation`)

| Key | English | Spanish |
|-----|---------|---------|
| `ai.confirmation.title` | Confirm Action | Confirmar Acción |
| `ai.confirmation.message` | This action requires your confirmation... | Esta acción requiere tu confirmación... |
| `ai.confirmation.action` | Action | Acción |
| `ai.confirmation.description` | Description | Descripción |
| `ai.confirmation.affectedResources` | Affected Resources | Recursos Afectados |
| `ai.confirmation.warning` | ⚠️ This action will modify your system... | ⚠️ Esta acción modificará tu sistema... |

### Tool Names (`ai.tools`)

| Key | English | Spanish |
|-----|---------|---------|
| `ai.tools.findContainersByName` | Find containers by name | Buscar contenedores por nombre |
| `ai.tools.listAllContainers` | List all containers | Listar todos los contenedores |
| `ai.tools.startContainer` | Start container | Iniciar contenedor |
| `ai.tools.stopContainer` | Stop container | Detener contenedor |
| `ai.tools.restartContainer` | Restart container | Reiniciar contenedor |

### Example Queries (`ai.examples`)

| Key | English | Spanish |
|-----|---------|---------|
| `ai.examples.showAllContainers` | Show me all my containers | Muéstrame todos mis contenedores |
| `ai.examples.whichRunning` | Which containers are running? | ¿Qué contenedores están ejecutándose? |
| `ai.examples.findPostgres` | Find my postgres database | Encuentra mi base de datos postgres |
| `ai.examples.listShortcuts` | List all my shortcuts | Lista todos mis accesos directos |

### Responses (`ai.responses`)

| Key | English | Spanish | Params |
|-----|---------|---------|--------|
| `ai.responses.containersFound` | I found {{count}} container(s): | Encontré {{count}} contenedor(es): | count |
| `ai.responses.containerStarted` | ✅ Container started successfully. | ✅ Contenedor iniciado exitosamente. | - |
| `ai.responses.containerStopped` | ✅ Container stopped successfully. | ✅ Contenedor detenido exitosamente. | - |

### Errors (`ai.errors`)

| Key | English | Spanish | Params |
|-----|---------|---------|--------|
| `ai.errors.general` | An error occurred... | Ocurrió un error... | - |
| `ai.errors.containerNotFound` | Container not found: {{name}} | Contenedor no encontrado: {{name}} | name |
| `ai.errors.operationFailed` | Operation failed: {{error}} | Operación fallida: {{error}} | error |
| `ai.errors.blockedOperation` | This operation is blocked... | Esta operación está bloqueada... | reason |

### Safety (`ai.safety`)

| Key | English | Spanish |
|-----|---------|---------|
| `ai.safety.blocked` | Blocked | Bloqueado |
| `ai.safety.requiresConfirmation` | Requires Confirmation | Requiere Confirmación |
| `ai.safety.safe` | Safe | Seguro |
| `ai.safety.dangerousOperation` | This is a potentially dangerous operation. | Esta es una operación potencialmente peligrosa. |

### Status (`ai.status`)

| Key | English | Spanish |
|-----|---------|---------|
| `ai.status.processing` | Processing... | Procesando... |
| `ai.status.executing` | Executing action... | Ejecutando acción... |
| `ai.status.completed` | Completed | Completado |
| `ai.status.waiting` | Waiting for confirmation... | Esperando confirmación... |

## Integration Examples

### AIChat Component

```typescript
import { useTranslation } from 'react-i18next';

export const AIChat: React.FC = () => {
  const { t } = useTranslation();
  
  return (
    <div>
      <h3>{t('ai.chat.title')}</h3>
      <input placeholder={t('ai.chat.placeholder')} />
      {isLoading && <span>{t('ai.chat.thinking')}</span>}
    </div>
  );
};
```

### AIConfirmationModal Component

```typescript
import { useTranslation } from 'react-i18next';

export const AIConfirmationModal: React.FC<Props> = ({ confirmationRequest }) => {
  const { t } = useTranslation();
  
  return (
    <div>
      <h2>{t('ai.confirmation.title')}</h2>
      <p>{t('ai.confirmation.warning')}</p>
      <div>
        <strong>{t('ai.confirmation.action')}:</strong>
        <span>{confirmationRequest.action}</span>
      </div>
      <button>{t('common.confirm')}</button>
      <button>{t('common.cancel')}</button>
    </div>
  );
};
```

### Example Queries Display

```typescript
import { useTranslation } from 'react-i18next';

export const ExampleQueries: React.FC = () => {
  const { t } = useTranslation();
  
  const examples = [
    t('ai.examples.showAllContainers'),
    t('ai.examples.whichRunning'),
    t('ai.examples.findPostgres'),
  ];
  
  return (
    <div>
      <p>{t('ai.chat.tryAsking')}</p>
      {examples.map((example, i) => (
        <button key={i}>{example}</button>
      ))}
    </div>
  );
};
```

### Response Formatting

```typescript
import { useTranslation } from 'react-i18next';

function formatResponse(response: AgentResponse) {
  const { t } = useTranslation();
  
  if (response.success) {
    return t('ai.responses.containerStarted');
  } else {
    return t('ai.errors.general');
  }
}
```

## Best Practices

1. **Always use translation keys** - Never hardcode text in components
2. **Use interpolation** - For dynamic values like counts, names, errors
3. **Reuse common keys** - Use `common.save`, `common.cancel`, etc. for standard actions
4. **Test both languages** - Switch language in UI to verify translations
5. **Keep keys organized** - Follow the namespace structure (ai.chat, ai.errors, etc.)

## Adding New Translations

To add new translation keys:

1. Add to `frontend/src/i18n/locales/en.json`:
```json
{
  "ai": {
    "newFeature": {
      "title": "New Feature",
      "description": "Description here"
    }
  }
}
```

2. Add to `frontend/src/i18n/locales/es.json`:
```json
{
  "ai": {
    "newFeature": {
      "title": "Nueva Característica",
      "description": "Descripción aquí"
    }
  }
}
```

3. Use in component:
```typescript
const { t } = useTranslation();
<h1>{t('ai.newFeature.title')}</h1>
```

## Language Switching

Users can switch languages using the LanguageSelector component in the footer. The selected language is automatically saved to localStorage and persists across sessions.

