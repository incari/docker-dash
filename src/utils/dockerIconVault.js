/**
 * Docker Icon Vault Integration for Backend
 * Provides utilities to map container names to docker-icon-vault icon URLs and descriptions
 *
 * Uses the JSON list from: https://incari.github.io/docker-icon-vault/list.json
 */

const https = require('https');

const DOCKER_ICON_VAULT_BASE_URL = "https://incari.github.io/docker-icon-vault";
const DOCKER_ICON_VAULT_LIST_URL = "https://incari.github.io/docker-icon-vault/list.json";

// Cache for the icon list (fetched once and reused)
let iconListCache = null;
let iconListCacheTime = null;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

/**
 * Fetch the list of available Docker icons from the vault
 * Returns array of {name, description, logo_url}
 */
async function fetchIconList() {
  // Return cached list if available and not expired
  if (iconListCache && iconListCacheTime && (Date.now() - iconListCacheTime < CACHE_DURATION)) {
    return iconListCache;
  }

  try {
    const response = await new Promise((resolve, reject) => {
      https.get(DOCKER_ICON_VAULT_LIST_URL, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });

    iconListCache = JSON.parse(response);
    iconListCacheTime = Date.now();
    console.log('[DOCKER-ICON-VAULT] Fetched icon list:', iconListCache.length, 'icons');
    return iconListCache;
  } catch (error) {
    console.error('[DOCKER-ICON-VAULT] Failed to fetch icon list:', error);
    return [];
  }
}

/**
 * Normalize container name to match docker-icon-vault naming convention
 * @param {string} containerName - The container name to normalize
 * @returns {string} Normalized container name
 */
function normalizeContainerName(containerName) {
  // Remove leading slash if present (Docker adds this)
  let normalized = containerName.replace(/^\//, "");

  // Remove version tags (e.g., :latest, :14.2, :3.11-alpine)
  normalized = normalized.split(":")[0] || "";

  // Convert slashes to hyphens (e.g., python/pytorch -> python-pytorch)
  normalized = normalized.replace(/\//g, "-");

  // Convert to lowercase
  normalized = normalized.toLowerCase();

  return normalized;
}

/**
 * Get the docker-icon-vault icon data for a container name
 * Returns {iconUrl, description} if available, otherwise returns null
 * @param {string} containerName - The container name
 * @returns {Promise<{iconUrl: string, description: string}|null>} The icon data or null
 */
async function getDockerIconVaultData(containerName) {
  const iconList = await fetchIconList();
  if (!iconList || iconList.length === 0) {
    return null;
  }

  const normalized = normalizeContainerName(containerName);

  // Check if the normalized name exists exactly in the vault
  let exactMatch = iconList.find(icon => icon.name === normalized);
  if (exactMatch) {
    return {
      iconUrl: `${DOCKER_ICON_VAULT_BASE_URL}/${exactMatch.logo_url.replace('./', '')}`,
      description: exactMatch.description
    };
  }

  // Try to find a match with priority:
  // 1. Icon name at the start (e.g., "postgres-db-1" matches "postgres")
  // 2. Icon name as a word boundary (e.g., "my-nginx-app" matches "nginx")
  // 3. Icon name anywhere in the string

  // Priority 1: Starts with icon name followed by hyphen or end
  let partialMatch = iconList.find((iconData) => {
    const pattern = new RegExp(`^${iconData.name}(-|$)`);
    return pattern.test(normalized);
  });

  if (partialMatch) {
    return {
      iconUrl: `${DOCKER_ICON_VAULT_BASE_URL}/${partialMatch.logo_url.replace('./', '')}`,
      description: partialMatch.description
    };
  }

  // Priority 2: Icon name appears as a complete word (surrounded by hyphens or at boundaries)
  partialMatch = iconList.find((iconData) => {
    const pattern = new RegExp(`(^|-)${iconData.name}(-|$)`);
    return pattern.test(normalized);
  });

  if (partialMatch) {
    return {
      iconUrl: `${DOCKER_ICON_VAULT_BASE_URL}/${partialMatch.logo_url.replace('./', '')}`,
      description: partialMatch.description
    };
  }

  // Priority 3: Icon name appears anywhere in the container name
  partialMatch = iconList.find((iconData) =>
    normalized.includes(iconData.name)
  );

  if (partialMatch) {
    return {
      iconUrl: `${DOCKER_ICON_VAULT_BASE_URL}/${partialMatch.logo_url.replace('./', '')}`,
      description: partialMatch.description
    };
  }

  return null;
}

/**
 * Get the docker-icon-vault URL for a container name
 * Returns the icon URL if available, otherwise returns null
 * @param {string} containerName - The container name
 * @returns {Promise<string|null>} The icon URL or null
 */
async function getDockerIconVaultUrl(containerName) {
  const data = await getDockerIconVaultData(containerName);
  return data ? data.iconUrl : null;
}

/**
 * Get the appropriate icon for a container
 * Returns either the docker-icon-vault URL or the default icon
 * @param {string} containerName - The container name
 * @param {string} defaultIcon - The default icon to use if no match found (default: "Server")
 * @returns {Promise<string>} The icon URL or default icon
 */
async function getContainerIcon(containerName, defaultIcon = "Server") {
  const vaultUrl = await getDockerIconVaultUrl(containerName);
  return vaultUrl || defaultIcon;
}

module.exports = {
  normalizeContainerName,
  fetchIconList,
  getDockerIconVaultData,
  getDockerIconVaultUrl,
  getContainerIcon
};

