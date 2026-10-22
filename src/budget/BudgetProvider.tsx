import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { onDataAdded } from "../app/background";
import { useToast } from "../app/ToastProvider";
import { recordUndo } from "../app/undo";
import { mergeOrder } from "../lib/dragDrop";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { useNow } from "../lib/useNow";
import { dayKey } from "../tasks/day";
import { useSpaces } from "../spaces/SpacesProvider";
import { budgetApi } from "./api";
import { toTransactionInput, type BudgetCategory, type CategoryInput, type Transaction, type TransactionInput } from "./budget";
import { tr } from "../i18n/i18n";

interface BudgetContextValue {
  categories: readonly BudgetCategory[];
  /** Toutes les opérations, de la plus récente à la plus ancienne. */
  transactions: readonly Transaction[];
  /** Opérations de l'espace choisi dans la barre de titre. */
  visible: readonly Transaction[];
  loaded: boolean;
  create: (input: TransactionInput) => Promise<Transaction | null>;
  update: (t: Transaction, changes: Partial<TransactionInput>) => Promise<void>;
  /** Met l'opération à la corbeille, avec « Annuler ». */
  remove: (t: Transaction) => Promise<void>;
  createCategory: (input: CategoryInput) => Promise<BudgetCategory | null>;
  updateCategory: (c: BudgetCategory, input: CategoryInput) => Promise<void>;
  /** Retire la catégorie ; ses opérations restent, sans catégorie (« Annuler » la rétablit). */
  removeCategory: (c: BudgetCategory) => Promise<void>;
  /** Nouvel ordre d'une partie (glisser-déposer) ; les autres gardent leur place. Ctrl+Z le défait. */
  reorderCategories: (ids: string[]) => Promise<void>;
}

const BudgetContext = createContext<BudgetContextValue | null>(null);

const byDay = (a: Transaction, b: Transaction) => b.day.localeCompare(a.day) || b.createdAt - a.createdAt;

export function BudgetProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const notify = useToast();
  const { filter } = useSpaces();
  const today = dayKey(useNow());

  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const reload = useCallback(async () => {
    const [cats, list] = await enqueue(() => Promise.all([budgetApi.categories(), budgetApi.list()]));
    setCategories([...cats].sort((a, b) => a.position - b.position));
    setTransactions([...list].sort(byDay));
  }, [enqueue]);

  useEffect(() => {
    reload()
      .catch((err: DataError) => notify(dataErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [reload, notify]);
  // Échéances à rattraper : au chargement, chaque jour, et après un ajout ou un import d'opération récurrente.
  const [dueCheck, recheckDue] = useReducer((n: number) => n + 1, 0);
  useEffect(
    () =>
      onDataAdded("transaction", () => {
        reload()
          .then(recheckDue)
          .catch(() => undefined);
      }),
    [reload],
  );

  // Échéances des opérations récurrentes arrivées : créées au chargement, puis chaque jour.
  useEffect(() => {
    if (!loaded) return;
    enqueue(() => budgetApi.generate(today))
      .then((made) => {
        if (made.length > 0) void reload().catch(() => undefined);
      })
      .catch(() => undefined);
  }, [loaded, today, dueCheck, enqueue, reload]);

  const ref = useRef(transactions);
  ref.current = transactions;

  const value = useMemo<BudgetContextValue>(() => {
    const fail = (err: unknown) => notify(dataErrorMessage(err as DataError));
    const put = (t: Transaction) => setTransactions((list) => (list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t]).sort(byDay));
    const remove = async (t: Transaction) => {
      try {
        await enqueue(() => budgetApi.remove(t.id));
      } catch (err) {
        fail(err);
        return;
      }
      setTransactions((list) => list.filter((x) => x.id !== t.id));
      notify(t.kind === "revenu" ? tr("Revenu supprimé.") : tr("Dépense supprimée."), {
        label: tr("Annuler|action"),
        undo: t.kind === "revenu" ? tr("suppression du revenu") : tr("suppression de la dépense"),
        run: () => {
          enqueue(() => budgetApi.restore(t.id))
            .then(put)
            .catch(fail);
        },
      });
    };
    const update = async (t: Transaction, changes: Partial<TransactionInput>) => {
      const base = ref.current.find((x) => x.id === t.id) ?? t;
      recordUndo(tr("modification de l'opération"), () => update(base, toTransactionInput(base)), `transaction:${base.id}`);
      put({ ...base, ...changes });
      try {
        const saved = await enqueue(() => budgetApi.update(base.id, { ...toTransactionInput(base), ...changes }));
        put(saved);
        if (saved.repeatMonths && (changes.repeatMonths !== undefined || changes.day !== undefined || changes.repeatUntil !== undefined)) recheckDue();
      } catch (err) {
        fail(err);
        await reload().catch(() => undefined);
      }
    };
    const removeCategory = async (c: BudgetCategory) => {
      const members = ref.current.filter((t) => t.categoryId === c.id);
      try {
        await enqueue(() => budgetApi.removeCategory(c.id));
      } catch (err) {
        fail(err);
        return;
      }
      setCategories((list) => list.filter((x) => x.id !== c.id));
      setTransactions((list) => list.map((t) => (t.categoryId === c.id ? { ...t, categoryId: null } : t)));
      notify(tr("Catégorie supprimée."), {
        label: tr("Annuler|action"),
        undo: tr("suppression de la catégorie"),
        run: () => {
          void (async () => {
            const again = await enqueue(() => budgetApi.createCategory({ name: c.name, kind: c.kind, color: c.color, icon: c.icon, monthlyCents: c.monthlyCents }));
            for (const t of members) await enqueue(() => budgetApi.update(t.id, { ...toTransactionInput(t), categoryId: again.id }));
            await reload();
          })().catch(fail);
        },
      });
    };
    return {
      reorderCategories: async (part: string[]) => {
        const before = categories.map((x) => x.id);
        const ids = mergeOrder(before, part);
        if (ids.join() === before.join()) return;
        const apply = async (order: string[]) => {
          setCategories((list) => [...list].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map((x, position) => ({ ...x, position })));
          await enqueue(() => budgetApi.reorderCategories(order));
        };
        try {
          await apply(ids);
          recordUndo(tr("déplacement de la catégorie"), () => apply(before));
        } catch (err) {
          fail(err);
        }
      },
      categories,
      transactions,
      visible: filter === "tous" ? transactions : transactions.filter((t) => t.spaceId === filter || t.spaceId === null),
      loaded,
      create: async (input) => {
        try {
          const t = await enqueue(() => budgetApi.create(input));
          put(t);
          recordUndo(t.kind === "revenu" ? tr("ajout du revenu") : tr("ajout de la dépense"), async () => {
            // Les échéances déjà créées par la répétition partent avec l'opération.
            const copies = ref.current.filter((x) => x.seriesId === t.id);
            for (const c of copies) await enqueue(() => budgetApi.remove(c.id)).catch(() => undefined);
            setTransactions((list) => list.filter((x) => x.seriesId !== t.id));
            await remove(t);
          });
          if (t.repeatMonths) recheckDue();
          return t;
        } catch (err) {
          fail(err);
          return null;
        }
      },
      update,
      remove,
      createCategory: async (input) => {
        try {
          const c = await enqueue(() => budgetApi.createCategory(input));
          setCategories((list) => [...list, c]);
          recordUndo(tr("ajout de la catégorie"), () => removeCategory(c));
          return c;
        } catch (err) {
          fail(err);
          return null;
        }
      },
      updateCategory: async (c, input) => {
        try {
          const next = await enqueue(() => budgetApi.updateCategory(c.id, input));
          setCategories((list) => list.map((x) => (x.id === c.id ? next : x)));
          recordUndo(tr("modification de la catégorie"), () =>
            enqueue(() => budgetApi.updateCategory(c.id, { name: c.name, kind: c.kind, color: c.color, icon: c.icon, monthlyCents: c.monthlyCents })).then((back) =>
              setCategories((list) => list.map((x) => (x.id === c.id ? back : x))),
            ),
          );
        } catch (err) {
          fail(err);
        }
      },
      removeCategory,
    };
  }, [categories, transactions, loaded, filter, enqueue, notify, reload]);

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
}

export function useBudgetIfAny(): BudgetContextValue | null {
  return useContext(BudgetContext);
}

export function useBudget(): BudgetContextValue {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error("useBudget doit être utilisé dans BudgetProvider");
  return ctx;
}
