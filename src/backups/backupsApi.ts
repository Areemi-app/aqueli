/** Sauvegardes (src-tauri/src/backups.rs et src-tauri/src/vault/backup.rs). */
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../lib/windowControls";
import { asVaultError } from "../vault/api";
import { locale, tr } from "../i18n/i18n";

export type BackupOrigin = "automatique" | "manuelle" | "avant-restauration" | "export";

export interface BackupInfo {
  path: string;
  fileName: string;
  /** Secondes Unix. */
  createdAt: number;
  origin: BackupOrigin;
  size: number;
  appVersion: string;
  /** Sur la destination externe (clé USB, disque). */
  external: boolean;
}

export interface BackupStatus {
  lastAuto: number;
  lastExternal: number;
  destination: string | null;
  destinationAvailable: boolean;
  folder: string;
  /** Aucune sauvegarde externe depuis 30 jours, après 30 jours d'usage. */
  externalReminder: boolean;
}

/** Nombre d'éléments d'une sauvegarde. */
export interface Preview {
  tasks: number;
  events: number;
  obligations: number;
  notes: number;
}

/** Même compte (mot de passe inchangé), ou compte de la sauvegarde. */
export type Restored = "sameAccount" | "otherAccount";

export const ORIGIN_LABELS: Record<BackupOrigin, string> = {
  automatique: tr("Automatique"),
  manuelle: tr("Manuelle"),
  "avant-restauration": tr("Avant restauration"),
  export: tr("Export"),
};

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asVaultError(e);
  }
}

/** Aperçu dans un navigateur (développement) : quelques sauvegardes d'exemple. */
function previewApi() {
  const now = Math.floor(Date.now() / 1000);
  const origins: BackupOrigin[] = ["automatique", "manuelle", "automatique", "avant-restauration", "automatique", "export", "automatique", "automatique"];
  let list: BackupInfo[] = [0, 1, 2, 3, 5, 9, 16, 40].map((days, i) => ({
    path: `C:\\Aqueli\\Sauvegardes\\apercu-${i}.aqueli`,
    fileName: `apercu-${i}.aqueli`,
    createdAt: now - days * 86_400 - 3600,
    origin: origins[i]!,
    size: 1_200_000 + i * 40_000,
    appVersion: "0.14.0",
    external: i === 3,
  }));
  let destination: string | null = null;
  return {
    status: async (): Promise<BackupStatus> => ({
      lastAuto: list[0]?.createdAt ?? 0,
      lastExternal: 0,
      destination,
      destinationAvailable: destination !== null,
      folder: "C:\\Users\\…\\AppData\\Roaming\\Aqueli\\Sauvegardes",
      externalReminder: true,
    }),
    list: async () => list,
    create: async () => {
      const backup: BackupInfo = { ...list[0]!, path: `apercu-${Date.now()}`, fileName: "nouvelle.aqueli", createdAt: Math.floor(Date.now() / 1000), origin: "manuelle" };
      list = [backup, ...list];
      return { backup, external: destination !== null };
    },
    preview: async (): Promise<Preview | null> => ({ tasks: 9, events: 14, obligations: 10, notes: 3 }),
    restore: async (): Promise<Restored> => "sameAccount",
    remove: async (path: string) => {
      list = list.filter((b) => b.path !== path);
    },
    chooseDestination: async () => (destination = "E:\\Sauvegardes Aqueli"),
    clearDestination: async () => {
      destination = null;
    },
    exportAccount: async () => "C:\\Users\\…\\Documents\\Aqueli export.aqueli",
    pickFile: async (): Promise<BackupInfo | null> => list[3] ?? null,
    openFolder: async (): Promise<void> => {},
  };
}

const tauriApi = {
  status: () => call<BackupStatus>("backups_status"),
  list: () => call<BackupInfo[]>("backups_list"),
  create: () => call<{ backup: BackupInfo; external: boolean }>("backups_create"),
  /** `null` : sauvegarde d'un autre compte, son mot de passe est demandé. */
  preview: (path: string, password?: string) => call<Preview | null>("backups_preview", { path, password: password ?? null }),
  restore: (path: string, password?: string) => call<Restored>("backups_restore", { path, password: password ?? null }),
  remove: (path: string) => call<void>("backups_delete", { path }),
  /** Dossier choisi, ou `null` si la fenêtre a été fermée. */
  chooseDestination: () => call<string | null>("backups_choose_destination"),
  clearDestination: () => call<void>("backups_clear_destination"),
  /** Fichier écrit, ou `null` si la fenêtre a été fermée. */
  exportAccount: () => call<string | null>("backups_export"),
  pickFile: () => call<BackupInfo | null>("backups_pick_file"),
  /** Ouvre le dossier des sauvegardes de ce PC dans l'Explorateur. */
  openFolder: () => call<void>("backups_open_folder"),
};

export const backupsApi: typeof tauriApi = inTauri || !import.meta.env.DEV ? tauriApi : previewApi();

/** « 1,2 Mo ». */
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return tr("{n} Ko", { n: Math.max(1, Math.round(bytes / 1024)) });
  return tr("{n} Mo", { n: (bytes / (1024 * 1024)).toLocaleString(locale(), { maximumFractionDigits: 1 }) });
}

/** « 4 tâches · 12 événements · 3 obligations · 8 notes ». */
export function previewText(p: Preview): string {
  const part = (n: number, one: string, many: string) => `${n.toLocaleString(locale())} ${n > 1 ? many : one}`;
  return [
    part(p.tasks, tr("tâche"), tr("tâches")),
    part(p.events, tr("événement"), tr("événements")),
    part(p.obligations, "obligation", "obligations"),
    part(p.notes, "note", "notes"),
  ].join(" · ");
}
