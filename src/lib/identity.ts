const TOKEN_KEY = "relapse.shooter";
const PROFILE_KEY = "relapse.profile";
const CAMERA_KEY = "relapse.camera";
const DB_NAME = "relapse";
const STORE = "phone";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PHONE_KEYS = [TOKEN_KEY, PROFILE_KEY, CAMERA_KEY] as const;

type PhoneKey = (typeof PHONE_KEYS)[number];

type Vault = {
  token: string;
  profile: string;
  camera: string;
};

export function restoredEntries(
  local: Record<string, string | null>,
  saved: Record<string, string | null> | null,
): { key: PhoneKey; value: string }[] {
  if (!saved) return [];
  const filled: { key: PhoneKey; value: string }[] = [];
  for (const key of PHONE_KEYS) {
    if (local[key]) continue;
    const value = saved[key];
    if (typeof value !== "string" || value.length === 0) continue;
    if (key === TOKEN_KEY && !UUID.test(value)) continue;
    filled.push({ key, value });
  }
  return filled;
}

function vaultFromStorage(): Vault | null {
  const token = localStorage.getItem(TOKEN_KEY) ?? "";
  const profile = localStorage.getItem(PROFILE_KEY) ?? "";
  const camera = localStorage.getItem(CAMERA_KEY) ?? "";
  if (!token && !profile && !camera) return null;
  return { token, profile, camera };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("storage"));
  });
}

/** Copy this phone's profile and camera into IndexedDB before an update reload. */
export async function snapshotPhone(): Promise<void> {
  try {
    if (typeof indexedDB === "undefined" || typeof localStorage === "undefined") return;
    const vault = vaultFromStorage();
    if (!vault) return;
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(vault, "self");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("storage"));
      });
    } finally {
      db.close();
    }
  } catch {
    /* the cookie still names this phone */
  }
}

/** Fill local storage from the last snapshot when an update cleared it. */
export async function restorePhone(): Promise<void> {
  try {
    if (typeof indexedDB === "undefined" || typeof localStorage === "undefined") return;
    const db = await openDb();
    let saved: Vault | null = null;
    try {
      saved = await new Promise<Vault | null>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).get("self");
        request.onsuccess = () => resolve((request.result as Vault | undefined) ?? null);
        request.onerror = () => reject(request.error ?? new Error("storage"));
      });
    } finally {
      db.close();
    }
    const fills = restoredEntries(
      {
        [TOKEN_KEY]: localStorage.getItem(TOKEN_KEY),
        [PROFILE_KEY]: localStorage.getItem(PROFILE_KEY),
        [CAMERA_KEY]: localStorage.getItem(CAMERA_KEY),
      },
      saved
        ? {
            [TOKEN_KEY]: saved.token,
            [PROFILE_KEY]: saved.profile,
            [CAMERA_KEY]: saved.camera,
          }
        : null,
    );
    for (const entry of fills) localStorage.setItem(entry.key, entry.value);
  } catch {
    /* the cookie still names this phone */
  }
}
