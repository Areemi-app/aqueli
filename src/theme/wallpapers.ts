/**
 * Fonds d'écran des thèmes personnels : rangés dans la base chiffrée (src-tauri/src/data/
 * wallpapers.rs), affichés par une adresse « blob: » en mémoire, une fois le compte déverrouillé
 * (WallpaperBridge, dans la fenêtre principale). Au verrouillage, les adresses sont libérées.
 */
import { invoke } from "@tauri-apps/api/core";
import { asDataError } from "../lib/dataError";
import { inTauri } from "../lib/windowControls";
import { hexOf, WALLPAPER_MAX_SIDE } from "./custom";
import { luminance, type Rgba } from "./contrast";

interface WallpapersApi {
  get(id: string): Promise<string | null>;
  set(id: string, data: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** Fichier .aqtheme : chemin choisi, ou nul si la personne annule. */
  exportTheme(name: string, content: string): Promise<string | null>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: WallpapersApi = {
  get: (id) => call("wallpaper_get", { id }),
  set: (id, data) => call("wallpaper_set", { id, data }),
  remove: (id) => call("wallpaper_delete", { id }),
  exportTheme: (name, content) => call("theme_export", { name, content }),
};

/** Aperçu dans un navigateur (développement) : les fonds restent en mémoire. */
function createPreviewApi(): WallpapersApi {
  const store = new Map<string, string>();
  return {
    get: async (id) => store.get(id) ?? null,
    set: async (id, data) => void store.set(id, data),
    remove: async (id) => void store.delete(id),
    exportTheme: async (name) => `C:\\Users\\…\\Documents\\${name}.aqtheme`,
  };
}

export const wallpapersApi: WallpapersApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();

// ——— Adresses des fonds affichés ———

let urls = new Map<string, string>();
const listeners = new Set<() => void>();

function publish(next: Map<string, string>): void {
  urls = next;
  listeners.forEach((l) => l());
}

export const wallpaperUrls = (): ReadonlyMap<string, string> => urls;
export function subscribeWallpapers(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Image « data: » vers une adresse « blob: » (courte, et libérée au verrouillage). */
export function blobUrlOf(data: string): string {
  const comma = data.indexOf(",");
  const mime = /^data:([^;]+);base64$/.exec(data.slice(0, comma))?.[1] ?? "image/jpeg";
  const bytes = Uint8Array.from(atob(data.slice(comma + 1)), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

export function showWallpaper(id: string, data: string): void {
  const next = new Map(urls);
  const old = next.get(id);
  next.set(id, blobUrlOf(data));
  publish(next);
  if (old) URL.revokeObjectURL(old);
}

export function hideWallpaper(id: string): void {
  const old = urls.get(id);
  if (!old) return;
  const next = new Map(urls);
  next.delete(id);
  publish(next);
  URL.revokeObjectURL(old);
}

/** Au verrouillage : plus aucune image en mémoire. */
export function hideAllWallpapers(): void {
  const old = [...urls.values()];
  publish(new Map());
  old.forEach((u) => URL.revokeObjectURL(u));
}

// ——— Image choisie par la personne ———

/** Moyenne des pixels les plus clairs et des plus sombres : les deux teintes extrêmes du fond. */
export function tonesOf(pixels: readonly Rgba[], share = 0.15): [light: string, dark: string] {
  const sorted = [...pixels].sort((a, b) => luminance(a) - luminance(b));
  const n = Math.max(1, Math.round(sorted.length * share));
  const mean = (list: readonly Rgba[]): Rgba => {
    const sum = list.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2], 1] as Rgba, [0, 0, 0, 1] as Rgba);
    return [sum[0] / list.length, sum[1] / list.length, sum[2] / list.length, 1];
  };
  return [hexOf(mean(sorted.slice(-n))), hexOf(mean(sorted.slice(0, n)))];
}

/**
 * Réduit l'image choisie (2560 px de côté au plus, JPEG) et mesure ses teintes claire et
 * sombre. Lue uniquement à partir du fichier que la personne a choisi.
 */
export async function prepareWallpaper(file: Blob): Promise<{ data: string; tones: [string, string] }> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, WALLPAPER_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.86);
    const sample = document.createElement("canvas");
    sample.width = 48;
    sample.height = 48;
    const ctx = sample.getContext("2d");
    ctx?.drawImage(bitmap, 0, 0, 48, 48);
    const raw = ctx?.getImageData(0, 0, 48, 48).data ?? new Uint8ClampedArray(4);
    const pixels: Rgba[] = [];
    for (let i = 0; i < raw.length; i += 4) pixels.push([raw[i]!, raw[i + 1]!, raw[i + 2]!, 1]);
    return { data, tones: tonesOf(pixels) };
  } finally {
    bitmap.close();
  }
}
