/**
 * Capture rapide : ce qui est saisi devient une tâche (boîte de réception), une note ou un
 * événement. La saisie intelligente des tâches reconnaît date, heure, #étiquette et !priorité.
 * Fonctions pures.
 */
import { addMinutes, nextHourSlot } from "../calendar/eventTime";
import type { EventInput } from "../calendar/events";
import { plainOf, type DocNode, type NoteBody } from "../notes/notes";
import { dayKey } from "../tasks/day";
import { parseQuickAdd } from "../tasks/quickAdd";
import type { TaskInput } from "../tasks/tasks";
import { tr } from "../i18n/i18n";

export type CaptureKind = "task" | "note" | "event";

export const CAPTURE_KINDS: readonly { id: CaptureKind; label: string }[] = [
  { id: "task", label: tr("Tâche") },
  { id: "note", label: tr("Note") },
  { id: "event", label: tr("Événement") },
];

/** Élément prêt à envoyer au cœur (src-tauri/src/capture.rs). */
export type Capture =
  | { kind: "task"; task: TaskInput; today: string }
  | { kind: "note"; body: NoteBody }
  | { kind: "event"; event: EventInput };

/** Tâche : titre et éléments reconnus ; sans date, elle va dans la boîte de réception. */
export function taskCapture(text: string, now: Date, defaultReminder: number | null): Capture | null {
  const parsed = parseQuickAdd(text, now, []);
  if (!parsed.title) return null;
  const task: TaskInput = {
    title: parsed.title,
    notes: "",
    spaceId: null,
    dueDate: parsed.dueDate,
    dueTime: parsed.dueTime,
    priority: parsed.priority,
    estimate: null,
    tags: parsed.tags,
    subtasks: [],
    recurrence: parsed.recurrence,
    color: null,
    reminder: parsed.dueTime ? defaultReminder : null,
    inbox: parsed.dueDate === null && !parsed.recurrence,
  };
  return { kind: "task", task, today: dayKey(now) };
}

/** Note : la première ligne donne le titre, les suivantes le texte. */
export function noteCapture(text: string): Capture | null {
  const [first = "", ...rest] = text.replace(/\r\n/g, "\n").split("\n");
  const title = first.trim();
  const lines = rest.join("\n").trim() ? rest : [];
  if (!title && lines.length === 0) return null;
  const doc: DocNode = {
    type: "doc",
    content: lines.length
      ? lines.map((line) => (line.trim() ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" }))
      : [{ type: "paragraph" }],
  };
  return { kind: "note", body: { title, content: JSON.stringify(doc), plain: plainOf(doc), links: [] } };
}

/** Événement : à l'heure saisie (une heure) ; une date seule donne la journée entière ; sans
 * rien, la prochaine heure pleine. */
export function eventCapture(text: string, now: Date, defaultReminder: number | null): Capture | null {
  const parsed = parseQuickAdd(text, now, []);
  if (!parsed.title) return null;
  const today = dayKey(now);
  const day = parsed.dueDate ?? today;
  let when: Pick<EventInput, "startDate" | "startTime" | "endDate" | "endTime">;
  if (parsed.dueTime) {
    const end = addMinutes(day, parsed.dueTime, 60);
    when = { startDate: day, startTime: parsed.dueTime, endDate: end.day, endTime: end.time };
  } else if (parsed.dueDate) {
    when = { startDate: day, startTime: null, endDate: day, endTime: null };
  } else {
    when = nextHourSlot(today, now, today);
  }
  const event: EventInput = {
    title: parsed.title,
    location: "",
    notes: "",
    spaceId: null,
    ...when,
    color: null,
    reminder: when.startTime ? defaultReminder : null,
    recurrence: null,
    exceptions: [],
    repeatUntil: null,
  };
  return { kind: "event", event };
}

export function buildCapture(kind: CaptureKind, text: string, now: Date, defaultReminder: number | null): Capture | null {
  if (kind === "note") return noteCapture(text);
  if (kind === "event") return eventCapture(text, now, defaultReminder);
  return taskCapture(text, now, defaultReminder);
}
