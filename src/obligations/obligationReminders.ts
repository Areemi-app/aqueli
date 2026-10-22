/**
 * Rappels des obligations : J-30, J-7 et J-1 par défaut, réglables par catégorie, à 9 h ;
 * les mêmes avant la date limite de résiliation. Identifiants « obl:id@date:e7 » (échéance)
 * ou « obl:id@date:r7 » (résiliation) : la notification propose « Ouvrir ».
 */
import { readPref, writePref } from "../lib/storage";
import { addDays, dayKey, fromDayKey, type DayKey } from "../tasks/day";
import { DEFAULT_REMINDER_TIME, type ScheduledReminder } from "../tasks/reminders";
import { CATEGORY_IDS, formatAmount, type Obligation, type ObligationCategory } from "./obligations";
import { tr } from "../i18n/i18n";

export const OBLIGATION_REMINDER_PREFIX = "obl:";
/** Jours avant l'échéance proposés dans les Paramètres. */
export const OFFSET_CHOICES = [30, 15, 7, 3, 1, 0] as const;
export const DEFAULT_OFFSETS: readonly number[] = [30, 7, 1];
const HORIZON_MS = 35 * 86_400_000;

/** Jours de rappel : un réglage pour toutes les catégories, et des exceptions. */
export interface ReminderSettings {
  default: number[];
  categories: Partial<Record<ObligationCategory, number[]>>;
}

const KEY = "rappelsObligations";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const validDays = (value: unknown): number[] | null =>
  Array.isArray(value)
    ? value.filter((n): n is number => OFFSET_CHOICES.includes(n as (typeof OFFSET_CHOICES)[number])).sort((a, b) => b - a)
    : null;

const sameDays = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((d, i) => d === b[i]);

/** Réglages enregistrés (l'ancien format, une liste par catégorie, devient des exceptions). */
export function readReminderSettings(): ReminderSettings {
  const saved = readPref<Record<string, unknown>>(KEY, {}, isObject);
  const byDefault = validDays(saved.default) ?? [...DEFAULT_OFFSETS];
  const source = isObject(saved.categories) ? saved.categories : saved;
  const categories: ReminderSettings["categories"] = {};
  for (const category of CATEGORY_IDS) {
    const days = validDays(source[category]);
    if (days && !sameDays(days, byDefault)) categories[category] = days;
  }
  return { default: byDefault, categories };
}

/** Réglage changé : les rappels sont reprogrammés (src/app/RemindersBridge.tsx). */
export const OFFSETS_CHANGED = "aqueli:rappels-obligations";

export function writeReminderSettings(settings: ReminderSettings): void {
  writePref(KEY, settings);
  window.dispatchEvent(new Event(OFFSETS_CHANGED));
}

/** Jours de rappel d'une catégorie : son exception, sinon le réglage par défaut. */
export function offsetsFor(settings: ReminderSettings, category: ObligationCategory): number[] {
  return settings.categories[category] ?? settings.default;
}

/** « J-7 », « Jour J ». */
export function offsetLabel(days: number): string {
  return days === 0 ? tr("Jour J") : tr("J-{days}", { days });
}

function inDays(days: number): string {
  if (days === 0) return tr("aujourd'hui");
  if (days === 1) return tr("demain");
  return tr("dans {days} jours", { days });
}

interface ObligationReminder extends ScheduledReminder {
  obligationId: string;
}

/** Tous les rappels des obligations à payer (échéance et date limite de résiliation). */
function remindersOf(list: readonly Obligation[], settings: ReminderSettings): ObligationReminder[] {
  const reminders: ObligationReminder[] = [];
  const [h = 9, m = 0] = DEFAULT_REMINDER_TIME.split(":").map(Number);
  const at = (day: DayKey, before: number) => {
    const date = fromDayKey(addDays(day, -before));
    date.setHours(h, m, 0, 0);
    return Math.floor(date.getTime() / 1000);
  };
  for (const o of list) {
    if (o.status !== "a-faire") continue;
    const amount = o.amountCents !== null ? ` · ${formatAmount(o.amountCents)}` : "";
    for (const n of offsetsFor(settings, o.category)) {
      reminders.push({
        at: at(o.dueDate, n),
        taskId: `${OBLIGATION_REMINDER_PREFIX}${o.id}@${o.dueDate}:e${n}`,
        title: o.title,
        when: tr("Échéance {when}", { when: inDays(n) }) + amount,
        obligationId: o.id,
      });
      if (o.cancelBy) {
        reminders.push({
          at: at(o.cancelBy, n),
          taskId: `${OBLIGATION_REMINDER_PREFIX}${o.id}@${o.cancelBy}:r${n}`,
          title: o.title,
          when: tr("Date limite de résiliation {when}", { when: inDays(n) }),
          obligationId: o.id,
        });
      }
    }
  }
  return reminders;
}

/** Rappels de maintenant (à une minute près) aux 35 prochains jours, confiés au cœur. */
export function scheduleForObligations(list: readonly Obligation[], settings: ReminderSettings, now: Date): ScheduledReminder[] {
  const from = Math.floor((now.getTime() - 60_000) / 1000);
  const until = Math.floor((now.getTime() + HORIZON_MS) / 1000);
  return remindersOf(list, settings)
    .filter((r) => r.at >= from && r.at <= until)
    .map(({ obligationId: _id, ...r }) => r);
}

/** Rappels tombés entre `from` et `to` (secondes Unix), pendant qu'Aqueli était arrêté. */
export function missedObligationsBetween(
  list: readonly Obligation[],
  settings: ReminderSettings,
  from: number,
  to: number,
): { obligation: Obligation; id: string }[] {
  return remindersOf(list, settings)
    .filter((r) => r.at > from && r.at <= to)
    .map((r) => ({ obligation: list.find((o) => o.id === r.obligationId)!, id: r.taskId }));
}

/** « obl:id@date:e7 » : l'obligation visée par une notification. */
export function parseObligationReminderId(id: string): { obligationId: string } | null {
  if (!id.startsWith(OBLIGATION_REMINDER_PREFIX)) return null;
  const obligationId = id.slice(OBLIGATION_REMINDER_PREFIX.length).split("@")[0] ?? "";
  return obligationId ? { obligationId } : null;
}

/** Jour d'aujourd'hui sur ce PC (pour les calculs appelés hors de React). */
export const todayKey = () => dayKey(new Date());
