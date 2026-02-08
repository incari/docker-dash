# Docker Icon Vault Integration

## Overview

This document describes the integration of the [docker-icon-vault](https://incari.github.io/docker-icon-vault/) into the Docker Dashboard application. The integration automatically selects appropriate icons for Docker containers based on their names.

## What is Docker Icon Vault?

Docker Icon Vault is a curated collection of 131+ curated icons for official Docker images. It provides consistent, professional icons for common containers like:
- `nginx`, `postgres`, `redis`, `mysql`, `mongo`
- `python`, `node`, `golang`, `ruby`, `php`
- `wordpress`, `nextcloud`, `traefik`, `caddy`
- And many more...

## Implementation

### 1. Utility Function (`frontend/src/utils/dockerIconVault.ts`)

Created a new utility module with the following functions:

#### `normalizeContainerName(containerName: string): string`
Normalizes container names to match docker-icon-vault naming conventions:
- Removes version tags (e.g., `postgres:14.2` → `postgres`)
- Converts slashes to hyphens (e.g., `python/pytorch` → `python-pytorch`)
- Converts to lowercase

#### `getDockerIconVaultUrl(containerName: string): string | null`
Returns the full URL to the docker-icon-vault icon if available:
- Exact match: `nginx` → `https://incari.github.io/docker-icon-vault/icons/nginx.png`
- Partial match: `my-nginx-app` → `https://incari.github.io/docker-icon-vault/icons/nginx.png`
- No match: returns `null`

#### `getContainerIcon(containerName: string, defaultIcon: string = "Server"): string`
Main function that returns either:
- The docker-icon-vault URL if available
- The default icon (usually "Server") if no match found

### 2. Updated Components

#### `frontend/src/hooks/useShortcutActions.ts`
Updated two functions to auto-select icons:

**`handleQuickAdd`**: When quickly adding a container as a shortcut (star icon)
```typescript
const icon = getContainerIcon(container.name, "Server");
formData.append("icon", icon);
```

**`handleQuickAddAsFavorite`**: When adding a container as a favorite
```typescript
const icon = getContainerIcon(container.name, "Server");
formData.append("icon", icon);
```

## Usage Examples

### Example 1: Python Container
- Container name: `python` or `python:3.11`
- Auto-selected icon: `https://incari.github.io/docker-icon-vault/icons/python.png`

### Example 2: Nginx Container
- Container name: `nginx` or `my-nginx-proxy`
- Auto-selected icon: `https://incari.github.io/docker-icon-vault/icons/nginx.png`

### Example 3: PostgreSQL Container
- Container name: `postgres:14.2`
- Auto-selected icon: `https://incari.github.io/docker-icon-vault/icons/postgres.png`

### Example 4: Unknown Container
- Container name: `my-custom-app`
- Auto-selected icon: `Server` (default Lucide icon)

## Benefits

1. **Professional Appearance**: Containers automatically get their official logos
2. **Better UX**: Users can quickly identify containers by their familiar icons
3. **Zero Configuration**: Works automatically without user intervention
4. **Fallback Support**: Unknown containers still get a default icon
5. **Consistent Branding**: Uses official Docker image branding

## Future Enhancements

Potential improvements for the future:

1. **Dynamic Icon List**: Fetch the available icons list from the vault API instead of hardcoding
2. **Custom Mappings**: Allow users to define custom container name → icon mappings
3. **Local Caching**: Cache icon URLs to reduce external requests
4. **Icon Preview**: Show icon preview in container selection dropdown
5. **Manual Override**: Allow users to manually change auto-selected icons

## Testing

To test the implementation:

1. Start the development server: `bun run dev`
2. Navigate to the Management View (Shortcuts page)
3. Click the star icon on a container (e.g., nginx, postgres, redis)
4. Verify that the shortcut is created with the appropriate docker-icon-vault icon
5. Alternatively, click "Add Shortcut" and select a container from the dropdown
6. Verify that the icon is automatically selected

## Maintenance

The `AVAILABLE_DOCKER_ICONS` array in `dockerIconVault.ts` should be kept in sync with the docker-icon-vault repository. Check for updates periodically at:
https://incari.github.io/docker-icon-vault/

## References

- Docker Icon Vault: https://incari.github.io/docker-icon-vault/
- Docker Icon Vault GitHub: https://github.com/incari/docker-icon-vault

