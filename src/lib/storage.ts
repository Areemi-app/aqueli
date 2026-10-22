/**
 * Préférences d'affichage (thème, sons, dernier écran…). Elles sont chargées une fois avant
 * l'affichage, gardées en mémoire, et chaque changement est enregistré dans le fichier
 * preferences.json, à côté du compte : la version installée et la version de développement
 * les partagent. Jamais de donnée personnelle ici : le contenu de l'utilisateur est dans
 * la base chiffrée. Seule exception : le prénom que la personne choisit d'afficher sur
 * l'écran de verrouillage (`displayName`), qui doit se lire avant le déverrouillage.
 */

export type Prefs = Record<string, unknown>;

/** Là où les préférences sont réellement lues et enregistrées. */
export interface PrefsBackend {
  load(): Promise<Prefs>;
  save(prefs: Prefs): Promise<void>;
}

/** Préfixes des préférences rangées auparavant dans le stockage local de la fenêtre. */
const LOCAL_PREFIXES = ["aqueli.", "aqualis."] as const;
/** Plusieurs changements rapprochés ne donnent qu'un enregistrement. */
const SAVE_DELAY_MS = 150;

let cache: Prefs = {};
let backend: PrefsBackend | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> = Promise.resolve();

/**
 * Préférences rangées dans le stockage local par les versions précédentes. Le nouveau
 * nom l'emporte sur l'ancien ; une valeur illisible est ignorée.
 */
function readLocalPrefs(storage: Storage): { prefs: Prefs; keys: string[] } {
  const prefs: Prefs = {};
  const keys: string[] = [];
  for (const prefix of [...LOCAL_PREFIXES].reverse()) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(prefix)) continue;
      keys.push(key);
      try {
        prefs[key.slice(prefix.length)] = JSON.parse(storage.getItem(key) ?? "");
      } catch {
        // Valeur illisible : le réglage par défaut s'appliquera.
      }
    }
  }
  return { prefs, keys };
}

function snapshot(): Prefs {
  return JSON.parse(JSON.stringify(cache)) as Prefs;
}

/** Enregistre maintenant les changements en attente (un enregistrement à la fois, dans l'ordre). */
export function flushPrefs(): Promise<void> {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  const target = backend;
  if (!target) return saving;
  const prefs = snapshot();
  saving = saving.then(() => target.save(prefs)).catch(() => {
    // Enregistrement impossible : le réglage reste appliqué jusqu'à la fermeture.
  });
  return saving;
}

/**
 * Charge les préférences avant l'affichage. Celles du stockage local (versions
 * précédentes) sont reprises si le fichier ne les a pas, puis effacées une fois enregistrées.
 */
export async function loadPrefs(source: PrefsBackend, storage?: Storage): Promise<void> {
  backend = source;
  try {
    cache = await source.load();
  } catch {
    cache = {};
  }
  if (!storage) return;
  let local: ReturnType<typeof readLocalPrefs>;
  try {
    local = readLocalPrefs(storage);
  } catch {
    return;
  }
  if (local.keys.length === 0) return;
  for (const [key, value] of Object.entries(local.prefs)) {
    if (!(key in cache)) cache[key] = value;
  }
  try {
    await source.save(snapshot());
    for (const key of local.keys) storage.removeItem(key);
  } catch {
    // Le fichier n'a pas pu être écrit : le stockage local est gardé pour la prochaine fois.
  }
}

export function readPref<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): T {
  const value = cache[key];
  if (value === undefined || !isValid(value)) return fallback;
  // Une copie : modifier la valeur lue ne change pas la préférence enregistrée.
  return typeof value === "object" && value !== null ? (JSON.parse(JSON.stringify(value)) as T) : value;
}

/** Compte supprimé : plus rien n'est enregistré jusqu'au rechargement de la fenêtre. */
export function stopSavingPrefs(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  backend = null;
}

export function writePref(key: string, value: unknown): void {
  try {
    cache[key] = JSON.parse(JSON.stringify(value));
  } catch {
    return;
  }
  if (!backend) return;
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => void flushPrefs(), SAVE_DELAY_MS);
}
