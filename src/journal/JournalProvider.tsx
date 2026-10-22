import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onDataAdded } from "../app/background";
import { useToast } from "../app/ToastProvider";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { useNow } from "../lib/useNow";
import { dayKey, type DayKey } from "../tasks/day";
import { useTheme } from "../theme/ThemeProvider";
import { journalApi } from "./api";
import { EMPTY_PAGE, plainText, themeMood, type JournalEntry, type JournalPage, type JournalSummary } from "./journal";
import { tr } from "../i18n/i18n";

interface JournalContextValue {
  /** Pages écrites, par jour. */
  pages: ReadonlyMap<DayKey, JournalSummary>;
  loaded: boolean;
  load: (day: DayKey) => Promise<JournalEntry | null>;
  /** Enregistre la page d'un jour ; les enregistrements passent dans l'ordre. */
  save: (day: DayKey, page: JournalPage) => Promise<void>;
  /** Humeur ou énergie d'un jour, sans ouvrir la page (Accueil). */
  setFeeling: (day: DayKey, changes: Partial<Pick<JournalPage, "mood" | "energy">>) => Promise<void>;
  /** Met la page à la corbeille, avec « Annuler ». */
  remove: (day: DayKey) => Promise<void>;
  search: (query: string) => Promise<DayKey[]>;
}

const JournalContext = createContext<JournalContextValue | null>(null);

/** Pages du journal, chargées une fois le compte déverrouillé ; l'humeur du jour va au thème. */
export function JournalProvider({ children }: { children: ReactNode }) {
  const [pages, setPages] = useState<Map<DayKey, JournalSummary>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const notify = useToast();
  const { setMood } = useTheme();
  const today = dayKey(useNow());

  // Une écriture à la fois, dans l'ordre.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  // Stable : l'éditeur ne recharge pas la page à chaque enregistrement.
  const load = useCallback((day: DayKey) => enqueue(() => journalApi.get(day)), [enqueue]);

  const reload = useCallback(async () => {
    const list = await enqueue(() => journalApi.list());
    setPages(new Map(list.map((p) => [p.day, p])));
  }, [enqueue]);

  useEffect(() => {
    reload()
      .catch((err: DataError) => notify(dataErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [reload, notify]);
  useEffect(() => onDataAdded("journal", () => void reload().catch(() => undefined)), [reload]);

  // Humeur du jour pour le changement automatique de thème ; oubliée au verrouillage.
  const todayPage = pages.get(today);
  const mood = themeMood(todayPage);
  useEffect(() => {
    setMood(mood);
  }, [mood, setMood]);
  useEffect(() => () => setMood(null), [setMood]);

  const value = useMemo<JournalContextValue>(() => {
    const put = (day: DayKey, summary: JournalSummary | null) =>
      setPages((current) => {
        const next = new Map(current);
        if (summary) next.set(day, summary);
        else next.delete(day);
        return next;
      });
    return {
      pages,
      loaded,
      load,
      save: async (day, page) => {
        try {
          put(day, await enqueue(() => journalApi.save(day, page)));
        } catch (err) {
          notify(dataErrorMessage(err as DataError));
        }
      },
      setFeeling: async (day, changes) => {
        try {
          const entry = await enqueue(() => journalApi.get(day));
          const page: JournalPage = entry
            ? { mood: entry.mood, energy: entry.energy, gratitudes: entry.gratitudes, content: entry.content, plain: plainText(entry.content), activities: entry.activities }
            : EMPTY_PAGE;
          put(day, await enqueue(() => journalApi.save(day, { ...page, ...changes })));
        } catch (err) {
          notify(dataErrorMessage(err as DataError));
        }
      },
      remove: async (day) => {
        try {
          await enqueue(() => journalApi.remove(day));
        } catch (err) {
          notify(dataErrorMessage(err as DataError));
          return;
        }
        put(day, null);
        notify(tr("Page supprimée."), {
          label: tr("Annuler|action"),
          undo: tr("suppression de la page"),
          run: () => {
            enqueue(() => journalApi.restore(day))
              .then((back) => put(day, back))
              .catch((err: DataError) => notify(dataErrorMessage(err)));
          },
        });
      },
      search: (query) => enqueue(() => journalApi.search(query)),
    };
  }, [pages, loaded, load, enqueue, notify]);

  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}

export function useJournal(): JournalContextValue {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error("useJournal doit être utilisé dans JournalProvider");
  return ctx;
}
