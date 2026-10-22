/**
 * Fichiers texte : une ligne par élément (« TÂCHE | Appeler le garage | 03/10/2026 14:00 »),
 * ou une tâche en saisie rapide par ligne. Chaque ligne devient un enregistrement brut, vérifié
 * ensuite comme une ligne de tableau (records.ts). Fonctions pures.
 */
import type { DayKey } from "../tasks/day";
import { fieldOf, isIncomeWord, kindFromTypeValue, type FieldId, type ImportKind, type KindGuess } from "./fields";
import {
  isBad,
  isPeriodText,
  isRepeatText,
  looksLikeMoney,
  parseDateTime,
  parseEstimate,
  parseMoney,
  parseReminder,
  parseSignedMoney,
  parseTimeRange,
} from "./values";
import { tr } from "../i18n/i18n";

/** Enregistrement lu dans un fichier, avant vérification. */
export interface RawRecord {
  line: number;
  kind: ImportKind | null;
  /** Type inconnu, manquant ou à venir. */
  kindError?: string;
  fields: Partial<Record<FieldId, string>>;
  /** Textes sans nom de champ : notes de l'élément (texte d'une note). */
  extra: string[];
  /** Ligne en saisie rapide (« Appeler le garage demain 14h #voiture »). */
  quick?: string;
  /** Case cochée (« - [x] ») : décochée dans l'aperçu. */
  done?: boolean;
  /** Élément de liste : autres colonnes du tableau (« Auteur », « Prix »), par nom. */
  cells?: Record<string, string>;
  /** Opération : le tableau porte des montants négatifs (relevé de banque) ; un montant positif est un revenu. */
  signed?: boolean;
  /** Avertissements de la lecture (répétition d'un agenda non reprise…). */
  notices?: string[];
}

/** Lecture d'un fichier texte : une tâche ou un événement par ligne, ou une seule note. */
export type TextMode = "tasks" | "events" | "note";

export interface TextLine {
  line: number;
  text: string;
}

const SKIP = [/^\/\//, /^#{1,6}\s/, /^(?:-{3,}|\*{3,}|_{3,})$/, /^```/, /^\|.*\|$/];
const MARKER = /^(?:[-*+•]|\d{1,3}[.)])\s+/;
const CHECKBOX = /^\[([ xX])\]\s+/;

/** Ligne débarrassée des puces et des cases ; `null` : ligne à ignorer. */
function clean(text: string): { text: string; done: boolean } | null {
  let t = text.trim();
  if (!t || SKIP.some((re) => re.test(t))) return null;
  t = t.replace(MARKER, "");
  const box = CHECKBOX.exec(t);
  if (box) t = t.slice(box[0].length);
  t = t.trim();
  return t ? { text: t, done: box !== null && box[1] !== " " } : null;
}

/** Type écrit en tête de ligne : « TÂCHE | … », ou « TÂCHE : … » en majuscules ; « REVENU » : opération de revenu. */
function prefix(text: string): { guess: KindGuess; title: string; rest: string[]; income: boolean } | null {
  const segments = text.split("|").map((s) => s.trim());
  if (segments.length > 1) {
    const guess = kindFromTypeValue(segments[0]!);
    if (guess) return { guess, title: segments[1] ?? "", rest: segments.slice(2), income: isIncomeWord(segments[0]!) };
  }
  const colon = /^([\p{Lu}-]{2,}(?:\s[\p{Lu}-]+)?)\s*:\s*(.*)$/u.exec(segments[0]!);
  if (colon) {
    const guess = kindFromTypeValue(colon[1]!);
    if (guess) return { guess, title: colon[2]!, rest: segments.slice(1), income: isIncomeWord(colon[1]!) };
  }
  return null;
}

/** Vrai si la ligne commence par un type (fichier « typé »). */
export function isTypedLine(text: string): boolean {
  const c = clean(text);
  return c !== null && prefix(c.text) !== null;
}

/** Champs qui s'écrivent aussi sans deux-points (« échéance 15/11/2026 »), si la valeur est valide. */
const LOOSE: Partial<Record<FieldId, (value: string, today: DayKey) => boolean>> = {
  due: (v, today) => !isBad(parseDateTime(v, { today })),
  cancelBy: (v, today) => !isBad(parseDateTime(v, { today })),
  date: (v, today) => !isBad(parseDateTime(v, { today })),
  endDate: (v, today) => !isBad(parseDateTime(v, { today })),
  start: (v) => !isBad(parseTimeRange(v)),
  end: (v) => !isBad(parseTimeRange(v)),
  amount: (v) => !isBad(parseMoney(v)),
  estimate: (v) => !isBad(parseEstimate(v)),
  reminder: (v) => !isBad(parseReminder(v)),
};

const NUMBER_ONLY = /^\d+(?:[.,]\d+)?$/;
const HAS_TIME = /\d\s*[h:]|midi|minuit/i;

function set(record: RawRecord, field: FieldId, value: string) {
  const current = record.fields[field];
  if (field === "tags" && current) record.fields.tags = `${current} ${value}`;
  else if ((field === "notes" || field === "text" || field === "subtasks") && current) record.fields[field] = `${current}\n${value}`;
  else if (current === undefined) record.fields[field] = value;
  else record.extra.push(value);
}

/** Range un champ d'une ligne de texte : « nom: valeur », ou reconnu à sa forme. */
function assign(record: RawRecord, kind: ImportKind, segment: string, today: DayKey) {
  const seg = segment.trim();
  if (!seg) return;
  const named = /^([^:]{1,40}?)\s*:\s*([\s\S]*)$/.exec(seg);
  const namedField = named ? fieldOf(kind, named[1]!) : null;
  if (named && namedField) {
    if (named[2]!.trim()) set(record, namedField, named[2]!.trim());
    return;
  }
  const words = seg.split(/\s+/);
  for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
    const field = fieldOf(kind, words.slice(0, n).join(" "));
    const value = words.slice(n).join(" ");
    const valid = field ? LOOSE[field] : undefined;
    if (field && valid && valid(value, today)) {
      set(record, field, value);
      return;
    }
  }
  if (seg.startsWith("#")) return set(record, "tags", seg);
  if (kind === "task" && /^!(?:!{1,2}|\p{L}+)?$/u.test(seg)) return set(record, "priority", seg);

  const isDate = !NUMBER_ONLY.test(seg) && !isBad(parseDateTime(seg, { today }));
  const isTime = HAS_TIME.test(seg) && !isBad(parseTimeRange(seg));
  if (kind === "task") {
    if (isDate) return set(record, "due", seg);
    if (isTime) return set(record, "time", seg);
    if (isRepeatText(seg, today)) return set(record, "repeat", seg);
  } else if (kind === "event") {
    if (isDate) return set(record, "date", seg);
    if (isTime) return set(record, "start", seg);
    if (isRepeatText(seg, today)) return set(record, "repeat", seg);
  } else if (kind === "obligation") {
    if (looksLikeMoney(seg)) return set(record, "amount", seg);
    if (isDate) return set(record, "due", seg);
    if (isPeriodText(seg)) return set(record, "period", seg);
  } else if (kind === "transaction") {
    if (looksLikeMoney(seg) || (!record.fields.amount && !isBad(parseSignedMoney(seg)) && !isDate)) return set(record, "amount", seg);
    if (isDate) return set(record, "date", seg);
  } else if (kind === "listItem") {
    // « LISTE | Lait | Courses | Crèmerie » : la liste, puis le rayon.
    if (!record.fields.list) return set(record, "list", seg);
    if (!record.fields.section) return set(record, "section", seg);
  }
  // Catégorie d'obligation, ou notes : décidé à la vérification.
  record.extra.push(seg);
}

/** Enregistrements d'un fichier texte lu ligne par ligne (`mode` : type des lignes sans type). */
export function lineRecords(lines: readonly TextLine[], mode: Exclude<TextMode, "note">, today: DayKey): RawRecord[] {
  const fallback: ImportKind = mode === "events" ? "event" : "task";
  const records: RawRecord[] = [];
  for (const { line, text } of lines) {
    const c = clean(text);
    if (!c) continue;
    const typed = prefix(c.text);
    const record: RawRecord = { line, kind: null, fields: {}, extra: [], done: c.done || undefined };
    if (typed && typed.guess && "later" in typed.guess) {
      record.kindError = tr("{kind} : bientôt disponible.", { kind: typed.guess.later });
      record.fields.title = typed.title;
      records.push(record);
      continue;
    }
    if (typed && typed.guess && "kind" in typed.guess) {
      record.kind = typed.guess.kind;
      record.fields.title = typed.title;
      if (typed.income) record.fields.direction = "revenu";
      for (const seg of typed.rest) assign(record, record.kind, seg, today);
    } else {
      record.kind = fallback;
      const segments = c.text.split("|").map((s) => s.trim());
      if (segments.length === 1) record.quick = c.text;
      else {
        record.fields.title = segments[0]!;
        for (const seg of segments.slice(1)) assign(record, fallback, seg, today);
      }
    }
    records.push(record);
  }
  return records;
}

/** Titre d'une note lue d'un seul tenant : premier titre Markdown, sinon le nom du fichier. */
export function noteRecord(text: string, fileTitle: string): RawRecord {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const index = lines.findIndex((l) => l.trim() !== "");
  const heading = index >= 0 ? /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(lines[index]!) : null;
  const body = heading ? lines.slice(index + 1).join("\n") : text;
  return { line: 1, kind: "note", fields: { title: heading ? heading[1]! : fileTitle, text: body }, extra: [] };
}
