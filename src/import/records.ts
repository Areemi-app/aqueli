/**
 * Vérification des enregistrements lus dans un fichier : chaque ligne devient un élément prêt à
 * créer (tâche, événement, obligation, note, habitude, contact), ou une ligne en erreur avec son explication.
 * Signale les doublons (même type, même titre, même date, dans Aqueli ou plus haut dans le
 * fichier). Fonctions pures.
 */
import { addMinutes } from "../calendar/eventTime";
import { birthdayLabel, contactName, EMPTY_CONTACT, type Contact, type ContactInput } from "../contacts/contacts";
import { frequencyLabel, HABIT_TEMPLATES, targetLabel, type Habit, type HabitInput, type HabitMoment } from "../habits/habits";
import { fold } from "../lib/fold";
import type { CalendarEvent, EventInput } from "../calendar/events";
import { plainOf, type NoteBody, type NoteMeta, type NoteSummary, type Notebook } from "../notes/notes";
import {
  CATEGORIES,
  formatAmount,
  PERIODS,
  type CategoryDef,
  type Obligation,
  type ObligationCategory,
  type ObligationInput,
} from "../obligations/obligations";
import type { Space } from "../spaces/spaces";
import { formatShortDay, type DayKey } from "../tasks/day";
import { parseQuickAdd, type Priority } from "../tasks/quickAdd";
import { recurrenceLabel, type Recurrence } from "../tasks/recurrence";
import { PRIORITY_LABELS, type Subtask, type Task, type TaskInput } from "../tasks/tasks";
import { repeatLabel, type BudgetCategory, type Transaction, type TransactionInput } from "../budget/budget";
import { cellText, columnId, listFromTemplate, templateOf, type CellValue, type ColumnKind, type List, type ListColumn, type ListInput, type ListItemInput, type TemplateId } from "../lists/lists";
import { fieldOf, isIncomeWord, isTypeColumn, keepsOtherColumns, kindFromTypeValue, KINDS, mapHeaders, UPDATABLE_KINDS, type ImportKind } from "./fields";
import type { RawRecord } from "./lines";
import { markdownToDoc } from "./markdown";
import {
  isBad,
  key,
  parseDateTime,
  parseDay,
  parseBirthday,
  parseHabitFrequency,
  parseEstimate,
  parseMoney,
  parsePeriod,
  parsePriority,
  parseReminder,
  parseRepeat,
  parseSignedMoney,
  parseTags,
  parseTime,
  parseTimeRange,
  parseYesNo,
  isEmail,
  isPhone,
  quote,
  splitValues,
  type Bad,
} from "./values";
import type { Cells } from "./xlsx";
import { tr, trn } from "../i18n/i18n";

/** Identifiant, pour la mise à jour par l'import (absent des éléments d'exemple des tests). */
type WithId = { id?: string };

export interface ExistingItems {
  tasks: readonly (Pick<Task, "title" | "dueDate"> & WithId)[];
  events: readonly (Pick<CalendarEvent, "title" | "startDate"> & WithId)[];
  obligations: readonly Pick<Obligation, "title" | "dueDate">[];
  notes: readonly Pick<NoteSummary, "title">[];
  habits?: readonly Pick<Habit, "name">[];
  contacts?: readonly (Pick<Contact, "firstName" | "lastName" | "company"> & WithId)[];
  transactions?: readonly (Pick<Transaction, "label" | "day" | "kind" | "amountCents"> & WithId)[];
  /** Éléments des listes, avec le nom de leur liste. */
  listItems?: readonly { list: string; title: string }[];
}

export interface ImportContext {
  now: Date;
  today: DayKey;
  /** Dates d'Excel comptées depuis 1904. */
  date1904: boolean;
  spaces: readonly Space[];
  /** Espace des éléments qui n'en précisent pas. */
  defaultSpaceId: string | null;
  notebooks: readonly Notebook[];
  categories: readonly CategoryDef[];
  /** Rappel par défaut des éléments à une heure précise (Paramètres › Rappels). */
  defaultReminder: number | null;
  /** Catégories du budget. */
  budgetCategories?: readonly BudgetCategory[];
  /** Listes existantes, qui reçoivent les éléments à leur nom. */
  lists?: readonly List[];
  existing: ExistingItems;
}

/** Liste qui reçoit un élément importé : existante, ou créée à son nom. */
export interface ListTarget {
  name: string;
  /** Liste existante ; nul : liste nouvelle. */
  id: string | null;
  /** Liste nouvelle : modèle, colonnes et rayons tirés du tableau. */
  input: ListInput | null;
}

export type ImportItem =
  | { kind: "task"; input: TaskInput }
  | { kind: "event"; input: EventInput }
  | { kind: "obligation"; input: ObligationInput }
  | { kind: "note"; body: NoteBody; meta: NoteMeta }
  | { kind: "habit"; input: HabitInput }
  | { kind: "contact"; input: ContactInput }
  | { kind: "transaction"; input: TransactionInput }
  | { kind: "listItem"; list: ListTarget; input: ListItemInput };

export interface ImportRow {
  /** Identifiant dans l'aperçu (source et ligne). */
  id: string;
  line: number;
  kind: ImportKind | null;
  title: string;
  /** Date et heure, telles qu'affichées. */
  when: string;
  /** Espace, étiquettes, montant… */
  details: string[];
  /** Élément à créer ; `null` si la ligne est en erreur. */
  item: ImportItem | null;
  errors: string[];
  warnings: string[];
  /** « Déjà dans Aqueli. », « Doublon de la ligne 4. » */
  duplicate: string | null;
  /** Élément existant que la ligne met à jour (colonne « Identifiant ») ; `null` : création. */
  replaces: string | null;
  /** Coché d'office : valide, sans doublon, pas déjà fait. */
  checked: boolean;
}

// ——— Tableaux ———

/** Enregistrements d'un tableau (onglet ou CSV) ; « mixed » : type donné par la colonne « Type ». */
export function tableRecords(headers: readonly string[], rows: readonly Cells[], kind: ImportKind | "mixed"): RawRecord[] {
  const typeIndex = headers.findIndex(isTypeColumn);
  const maps = new Map(KINDS.map((k) => [k, mapHeaders(headers, k).fields]));
  // Relevé de banque : des montants négatifs ; un montant positif y est alors un revenu.
  const amountIndex = maps.get("transaction")!.indexOf("amount");
  const signed = amountIndex >= 0 && rows.some(({ cells }) => {
    const v = parseSignedMoney(cells[amountIndex] ?? "");
    return !isBad(v) && v < 0;
  });
  return rows.map(({ line, cells }) => {
    const record: RawRecord = { line, kind: kind === "mixed" ? null : kind, fields: {}, extra: [] };
    if (kind === "mixed") {
      const value = typeIndex >= 0 ? (cells[typeIndex] ?? "").trim() : "";
      const guess = kindFromTypeValue(value);
      if (guess && "kind" in guess) record.kind = guess.kind;
      else if (guess && "later" in guess) record.kindError = tr("{kind} : bientôt disponible.", { kind: guess.later });
      else record.kindError = value ? tr("Type inconnu : {value}.", { value: quote(value) }) : tr("Type manquant.");
      if (record.kind === "transaction" && isIncomeWord(value)) record.fields.direction = "revenu";
    }
    const fields = maps.get(record.kind ?? "task")!;
    fields.forEach((field, i) => {
      const value = cells[i];
      if (field && value && value.trim()) record.fields[field] = value;
    });
    if (record.kind === "transaction" && signed) record.signed = true;
    if (record.kind && keepsOtherColumns(record.kind)) {
      record.cells = {};
      headers.forEach((h, i) => {
        const value = cells[i];
        if (!fields[i] && h.trim() && !isTypeColumn(h) && value && value.trim()) record.cells![h.trim()] = value;
      });
    }
    return record;
  });
}

/** Colonnes ignorées d'un tableau, telles qu'écrites (celles d'une liste deviennent ses colonnes). */
export function ignoredColumns(headers: readonly string[], kind: ImportKind | "mixed"): string[] {
  if (kind !== "mixed" && keepsOtherColumns(kind)) return [];
  if (kind !== "mixed") return mapHeaders(headers, kind).ignored;
  return headers.filter((h) => h.trim() && !isTypeColumn(h) && KINDS.every((k) => fieldOf(k, h) === null)).map((h) => h.trim());
}

// ——— Vérification ———

const MAX_TITLE = 500;
const MAX_NOTE_TITLE = 300;
const MAX_NOTES = 20_000;

/** Texte sur une ligne : caractères de contrôle et espaces superflus retirés. */
const oneLine = (text: string) =>
  text
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Texte sur plusieurs lignes : retours à la ligne et tabulations gardés. */
const multiLine = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
    .trim();

/** Nom comparé sans accents, majuscules ni ponctuation (« Travail » = « travail »). */
const squash = (text: string) => key(text).replace(/[^a-z0-9]/g, "");

interface Check {
  errors: string[];
  warnings: string[];
  /** Valeur lue, ou `undefined` (erreur notée). */
  take<T>(value: T | Bad): T | undefined;
}

function check(): Check {
  const errors: string[] = [];
  const warnings: string[] = [];
  return {
    errors,
    warnings,
    take: <T>(value: T | Bad) => {
      if (isBad(value)) {
        errors.push(value.message);
        return undefined;
      }
      return value;
    },
  };
}

function title(text: string | undefined, max: number, c: Check): string {
  const t = oneLine(text ?? "");
  if (!t) c.errors.push(tr("Titre manquant."));
  else if (t.length > max) c.errors.push(tr("Titre trop long ({max} caractères au plus).", { max }));
  return t;
}

function notesOf(parts: (string | undefined)[], c: Check): string {
  const notes = multiLine(parts.filter((p) => p && p.trim()).join("\n"));
  if (notes.length > MAX_NOTES) c.errors.push(tr("Notes trop longues (20 000 caractères au plus)."));
  return notes;
}

function spaceOf(text: string | undefined, ctx: ImportContext, c: Check, fallback: string | null = ctx.defaultSpaceId): string | null {
  if (!text?.trim()) return fallback;
  const wanted = squash(text);
  const space = ctx.spaces.find((s) => squash(s.name) === wanted);
  if (space) return space.id;
  c.warnings.push(tr("Espace inconnu : {quote}.", { quote: quote(text.trim()) }));
  return fallback;
}

const spaceName = (id: string | null, ctx: ImportContext) => ctx.spaces.find((s) => s.id === id)?.name ?? null;

function reminderOf(text: string | undefined, timed: boolean, ctx: ImportContext, c: Check): number | null {
  if (text?.trim()) return c.take(parseReminder(text)) ?? null;
  return timed ? ctx.defaultReminder : null;
}

const dayLabel = (day: DayKey, ctx: ImportContext) => formatShortDay(day, ctx.today);

interface Built {
  item: ImportItem | null;
  title: string;
  when: string;
  details: string[];
  /** Clé des doublons : type, titre et date. */
  dupKey: string;
}

function buildTask(r: RawRecord, ctx: ImportContext, c: Check): Built {
  const f = r.fields;
  const opts = { today: ctx.today, date1904: ctx.date1904 };
  let name = f.title;
  let due: DayKey | null = null;
  let time: string | null = null;
  let priority: Priority = 0;
  let tags: string[] = [];
  let recurrence: Recurrence | null = null;
  let quickSpace: string | null = null;
  if (r.quick !== undefined) {
    const q = parseQuickAdd(r.quick, ctx.now, ctx.spaces);
    name = q.title;
    due = q.dueDate;
    time = q.dueTime;
    priority = q.priority;
    tags = q.tags;
    recurrence = q.recurrence;
    quickSpace = q.spaceId;
  }
  const t = title(name, MAX_TITLE, c);
  let badDate = false;
  if (f.due) {
    const dt = c.take(parseDateTime(f.due, opts));
    if (dt) {
      due = dt.day;
      if (dt.start) time = dt.start;
    } else badDate = true;
  }
  if (f.time) time = c.take(parseTime(f.time)) ?? time;
  let start: DayKey | null = null;
  if (f.start) start = c.take(parseDateTime(f.start, opts))?.day ?? null;
  if (start && due && start > due) c.errors.push(tr("Date de début après l'échéance."));
  if (f.priority) priority = c.take(parsePriority(f.priority)) ?? priority;
  if (f.tags) {
    const more = c.take(parseTags(f.tags)) ?? [];
    tags = [...tags, ...more.filter((m) => !tags.some((x) => x.toLowerCase() === m.toLowerCase()))];
    if (tags.length > 20) c.errors.push(tr("20 étiquettes au plus."));
  }
  const spaceId = spaceOf(f.space, ctx, c, quickSpace ?? ctx.defaultSpaceId);
  const estimate = f.estimate ? (c.take(parseEstimate(f.estimate)) ?? null) : null;
  if (f.repeat) {
    const rule = c.take(parseRepeat(f.repeat, due ?? ctx.today, true));
    if (rule !== undefined) recurrence = rule;
  }
  if (time && !due && !recurrence) c.errors.push(tr("Heure sans échéance."));
  let reminder = reminderOf(f.reminder, time !== null, ctx, c);
  if (reminder !== null && !due && !recurrence) {
    if (f.reminder) c.warnings.push(tr("Rappel ignoré : aucune échéance."));
    reminder = null;
  }
  const subtasks: Subtask[] = [];
  if (f.subtasks) {
    for (const s of f.subtasks.split(/\s*[;\n]\s*/)) {
      const st = oneLine(s);
      if (!st) continue;
      if (st.length > 300) c.errors.push(tr("Sous-tâche trop longue (300 caractères au plus)."));
      subtasks.push({ id: "", title: st, done: false });
    }
    if (subtasks.length > 100) c.errors.push(tr("100 sous-tâches au plus."));
  }
  const notes = notesOf([f.notes, ...r.extra], c);
  const input: TaskInput = {
    title: t,
    notes,
    spaceId,
    dueDate: due,
    dueTime: due || recurrence ? time : null,
    startDate: start,
    priority,
    estimate,
    tags,
    subtasks,
    recurrence,
    color: null,
    reminder,
    inbox: due === null && !recurrence,
  };
  const details = [
    spaceName(spaceId, ctx),
    tags.length ? tags.map((x) => `#${x}`).join(" ") : null,
    priority ? tr("Priorité {priority}", { priority: PRIORITY_LABELS[priority].toLowerCase() }) : null,
    recurrence ? recurrenceLabel(recurrence) : null,
    subtasks.length ? trn(subtasks.length, "{n} sous-tâche", "{n} sous-tâches") : null,
  ].filter((d): d is string => d !== null);
  const when = badDate
    ? ""
    : due
      ? `${dayLabel(due, ctx)}${input.dueTime ? ` · ${input.dueTime}` : ""}`
      : recurrence
        ? tr("Répétée")
        : tr("Boîte de réception");
  return { item: { kind: "task", input }, title: t, when, details, dupKey: `task|${key(t)}|${due ?? ""}` };
}

function buildEvent(r: RawRecord, ctx: ImportContext, c: Check): Built {
  const f = r.fields;
  const opts = { today: ctx.today, date1904: ctx.date1904 };
  let name = f.title;
  let startDate: DayKey | null = null;
  let startTime: string | null = null;
  let endTime: string | null = null;
  let endDate: DayKey | null = null;
  if (r.quick !== undefined) {
    const q = parseQuickAdd(r.quick, ctx.now, ctx.spaces);
    name = q.title;
    startDate = q.dueDate;
    startTime = q.dueTime;
  }
  const t = title(name, MAX_TITLE, c);
  if (f.date) {
    const dt = c.take(parseDateTime(f.date, opts));
    if (dt) {
      startDate = dt.day;
      startTime = dt.start ?? startTime;
      endTime = dt.end ?? endTime;
    }
  }
  if (f.start) {
    // « 08/10/2026 09:30 » dans la colonne Début, ou seulement l'heure (ou le créneau).
    const dt = parseDateTime(f.start, opts);
    if (!isBad(dt) && dt.start) {
      startDate ??= dt.day;
      startTime = dt.start;
      endTime = dt.end ?? endTime;
    } else {
      const range = c.take(parseTimeRange(f.start));
      if (range) {
        startTime = range.start;
        endTime = range.end ?? endTime;
      }
    }
  }
  if (f.end) {
    const dt = parseDateTime(f.end, opts);
    if (!isBad(dt) && dt.start) {
      endDate = dt.day;
      endTime = dt.start;
    } else endTime = c.take(parseTime(f.end)) ?? endTime;
  }
  if (f.endDate) endDate = c.take(parseDay(f.endDate, opts)) ?? endDate;
  if (!startDate) c.errors.push(f.date ? tr("Date illisible.") : tr("Date manquante."));

  let when = "";
  let input: EventInput | null = null;
  if (startDate) {
    if (!startTime && endTime) c.errors.push(tr("Heure de fin sans heure de début."));
    let end = { day: endDate ?? startDate, time: endTime };
    if (startTime && !endTime) end = addMinutes(endDate ?? startDate, startTime, 60);
    if (startTime && endTime && !endDate && endTime <= startTime) c.errors.push(tr("La fin précède le début."));
    else if (startTime && end.time && `${end.day} ${end.time}` <= `${startDate} ${startTime}`) c.errors.push(tr("La fin précède le début."));
    else if (!startTime && end.day < startDate) c.errors.push(tr("La fin précède le début."));
    const span = (Date.parse(end.day) - Date.parse(startDate)) / 86_400_000;
    if (span > 366) c.errors.push(tr("Événement trop long (366 jours au plus)."));
    const location = oneLine(f.location ?? "");
    if (location.length > 300) c.errors.push(tr("Lieu trop long (300 caractères au plus)."));
    let recurrence: Recurrence | null = null;
    if (f.repeat) recurrence = c.take(parseRepeat(f.repeat, startDate, false)) ?? null;
    input = {
      title: t,
      location,
      notes: notesOf([f.notes, ...r.extra], c),
      spaceId: spaceOf(f.space, ctx, c),
      startDate,
      startTime,
      endDate: end.day,
      endTime: startTime ? end.time : null,
      color: null,
      reminder: reminderOf(f.reminder, startTime !== null, ctx, c),
      recurrence,
      exceptions: [],
      repeatUntil: null,
    };
    const lastDay = input.endDate !== startDate ? ` → ${dayLabel(input.endDate, ctx)}` : "";
    when = startTime ? `${dayLabel(startDate, ctx)} · ${startTime}–${input.endTime}${lastDay}` : `${dayLabel(startDate, ctx)}${lastDay}`;
  }
  const details = input
    ? [spaceName(input.spaceId, ctx), input.location || null, input.recurrence ? recurrenceLabel(input.recurrence) : null].filter(
        (d): d is string => d !== null,
      )
    : [];
  return { item: input ? { kind: "event", input } : null, title: t, when, details, dupKey: `event|${key(t)}|${startDate ?? ""}` };
}

/** Catégorie d'après son nom (celui d'origine ou celui choisi), son identifiant ou un début de nom. */
function categoryFrom(text: string, ctx: ImportContext): ObligationCategory | null {
  const wanted = key(text);
  const singular = (s: string) => s.replace(/s\b/g, "");
  for (const cat of ctx.categories) {
    const original = CATEGORIES.find((x) => x.id === cat.id)?.label ?? cat.label;
    for (const name of [cat.id, cat.label, original].map(key)) {
      if (name === wanted || singular(name) === singular(wanted) || name.startsWith(`${wanted} `)) return cat.id;
    }
  }
  return null;
}

function buildObligation(r: RawRecord, ctx: ImportContext, c: Check): Built {
  const f = r.fields;
  const opts = { today: ctx.today, date1904: ctx.date1904 };
  const t = title(f.title, MAX_TITLE, c);
  const extra = [...r.extra];
  let category: ObligationCategory = "factures";
  if (f.category) {
    const found = categoryFrom(f.category, ctx);
    if (found) category = found;
    else c.warnings.push(tr("Catégorie inconnue : {category}. Classée dans {fallback}.", { category: quote(f.category.trim()), fallback: ctx.categories.find((x) => x.id === "factures")?.label ?? tr("Factures") }));
  } else {
    // Ligne de texte : une catégorie écrite sans nom de champ.
    const index = extra.findIndex((e) => categoryFrom(e, ctx) !== null);
    if (index >= 0) category = categoryFrom(extra.splice(index, 1)[0]!, ctx)!;
  }
  const due = f.due ? c.take(parseDateTime(f.due, opts))?.day : undefined;
  if (!f.due) c.errors.push(tr("Échéance manquante."));
  const amountCents = f.amount ? (c.take(parseMoney(f.amount)) ?? null) : null;
  const periodMonths = f.period ? (c.take(parsePeriod(f.period)) ?? null) : null;
  const cancelBy = f.cancelBy ? (c.take(parseDateTime(f.cancelBy, opts))?.day ?? null) : null;
  if (due && cancelBy && cancelBy > due) c.errors.push(tr("Le préavis suit l'échéance."));
  const organization = oneLine(f.organization ?? "");
  if (organization.length > 200) c.errors.push(tr("Organisme trop long (200 caractères au plus)."));
  const reference = oneLine(f.reference ?? "");
  if (reference.length > 100) c.errors.push(tr("Référence trop longue (100 caractères au plus)."));
  // Prélèvement automatique : oui ou non.
  const autoPay = f.autoPay ? (c.take(parseYesNo(f.autoPay)) ?? false) : false;
  const input: ObligationInput | null = due
    ? {
        title: t,
        category,
        organization,
        reference,
        amountCents,
        periodMonths,
        dueDate: due,
        cancelBy,
        status: "a-faire",
        spaceId: spaceOf(f.space, ctx, c),
        color: null,
        notes: notesOf([f.notes, ...extra], c),
        autoPay,
      }
    : null;
  const details = input
    ? [
        ctx.categories.find((x) => x.id === category)?.label ?? null,
        amountCents !== null ? formatAmount(amountCents) : null,
        PERIODS.find((p) => p.value === periodMonths)?.label ?? null,
        cancelBy ? tr("Préavis {date}", { date: dayLabel(cancelBy, ctx) }) : null,
        organization || null,
      ].filter((d): d is string => d !== null)
    : [];
  return {
    item: input ? { kind: "obligation", input } : null,
    title: t,
    when: due ? dayLabel(due, ctx) : "",
    details,
    dupKey: `obligation|${key(t)}|${due ?? ""}`,
  };
}

function buildNote(r: RawRecord, ctx: ImportContext, c: Check): Built {
  const f = r.fields;
  const text = multiLine([f.text, ...r.extra].filter(Boolean).join("\n"));
  // Sans titre : la première ligne du texte.
  const t = title(f.title?.trim() ? f.title : text.split("\n")[0]?.replace(/^#+\s*/, "").slice(0, 120), MAX_NOTE_TITLE, c);
  const doc = markdownToDoc(text);
  const plain = plainOf(doc);
  if (plain.length > 1_000_000) c.errors.push(tr("Texte trop long."));
  let notebookId: string | null = null;
  if (f.notebook?.trim()) {
    const wanted = squash(f.notebook);
    notebookId = ctx.notebooks.find((n) => squash(n.name) === wanted)?.id ?? null;
    if (!notebookId) c.warnings.push(tr("Carnet inconnu : {quote}.", { quote: quote(f.notebook.trim()) }));
  }
  const tags = f.tags ? (c.take(parseTags(f.tags)) ?? []) : [];
  const pinned = f.pinned ? (c.take(parseYesNo(f.pinned)) ?? false) : false;
  const meta: NoteMeta = { notebookId, spaceId: spaceOf(f.space, ctx, c), tags, pinned, favorite: false, color: null, archived: false };
  const body: NoteBody = { title: t, content: JSON.stringify(doc), plain, links: [] };
  const details = [
    spaceName(meta.spaceId, ctx),
    notebookId ? (ctx.notebooks.find((n) => n.id === notebookId)?.name ?? null) : null,
    tags.length ? tags.map((x) => `#${x}`).join(" ") : null,
    pinned ? tr("Épinglée") : null,
    plain ? plain.replace(/\s+/g, " ").slice(0, 80) : null,
  ].filter((d): d is string => d !== null);
  return { item: { kind: "note", body, meta }, title: t, when: "", details, dupKey: `note|${key(t)}` };
}

const MAX_HABIT_NAME = 60;

function buildHabit(r: RawRecord, ctx: ImportContext, c: Check): Built {
  const f = { ...r.fields };
  for (const extra of r.extra) {
    const text = extra.trim();
    const amount = /^(\d{1,4})\s*(\p{L}[\p{L} '-]*)?$/u.exec(text);
    if (!f.frequency && !isBad(parseHabitFrequency(text))) f.frequency = text;
    else if (!f.target && amount) {
      f.target = amount[1];
      if (amount[2] && !f.unit) f.unit = amount[2];
    } else if (!f.reminder && !isBad(parseTime(text))) f.reminder = text;
    else c.warnings.push(tr("Champ ignoré : {quote}.", { quote: quote(text) }));
  }
  const t = title(f.title, MAX_HABIT_NAME, c);
  const frequency = f.frequency ? c.take(parseHabitFrequency(f.frequency)) : { kind: "quotidien" as const };
  let target = 1;
  if (f.target) {
    const n = Number(f.target.trim().replace(",", "."));
    if (Number.isInteger(n) && n >= 1 && n <= 1000) target = n;
    else c.errors.push(tr("Objectif refusé : {target} (nombre entier de 1 à 1000).", { target: f.target.trim() }));
  }
  const unit = oneLine(f.unit ?? "");
  if (unit.length > 20) c.errors.push(tr("Unité trop longue (20 caractères au plus)."));
  const reminder = f.reminder ? (c.take(parseTime(f.reminder)) ?? null) : null;
  const negative = f.negative ? (c.take(parseYesNo(f.negative)) ?? false) : false;
  // Moment de la journée : matin, midi ou soir (« après-midi » compte pour midi).
  const momentWord = f.moment ? fold(f.moment).trim() : "";
  const moment: HabitMoment | null =
    momentWord.startsWith("mat") || momentWord.startsWith("morning")
      ? "matin"
      : momentWord.startsWith("midi") || momentWord.startsWith("apres") || momentWord.startsWith("midday") || momentWord.startsWith("noon") || momentWord.startsWith("afternoon")
        ? "midi"
        : momentWord.startsWith("soir") || momentWord.startsWith("nuit") || momentWord.startsWith("evening") || momentWord.startsWith("night")
          ? "soir"
          : null;
  if (momentWord && moment === null && !/^(journee|dans la journee|aucun|-|during the day|any time|anytime|none)$/.test(momentWord)) c.warnings.push(tr("Moment inconnu : « matin », « midi » ou « soir ». L'habitude est rangée « dans la journée »."));
  // Symbole et couleur d'un modèle au même nom (« Lire », « Méditer »), sinon ceux du module.
  const model = HABIT_TEMPLATES.find((m) => key(m.name) === key(t) || key(m.label) === key(t));
  const input: HabitInput | null = frequency
    ? {
        name: t,
        icon: model?.icon ?? "repetition",
        color: model?.color ?? null,
        kind: target > 1 || unit ? "quantite" : "oui-non",
        negative,
        target,
        unit,
        frequency,
        reminder,
        moment,
        spaceId: spaceOf(f.space, ctx, c),
      }
    : null;
  const details = input
    ? [spaceName(input.spaceId, ctx), frequencyLabel(input.frequency), targetLabel(input), input.negative ? tr("À arrêter") : null, reminder ? tr("Rappel {time}", { time: reminder }) : null].filter(
        (d): d is string => !!d,
      )
    : [];
  return { item: input ? { kind: "habit", input } : null, title: t, when: "", details, dupKey: `habit|${key(t)}` };
}

const phoneLabel = (value: string) => (/^(?:\+33\s?[67]|0[67])/.test(value.replace(/[\s.]/g, "")) ? "Mobile" : "Domicile");

function buildContact(r: RawRecord, ctx: ImportContext, c: Check): Built {
  const f = { ...r.fields };
  const extra: string[] = [];
  // Ligne de texte : téléphones, e-mails et date reconnus à leur forme.
  for (const e of r.extra) {
    const v = e.trim();
    if (isEmail(v)) f.email = f.email ? `${f.email}; ${v}` : v;
    else if (!f.birthday && !isBad(parseBirthday(v, ctx.date1904))) f.birthday = v;
    else if (isPhone(v) && v.replace(/\D/g, "").length >= 6) f.phone = f.phone ? `${f.phone}; ${v}` : v;
    else extra.push(v);
  }
  let first = oneLine(f.firstName ?? "");
  let last = oneLine(f.lastName ?? "");
  // Titre d'une ligne de texte (« Paul Durand ») : le premier mot est le prénom.
  if (!first && !last && f.title?.trim()) {
    const [head, ...tail] = oneLine(f.title).split(" ");
    first = head ?? "";
    last = tail.join(" ");
  }
  const company = oneLine(f.company ?? "");
  if (!first && !last && !company) c.errors.push(tr("Nom manquant."));
  if (first.length > 100 || last.length > 100) c.errors.push(tr("Nom trop long (100 caractères au plus)."));
  if (company.length > 150) c.errors.push(tr("Société trop longue (150 caractères au plus)."));
  const phones = splitValues(f.phone ?? "").map((v) => {
    if (!isPhone(v) || v.length > 40) c.errors.push(tr("Téléphone illisible : {quote}.", { quote: quote(v) }));
    return { label: phoneLabel(v), value: v };
  });
  const emails = splitValues(f.email ?? "").map((v) => {
    if (!isEmail(v) || v.length > 200) c.errors.push(tr("Adresse e-mail illisible : {quote}.", { quote: quote(v) }));
    return { label: tr("Personnel"), value: v };
  });
  if (phones.length > 10 || emails.length > 10) c.errors.push(tr("10 numéros et 10 adresses e-mail au plus."));
  const address = multiLine(f.address ?? "");
  if (address.length > 500) c.errors.push(tr("Adresse trop longue (500 caractères au plus)."));
  const birthday = f.birthday ? (c.take(parseBirthday(f.birthday, ctx.date1904)) ?? null) : null;
  const tags = f.tags ? (c.take(parseTags(f.tags)) ?? []) : [];
  // « Rester en contact » : chaque semaine… chaque année ; vide ou « non » : aucun suivi.
  const keepWord = f.keepInTouch ? key(f.keepInTouch) : "";
  const keepInTouch = keepWord ? keepInTouchOf(keepWord) : null;
  if (keepWord && keepInTouch === undefined) c.warnings.push(tr("Fréquence de contact inconnue : {quote}. Contact sans suivi.", { quote: quote(f.keepInTouch!.trim()) }));
  const input: ContactInput = {
    ...EMPTY_CONTACT,
    firstName: first,
    lastName: last,
    company,
    phones,
    emails,
    address,
    birthday,
    notes: notesOf([f.notes, ...extra], c),
    tags,
    spaceId: spaceOf(f.space, ctx, c),
    keepInTouch: keepInTouch ?? null,
  };
  const name = contactName(input);
  const details = [spaceName(input.spaceId, ctx), company && company !== name ? company : null, phones[0]?.value ?? null, emails[0]?.value ?? null, birthday ? tr("Né(e) le {date}", { date: birthdayLabel(birthday) }) : null].filter(
    (d): d is string => !!d,
  );
  return { item: { kind: "contact", input }, title: name, when: "", details, dupKey: `contact|${key(name)}` };
}

/** Fréquence de « Rester en contact » en jours ; `null` : aucun suivi ; `undefined` : illisible. */
function keepInTouchOf(word: string): number | null | undefined {
  if (/^(?:non|aucun(?: suivi)?|jamais|-|no|none|never|no follow-up)$/.test(word)) return null;
  if (/semaine|hebdo|week/.test(word)) return /2|deux|two|15 jours|quinzaine/.test(word) ? 14 : 7;
  if (/15 jours|quinzaine|fortnight/.test(word)) return 14;
  if (/\ban\b|annuel|year|annual/.test(word)) return 365;
  if (/6 mois|six mois|semestr|6 months|six months/.test(word)) return 180;
  if (/3 mois|trois mois|trimestr|3 months|three months|quarter/.test(word)) return 90;
  if (/mois|mensuel|month/.test(word)) return 30;
  return undefined;
}

/** Catégorie du budget d'après son nom (ou un début de nom), du bon sens de préférence. */
function budgetCategoryFrom(text: string, kind: "depense" | "revenu", ctx: ImportContext): BudgetCategory | null {
  const wanted = key(text);
  const singular = (s: string) => s.replace(/s\b/g, "");
  const all = [...(ctx.budgetCategories ?? [])].sort((a, b) => Number(b.kind === kind) - Number(a.kind === kind));
  return all.find((cat) => {
    const name = key(cat.name);
    return name === wanted || singular(name) === singular(wanted) || name.startsWith(`${wanted} `);
  }) ?? null;
}

const MAX_LABEL = 200;

function buildTransaction(r: RawRecord, ctx: ImportContext, c: Check): Built {
  const f = { ...r.fields };
  const opts = { today: ctx.today, date1904: ctx.date1904 };
  let label = oneLine(f.title ?? "");
  // « DÉPENSE | 42,50 € | Courses | 27/09/2026 » : le montant tient lieu de titre.
  if (!f.amount && !f.debit && !f.credit && label && !isBad(parseSignedMoney(label))) {
    f.amount = label;
    label = "";
  }
  const day = f.date ? c.take(parseDay(f.date, opts)) : undefined;
  if (!f.date) c.errors.push(tr("Date manquante."));

  // Sens et montant : colonnes Débit et Crédit, ou montant signé d'un relevé, ou colonne Sens.
  let kind: "depense" | "revenu" = "depense";
  let amount: number | undefined;
  if (f.debit || f.credit) {
    const debit = f.debit ? c.take(parseSignedMoney(f.debit)) : 0;
    const credit = f.credit ? c.take(parseSignedMoney(f.credit)) : 0;
    if (debit && credit) c.errors.push(tr("Débit et crédit sur la même ligne."));
    else if (credit) {
      kind = "revenu";
      amount = Math.abs(credit);
    } else if (debit) amount = Math.abs(debit);
    else if (debit !== undefined && credit !== undefined) c.errors.push(tr("Montant manquant."));
  } else if (f.amount) {
    const value = c.take(parseSignedMoney(f.amount));
    if (value !== undefined) {
      if (value === 0) c.errors.push(tr("Montant nul."));
      kind = value > 0 && r.signed ? "revenu" : "depense";
      amount = Math.abs(value);
    }
  } else c.errors.push(tr("Montant manquant."));
  if (f.direction) {
    const d = key(f.direction);
    if (/^(?:revenus?|credit|entree|recette|\+|income|in|money in)$/.test(d)) kind = "revenu";
    else if (/^(?:depenses?|debit|sortie|achat|-|expenses?|out|money out|purchase)$/.test(d)) kind = "depense";
    else c.errors.push(tr("Sens illisible : {quote} (dépense ou revenu).", { quote: quote(f.direction.trim()) }));
  }
  if (amount !== undefined && amount > 100_000_000) c.errors.push(tr("Montant hors limites."));

  // Catégorie : colonne Catégorie, ou un texte d'une ligne qui porte son nom.
  let category: BudgetCategory | null = null;
  const extra = [...r.extra];
  if (f.category?.trim()) {
    category = budgetCategoryFrom(f.category, kind, ctx);
    if (!category) c.warnings.push(tr("Catégorie inconnue : {quote}.", { quote: quote(f.category.trim()) }));
  } else {
    const index = extra.findIndex((e) => budgetCategoryFrom(e, kind, ctx) !== null);
    if (index >= 0) category = budgetCategoryFrom(extra.splice(index, 1)[0]!, kind, ctx);
  }
  if (category && category.kind !== kind) {
    c.warnings.push(
      category.kind === "revenu"
        ? tr("Catégorie {name} réservée aux revenus : opération sans catégorie.", { name: quote(category.name) })
        : tr("Catégorie {name} réservée aux dépenses : opération sans catégorie.", { name: quote(category.name) }),
    );
    category = null;
  }
  if (!label) label = category?.name ?? (kind === "revenu" ? tr("Revenu") : tr("Dépense"));
  if (label.length > MAX_LABEL) c.errors.push(tr("Libellé trop long ({max_label} caractères au plus).", { max_label: MAX_LABEL }));
  // Répétition (salaire, loyer…) : tous les N mois, jusqu'à une date facultative.
  const repeatMonths = f.period ? (c.take(parsePeriod(f.period)) ?? null) : null;
  let repeatUntil = f.endDate ? (c.take(parseDay(f.endDate, opts)) ?? null) : null;
  if (repeatUntil && repeatMonths === null) {
    c.warnings.push(tr("Date de fin sans répétition : ignorée."));
    repeatUntil = null;
  }
  if (repeatUntil && day && repeatUntil < day) c.errors.push(tr("Fin de la répétition avant la date de l'opération."));
  const input: TransactionInput | null =
    day && amount
      ? { day, amountCents: amount, kind, categoryId: category?.id ?? null, label, notes: notesOf([f.notes, ...extra], c), spaceId: spaceOf(f.space, ctx, c), repeatMonths, repeatUntil }
      : null;
  const details = input
    ? [
        `${kind === "revenu" ? "+" : "−"} ${formatAmount(input.amountCents)}`,
        kind === "revenu" ? tr("Revenu") : tr("Dépense"),
        category?.name ?? null,
        repeatMonths ? repeatLabel(repeatMonths) : null,
        spaceName(input.spaceId, ctx),
      ].filter(
        (d): d is string => d !== null,
      )
    : [];
  return {
    item: input ? { kind: "transaction", input } : null,
    title: label,
    when: day ? dayLabel(day, ctx) : "",
    details,
    dupKey: `transaction|${key(label)}|${day ?? ""}|${kind}|${amount ?? ""}`,
  };
}

/** Modèle d'une liste nouvelle d'après son nom (« Courses », « Livres à lire »). */
function templateFor(name: string): TemplateId {
  const k = key(name);
  const found: [RegExp, TemplateId][] = [
    [/course|marche|epicerie|shopping|grocer/, "courses"],
    [/livre|lecture|bd\b|\bbooks?\b|reading/, "livres"],
    [/film|serie|cinema|movie|\bshows?\b/, "films"],
    [/cadeau|\bgifts?\b|present/, "cadeaux"],
    [/voyage|destination|vacance|travel|\btrips?\b|holiday/, "voyages"],
    [/envie|souhait|\bwish/, "envies"],
  ];
  return found.find(([re]) => re.test(k))?.[1] ?? "libre";
}

/** Sorte d'une colonne nouvelle d'après son nom. */
function columnKindFor(name: string): ColumnKind {
  const k = key(name);
  if (/^(?:note|notes sur 5|etoiles?|avis|priorite|rating|stars?|score)$/.test(k)) return "note";
  if (/prix|montant|cout|budget|tarif|price|cost|amount/.test(k)) return "prix";
  if (/^(?:date|quand|lu le|vu le|le|when|read on|seen on|watched on)$|^date /.test(k)) return "date";
  if (/lien|url|site|adresse web|link|website/.test(k)) return "lien";
  if (/^(?:vu|lu|offert|possede|achete|reserve|seen|watched|read|given|owned|bought|booked)$/.test(k)) return "case";
  return "texte";
}

/** Valeur d'une cellule selon la sorte de sa colonne. */
function cellValue(kind: ColumnKind, text: string, name: string, ctx: ImportContext, c: Check): CellValue | undefined {
  const t = text.trim();
  if (kind === "note") {
    const stars = [...t].filter((ch) => ch === "★").length;
    const n = stars || Number(/^(\d)(?:[.,]0)?\s*(?:\/\s*5|etoiles?|étoiles?|stars?)?$/i.exec(t)?.[1] ?? Number.NaN);
    if (Number.isInteger(n) && n >= 0 && n <= 5) return n;
    c.errors.push(tr("{name} : note de 0 à 5 attendue ({quote}).", { name, quote: quote(t) }));
    return undefined;
  }
  if (kind === "prix") {
    const v = c.take(parseMoney(t));
    return v;
  }
  if (kind === "date") return c.take(parseDay(t, { today: ctx.today, date1904: ctx.date1904 }));
  if (kind === "case") return c.take(parseYesNo(t));
  if (t.length > 1000) {
    c.errors.push(tr("{name} : texte trop long (1 000 caractères au plus).", { name }));
    return undefined;
  }
  return multiLine(t);
}

const squashName = (text: string) => key(text).replace(/[^a-z0-9]/g, "");

function buildListItem(r: RawRecord, ctx: ImportContext, c: Check): Built {
  const f = r.fields;
  const t = title(f.title, 300, c);
  const listName = oneLine(f.list ?? "");
  if (!listName) c.errors.push(tr("Liste manquante."));
  else if (listName.length > 100) c.errors.push(tr("Nom de liste trop long (100 caractères au plus)."));
  const existing = listName ? (ctx.lists ?? []).find((l) => squashName(l.name) === squashName(listName)) : undefined;
  const done = f.done ? (c.take(parseYesNo(f.done)) ?? false) : false;
  const sectionText = oneLine(f.section ?? "");

  // Colonnes : celles de la liste existante, ou celles du modèle et du tableau pour une liste nouvelle.
  let columns: ListColumn[];
  let input: ListInput | null = null;
  if (existing) columns = existing.columns;
  else {
    input = listFromTemplate(templateOf(templateFor(listName)), listName, spaceOf(undefined, ctx, c));
    columns = input.columns;
    for (const header of Object.keys(r.cells ?? {})) {
      if (columns.some((col) => squashName(col.name) === squashName(header))) continue;
      if (columns.length >= 12) {
        c.warnings.push(tr("Colonne ignorée : {quote} (12 colonnes au plus).", { quote: quote(header) }));
        continue;
      }
      columns = [...columns, { id: columnId(header, columns), name: header.slice(0, 40), kind: columnKindFor(header) }];
    }
    input = { ...input, columns };
  }
  const cells: Record<string, CellValue> = {};
  for (const [header, text] of Object.entries(r.cells ?? {})) {
    const column = columns.find((col) => squashName(col.name) === squashName(header));
    if (!column) {
      c.warnings.push(tr("Colonne absente de la liste : {quote}.", { quote: quote(header) }));
      continue;
    }
    const value = cellValue(column.kind, text, column.name, ctx, c);
    if (value !== undefined && value !== "" && value !== false) cells[column.id] = value;
  }
  // Rayon : un de ceux de la liste (ou du modèle), sinon ajouté à la liste nouvelle.
  let section: string | null = null;
  if (sectionText) {
    const known = (existing?.sections ?? input?.sections ?? []).find((s) => squashName(s) === squashName(sectionText));
    if (known) section = known;
    else if (existing) c.warnings.push(tr("Rayon inconnu de la liste : {quote}. Élément ajouté sans rayon.", { quote: quote(sectionText) }));
    else if (sectionText.length > 50) c.errors.push(tr("Rayon trop long (50 caractères au plus)."));
    else {
      section = sectionText;
      input = { ...input!, sections: [...input!.sections, sectionText] };
    }
  }
  const list: ListTarget = { name: existing?.name ?? listName, id: existing?.id ?? null, input };
  const item: ListItemInput = { title: t, section, cells, done, image: null };
  const details = [
    existing ? tr("Liste « {name} »", { name: existing.name }) : listName ? tr("Nouvelle liste « {name} »", { name: listName }) : null,
    section,
    ...columns.map((col) => cellText(col.kind, cells[col.id])).filter(Boolean).slice(0, 2),
    done ? tr("Fait") : null,
  ].filter((d): d is string => !!d);
  return {
    item: listName ? { kind: "listItem", list, input: item } : null,
    title: t,
    when: "",
    details,
    dupKey: `listItem|${squashName(listName)}|${key(t)}`,
  };
}

const BUILDERS: Record<ImportKind, (r: RawRecord, ctx: ImportContext, c: Check) => Built> = {
  task: buildTask,
  event: buildEvent,
  obligation: buildObligation,
  note: buildNote,
  habit: buildHabit,
  contact: buildContact,
  transaction: buildTransaction,
  listItem: buildListItem,
};

/** Clés des éléments déjà dans Aqueli. */
export function existingKeys(existing: ExistingItems): Set<string> {
  return new Set([
    ...existing.tasks.map((t) => `task|${key(t.title)}|${t.dueDate ?? ""}`),
    ...existing.events.map((e) => `event|${key(e.title)}|${e.startDate}`),
    ...existing.obligations.map((o) => `obligation|${key(o.title)}|${o.dueDate}`),
    ...existing.notes.map((n) => `note|${key(n.title)}`),
    ...(existing.habits ?? []).map((h) => `habit|${key(h.name)}`),
    ...(existing.contacts ?? []).map((x) => `contact|${key(contactName(x))}`),
    ...(existing.transactions ?? []).map((t) => `transaction|${key(t.label)}|${t.day}|${t.kind}|${t.amountCents}`),
    ...(existing.listItems ?? []).map((i) => `listItem|${squashName(i.list)}|${key(i.title)}`),
  ]);
}

/** Vérifie les enregistrements d'une source ; `seen` : doublons des lignes précédentes. */
export function buildRows(
  source: string,
  records: readonly RawRecord[],
  ctx: ImportContext,
  known: ReadonlySet<string>,
  seen: Map<string, number>,
): ImportRow[] {
  return records.map((r) => {
    const c = check();
    const id = `${source}:${r.line}`;
    if (!r.kind) {
      const t = oneLine(r.fields.title ?? "");
      return { id, line: r.line, kind: null, title: t, when: "", details: [], item: null, errors: [r.kindError ?? tr("Type inconnu.")], warnings: [], duplicate: null, replaces: null, checked: false };
    }
    const built = BUILDERS[r.kind](r, ctx, c);
    // Colonne « Identifiant » : la ligne met à jour l'élément d'Aqueli qui le porte.
    const wanted = UPDATABLE_KINDS.includes(r.kind) ? r.fields.id?.trim() || null : null;
    const replaces = wanted && existingIds(ctx.existing, r.kind).has(wanted) ? wanted : null;
    if (wanted && !replaces) c.warnings.push(tr("Identifiant inconnu : un nouvel élément sera créé."));
    let duplicate: string | null = null;
    if (replaces) {
      // Le même élément mis à jour deux fois : la seconde ligne est un doublon.
      const once = `maj|${r.kind}|${replaces}`;
      if (seen.has(once)) duplicate = tr("Même élément que la ligne {line}.", { line: seen.get(once) });
      else seen.set(once, r.line);
    } else if (known.has(built.dupKey)) duplicate = tr("Déjà dans Aqueli.");
    else if (seen.has(built.dupKey)) duplicate = tr("Doublon de la ligne {line}.", { line: seen.get(built.dupKey) });
    else if (c.errors.length === 0) seen.set(built.dupKey, r.line);
    if (r.done) c.warnings.push(tr("Case cochée : élément déjà fait."));
    c.warnings.push(...(r.notices ?? []));
    const valid = c.errors.length === 0 && built.item !== null;
    return {
      id,
      line: r.line,
      kind: r.kind,
      title: built.title,
      when: built.when,
      details: built.details,
      item: valid ? built.item : null,
      errors: c.errors,
      warnings: c.warnings,
      duplicate,
      replaces,
      checked: valid && duplicate === null && !r.done,
    };
  });
}

/** Identifiants des éléments existants d'un type. */
function existingIds(existing: ExistingItems, kind: ImportKind): Set<string> {
  const list: readonly WithId[] =
    kind === "task" ? existing.tasks : kind === "event" ? existing.events : kind === "contact" ? (existing.contacts ?? []) : kind === "transaction" ? (existing.transactions ?? []) : [];
  return new Set(list.map((x) => x.id).filter((id): id is string => !!id));
}

/** Éléments à envoyer au cœur, regroupés par type, avec la ligne de chacun (erreurs). */
export interface Batch {
  tasks: TaskInput[];
  events: EventInput[];
  obligations: ObligationInput[];
  notes: { body: NoteBody; meta: NoteMeta }[];
  habits: HabitInput[];
  contacts: ContactInput[];
  transactions: TransactionInput[];
  /** Éléments de listes, par liste (existante, ou créée d'abord). */
  lists: ImportList[];
  /** Éléments existants remplacés par leur ligne (colonne « Identifiant »). */
  updates: Updates;
}

export interface Replace<T> {
  id: string;
  input: T;
}

export interface Updates {
  tasks: Replace<TaskInput>[];
  events: Replace<EventInput>[];
  contacts: Replace<ContactInput>[];
  transactions: Replace<TransactionInput>[];
}

export const emptyUpdates = (): Updates => ({ tasks: [], events: [], contacts: [], transactions: [] });

export interface ImportList {
  listId: string | null;
  list: ListInput | null;
  items: ListItemInput[];
}

/** Colonnes et rayons réunis de plusieurs lignes d'une même liste nouvelle. */
function mergeLists(a: ListInput, b: ListInput): ListInput {
  return {
    ...a,
    columns: [...a.columns, ...b.columns.filter((c) => !a.columns.some((x) => x.id === c.id))].slice(0, 12),
    sections: [...a.sections, ...b.sections.filter((s) => !a.sections.some((x) => squashName(x) === squashName(s)))].slice(0, 30),
  };
}

export function toBatch(rows: readonly ImportRow[]): { batch: Batch; origin: Record<ImportKind, ImportRow[]> } {
  const batch: Batch = { tasks: [], events: [], obligations: [], notes: [], habits: [], contacts: [], transactions: [], lists: [], updates: emptyUpdates() };
  const origin: Record<ImportKind, ImportRow[]> = { task: [], event: [], obligation: [], note: [], habit: [], contact: [], transaction: [], listItem: [] };
  // Mises à jour : après les créations de leur type (le cœur les numérote à la suite).
  const later: Record<ImportKind, ImportRow[]> = { task: [], event: [], obligation: [], note: [], habit: [], contact: [], transaction: [], listItem: [] };
  const lists = new Map<string, { target: ImportList; rows: ImportRow[] }>();
  for (const row of rows) {
    const item = row.item;
    if (!item) continue;
    if (item.kind === "listItem") {
      const k = item.list.id ?? `nouvelle|${squashName(item.list.name)}`;
      const group = lists.get(k);
      if (group) {
        if (group.target.list && item.list.input) group.target.list = mergeLists(group.target.list, item.list.input);
        group.target.items.push(item.input);
        group.rows.push(row);
      } else lists.set(k, { target: { listId: item.list.id, list: item.list.input, items: [item.input] }, rows: [row] });
      continue;
    }
    if (row.replaces && (item.kind === "task" || item.kind === "event" || item.kind === "contact" || item.kind === "transaction")) {
      later[item.kind].push(row);
      if (item.kind === "task") batch.updates.tasks.push({ id: row.replaces, input: item.input });
      else if (item.kind === "event") batch.updates.events.push({ id: row.replaces, input: item.input });
      else if (item.kind === "contact") batch.updates.contacts.push({ id: row.replaces, input: item.input });
      else batch.updates.transactions.push({ id: row.replaces, input: item.input });
      continue;
    }
    origin[item.kind].push(row);
    if (item.kind === "task") batch.tasks.push(item.input);
    else if (item.kind === "event") batch.events.push(item.input);
    else if (item.kind === "obligation") batch.obligations.push(item.input);
    else if (item.kind === "habit") batch.habits.push(item.input);
    else if (item.kind === "contact") batch.contacts.push(item.input);
    else if (item.kind === "transaction") batch.transactions.push(item.input);
    else batch.notes.push({ body: item.body, meta: item.meta });
  }
  // Éléments de listes : l'ordre envoyé au cœur, liste par liste (place d'une erreur).
  for (const { target, rows: listRows } of lists.values()) {
    batch.lists.push(target);
    origin.listItem.push(...listRows);
  }
  for (const kind of UPDATABLE_KINDS) origin[kind].push(...later[kind]);
  return { batch, origin };
}

