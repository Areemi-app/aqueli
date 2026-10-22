import { tr } from "../i18n/i18n";
/**
 * Minuteur Focus (cahier des charges § 4.10) : séances de concentration, pauses, longue pause
 * toutes les N séances. Machine à états pure : l'heure arrive en paramètre, et un minuteur
 * resté sans affichage (Aqueli verrouillé) rattrape les phases écoulées.
 */

export interface FocusPlan {
  /** Minutes de concentration, de pause, de longue pause ; longue pause toutes les `every` séances. */
  focus: number;
  pause: number;
  longPause: number;
  every: number;
  /**
   * Séance libre : pas de durée fixée (4 heures au plus), le temps écoulé s'affiche ; la pause
   * dure le cinquième de la séance, sans longue pause.
   */
  flow?: boolean;
}

export const PLANS = {
  classique: { focus: 25, pause: 5, longPause: 15, every: 4 },
  long: { focus: 50, pause: 10, longPause: 20, every: 4 },
  libre: { focus: 240, pause: 5, longPause: 15, every: 4, flow: true },
} as const satisfies Record<string, FocusPlan>;

export type Phase = "concentration" | "pause" | "longue-pause";
export type Status = "arret" | "en-cours" | "suspendu";

export interface TimerState {
  phase: Phase;
  status: Status;
  /** Fin de la phase (ms), pendant qu'elle s'écoule. */
  endsAt: number | null;
  /** Temps restant (ms), à l'arrêt ou suspendu. */
  remaining: number;
  /** Séance de concentration en cours (1 à `every`). */
  cycle: number;
  /** Début de la séance de concentration en cours (ms), pour l'enregistrer. */
  startedAt: number | null;
  taskId: string | null;
  /** Intention de la séance (« Sur quoi travaillez-vous ? »). */
  intention: string | null;
  plan: FocusPlan;
  /** Durée de la phase (ms) quand elle diffère du plan : pause d'une séance libre. */
  total?: number;
}

/** Séance de concentration terminée, à enregistrer. */
export interface FocusRecord {
  taskId: string | null;
  /** Début (ms). */
  startedAt: number;
  minutes: number;
  note: string | null;
}

const MINUTE = 60_000;

export function phaseMs(plan: FocusPlan, phase: Phase): number {
  return (phase === "concentration" ? plan.focus : phase === "pause" ? plan.pause : plan.longPause) * MINUTE;
}

/** Durée de la phase en cours (ms). */
export function phaseTotal(s: TimerState): number {
  return s.total ?? phaseMs(s.plan, s.phase);
}

/** Pause après une séance libre : le cinquième de la séance, de 1 à 30 minutes. */
export function flowPause(minutes: number): number {
  return Math.min(30, Math.max(1, Math.round(minutes / 5)));
}

export function initialState(plan: FocusPlan, taskId: string | null = null, intention: string | null = null): TimerState {
  return { phase: "concentration", status: "arret", endsAt: null, remaining: phaseMs(plan, "concentration"), cycle: 1, startedAt: null, taskId, intention, plan };
}

export function remainingMs(s: TimerState, now: number): number {
  return s.status === "en-cours" && s.endsAt !== null ? Math.max(0, s.endsAt - now) : s.remaining;
}

/** Temps écoulé dans la phase (ms). */
export function elapsedMs(s: TimerState, now: number): number {
  return Math.max(0, phaseTotal(s) - remainingMs(s, now));
}

/** Le minuteur compte le temps écoulé (séance libre) au lieu du temps restant. */
export function countsUp(s: TimerState): boolean {
  return s.plan.flow === true && s.phase === "concentration";
}

/** Temps affiché : écoulé pendant une séance libre, restant sinon. */
export function shownMs(s: TimerState, now: number): number {
  return countsUp(s) ? elapsedMs(s, now) : remainingMs(s, now);
}

/** Part écoulée de la phase, de 0 à 1. */
export function progress(s: TimerState, now: number): number {
  const total = phaseTotal(s);
  return total === 0 ? 1 : Math.min(1, Math.max(0, 1 - remainingMs(s, now) / total));
}

/** Démarre ou reprend. */
export function start(s: TimerState, now: number): TimerState {
  if (s.status === "en-cours") return s;
  const startedAt = s.phase === "concentration" ? (s.startedAt ?? now) : s.startedAt;
  return { ...s, status: "en-cours", endsAt: now + s.remaining, startedAt };
}

/** Suspend (le temps restant est gardé). */
export function suspend(s: TimerState, now: number): TimerState {
  if (s.status !== "en-cours") return s;
  return { ...s, status: "suspendu", remaining: remainingMs(s, now), endsAt: null };
}

/** Temps de concentration écoulé dans la séance en cours. */
function focusedMinutes(s: TimerState, now: number): number {
  if (s.phase !== "concentration" || s.startedAt === null) return 0;
  return Math.floor((phaseMs(s.plan, "concentration") - remainingMs(s, now)) / MINUTE);
}

function record(s: TimerState, minutes: number): FocusRecord | null {
  return minutes >= 1 && s.startedAt !== null ? { taskId: s.taskId, startedAt: s.startedAt, minutes, note: s.intention } : null;
}

/** Arrête : retour au début d'une séance ; le temps de concentration déjà passé compte (1 min au moins). */
export function stop(s: TimerState, now: number): { state: TimerState; record: FocusRecord | null } {
  return { state: { ...initialState(s.plan, s.taskId, s.intention), cycle: s.phase === "concentration" ? s.cycle : nextCycle(s) }, record: record(s, focusedMinutes(s, now)) };
}

function nextCycle(s: TimerState): number {
  return s.phase === "longue-pause" ? 1 : s.cycle + 1;
}

/** Phase suivante, commencée à `at` (ou attendant un démarrage si `running` est faux). */
function next(s: TimerState, at: number, running: boolean): TimerState {
  if (s.phase === "concentration") {
    const phase: Phase = !s.plan.flow && s.cycle % s.plan.every === 0 ? "longue-pause" : "pause";
    // Séance libre : la pause suit la durée de la séance.
    const total = s.plan.flow ? flowPause(focusedMinutes(s, at)) * MINUTE : undefined;
    const length = total ?? phaseMs(s.plan, phase);
    // La pause commence d'elle-même.
    return { ...s, phase, status: running || s.status === "en-cours" ? "en-cours" : "arret", endsAt: at + length, remaining: length, startedAt: null, total };
  }
  const base = { ...s, phase: "concentration" as const, cycle: nextCycle(s), remaining: phaseMs(s.plan, "concentration"), total: undefined };
  return running ? { ...base, status: "en-cours", endsAt: at + base.remaining, startedAt: at } : { ...base, status: "arret", endsAt: null, startedAt: null };
}

/** Passe à la phase suivante ; une séance interrompue compte pour le temps déjà passé. */
export function skip(s: TimerState, now: number): { state: TimerState; record: FocusRecord | null } {
  const rec = record(s, focusedMinutes(s, now));
  const after = next(s, now, false);
  // Passer une pause en cours la termine ; passer une séance démarre la pause.
  return { state: s.phase === "concentration" && s.status !== "arret" ? { ...after, status: "en-cours", endsAt: now + after.remaining } : after, record: rec };
}

export interface TickResult {
  state: TimerState;
  /** Phases terminées depuis le dernier passage (pour le son et le message). */
  ended: Phase[];
  records: FocusRecord[];
}

/**
 * Fait avancer le minuteur jusqu'à `now`. À la fin d'une séance, la pause commence d'elle-même ;
 * à la fin d'une pause, la séance suivante démarre seule si `autoContinue`, sinon attend.
 */
export function tick(s: TimerState, now: number, autoContinue: boolean): TickResult {
  let state = s;
  const ended: Phase[] = [];
  const records: FocusRecord[] = [];
  for (let guard = 0; guard < 20 && state.status === "en-cours" && state.endsAt !== null && state.endsAt <= now; guard++) {
    const at = state.endsAt!;
    ended.push(state.phase);
    if (state.phase === "concentration") {
      const rec = record(state, state.plan.focus);
      if (rec) records.push(rec);
    }
    state = next(state, at, state.phase !== "concentration" ? autoContinue : true);
  }
  return { state, ended, records };
}

/** « 24:59 », « 1:05:00 » au-delà d'une heure. */
export function clock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  return h > 0 ? `${h}:${mm}:${String(sec).padStart(2, "0")}` : `${mm.padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export const PHASE_LABELS: Record<Phase, string> = { concentration: tr("Concentration"), pause: tr("Pause"), "longue-pause": tr("Longue pause") };

/** « 1 h 15 », « 45 min ». */
export { durationLabel } from "../lib/duration";

/** Plan valide : durées de 1 à 240 minutes, longue pause toutes les 2 à 8 séances. */
export function cleanPlan(p: FocusPlan): FocusPlan {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(v) ? v : min)));
  return { focus: clamp(p.focus, 1, 240), pause: clamp(p.pause, 1, 60), longPause: clamp(p.longPause, 1, 90), every: clamp(p.every, 2, 8) };
}
