/**
 * Ce que montre le calendrier : événements, tâches datées, obligations, anniversaires, jours fériés et fêtes, puis leur place
 * dans les grilles (colonnes quand ils se chevauchent, rangées de la ligne « Journée »).
 * Fonctions pures ; les heures sont en minutes depuis minuit.
 */
import { birthdaysBetween, birthdayTitle, type Contact } from "../contacts/contacts";
import { withLanes, type Laned } from "../lib/lanes";
import { categoryOf, dueDatesBetween, type CategoryDef, type Obligation } from "../obligations/obligations";
import { durationOf, toMinutes } from "../planner/plan";
import type { Space, SpaceFilter } from "../spaces/spaces";
import { daysBetween, type DayKey } from "../tasks/day";
import type { Task } from "../tasks/tasks";
import type { CalendarEvent } from "./events";
import type { Holiday } from "./holidays";
import { occurrenceOf, occurrenceStarts } from "./occurrences";
import { tr } from "../i18n/i18n";

const DAY = 24 * 60;

/** « obligation » : échéance ; « cancel » : date limite de résiliation ; « birthday » : anniversaire d'un contact. */
export type ItemKind = "event" | "task" | "holiday" | "obligation" | "cancel" | "birthday";

/** Seuls les événements et les tâches se déplacent dans le calendrier. */
export const isMovable = (item: Pick<CalItem, "kind">) => item.kind === "event" || item.kind === "task";

export interface CalItem {
  /** Unique dans l'affichage. */
  key: string;
  kind: ItemKind;
  /** Identifiant de l'événement ou de la tâche (vide pour un jour férié). */
  id: string;
  /** Événement répété : jour de cette occurrence ; sinon `null`. */
  occurrence: DayKey | null;
  title: string;
  /** Couleur de l'élément ou de son calendrier ; `null` : couleur du thème. */
  color: string | null;
  startDate: DayKey;
  endDate: DayKey;
  /** Minutes ; `null` pour la journée entière. */
  start: number | null;
  end: number | null;
  location: string;
  /** Jour férié ou fête (élément « holiday ») : sa sorte et sa précision. */
  special?: { kind: Holiday["kind"]; note?: string };
}

export interface Layers {
  events: readonly CalendarEvent[];
  tasks: readonly Task[];
  spaces: readonly Space[];
  /** Filtre global de la barre de titre. */
  filter: SpaceFilter;
  /** Calendriers décochés dans « Mes calendriers ». */
  hiddenSpaces: readonly string[];
  showTasks: boolean;
  /** Jours fériés et fêtes à montrer (réglage « Jours fériés et fêtes », `useSpecialDays`). */
  holidays?: readonly Holiday[];
  obligations?: readonly Obligation[];
  /** Catégories d'obligations avec les couleurs choisies. */
  obligationCategories?: readonly CategoryDef[];
  showObligations?: boolean;
  contacts?: readonly Contact[];
  showBirthdays?: boolean;
  /** Couleur des anniversaires (celle du module Contacts). */
  birthdayColor?: string;
}

function shown(spaceId: string | null, layers: Layers): boolean {
  if (spaceId === null) return layers.filter === "tous";
  return (layers.filter === "tous" || layers.filter === spaceId) && !layers.hiddenSpaces.includes(spaceId);
}

const spaceColor = (spaceId: string | null, spaces: readonly Space[]) =>
  spaces.find((s) => s.id === spaceId)?.color ?? null;

/** Éléments qui touchent la période de `from` à `to` (compris). */
export function itemsBetween(layers: Layers, from: DayKey, to: DayKey): CalItem[] {
  const items: CalItem[] = [];
  for (const e of layers.events) {
    if (!shown(e.spaceId, layers)) continue;
    // Un événement répété donne une occurrence par date de la série.
    for (const day of occurrenceStarts(e, from, to)) {
      const when = occurrenceOf(e, day);
      items.push({
        key: e.recurrence ? `e:${e.id}@${day}` : `e:${e.id}`,
        kind: "event",
        id: e.id,
        occurrence: e.recurrence ? day : null,
        title: e.title,
        color: e.color ?? spaceColor(e.spaceId, layers.spaces),
        startDate: when.startDate,
        endDate: when.endDate,
        start: when.startTime === null ? null : toMinutes(when.startTime),
        end: when.endTime === null ? null : toMinutes(when.endTime),
        location: e.location,
      });
    }
  }
  if (layers.showTasks) {
    for (const t of layers.tasks) {
      // Le calendrier sert à prévoir : les tâches terminées n'y figurent plus.
      if (t.doneAt !== null || t.dueDate === null || t.dueDate < from || t.dueDate > to || !shown(t.spaceId, layers)) continue;
      const start = t.dueTime === null ? null : toMinutes(t.dueTime);
      items.push({
        key: `t:${t.id}`,
        kind: "task",
        id: t.id,
        occurrence: null,
        title: t.title,
        color: t.color ?? spaceColor(t.spaceId, layers.spaces),
        startDate: t.dueDate,
        endDate: t.dueDate,
        start,
        end: start === null ? null : Math.min(start + durationOf(t), DAY),
        location: "",
        });
    }
  }
  if (layers.showObligations) {
    for (const o of layers.obligations ?? []) {
      if (o.status !== "a-faire" || !shown(o.spaceId, layers)) continue;
      const color = o.color ?? categoryOf(o.category, layers.obligationCategories).color;
      const base = { id: o.id, occurrence: null, color, start: null, end: null, location: "" };
      for (const day of dueDatesBetween(o, from, to)) {
        items.push({ ...base, key: `o:${o.id}@${day}`, kind: "obligation", title: o.title, startDate: day, endDate: day });
      }
      if (o.cancelBy && o.cancelBy >= from && o.cancelBy <= to) {
        const day = o.cancelBy;
        items.push({ ...base, key: `o:${o.id}@${day}:r`, kind: "cancel", title: tr("Résiliation : {title}", { title: o.title }), startDate: day, endDate: day });
      }
    }
  }
  if (layers.showBirthdays) {
    for (const b of birthdaysBetween((layers.contacts ?? []).filter((c) => shown(c.spaceId, layers)), from, to)) {
      items.push({
        key: `b:${b.contact.id}@${b.day}`,
        kind: "birthday",
        id: b.contact.id,
        occurrence: null,
        title: birthdayTitle(b),
        color: b.contact.color ?? layers.birthdayColor ?? null,
        startDate: b.day,
        endDate: b.day,
        start: null,
        end: null,
        location: "",
      });
    }
  }
  for (const h of layers.holidays ?? []) {
    if (h.day < from || h.day > to) continue;
    items.push({
      key: `f:${h.day}:${h.name}`,
      kind: "holiday",
      id: "",
      occurrence: null,
      title: h.name,
      color: h.color,
      startDate: h.day,
      endDate: h.day,
      start: null,
      end: null,
      location: "",
      special: h.note ? { kind: h.kind, note: h.note } : { kind: h.kind },
    });
  }
  return items;
}

export interface Segment extends Laned {
  item: CalItem;
  start: number;
  end: number;
  /** L'élément a commencé un jour précédent, ou continue le lendemain. */
  fromBefore: boolean;
  toAfter: boolean;
}

/** Morceaux des éléments à heure fixe qui tombent dans la journée, en colonnes. */
export function timedSegments(items: readonly CalItem[], day: DayKey): Segment[] {
  const parts = items
    .filter((i) => i.start !== null && i.startDate <= day && i.endDate >= day)
    .map((item) => {
      const fromBefore = item.startDate < day;
      const toAfter = item.endDate > day;
      return {
        item,
        start: fromBefore ? 0 : (item.start ?? 0),
        end: toAfter ? DAY : (item.end ?? DAY),
        fromBefore,
        toAfter,
      };
    })
    .filter((p) => p.end > p.start);
  return withLanes(parts);
}

export interface Span {
  item: CalItem;
  /** Colonne du premier jour montré, et nombre de colonnes. */
  col: number;
  span: number;
  row: number;
  /** L'élément commence avant le premier jour montré, ou finit après le dernier. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

const KIND_ORDER: Record<ItemKind, number> = { holiday: 0, birthday: 1, cancel: 2, obligation: 3, event: 4, task: 5 };

/** Éléments sur la journée entière, rangés sur des lignes sans se chevaucher (ligne « Journée »). */
export function allDaySpans(items: readonly CalItem[], days: readonly DayKey[]): Span[] {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return [];
  const rows: boolean[][] = [];
  const sorted = items
    .filter((i) => i.start === null && i.startDate <= last && i.endDate >= first)
    .sort(
      (a, b) =>
        (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0) ||
        daysBetween(b.startDate, b.endDate) - daysBetween(a.startDate, a.endDate) ||
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
    );
  return sorted.map((item) => {
    const col = Math.max(0, daysBetween(first, item.startDate));
    const endCol = Math.min(days.length - 1, daysBetween(first, item.endDate));
    let row = rows.findIndex((cells) => cells.slice(col, endCol + 1).every((taken) => !taken));
    if (row === -1) {
      row = rows.length;
      rows.push(Array.from({ length: days.length }, () => false));
    }
    for (let c = col; c <= endCol; c++) rows[row]![c] = true;
    return {
      item,
      col,
      span: endCol - col + 1,
      row,
      clippedStart: item.startDate < first,
      clippedEnd: item.endDate > last,
    };
  });
}

/** Éléments d'un jour : journée entière d'abord, puis par heure de début. */
export function dayItems(items: readonly CalItem[], day: DayKey): CalItem[] {
  return items
    .filter((i) => i.startDate <= day && i.endDate >= day)
    .sort((a, b) => {
      const sa = a.start === null || a.startDate < day ? -1 : a.start;
      const sb = b.start === null || b.startDate < day ? -1 : b.start;
      return sa - sb || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title, "fr");
    });
}
