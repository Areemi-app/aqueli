/** Tâches imprimées (Ctrl+P) : la liste ou la vue affichée, avec échéance, priorité et sous-tâches. */
import type { PrintDoc, PrintRow, PrintSection } from "../print/print";
import { relativeDay, type DayKey } from "./day";
import { PRIORITY_LABELS, type Task } from "./tasks";
import { tr } from "../i18n/i18n";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Lignes d'une tâche : la tâche, puis ses sous-tâches en retrait. */
export function taskRows(t: Task, today: DayKey, spaceName?: (id: string | null) => string | null): PrintRow[] {
  const done = t.doneAt !== null;
  const late = !done && t.dueDate !== null && t.dueDate < today;
  const meta = [
    t.dueDate ? cap(relativeDay(t.dueDate, today)) + (t.dueTime ? ` · ${t.dueTime}` : "") : null,
    t.priority > 0 ? tr("Priorité {priority}", { priority: PRIORITY_LABELS[t.priority].toLowerCase() }) : null,
    t.tags.length > 0 ? t.tags.map((x) => `#${x}`).join(" ") : null,
    spaceName?.(t.spaceId) ?? null,
  ].filter((x): x is string => !!x);
  return [
    { text: t.title, checked: done, meta: meta.join(" · ") || undefined, tone: late ? "late" : undefined },
    ...t.subtasks.map((s) => ({ text: s.title, checked: s.done, indent: true })),
  ];
}

export function tasksPrintDoc(
  title: string,
  groups: readonly { title: string; tasks: readonly Task[] }[],
  today: DayKey,
  options: { subtitle?: string; spaceName?: (id: string | null) => string | null } = {},
): PrintDoc {
  const sections: PrintSection[] = groups.map((g) => ({
    heading: g.title || undefined,
    rows: g.tasks.flatMap((t) => taskRows(t, today, options.spaceName)),
  }));
  return { title, subtitle: options.subtitle, sections, empty: tr("Aucune tâche.") };
}
