import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { onDataAdded } from "../app/background";
import { useToast } from "../app/ToastProvider";
import { recordUndo } from "../app/undo";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { useNow } from "../lib/useNow";
import { dayKey, formatShortDay } from "../tasks/day";
import { obligationsApi } from "./api";
import {
  categoryOf as baseCategoryOf,
  mergeCategories,
  toObligationInput,
  type CategoryCustom,
  type CategoryDef,
  type Obligation,
  type ObligationCategory,
  type ObligationInput,
} from "./obligations";
import { tr } from "../i18n/i18n";

interface ObligationsContextValue {
  obligations: readonly Obligation[];
  loaded: boolean;
  create: (input: ObligationInput) => Promise<Obligation>;
  /** Modifie une obligation ; l'affichage suit tout de suite, puis la base confirme. */
  update: (obligation: Obligation, changes: Partial<ObligationInput>) => Promise<void>;
  /** « Payé », avec « Annuler » pendant 8 secondes. */
  pay: (obligation: Obligation) => Promise<void>;
  /** Met l'obligation à la corbeille, avec « Annuler ». */
  remove: (obligation: Obligation) => Promise<void>;
  /** Copie de l'obligation. */
  duplicate: (obligation: Obligation) => Promise<void>;
  /** Catégories avec les noms et couleurs choisis. */
  categories: readonly CategoryDef[];
  categoryOf: (id: ObligationCategory) => CategoryDef;
  /** Renomme, recolore ou change le symbole d'une catégorie ; `null` partout : retour à l'origine. */
  customizeCategory: (
    id: ObligationCategory,
    changes: { label: string | null; color: string | null; icon: string | null },
  ) => Promise<void>;
}

const ObligationsContext = createContext<ObligationsContextValue | null>(null);

/** Obligations, chargées une fois le compte déverrouillé. */
export function ObligationsProvider({ children }: { children: ReactNode }) {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [custom, setCustom] = useState<CategoryCustom[]>([]);
  const notify = useToast();

  const listRef = useRef<Obligation[]>([]);
  const setAll = useCallback((change: (list: Obligation[]) => Obligation[]) => {
    listRef.current = change(listRef.current);
    setObligations(listRef.current);
  }, []);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);
  const replace = useCallback((o: Obligation) => setAll((list) => list.map((x) => (x.id === o.id ? o : x))), [setAll]);

  const reload = useCallback(async () => {
    const list = await enqueue(() => obligationsApi.list());
    setAll(() => list);
    setCustom(await enqueue(() => obligationsApi.categories()));
  }, [enqueue, setAll]);

  useEffect(() => {
    reload()
      .catch((err: DataError) => notify(dataErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [reload, notify]);

  // Prélèvements automatiques arrivés : enregistrés au chargement, chaque jour, et dès qu'une
  // obligation passe en prélèvement automatique (ou en arrive par l'import).
  const today = dayKey(useNow());
  const [dueCheck, recheckDue] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!loaded) return;
    enqueue(() => obligationsApi.autopay(today))
      .then((changed) => {
        if (changed.length === 0) return;
        for (const o of changed) replace(o);
        notify(changed.length === 1 ? tr("Prélèvement enregistré : {title}.", { title: changed[0]!.title }) : tr("{length} prélèvements enregistrés.", { length: changed.length }));
      })
      .catch(() => undefined);
  }, [loaded, today, dueCheck, enqueue, replace, notify]);

  // Obligations importées (ou import annulé).
  useEffect(
    () =>
      onDataAdded("obligation", () => {
        reload()
          .then(recheckDue)
          .catch(() => undefined);
      }),
    [reload],
  );

  const value = useMemo<ObligationsContextValue>(() => {
    const update = async (obligation: Obligation, changes: Partial<ObligationInput>) => {
      const base = listRef.current.find((o) => o.id === obligation.id) ?? obligation;
      recordUndo(tr("modification de l'obligation"), () => update(base, toObligationInput(base)), `obligation:${base.id}`);
      const input = { ...toObligationInput(base), ...changes };
      replace({ ...base, ...input });
      try {
        const saved = await enqueue(() => obligationsApi.update(base.id, input));
        replace(saved);
        if (saved.autoPay && saved.status === "a-faire" && saved.dueDate <= dayKey(new Date())) recheckDue();
      } catch (err) {
        notify(dataErrorMessage(err as DataError));
        await reload().catch(() => undefined);
      }
    };
    const remove = async (obligation: Obligation) => {
      try {
        await enqueue(() => obligationsApi.remove(obligation.id));
      } catch (err) {
        notify(dataErrorMessage(err as DataError));
        return;
      }
      setAll((list) => list.filter((o) => o.id !== obligation.id));
      notify(tr("Obligation supprimée."), {
        label: tr("Annuler|action"),
        undo: tr("suppression de l'obligation"),
        run: () => {
          enqueue(() => obligationsApi.restore(obligation.id))
            .then((back) => setAll((list) => [...list.filter((o) => o.id !== back.id), back]))
            .catch((err: DataError) => notify(dataErrorMessage(err)));
        },
      });
    };
    const customizeCategory = async (id: ObligationCategory, changes: { label: string | null; color: string | null; icon: string | null }) => {
      const before = custom.find((c) => c.id === id);
      recordUndo(
        tr("modification de la catégorie"),
        () => customizeCategory(id, { label: before?.label ?? null, color: before?.color ?? null, icon: before?.icon ?? null }),
        `category:${id}`,
      );
      try {
        const saved = await enqueue(() => obligationsApi.customizeCategory({ id, ...changes }));
        setCustom((list) => [...list.filter((c) => c.id !== id), ...(saved.label || saved.color || saved.icon ? [saved] : [])]);
      } catch (err) {
        notify(dataErrorMessage(err as DataError));
      }
    };
    const categories = mergeCategories(custom);
    return {
      obligations,
      loaded,
      categories,
      categoryOf: (id) => baseCategoryOf(id, categories),
      customizeCategory,
      create: async (input) => {
        const o = await enqueue(() => obligationsApi.create(input));
        setAll((list) => [...list, o]);
        recordUndo(tr("ajout de l'obligation"), () => remove(o));
        if (o.autoPay && o.dueDate <= dayKey(new Date())) recheckDue();
        return o;
      },
      update,
      pay: async (obligation) => {
        const before = toObligationInput(listRef.current.find((o) => o.id === obligation.id) ?? obligation);
        try {
          const paid = await enqueue(() => obligationsApi.pay(obligation.id, dayKey(new Date())));
          replace(paid);
          const text =
            paid.status === "paye"
              ? tr("Obligation payée.")
              : tr("Échéance suivante : {date}.", { date: formatShortDay(paid.dueDate, dayKey(new Date())).replace(/\.$/, "") });
          notify(text, {
            label: tr("Annuler|action"),
            undo: tr("paiement de l'obligation"),
            run: () => {
              void enqueue(() => obligationsApi.forgetPayment(paid.id)).catch(() => undefined);
              void update(paid, before);
            },
          });
        } catch (err) {
          notify(dataErrorMessage(err as DataError));
        }
      },
      duplicate: async (obligation) => {
        try {
          const base = listRef.current.find((o) => o.id === obligation.id) ?? obligation;
          const copy = await enqueue(() => obligationsApi.create(toObligationInput(base)));
          setAll((list) => [...list, copy]);
          recordUndo(tr("copie de l'obligation"), () => remove(copy));
          notify(tr("Obligation dupliquée."));
        } catch (err) {
          notify(dataErrorMessage(err as DataError));
        }
      },
      remove,
    };
  }, [obligations, loaded, custom, enqueue, setAll, replace, notify, reload]);

  return <ObligationsContext.Provider value={value}>{children}</ObligationsContext.Provider>;
}

export function useObligations(): ObligationsContextValue {
  const ctx = useContext(ObligationsContext);
  if (!ctx) throw new Error("useObligations doit être utilisé dans ObligationsProvider");
  return ctx;
}
