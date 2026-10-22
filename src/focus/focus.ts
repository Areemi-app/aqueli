/** Réglages et statistiques du Focus (cahier des charges § 4.10). */
import { addDays, weekday, type DayKey } from "../tasks/day";
import type { ScheduledReminder } from "../tasks/reminders";
import type { FocusSession } from "./api";
import { cleanPlan, flowPause, PLANS, type FocusPlan, type TimerState } from "./timer";
import { tr } from "../i18n/i18n";

export type PlanId = keyof typeof PLANS | "perso";
export type Ambience = "aucune" | "pluie" | "ruisseau" | "vagues" | "cafe";

export interface FocusSettings {
  plan: PlanId;
  /** Durées du plan personnalisé. */
  custom: FocusPlan;
  /** La séance suivante démarre seule après une pause. */
  autoContinue: boolean;
  /** « Ne pas déranger » : les rappels attendent la fin de la séance. */
  quiet: boolean;
  ambience: Ambience;
  /** Volume de l'ambiance, 0 à 100. */
  volume: number;
  /** Objectif de concentration par jour, en minutes (0 : aucun). */
  dailyGoal: number;
}

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  plan: "classique",
  custom: { focus: 40, pause: 8, longPause: 20, every: 4 },
  autoContinue: false,
  quiet: true,
  ambience: "aucune",
  volume: 50,
  dailyGoal: 120,
};

/** Objectifs du jour proposés, en minutes. */
export const DAILY_GOALS: readonly number[] = [0, 30, 60, 90, 120, 180, 240, 300, 360];

const AMBIENCES: readonly Ambience[] = ["aucune", "pluie", "ruisseau", "vagues", "cafe"];

export const AMBIENCE_LABELS: Record<Ambience, string> = {
  aucune: tr("Silence"),
  pluie: tr("Pluie"),
  ruisseau: tr("Ruisseau"),
  vagues: tr("Vagues"),
  cafe: tr("Café"),
};

export const PLAN_LABELS: Record<PlanId, string> = { classique: "25 / 5", long: "50 / 10", libre: tr("Libre"), perso: tr("Personnalisé") };

/** Réglages lus dans les préférences, complétés et corrigés. */
export function readSettings(value: unknown): FocusSettings {
  if (typeof value !== "object" || value === null) return DEFAULT_FOCUS_SETTINGS;
  const v = value as Partial<Record<keyof FocusSettings, unknown>>;
  const d = DEFAULT_FOCUS_SETTINGS;
  const custom = typeof v.custom === "object" && v.custom !== null ? cleanPlan({ ...d.custom, ...(v.custom as Partial<FocusPlan>) }) : d.custom;
  return {
    plan: v.plan === "classique" || v.plan === "long" || v.plan === "libre" || v.plan === "perso" ? v.plan : d.plan,
    custom,
    autoContinue: typeof v.autoContinue === "boolean" ? v.autoContinue : d.autoContinue,
    quiet: typeof v.quiet === "boolean" ? v.quiet : d.quiet,
    ambience: AMBIENCES.includes(v.ambience as Ambience) ? (v.ambience as Ambience) : d.ambience,
    volume: typeof v.volume === "number" && Number.isFinite(v.volume) ? Math.min(100, Math.max(0, Math.round(v.volume))) : d.volume,
    dailyGoal: DAILY_GOALS.includes(v.dailyGoal as number) ? (v.dailyGoal as number) : d.dailyGoal,
  };
}

export function planOf(settings: FocusSettings): FocusPlan {
  return settings.plan === "perso" ? settings.custom : PLANS[settings.plan];
}

/** Minutes concentrées chaque jour, du plus ancien au plus récent (`days` jours jusqu'à `today`). */
export function minutesByDay(sessions: readonly FocusSession[], today: DayKey, days: number): { day: DayKey; minutes: number }[] {
  const totals = new Map<DayKey, number>();
  for (const s of sessions) totals.set(s.day, (totals.get(s.day) ?? 0) + s.minutes);
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1);
    return { day, minutes: totals.get(day) ?? 0 };
  });
}

/** Lundi de la semaine de `day`. */
function monday(day: DayKey): DayKey {
  return addDays(day, -((weekday(day) + 6) % 7));
}

export interface FocusSummary {
  today: number;
  todaySessions: number;
  week: number;
  /** Moyenne des jours avec au moins une séance, sur 28 jours. */
  average: number;
  /** Jours de suite avec au moins une séance, jusqu'à aujourd'hui (ou hier). */
  streak: number;
}

export function summarize(sessions: readonly FocusSession[], today: DayKey): FocusSummary {
  const start = monday(today);
  const from = addDays(today, -27);
  let todayMinutes = 0;
  let todaySessions = 0;
  let week = 0;
  const active = new Map<DayKey, number>();
  for (const s of sessions) {
    if (s.day === today) {
      todayMinutes += s.minutes;
      todaySessions += 1;
    }
    if (s.day >= start && s.day <= today) week += s.minutes;
    if (s.day >= from && s.day <= today) active.set(s.day, (active.get(s.day) ?? 0) + s.minutes);
  }
  const total = [...active.values()].reduce((a, b) => a + b, 0);
  let streak = 0;
  let day = active.has(today) ? today : addDays(today, -1);
  const days = new Set(sessions.map((s) => s.day));
  while (days.has(day)) {
    streak += 1;
    day = addDays(day, -1);
  }
  return { today: todayMinutes, todaySessions, week, average: active.size === 0 ? 0 : Math.round(total / active.size), streak };
}

/** Tâches qui ont reçu le plus de minutes, des plus suivies aux moins suivies. */
export function topTasks(byTask: ReadonlyMap<string, number>, count: number): [string, number][] {
  return [...byTask].sort((a, b) => b[1] - a[1]).slice(0, count);
}

/**
 * Fin de la phase en cours (et de la pause qui suit une séance), annoncée par une notification
 * quand Aqueli n'est pas au premier plan. Identifiants « focus:… » : la notification ouvre Aqueli.
 */
export function scheduleForFocus(timer: TimerState, autoContinue: boolean): ScheduledReminder[] {
  if (timer.status !== "en-cours" || timer.endsAt === null) return [];
  const at = Math.ceil(timer.endsAt / 1000);
  const flow = timer.plan.flow === true;
  const next = flow
    ? autoContinue
      ? tr("Nouvelle séance libre.")
      : tr("Prochaine séance : libre.")
    : autoContinue
      ? tr("Nouvelle séance de {minutes} min.", { minutes: timer.plan.focus })
      : tr("Prochaine séance : {minutes} min.", { minutes: timer.plan.focus });
  if (timer.phase !== "concentration") return [{ at, taskId: "focus:pause", title: tr("Pause terminée"), when: next }];
  const long = !flow && timer.cycle % timer.plan.every === 0;
  const pause = long ? timer.plan.longPause : flow ? flowPause(timer.plan.focus) : timer.plan.pause;
  return [
    { at, taskId: "focus:fin", title: tr("Séance terminée"), when: long ? tr("Longue pause de {pause} min.", { pause }) : tr("Pause de {pause} min.", { pause }) },
    { at: at + pause * 60, taskId: "focus:pause", title: tr("Pause terminée"), when: next },
  ];
}
