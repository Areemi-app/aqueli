/**
 * Journal de sécurité (cahier des charges § 8) : déverrouillages, essais erronés, exports,
 * changements de mot de passe… tenu par le cœur dans la base chiffrée (src-tauri/src/data/security.rs).
 */
import { invoke } from "@tauri-apps/api/core";
import { ICONS } from "../components/icons";
import { asDataError } from "../lib/dataError";
import { inTauri } from "../lib/windowControls";
import { fr, locale, tr, trValue, trn } from "../i18n/i18n";

export interface SecurityEvent {
  id: number;
  /** Secondes depuis 1970. */
  at: number;
  event: string;
  detail: string | null;
}

export interface SecurityLog {
  events: SecurityEvent[];
  total: number;
}

export interface EventView {
  label: string;
  detail: string | null;
  icon: string;
  /** « warn » : à remarquer (essais erronés, accès par la clé de récupération). */
  tone: "warn" | null;
}

const LABELS: Record<string, { label: string; icon: string; tone?: "warn" }> = {
  creation: { label: tr("Création du compte"), icon: ICONS.shield },
  deverrouillage: { label: tr("Déverrouillage par mot de passe"), icon: ICONS.lock },
  "deverrouillage-windows-hello": { label: tr("Déverrouillage par Windows Hello"), icon: ICONS.faceId },
  recuperation: { label: tr("Accès par la clé de récupération"), icon: ICONS.key, tone: "warn" },
  "changement-mot-de-passe": { label: tr("Mot de passe modifié"), icon: ICONS.key },
  "nouvelle-cle-de-recuperation": { label: tr("Nouvelle clé de récupération"), icon: ICONS.key },
  "windows-hello-active": { label: tr("Windows Hello activé"), icon: ICONS.faceId },
  "windows-hello-desactive": { label: tr("Windows Hello désactivé"), icon: ICONS.faceId },
  restauration: { label: tr("Restauration d'une sauvegarde"), icon: ICONS.history },
  export: { label: tr("Export"), icon: ICONS.save },
};

const DAY = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long", year: "numeric" });

/** Détails des exports, enregistrés en français par le cœur (src-tauri/src/commands.rs). */
const EXPORT_DETAILS = [fr("Compte entier (sauvegarde chiffrée)"), fr("Document"), fr("Thème (.aqtheme)")];

/** Libellé, détail et icône d'un événement. */
export function describeEvent(e: Pick<SecurityEvent, "event" | "detail">): EventView {
  const known = LABELS[e.event];
  let detail = e.detail?.trim() || null;
  let tone = known?.tone ?? null;
  const failures = detail ? /^(\d+) essai/.exec(detail) : null;
  if (failures) {
    const n = Number(failures[1]);
    detail = trn(n, "{n} essai erroné avant ce déverrouillage", "{n} essais erronés avant ce déverrouillage");
    tone = "warn";
  } else if (e.event === "restauration" && detail && /^\d{4}-\d{2}-\d{2}$/.test(detail)) {
    detail = tr("Sauvegarde du {date}", { date: DAY.format(new Date(`${detail}T12:00:00`)) });
  } else if (detail && EXPORT_DETAILS.includes(detail)) {
    detail = trValue(detail);
  } else if (detail && /^Fichier \.\w+$/.test(detail)) {
    detail = tr("Fichier .{ext}", { ext: detail.slice(9) });
  }
  return { label: known?.label ?? tr("Événement : {event}", { event: e.event }), detail, icon: known?.icon ?? ICONS.info, tone };
}

const WHEN = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** « 5 oct. 2026, 03:12 ». */
export const whenLabel = (at: number) => WHEN.format(new Date(at * 1000));

const now = () => Math.floor(Date.now() / 1000);

/** Aperçu dans le navigateur : quelques événements d'exemple. */
const PREVIEW: SecurityEvent[] = [
  { id: 4, at: now() - 120, event: "export", detail: tr("Fichier .md") },
  { id: 3, at: now() - 3_600, event: "deverrouillage", detail: tr("2 essai(s) raté(s) avant ce déverrouillage") },
  { id: 2, at: now() - 86_400, event: "deverrouillage-windows-hello", detail: null },
  { id: 1, at: now() - 8 * 86_400, event: "creation", detail: null },
];

export async function securityLog(limit: number): Promise<SecurityLog> {
  if (!inTauri && import.meta.env.DEV) return { events: PREVIEW.slice(0, limit), total: PREVIEW.length };
  try {
    return await invoke<SecurityLog>("security_log", { limit });
  } catch (e) {
    throw asDataError(e);
  }
}
