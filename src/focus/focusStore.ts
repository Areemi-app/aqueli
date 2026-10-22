/**
 * Minuteur en cours, gardé hors de l'affichage : il avance tout seul (écran Focus fermé,
 * Aqueli verrouillé), se pilote depuis l'écran Focus, le mini-lecteur ou la petite fenêtre
 * toujours visible, et rattrape les phases écoulées. Les séances terminées attendent ici
 * d'être enregistrées (base ouverte). Les sons de l'interface se taisent pendant une séance de
 * concentration (cahier des charges § 6).
 */
import {
  initialState,
  skip as skipPhase,
  start as startTimer,
  stop as stopTimer,
  suspend as suspendTimer,
  tick,
  type FocusPlan,
  type FocusRecord,
  type Phase,
  type TimerState,
} from "./timer";

/** Séance à enregistrer ; `undoable` : arrêtée à la main (Ctrl+Z la retire). */
export interface PendingRecord extends FocusRecord {
  undoable: boolean;
}

type Listener = () => void;
type EndListener = (ended: Phase[], state: TimerState) => void;

export interface FocusStore {
  get: () => TimerState;
  subscribe: (listener: Listener) => () => void;
  /** Plan des séances et enchaînement (réglages du Focus). */
  configure: (plan: FocusPlan, autoContinue: boolean) => void;
  start: () => void;
  suspend: () => void;
  /** Démarre ou suspend. */
  toggle: () => void;
  stop: () => void;
  skip: () => void;
  setTask: (taskId: string | null) => void;
  /** Intention de la séance (`null` : aucune). */
  setIntention: (intention: string | null) => void;
  startWith: (taskId: string | null) => void;
  /** Séances terminées en attente d'enregistrement (vidées par la lecture). */
  takeRecords: () => PendingRecord[];
  onRecords: (listener: Listener) => () => void;
  /** Fin de phase (son, message). */
  onEnded: (listener: EndListener) => () => void;
  /** Fait avancer le minuteur jusqu'à `now` (appelé régulièrement pendant qu'il tourne). */
  advance: (now: number) => void;
}

export function createFocusStore(now: () => number = Date.now, schedule = true): FocusStore {
  let state: TimerState | null = null;
  let plan: FocusPlan = { focus: 25, pause: 5, longPause: 15, every: 4 };
  let autoContinue = false;
  let pending: PendingRecord[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<Listener>();
  const recordListeners = new Set<Listener>();
  const endListeners = new Set<EndListener>();

  const get = () => (state ??= initialState(plan));
  const keep = (record: FocusRecord | null, undoable: boolean) => {
    if (!record) return;
    pending.push({ ...record, undoable });
    for (const l of recordListeners) l();
  };
  const advance = (at: number) => {
    const current = get();
    if (current.status !== "en-cours") return;
    const result = tick(current, at, autoContinue);
    if (result.ended.length === 0) return;
    set(result.state);
    for (const r of result.records) keep(r, false);
    for (const l of endListeners) l(result.ended, result.state);
  };
  const set = (next: TimerState) => {
    state = next;
    if (schedule) {
      if (next.status === "en-cours" && timer === undefined) timer = setInterval(() => advance(now()), 500);
      else if (next.status !== "en-cours" && timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    }
    for (const l of listeners) l();
  };

  return {
    get,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    configure: (nextPlan, nextAuto) => {
      autoContinue = nextAuto;
      const same = JSON.stringify(nextPlan) === JSON.stringify(plan);
      plan = nextPlan;
      const t = state;
      if (!t) return;
      // Nouveau plan : appliqué tout de suite si le minuteur n'a pas commencé, sinon aux phases suivantes.
      if (t.status === "arret" && t.phase === "concentration" && t.startedAt === null) set({ ...initialState(plan, t.taskId, t.intention), cycle: Math.min(t.cycle, plan.every) });
      else if (!same) set({ ...t, plan });
    },
    start: () => set(startTimer(get(), now())),
    suspend: () => set(suspendTimer(get(), now())),
    toggle: () => set(get().status === "en-cours" ? suspendTimer(get(), now()) : startTimer(get(), now())),
    stop: () => {
      const { state: next, record } = stopTimer(get(), now());
      set(next);
      keep(record, true);
    },
    skip: () => {
      const { state: next, record } = skipPhase(get(), now());
      set(next);
      keep(record, true);
    },
    setTask: (taskId) => set({ ...get(), taskId }),
    setIntention: (intention) => set({ ...get(), intention: intention?.trim() ? intention : null }),
    startWith: (taskId) => set(startTimer({ ...get(), taskId }, now())),
    takeRecords: () => {
      const list = pending;
      pending = [];
      return list;
    },
    onRecords: (listener) => {
      recordListeners.add(listener);
      return () => recordListeners.delete(listener);
    },
    onEnded: (listener) => {
      endListeners.add(listener);
      return () => endListeners.delete(listener);
    },
    advance,
  };
}

/** Le minuteur d'Aqueli (un seul, partagé par tous les affichages). */
export const focusStore = createFocusStore();

/** Une séance de concentration s'écoule. */
export function isConcentrating(): boolean {
  const s = focusStore.get();
  return s.status === "en-cours" && s.phase === "concentration";
}
