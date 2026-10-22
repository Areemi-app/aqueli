/**
 * Recherche globale (cahier des charges § 5) : tâches, événements, obligations, notes, projets,
 * contacts, documents, pages du journal et habitudes à la fois,
 * filtres par type, date et étiquette, résultats groupés par type. Fonctions pures.
 */
import type { CalendarEvent } from "../calendar/events";
import { contactName, type Contact } from "../contacts/contacts";
import { documentDetail, type Document } from "../documents/documents";
import { frequencyLabel, type Habit } from "../habits/habits";
import { STATUS_LABELS, type Project } from "../projects/projects";
import type { BudgetCategory, Transaction } from "../budget/budget";
import { periodLabel as goalPeriodLabel, STATUS_LABELS as GOAL_STATUS, type Goal } from "../goals/goals";
import { cellText, type List, type ListItem } from "../lists/lists";
import { formatAmount } from "../obligations/obligations";
import { longDay, type JournalSummary } from "../journal/journal";
import { containsExactly, hasAccents } from "../lib/fold";
import type { NoteSummary } from "../notes/notes";
import type { Obligation } from "../obligations/obligations";
import type { SpaceFilter } from "../spaces/spaces";
import { addDays, dayKey, daysBetween, type DayKey } from "../tasks/day";
import type { Task } from "../tasks/tasks";
import { matchScore, words, type Searchable } from "./fuzzy";
import { tr, trn } from "../i18n/i18n";

export type SearchKind = "task" | "event" | "obligation" | "note" | "project" | "contact" | "document" | "journal" | "habit" | "list" | "goal" | "transaction";

export const SEARCH_KINDS: readonly { id: SearchKind; label: string }[] = [
  { id: "task", label: tr("Tâches") },
  { id: "event", label: tr("Événements") },
  { id: "obligation", label: tr("Obligations") },
  { id: "note", label: tr("Notes") },
  { id: "project", label: tr("Projets") },
  { id: "contact", label: tr("Contacts") },
  { id: "document", label: tr("Documents") },
  { id: "journal", label: tr("Journal") },
  { id: "habit", label: tr("Habitudes") },
  { id: "list", label: tr("Listes") },
  { id: "goal", label: tr("Objectifs") },
  { id: "transaction", label: tr("Budget") },
];

export interface SearchDoc extends Searchable {
  kind: SearchKind;
  id: string;
  title: string;
  /** Texte complémentaire affiché sous le titre. */
  detail: string;
  /** Date de l'élément : échéance, début, dernière modification d'une note. */
  day: DayKey | null;
  tags: readonly string[];
  spaceId: string | null;
  /** Tâche terminée, obligation payée ou résiliée, habitude archivée. */
  closed: boolean;
  /** Texte complet, pour l'orthographe exacte. */
  raw: string;
}

const doc = (d: Omit<SearchDoc, "titleWords" | "bodyWords" | "raw"> & { body: string }): SearchDoc => {
  const { body, ...rest } = d;
  return { ...rest, titleWords: words(d.title), bodyWords: words(body), raw: `${d.title} ${body}` };
};

export interface SearchData {
  tasks: readonly Task[];
  events: readonly CalendarEvent[];
  obligations: readonly Obligation[];
  notes: readonly NoteSummary[];
  journal?: readonly JournalSummary[];
  habits?: readonly Habit[];
  projects?: readonly Project[];
  contacts?: readonly Contact[];
  documents?: readonly Document[];
  lists?: readonly List[];
  /** Éléments des listes, par liste. */
  listItems?: ReadonlyMap<string, readonly ListItem[]>;
  goals?: readonly Goal[];
  transactions?: readonly Transaction[];
  budgetCategories?: readonly BudgetCategory[];
}

/** Identifiant d'un élément de liste dans l'index : « liste/élément ». */
export const listItemDocId = (listId: string, itemId: string) => `${listId}/${itemId}`;

/** Index de recherche, à refaire quand les données changent. */
export function buildDocs({
  tasks,
  events,
  obligations,
  notes,
  journal = [],
  habits = [],
  projects = [],
  contacts = [],
  documents = [],
  lists = [],
  listItems = new Map(),
  goals = [],
  transactions = [],
  budgetCategories = [],
}: SearchData): SearchDoc[] {
  return [
    ...lists.flatMap((l) => [
      doc({
        kind: "list",
        id: l.id,
        title: l.name,
        detail: trn((listItems.get(l.id) ?? []).length, "Liste · {n} élément", "Liste · {n} éléments"),
        body: l.sections.join(" "),
        day: null,
        tags: [],
        spaceId: l.spaceId,
        closed: l.archived,
      }),
      ...(listItems.get(l.id) ?? []).map((i) =>
        doc({
          kind: "list",
          id: listItemDocId(l.id, i.id),
          title: i.title,
          detail: [tr("Liste « {name} »", { name: l.name }), i.section ?? "", ...l.columns.map((c) => cellText(c.kind, i.cells[c.id])).filter(Boolean).slice(0, 2)].filter(Boolean).join(" · "),
          body: [i.section ?? "", ...l.columns.map((c) => cellText(c.kind, i.cells[c.id]))].join(" "),
          day: null,
          tags: [],
          spaceId: l.spaceId,
          closed: l.archived || i.done,
        }),
      ),
    ]),
    ...goals.map((g) =>
      doc({
        kind: "goal",
        id: g.id,
        title: g.title,
        detail: `${goalPeriodLabel(g)} · ${GOAL_STATUS[g.status]}`,
        body: [g.why, g.unit].join(" "),
        day: g.targetDate,
        tags: [],
        spaceId: g.spaceId,
        closed: g.status !== "en-cours",
      }),
    ),
    ...transactions.map((t) => {
      const category = budgetCategories.find((c) => c.id === t.categoryId)?.name ?? "";
      return doc({
        kind: "transaction",
        id: t.id,
        title: t.label || category || (t.kind === "revenu" ? tr("Revenu") : tr("Dépense")),
        detail: [`${t.kind === "revenu" ? "+" : "−"} ${formatAmount(t.amountCents)}`, category].filter(Boolean).join(" · "),
        body: [category, t.notes, formatAmount(t.amountCents)].join(" "),
        day: t.day,
        tags: [],
        spaceId: t.spaceId,
        closed: false,
      });
    }),
    ...tasks.map((t) =>
      doc({
        kind: "task",
        id: t.id,
        title: t.title,
        detail: t.notes.split("\n")[0] ?? "",
        body: [t.notes, ...t.subtasks.map((s) => s.title), ...t.tags].join(" "),
        day: t.dueDate,
        tags: t.tags,
        spaceId: t.spaceId,
        closed: t.doneAt !== null,
      }),
    ),
    ...events.map((e) =>
      doc({
        kind: "event",
        id: e.id,
        title: e.title,
        detail: e.location,
        body: `${e.location} ${e.notes}`,
        day: e.startDate,
        tags: [],
        spaceId: e.spaceId,
        closed: false,
      }),
    ),
    ...obligations.map((o) =>
      doc({
        kind: "obligation",
        id: o.id,
        title: o.title,
        detail: o.organization,
        body: `${o.organization} ${o.reference} ${o.notes}`,
        day: o.dueDate,
        tags: [],
        spaceId: o.spaceId,
        closed: o.status !== "a-faire",
      }),
    ),
    ...notes.map((n) =>
      doc({
        kind: "note",
        id: n.id,
        title: n.title.trim() || tr("Sans titre"),
        detail: n.excerpt,
        body: `${n.excerpt} ${n.tags.join(" ")}`,
        day: dayKey(new Date(n.updatedAt * 1000)),
        tags: n.tags,
        spaceId: n.spaceId,
        closed: false,
      }),
    ),
    ...projects.map((p) =>
      doc({
        kind: "project",
        id: p.id,
        title: p.name,
        detail: STATUS_LABELS[p.status],
        body: p.description,
        day: p.endDate,
        tags: [],
        spaceId: p.spaceId,
        closed: p.archived || p.status === "termine",
      }),
    ),
    ...contacts.map((c) =>
      doc({
        kind: "contact",
        id: c.id,
        title: contactName(c),
        detail: [c.company !== contactName(c) ? c.company : "", c.phones[0]?.value ?? "", c.emails[0]?.value ?? ""].filter(Boolean).join(" · "),
        body: [c.company, c.address, c.notes, ...c.emails.map((e) => e.value), ...c.phones.map((p) => `${p.value} ${p.value.replace(/\D/g, "")}`), ...c.tags].join(" "),
        day: null,
        tags: c.tags,
        spaceId: c.spaceId,
        closed: false,
      }),
    ),
    ...documents.map((d) =>
      doc({
        kind: "document",
        id: d.id,
        title: d.name,
        detail: documentDetail(d),
        body: [d.notes, ...d.tags].join(" "),
        day: d.expiresOn,
        tags: d.tags,
        spaceId: d.spaceId,
        closed: false,
      }),
    ),
    ...journal.map((j) => {
      const title = longDay(j.day);
      return doc({
        kind: "journal",
        id: j.day,
        title: title.charAt(0).toUpperCase() + title.slice(1),
        detail: j.excerpt,
        body: [j.excerpt, ...j.gratitudes].join(" "),
        day: j.day,
        tags: [],
        spaceId: null,
        closed: false,
      });
    }),
    ...habits.map((h) =>
      doc({
        kind: "habit",
        id: h.id,
        title: h.name,
        detail: frequencyLabel(h.frequency),
        body: h.unit,
        day: null,
        tags: [],
        spaceId: h.spaceId,
        closed: h.archived,
      }),
    ),
  ];
}

export type DateFilter = "toutes" | "aujourdhui" | "7-jours" | "30-jours" | "30-derniers" | "annee";

export const DATE_FILTERS: readonly { value: DateFilter; label: string }[] = [
  { value: "toutes", label: tr("Toutes les dates") },
  { value: "aujourdhui", label: tr("Aujourd'hui") },
  { value: "7-jours", label: tr("7 prochains jours") },
  { value: "30-jours", label: tr("30 prochains jours") },
  { value: "30-derniers", label: tr("30 derniers jours") },
  { value: "annee", label: tr("Cette année") },
];

export function inDates(day: DayKey | null, filter: DateFilter, today: DayKey): boolean {
  if (filter === "toutes") return true;
  if (day === null) return false;
  switch (filter) {
    case "aujourdhui":
      return day === today;
    case "7-jours":
      return day >= today && day <= addDays(today, 6);
    case "30-jours":
      return day >= today && day <= addDays(today, 29);
    case "30-derniers":
      return day <= today && day >= addDays(today, -29);
    case "annee":
      return day.slice(0, 4) === today.slice(0, 4);
  }
}

export interface SearchFilters {
  kind: SearchKind | "tout";
  date: DateFilter;
  /** Étiquette (sous-étiquettes comprises), ou toutes. */
  tag: string | null;
  space: SpaceFilter;
}

export const NO_FILTERS: SearchFilters = { kind: "tout", date: "toutes", tag: null, space: "tous" };

export interface SearchResult {
  doc: SearchDoc;
  score: number;
}

const hasTag = (tags: readonly string[], tag: string) => {
  const t = tag.toLowerCase();
  return tags.some((x) => x.toLowerCase() === t || x.toLowerCase().startsWith(`${t}/`));
};

/**
 * Éléments qui correspondent, les meilleurs d'abord, puis les plus proches d'aujourd'hui.
 * `noteIds`, `journalDays` : notes et pages trouvées dans leur texte complet par le cœur (au-delà de l'aperçu).
 */
export function searchDocs(
  docs: readonly SearchDoc[],
  query: string,
  filters: SearchFilters,
  today: DayKey,
  noteIds: readonly string[] = [],
  journalDays: readonly string[] = [],
): SearchResult[] {
  const q = words(query);
  if (q.length === 0) return [];
  const accented = hasAccents(query.trim());
  const inText = new Set(noteIds);
  const inPages = new Set(journalDays);
  const results: SearchResult[] = [];
  for (const d of docs) {
    if (filters.kind !== "tout" && d.kind !== filters.kind) continue;
    if (filters.space !== "tous" && d.spaceId !== filters.space) continue;
    if (filters.tag && !hasTag(d.tags, filters.tag)) continue;
    if (!inDates(d.day, filters.date, today)) continue;
    let score = matchScore(q, d);
    if (score === 0 && ((d.kind === "note" && inText.has(d.id)) || (d.kind === "journal" && inPages.has(d.id)))) score = q.length;
    if (score === 0) continue;
    if (accented && containsExactly(d.raw, query.trim())) score += 2;
    if (d.closed) score -= 0.5;
    results.push({ doc: d, score });
  }
  const distanceToToday = (d: SearchDoc) => (d.day ? Math.abs(daysBetween(today, d.day)) : 10_000);
  return results.sort(
    (a, b) => b.score - a.score || distanceToToday(a.doc) - distanceToToday(b.doc) || a.doc.title.localeCompare(b.doc.title, "fr"),
  );
}

/** Résultats groupés par type, dans l'ordre des types. */
export function groupResults(results: readonly SearchResult[]): { kind: SearchKind; label: string; results: SearchResult[] }[] {
  return SEARCH_KINDS.map((k) => ({ kind: k.id, label: k.label, results: results.filter((r) => r.doc.kind === k.id) })).filter(
    (g) => g.results.length > 0,
  );
}

/** Étiquettes connues (tâches et notes), par ordre alphabétique. */
export function knownTags(docs: readonly SearchDoc[]): string[] {
  const seen = new Map<string, string>();
  for (const d of docs) for (const t of d.tags) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}
