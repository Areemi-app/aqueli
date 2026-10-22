/**
 * Focus : minuteur en cours (focusStore), réglages et séances enregistrées. Ici, une fois le
 * compte ouvert, les séances terminées sont enregistrées, les rappels attendent pendant la
 * concentration, l'ambiance joue et la fin de chaque phase est annoncée.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useToast } from "../app/ToastProvider";
import { recordUndo } from "../app/undo";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { readPref, writePref } from "../lib/storage";
import { useNow } from "../lib/useNow";
import { useNavigation } from "../navigation/NavigationProvider";
import { useSound } from "../sound/SoundProvider";
import { addDays, dayKey, type DayKey } from "../tasks/day";
import { ambience } from "./ambience";
import { focusApi, type FocusSession } from "./api";
import { DEFAULT_FOCUS_SETTINGS, planOf, readSettings, type FocusSettings } from "./focus";
import { focusStore, type PendingRecord } from "./focusStore";
import type { TimerState } from "./timer";
import { tr } from "../i18n/i18n";

/** Séances chargées : 8 semaines (statistiques et graphique). */
const HISTORY_DAYS = 56;

interface FocusContextValue {
  timer: TimerState;
  settings: FocusSettings;
  setSettings: (changes: Partial<FocusSettings>) => void;
  start: () => void;
  suspend: () => void;
  stop: () => void;
  skip: () => void;
  /** Tâche suivie par la séance (`null` : aucune). */
  setTask: (taskId: string | null) => void;
  /** Intention de la séance (`null` : aucune). */
  setIntention: (intention: string | null) => void;
  /** Retire une séance enregistrée (« Annuler » la remet). */
  removeSession: (session: FocusSession) => void;
  /** Démarre une séance sur cette tâche. */
  startWith: (taskId: string | null) => void;
  sessions: readonly FocusSession[];
  /** Minutes de concentration par tâche, toutes séances confondues. */
  byTask: ReadonlyMap<string, number>;
  today: DayKey;
  loaded: boolean;
}

const FocusContext = createContext<FocusContextValue | null>(null);

export function readFocusSettings(): FocusSettings {
  return readSettings(readPref<unknown>("focus", DEFAULT_FOCUS_SETTINGS, (_v): _v is unknown => true));
}

/** Minuteur partagé, suivi par l'affichage. */
export function useTimer(): TimerState {
  return useSyncExternalStore(focusStore.subscribe, focusStore.get);
}

export function FocusProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState(readFocusSettings);
  const timer = useTimer();
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [byTask, setByTask] = useState<ReadonlyMap<string, number>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const notify = useToast();
  const { play } = useSound();
  const { go } = useNavigation();
  const today = dayKey(useNow());

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => focusStore.configure(planOf(settings), settings.autoContinue), [settings]);

  const reload = useCallback(async () => {
    const [list, totals] = await Promise.all([focusApi.list(addDays(dayKey(new Date()), -HISTORY_DAYS)), focusApi.byTask()]);
    setSessions(list);
    setByTask(new Map(totals));
  }, []);

  useEffect(() => {
    reload()
      .catch((err: DataError) => notify(dataErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [reload, notify]);

  /** Enregistre les séances terminées (et le temps passé sur leur tâche). */
  const saveRecords = useCallback(
    async (records: readonly PendingRecord[]) => {
      for (const r of records) {
        try {
          const saved = await focusApi.add(r.taskId, dayKey(new Date(r.startedAt)), Math.floor(r.startedAt / 1000), r.minutes, r.note);
          setSessions((list) => [...list, saved]);
          if (saved.taskId) setByTask((m) => new Map(m).set(saved.taskId!, (m.get(saved.taskId!) ?? 0) + saved.minutes));
          if (r.undoable) {
            recordUndo(tr("séance de Focus"), async () => {
              await focusApi.remove(saved.id);
              setSessions((list) => list.filter((s) => s.id !== saved.id));
              if (saved.taskId) setByTask((m) => new Map(m).set(saved.taskId!, Math.max(0, (m.get(saved.taskId!) ?? 0) - saved.minutes)));
            });
          }
        } catch (err) {
          notify(dataErrorMessage(err as DataError));
        }
      }
    },
    [notify],
  );

  const removeSession = useCallback(
    (session: FocusSession) => {
      const adjust = (s: FocusSession, sign: 1 | -1) => {
        if (s.taskId) setByTask((m) => new Map(m).set(s.taskId!, Math.max(0, (m.get(s.taskId!) ?? 0) + sign * s.minutes)));
      };
      focusApi
        .remove(session.id)
        .then(() => {
          setSessions((list) => list.filter((s) => s.id !== session.id));
          adjust(session, -1);
          notify(tr("Séance supprimée."), {
            label: tr("Annuler|action"),
            undo: tr("suppression de la séance"),
            run: () => {
              focusApi
                .add(session.taskId, session.day, session.startedAt, session.minutes, session.note)
                .then((back) => {
                  setSessions((list) => [...list, back].sort((a, b) => a.startedAt - b.startedAt));
                  adjust(back, 1);
                })
                .catch((err: DataError) => notify(dataErrorMessage(err)));
            },
          });
        })
        .catch((err: DataError) => notify(dataErrorMessage(err)));
    },
    [notify],
  );

  // Séances terminées, y compris pendant le verrouillage : enregistrées dès que la base est ouverte.
  useEffect(() => {
    const drain = () => void saveRecords(focusStore.takeRecords());
    drain();
    return focusStore.onRecords(drain);
  }, [saveRecords]);

  // Fin d'une phase : carillon et message.
  useEffect(
    () =>
      focusStore.onEnded((_ended, s) => {
        play("carillon", { inFocus: true });
        const minutes = Math.round(s.remaining / 60_000);
        const message =
          s.phase === "concentration"
            ? s.status === "en-cours"
              ? tr("Pause terminée. Nouvelle séance.")
              : tr("Pause terminée.")
            : s.phase === "longue-pause"
              ? tr("Séance terminée. Longue pause de {minutes} min.", { minutes })
              : tr("Séance terminée. Pause de {minutes} min.", { minutes });
        notify(message, s.phase === "concentration" && s.status !== "en-cours" ? { label: tr("Démarrer"), run: focusStore.start } : { label: tr("Afficher"), run: () => go("focus") });
      }),
    [play, notify, go],
  );

  // « Ne pas déranger » : les rappels attendent la fin de la séance de concentration.
  const quietUntil = settings.quiet && timer.status === "en-cours" && timer.phase === "concentration" && timer.endsAt !== null ? Math.ceil(timer.endsAt / 1000) : null;
  useEffect(() => {
    focusApi.quiet(quietUntil).catch(() => {});
  }, [quietUntil]);

  // Ambiance pendant la concentration ; elle se tait pendant les pauses et au verrouillage.
  const ambienceOn = timer.status === "en-cours" && timer.phase === "concentration" ? settings.ambience : "aucune";
  useEffect(() => {
    ambience.play(ambienceOn, settingsRef.current.volume);
  }, [ambienceOn]);
  useEffect(() => ambience.setVolume(settings.volume), [settings.volume]);
  useEffect(() => () => ambience.stop(), []);

  const value = useMemo<FocusContextValue>(() => {
    const setSettings = (changes: Partial<FocusSettings>) => {
      const next = { ...settingsRef.current, ...changes };
      settingsRef.current = next;
      writePref("focus", next);
      setSettingsState(next);
    };
    return {
      timer,
      settings,
      setSettings,
      start: focusStore.start,
      suspend: focusStore.suspend,
      stop: focusStore.stop,
      skip: focusStore.skip,
      setTask: focusStore.setTask,
      setIntention: focusStore.setIntention,
      removeSession,
      startWith: focusStore.startWith,
      sessions,
      byTask,
      today,
      loaded,
    };
  }, [timer, settings, sessions, byTask, today, loaded, removeSession]);

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus(): FocusContextValue {
  const ctx = useContext(FocusContext);
  if (!ctx) throw new Error("useFocus doit être utilisé dans FocusProvider");
  return ctx;
}

/** Focus s'il est disponible (menus et détail des tâches, aussi utilisés sans lui dans les tests). */
export function useFocusIfAny(): FocusContextValue | null {
  return useContext(FocusContext);
}

/**
 * Heure du moment, relue à chaque affichage ; l'affichage se rafraîchit plusieurs fois par
 * seconde pendant que le minuteur tourne. À la reprise, le décompte repart donc de la bonne
 * seconde, sans saut. Fenêtre réduite ou cachée : rien n'est redessiné, jusqu'à son retour.
 */
export function useTimerNow(running: boolean): number {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 250);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [running]);
  return Date.now();
}
