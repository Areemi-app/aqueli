/**
 * Mise à jour d'éléments existants par l'import (colonne « Identifiant ») : la ligne du fichier
 * remplace ce qu'elle décrit, et l'élément garde ce que le fichier ne contient pas (couleur,
 * projet, photo, fiche, sous-tâches déjà cochées…). Fonctions pures.
 */
import { toTransactionInput, type Transaction, type TransactionInput } from "../budget/budget";
import { toEventInput, type CalendarEvent, type EventInput } from "../calendar/events";
import { toInput as toContactInput, type Contact, type ContactInput } from "../contacts/contacts";
import { fold } from "../lib/fold";
import { toInput as toTaskInput, type Task, type TaskInput } from "../tasks/tasks";
import { emptyUpdates, type ImportRow, type Updates } from "./records";

const same = (a: string, b: string) => fold(a.trim()) === fold(b.trim());

export function mergeTask(existing: Task, imported: TaskInput): TaskInput {
  return {
    ...imported,
    color: existing.color,
    projectId: existing.projectId,
    doing: existing.doing,
    inbox: existing.inbox && imported.dueDate === null,
    // Sans colonne « Commencer le », la date de début reste.
    startDate: imported.startDate ?? existing.startDate,
    // Une sous-tâche déjà cochée le reste si le fichier la reprend.
    subtasks: imported.subtasks.map((s) => {
      const before = existing.subtasks.find((x) => same(x.title, s.title));
      return before ? { ...s, id: before.id, done: before.done } : s;
    }),
  };
}

export function mergeEvent(existing: CalendarEvent, imported: EventInput): EventInput {
  const sameSeries = JSON.stringify(existing.recurrence) === JSON.stringify(imported.recurrence);
  return {
    ...imported,
    color: existing.color,
    // Occurrences retirées et fin de la série : gardées tant que la répétition est la même.
    exceptions: sameSeries ? existing.exceptions : imported.exceptions,
    repeatUntil: imported.repeatUntil ?? (sameSeries ? existing.repeatUntil : null),
  };
}

/** Sans répétition dans le fichier (ancien export, tableau d'une banque), celle de l'opération reste. */
export function mergeTransaction(existing: Transaction, imported: TransactionInput): TransactionInput {
  if (imported.repeatMonths !== null) return imported;
  return { ...imported, repeatMonths: existing.repeatMonths, repeatUntil: existing.repeatUntil };
}

export function mergeContact(existing: Contact, imported: ContactInput): ContactInput {
  const keepLabels = <T extends { value: string; label?: string }>(entries: T[], before: T[]) =>
    entries.map((e) => {
      const old = before.find((b) => same(b.value, e.value));
      return old ? { ...e, label: old.label } : e;
    });
  return {
    ...imported,
    phones: keepLabels(imported.phones, existing.phones),
    emails: keepLabels(imported.emails, existing.emails),
    photo: existing.photo,
    color: existing.color,
    favorite: existing.favorite,
    fields: existing.fields,
    groupId: existing.groupId,
    style: existing.style,
    keepInTouch: imported.keepInTouch ?? existing.keepInTouch,
  };
}

export interface ExistingFull {
  tasks: readonly Task[];
  events: readonly CalendarEvent[];
  contacts: readonly Contact[];
  transactions: readonly Transaction[];
}

/**
 * Lignes prêtes à envoyer (mises à jour fusionnées avec l'élément existant) et valeurs
 * d'avant, pour annuler l'import.
 */
export function prepareUpdates(rows: readonly ImportRow[], existing: ExistingFull): { rows: ImportRow[]; previous: Updates } {
  const previous = emptyUpdates();
  const out = rows.map((row): ImportRow => {
    const item = row.item;
    if (!row.replaces || !item) return row;
    const id = row.replaces;
    if (item.kind === "task") {
      const before = existing.tasks.find((t) => t.id === id);
      if (!before) return { ...row, replaces: null };
      previous.tasks.push({ id, input: toTaskInput(before) });
      return { ...row, item: { kind: "task", input: mergeTask(before, item.input) } };
    }
    if (item.kind === "event") {
      const before = existing.events.find((e) => e.id === id);
      if (!before) return { ...row, replaces: null };
      previous.events.push({ id, input: toEventInput(before) });
      return { ...row, item: { kind: "event", input: mergeEvent(before, item.input) } };
    }
    if (item.kind === "contact") {
      const before = existing.contacts.find((c) => c.id === id);
      if (!before) return { ...row, replaces: null };
      previous.contacts.push({ id, input: toContactInput(before) });
      return { ...row, item: { kind: "contact", input: mergeContact(before, item.input) } };
    }
    if (item.kind === "transaction") {
      const before = existing.transactions.find((t) => t.id === id);
      if (!before) return { ...row, replaces: null };
      previous.transactions.push({ id, input: toTransactionInput(before) });
      return { ...row, item: { kind: "transaction", input: mergeTransaction(before, item.input) } };
    }
    return { ...row, replaces: null };
  });
  return { rows: out, previous };
}
