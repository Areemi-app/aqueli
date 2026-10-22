/**
 * Documents côté interface (src-tauri/src/data/documents.rs) : genre de fichier, taille,
 * aperçu possible, expiration et rappel, sorte, émetteur et date du document (devinées depuis le
 * nom du fichier à l'ajout), tri. Fonctions pures.
 */
import { fold } from "../lib/fold";
import { addDays, daysBetween, fromDayKey, makeDay, type DayKey } from "../tasks/day";
import type { ScheduledReminder } from "../tasks/reminders";
import { lang, locale, tr, trn } from "../i18n/i18n";

export interface Document {
  id: string;
  name: string;
  /** Extension en minuscules, sans le point. */
  ext: string;
  size: number;
  folderId: string | null;
  tags: string[];
  expiresOn: DayKey | null;
  /** Rappel, en jours avant l'expiration (0 : le jour même). */
  remindDays: number | null;
  notes: string;
  spaceId: string | null;
  createdAt: number;
  updatedAt: number;
  /** Date du document (facture, relevé…), distincte de son ajout. */
  docDate: DayKey | null;
  /** Émetteur : organisme, entreprise, administration. */
  issuer: string;
  docType: DocType | null;
}

export type DocumentMeta = Pick<Document, "name" | "folderId" | "tags" | "expiresOn" | "remindDays" | "notes" | "spaceId" | "docDate" | "issuer" | "docType">;

export function toMeta(d: Document): DocumentMeta {
  const { name, folderId, tags, expiresOn, remindDays, notes, spaceId, docDate, issuer, docType } = d;
  return { name, folderId, tags, expiresOn, remindDays, notes, spaceId, docDate, issuer, docType };
}

export type DocType = "facture" | "contrat" | "attestation" | "releve" | "fiche-de-paie" | "impots" | "ordonnance" | "garantie" | "identite" | "courrier" | "autre";

/** Sortes de documents (les mêmes que le cœur), avec les mots qui les désignent dans un nom de fichier (français ou anglais). */
export const DOC_TYPES: readonly { id: DocType; label: string; symbol: string; words: RegExp }[] = [
  { id: "facture", label: tr("Facture"), symbol: "facture", words: /factur|ticket de caisse|\bdevis\b|invoice|\bbill\b|receipt/ },
  { id: "contrat", label: tr("Contrat"), symbol: "contrat", words: /contrat|\bbail\b|avenant|conditions generales|contract|\blease\b|tenancy|agreement|terms and conditions/ },
  { id: "attestation", label: tr("Attestation"), symbol: "tampon", words: /attestation|certificat|justificatif|proof of/ },
  { id: "releve", label: tr("Relevé"), symbol: "banque", words: /releve|extrait de compte|statement/ },
  { id: "fiche-de-paie", label: tr("Fiche de paie"), symbol: "portemonnaie", words: /fiche de paie|bulletin de (?:paie|salaire)|\bpaie\b|pay ?slip|payroll/ },
  { id: "impots", label: tr("Impôts"), symbol: "balance", words: /impot|imposition|taxe (?:fonciere|d habitation)|\btax\b|tax return/ },
  { id: "ordonnance", label: tr("Ordonnance"), symbol: "pilule", words: /ordonnance|prescription/ },
  { id: "garantie", label: tr("Garantie"), symbol: "garantie", words: /garantie|warranty|guarantee/ },
  { id: "identite", label: tr("Pièce d'identité"), symbol: "passeport", words: /carte d identite|\bcni\b|passeport|permis de conduire|titre de sejour|carte vitale|passport|identity card|\bid card\b|driving licen[cs]e|residence permit/ },
  { id: "courrier", label: tr("Courrier"), symbol: "enveloppe", words: /courrier|\blettre\b|\bletter\b|correspondence/ },
  { id: "autre", label: tr("Autre"), symbol: "document", words: /^$/ },
];

export function docTypeOf(id: DocType | null): (typeof DOC_TYPES)[number] | null {
  return DOC_TYPES.find((t) => t.id === id) ?? null;
}

const MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
const EN_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Sorte et date devinées d'après le nom du fichier (« Facture EDF 2026-09-30.pdf »). */
export function guessFromName(name: string): Partial<Pick<DocumentMeta, "docType" | "docDate">> {
  const stem = name.replace(/\.[a-z0-9]{1,8}$/i, "");
  const text = fold(stem).replace(/[_'’-]+/g, " ");
  const guess: Partial<Pick<DocumentMeta, "docType" | "docDate">> = {};
  const type = DOC_TYPES.find((t) => t.id !== "autre" && t.words.test(text));
  if (type) guess.docType = type.id;
  const day = (y: number, m: number, d: number) => (y >= 1950 && y <= 2100 ? makeDay(y, m, d) : null);
  let m: RegExpMatchArray | null;
  let found: DayKey | null = null;
  if ((m = stem.match(/(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})/))) found = day(+m[1]!, +m[2]!, +m[3]!);
  else if ((m = stem.match(/(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})/))) found = day(+m[3]!, +m[2]!, +m[1]!);
  else if ((m = stem.match(/(?:^|\D)((?:19|20)\d{2})(\d{2})(\d{2})(?:\D|$)/))) found = day(+m[1]!, +m[2]!, +m[3]!);
  else if ((m = stem.match(/(\d{4})[-_.](\d{1,2})(?:\D|$)/))) found = day(+m[1]!, +m[2]!, 1);
  else if ((m = text.match(new RegExp(`(${MONTHS.join("|")})\\s*(\\d{4})`)))) found = day(+m[2]!, MONTHS.indexOf(m[1]!) + 1, 1);
  else if ((m = text.match(new RegExp(`(${EN_MONTHS.join("|")})\\s*(\\d{4})`)))) found = day(+m[2]!, EN_MONTHS.indexOf(m[1]!) + 1, 1);
  if (found) guess.docDate = found;
  return guess;
}

export type DocSort = "ajout" | "date" | "nom" | "taille";

export const DOC_SORTS: readonly { value: DocSort; label: string }[] = [
  { value: "ajout", label: tr("Ajout récent") },
  { value: "date", label: tr("Date du document") },
  { value: "nom", label: tr("Nom") },
  { value: "taille", label: tr("Taille|fichier") },
];

/** Documents triés ; par date du document, ceux sans date viennent à la fin. */
export function sortDocs(list: readonly Document[], by: DocSort): Document[] {
  const copy = [...list];
  if (by === "nom") return copy.sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
  if (by === "taille") return copy.sort((a, b) => b.size - a.size);
  if (by === "date") return copy.sort((a, b) => (b.docDate ?? "").localeCompare(a.docDate ?? "") || b.createdAt - a.createdAt);
  return copy.sort((a, b) => b.createdAt - a.createdAt);
}

export interface Folder {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  position: number;
}

export type FolderInput = Pick<Folder, "name" | "icon" | "color">;

export type FileKind = "pdf" | "image" | "texte" | "tableur" | "traitement" | "presentation" | "archive" | "audio" | "video" | "autre";

const KINDS: Record<Exclude<FileKind, "autre">, readonly string[]> = {
  pdf: ["pdf"],
  image: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "svg"],
  texte: ["txt", "md", "csv", "json", "log", "xml", "ini"],
  tableur: ["xlsx", "xls", "ods"],
  traitement: ["docx", "doc", "odt", "rtf"],
  presentation: ["pptx", "ppt", "odp"],
  archive: ["zip", "7z", "rar", "gz", "tar"],
  audio: ["mp3", "wav", "m4a", "ogg", "flac"],
  video: ["mp4", "mov", "avi", "mkv", "webm"],
};

export const KIND_LABELS: Record<FileKind, string> = {
  pdf: "PDF",
  image: tr("Image"),
  texte: tr("Texte"),
  tableur: tr("Tableur"),
  traitement: tr("Document texte"),
  presentation: tr("Présentation"),
  archive: tr("Archive"),
  audio: tr("Son"),
  video: tr("Vidéo"),
  autre: tr("Fichier"),
};

export function fileKind(ext: string): FileKind {
  for (const [kind, list] of Object.entries(KINDS) as [FileKind, readonly string[]][]) if (list.includes(ext)) return kind;
  return "autre";
}

/** Types affichés dans l'aperçu intégré (le reste s'exporte). */
const PREVIEW_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

/** Comment montrer un document dans Aqueli : image, PDF, texte, ou pas d'aperçu. */
export function previewOf(ext: string): { mode: "image" | "pdf" | "text"; type: string } | null {
  if (ext === "pdf") return { mode: "pdf", type: PREVIEW_TYPES.pdf! };
  if (PREVIEW_TYPES[ext]) return { mode: "image", type: PREVIEW_TYPES[ext]! };
  if (KINDS.texte.includes(ext)) return { mode: "text", type: "text/plain" };
  return null;
}

/** « 845 octets », « 12 ko », « 1,4 Mo ». */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return trn(bytes, "{n} octet", "{n} octets");
  if (bytes < 1024 * 1024) return tr("{n} ko", { n: Math.round(bytes / 1024) });
  const mo = bytes / (1024 * 1024);
  return tr("{n} Mo", { n: mo.toLocaleString(locale(), { maximumFractionDigits: mo < 10 ? 1 : 0 }) });
}

/** « PDF · 1,4 Mo ». */
export function documentDetail(d: Pick<Document, "ext" | "size">): string {
  return `${KIND_LABELS[fileKind(d.ext)]} · ${sizeLabel(d.size)}`;
}

const LONG_DATE_FORMAT = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long", year: "numeric" });
/** « 1er mars 2031 ». */
const LONG_DATE = { format: (d: Date) => (lang() === "fr" ? LONG_DATE_FORMAT.format(d).replace(/^1 /, "1er ") : LONG_DATE_FORMAT.format(d)) };

export type ExpiryState = "expire" | "bientot" | "valide";

/** État d'un document qui expire : expiré, bientôt (dans le délai du rappel, 30 jours sinon), valide. */
export function expiryOf(d: Pick<Document, "expiresOn" | "remindDays">, today: DayKey): { state: ExpiryState; label: string; days: number } | null {
  if (!d.expiresOn) return null;
  const days = daysBetween(today, d.expiresOn);
  const date = LONG_DATE.format(fromDayKey(d.expiresOn));
  if (days < 0) return { state: "expire", label: tr("Expiré depuis le {date}", { date }), days };
  if (days === 0) return { state: "bientot", label: tr("Expire aujourd'hui"), days };
  const label = days === 1 ? tr("Expire demain") : days <= 60 ? tr("Expire dans {days} jours", { days }) : tr("Expire le {date}", { date });
  return { state: days <= Math.max(30, d.remindDays ?? 0) ? "bientot" : "valide", label, days };
}

export const REMIND_CHOICES: readonly { value: number | null; label: string }[] = [
  { value: null, label: tr("Aucun") },
  { value: 0, label: tr("Le jour même") },
  { value: 7, label: tr("1 semaine avant") },
  { value: 14, label: tr("2 semaines avant") },
  { value: 30, label: tr("1 mois avant") },
  { value: 60, label: tr("2 mois avant") },
  { value: 90, label: tr("3 mois avant") },
];

export const DOCUMENT_REMINDER_PREFIX = "doc:";

/** Rappels d'expiration, à 9 h, de maintenant à un an. */
export function scheduleForDocuments(list: readonly Document[], now: Date): ScheduledReminder[] {
  const from = now.getTime() - 60_000;
  const until = now.getTime() + 366 * 86_400_000;
  const result: ScheduledReminder[] = [];
  for (const d of list) {
    if (!d.expiresOn || d.remindDays === null) continue;
    const at = fromDayKey(addDays(d.expiresOn, -d.remindDays));
    at.setHours(9, 0, 0, 0);
    if (at.getTime() < from || at.getTime() > until) continue;
    result.push({
      at: Math.floor(at.getTime() / 1000),
      taskId: `${DOCUMENT_REMINDER_PREFIX}${d.id}`,
      title: d.name,
      when: d.remindDays === 0 ? tr("Expire aujourd'hui") : tr("Expire le {date}", { date: LONG_DATE.format(fromDayKey(d.expiresOn)) }),
    });
  }
  return result;
}

export function parseDocumentReminderId(id: string): string | null {
  return id.startsWith(DOCUMENT_REMINDER_PREFIX) ? id.slice(DOCUMENT_REMINDER_PREFIX.length) || null : null;
}

/** Nom sans l'extension (pour le renommer). */
export function stemOf(d: Pick<Document, "name" | "ext">): string {
  return d.ext && d.name.toLowerCase().endsWith(`.${d.ext}`) ? d.name.slice(0, -d.ext.length - 1) : d.name;
}

/** Couleur de la pastille de chaque genre de fichier. */
export const KIND_COLORS: Record<FileKind, string> = {
  pdf: "#e04848",
  image: "#2fae4a",
  texte: "#7f9a14",
  tableur: "#1f9a6e",
  traitement: "#2d6ff0",
  presentation: "#e0671f",
  archive: "#8a6a3a",
  audio: "#c2479a",
  video: "#7a4fd0",
  autre: "#3d6fb8",
};

/** Symbole de chaque genre de fichier (src/components/symbols.ts). */
export const KIND_SYMBOLS: Record<FileKind, string> = {
  pdf: "facture",
  image: "photo",
  texte: "carnet",
  tableur: "graphique",
  traitement: "contrat",
  presentation: "palette",
  archive: "cadenas",
  audio: "musique",
  video: "film",
  autre: "carnet",
};
