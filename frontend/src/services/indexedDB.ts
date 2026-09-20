/**
 * IndexedDB Service for offline data persistence
 * Stores containers, shortcuts, sections, and tailscale info
 */

import type { DockerContainer, Shortcut, Section } from "../types";
import type { TailscaleInfoExtended } from "../appTypes";

const DB_NAME = "DockerDashDB";
/**
 * 2: containers are keyed by [hostId, id] rather than id alone. A container's
 * identity is the pair once the dashboard reads several servers - a Docker ID
 * is only unique within the daemon that issued it.
 */
const DB_VERSION = 2;

// Store names
const STORES = {
  CONTAINERS: "containers",
  SHORTCUTS: "shortcuts",
  SECTIONS: "sections",
  TAILSCALE: "tailscale",
  METADATA: "metadata",
} as const;

interface MetadataEntry {
  key: string;
  value: any;
  timestamp: number;
}

/**
 * Initialize IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // A store's key path cannot be changed in place, so the containers store
      // from version 1 is dropped and rebuilt. Nothing is lost that matters:
      // it only ever held a copy of what the server would say next.
      if (db.objectStoreNames.contains(STORES.CONTAINERS)) {
        const existing = (event.target as IDBOpenDBRequest).transaction
          ?.objectStore(STORES.CONTAINERS);
        if (!Array.isArray(existing?.keyPath)) {
          db.deleteObjectStore(STORES.CONTAINERS);
        }
      }
      if (!db.objectStoreNames.contains(STORES.CONTAINERS)) {
        db.createObjectStore(STORES.CONTAINERS, {
          keyPath: ["hostId", "id"],
        });
      }

      if (!db.objectStoreNames.contains(STORES.SHORTCUTS)) {
        db.createObjectStore(STORES.SHORTCUTS, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORES.SECTIONS)) {
        db.createObjectStore(STORES.SECTIONS, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORES.TAILSCALE)) {
        db.createObjectStore(STORES.TAILSCALE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORES.METADATA)) {
        db.createObjectStore(STORES.METADATA, { keyPath: "key" });
      }
    };
  });
}

/**
 * Generic function to save data to a store
 */
async function saveToStore<T>(storeName: string, data: T[]): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);

  // Clear existing data
  store.clear();

  // put, not add: add throws on a key that is already in the batch, which
  // aborts the whole transaction. The store was just cleared, so overwriting is
  // the right behaviour for a duplicate anyway.
  data.forEach((item) => store.put(item));

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

/**
 * Generic function to get all data from a store
 */
async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  const transaction = db.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      resolve(request.result as T[]);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Save metadata (like last update timestamp)
 */
async function saveMetadata(key: string, value: any): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction(STORES.METADATA, "readwrite");
  const store = transaction.objectStore(STORES.METADATA);

  const metadata: MetadataEntry = {
    key,
    value,
    timestamp: Date.now(),
  };

  store.put(metadata);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

/**
 * Get metadata
 */
async function getMetadata(key: string): Promise<MetadataEntry | null> {
  const db = await openDB();
  const transaction = db.transaction(STORES.METADATA, "readonly");
  const store = transaction.objectStore(STORES.METADATA);
  const request = store.get(key);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// ==================== Public API ====================

/**
 * Containers
 */
export const indexedDBContainers = {
  save: async (containers: DockerContainer[]): Promise<void> => {
    await saveToStore(STORES.CONTAINERS, containers);
    await saveMetadata("containers_last_update", Date.now());
  },

  getAll: async (): Promise<DockerContainer[]> => {
    return getAllFromStore<DockerContainer>(STORES.CONTAINERS);
  },

  getLastUpdate: async (): Promise<number | null> => {
    const metadata = await getMetadata("containers_last_update");
    return metadata?.value || null;
  },
};

/**
 * Shortcuts
 */
export const indexedDBShortcuts = {
  save: async (shortcuts: Shortcut[]): Promise<void> => {
    await saveToStore(STORES.SHORTCUTS, shortcuts);
    await saveMetadata("shortcuts_last_update", Date.now());
  },

  getAll: async (): Promise<Shortcut[]> => {
    return getAllFromStore<Shortcut>(STORES.SHORTCUTS);
  },

  getLastUpdate: async (): Promise<number | null> => {
    const metadata = await getMetadata("shortcuts_last_update");
    return metadata?.value || null;
  },
};

/**
 * Sections
 */
export const indexedDBSections = {
  save: async (sections: Section[]): Promise<void> => {
    await saveToStore(STORES.SECTIONS, sections);
    await saveMetadata("sections_last_update", Date.now());
  },

  getAll: async (): Promise<Section[]> => {
    return getAllFromStore<Section>(STORES.SECTIONS);
  },

  getLastUpdate: async (): Promise<number | null> => {
    const metadata = await getMetadata("sections_last_update");
    return metadata?.value || null;
  },
};

/**
 * Tailscale
 */
export const indexedDBTailscale = {
  save: async (info: TailscaleInfoExtended): Promise<void> => {
    const db = await openDB();
    const transaction = db.transaction(STORES.TAILSCALE, "readwrite");
    const store = transaction.objectStore(STORES.TAILSCALE);

    // Clear and save single record
    store.clear();
    store.add({ id: 1, ...info });

    await saveMetadata("tailscale_last_update", Date.now());

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  },

  get: async (): Promise<TailscaleInfoExtended | null> => {
    const db = await openDB();
    const transaction = db.transaction(STORES.TAILSCALE, "readonly");
    const store = transaction.objectStore(STORES.TAILSCALE);
    const request = store.get(1);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        db.close();
        const result = request.result;
        if (result) {
          // Remove the id field we added for storage
          const { id, ...info } = result;
          resolve(info as TailscaleInfoExtended);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  },

  getLastUpdate: async (): Promise<number | null> => {
    const metadata = await getMetadata("tailscale_last_update");
    return metadata?.value || null;
  },
};

/**
 * Clear all data (useful for debugging or reset)
 */
export async function clearAllData(): Promise<void> {
  const db = await openDB();
  const storeNames = [
    STORES.CONTAINERS,
    STORES.SHORTCUTS,
    STORES.SECTIONS,
    STORES.TAILSCALE,
    STORES.METADATA,
  ];

  const transaction = db.transaction(storeNames, "readwrite");

  storeNames.forEach((storeName) => {
    transaction.objectStore(storeName).clear();
  });

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

