/** Budget : catégories, dépenses et revenus, dans la base chiffrée (src-tauri/src/data/budget.rs). */
import { invoke } from "@tauri-apps/api/core";
import { tr } from "../i18n/i18n";
import { asDataError } from "../lib/dataError";
import { demo } from "../lib/demo";
import { inTauri } from "../lib/windowControls";
import { addDays, dayKey } from "../tasks/day";
import { nextOccurrence, type BudgetCategory, type CategoryInput, type Transaction, type TransactionInput } from "./budget";
import type { SavingsEntry, SavingsEntryInput, SavingsGoal, SavingsGoalInput } from "./savings";

export interface BudgetApi {
  categories(): Promise<BudgetCategory[]>;
  createCategory(category: CategoryInput): Promise<BudgetCategory>;
  updateCategory(id: string, category: CategoryInput): Promise<BudgetCategory>;
  removeCategory(id: string): Promise<void>;
  /** Nouvel ordre (glisser-déposer). */
  reorderCategories(ids: string[]): Promise<void>;
  list(): Promise<Transaction[]>;
  create(transaction: TransactionInput): Promise<Transaction>;
  update(id: string, transaction: TransactionInput): Promise<Transaction>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<Transaction>;
  /** Crée les échéances des opérations récurrentes arrivées jusqu'à `today`. */
  generate(today: string): Promise<Transaction[]>;
  savings(): Promise<SavingsGoal[]>;
  createSavings(goal: SavingsGoalInput): Promise<SavingsGoal>;
  updateSavings(id: string, goal: SavingsGoalInput): Promise<SavingsGoal>;
  removeSavings(id: string): Promise<void>;
  restoreSavings(id: string): Promise<SavingsGoal>;
  reorderSavings(ids: string[]): Promise<void>;
  savingsEntries(): Promise<SavingsEntry[]>;
  addSavingsEntry(goalId: string, entry: SavingsEntryInput): Promise<SavingsEntry>;
  removeSavingsEntry(id: string): Promise<void>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: BudgetApi = {
  categories: () => call("budget_categories_list"),
  createCategory: (category) => call("budget_categories_create", { category }),
  updateCategory: (id, category) => call("budget_categories_update", { id, category }),
  removeCategory: (id) => call("budget_categories_delete", { id }),
  reorderCategories: (ids) => call("order_save", { kind: "categories-budget", ids }),
  list: () => call("transactions_list"),
  create: (transaction) => call("transactions_create", { transaction }),
  update: (id, transaction) => call("transactions_update", { id, transaction }),
  remove: (id) => call("transactions_delete", { id }),
  restore: (id) => call("transactions_restore", { id }),
  generate: (today) => call("transactions_generate", { today }),
  savings: () => call("savings_list"),
  createSavings: (goal) => call("savings_create", { goal }),
  updateSavings: (id, goal) => call("savings_update", { id, goal }),
  removeSavings: (id) => call("savings_delete", { id }),
  restoreSavings: (id) => call("savings_restore", { id }),
  reorderSavings: (ids) => call("order_save", { kind: "epargne", ids }),
  savingsEntries: () => call("savings_entries_list"),
  addSavingsEntry: (goalId, entry) => call("savings_entries_create", { goalId, entry }),
  removeSavingsEntry: (id) => call("savings_entries_delete", { id }),
};

/** Budget d'exemple pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): BudgetApi {
  const now = () => Math.floor(Date.now() / 1000);
  const today = dayKey(new Date());
  let seq = 0;
  let categories: BudgetCategory[] = [
    ["cat-courses", tr("Courses|budget"), "depense", "#2fae4a", "panier", 40000],
    ["cat-logement", tr("Logement"), "depense", "#e0671f", "maison", null],
    ["cat-transports", tr("Transports"), "depense", "#2d6ff0", "voiture", 12000],
    ["cat-sante", tr("Santé"), "depense", "#e04848", "sante", null],
    ["cat-loisirs", tr("Loisirs"), "depense", "#7a5ce6", "musique", 8000],
    ["cat-restaurants", tr("Restaurants"), "depense", "#e89a1c", "cuisine", 6000],
    ["cat-divers", tr("Divers"), "depense", "#5a7d99", "etoile", null],
    ["cat-salaire", tr("Salaire"), "revenu", "#1f9a6e", "argent", null],
    ["cat-autres-revenus", tr("Autres revenus"), "revenu", "#16a3a3", "banque", null],
    ["cat-activite", tr("Activité indépendante"), "revenu", "#2d6ff0", "ordinateur", null],
    ["cat-aides", tr("Aides et allocations"), "revenu", "#7a5ce6", "famille", null],
    ["cat-remboursements", tr("Remboursements"), "revenu", "#0a9fd8", "facture", null],
    ["cat-ventes", tr("Ventes"), "revenu", "#e0671f", "panier", null],
    ["cat-cadeaux-recus", tr("Cadeaux reçus"), "revenu", "#d9567a", "cadeau", null],
    ["cat-placements", tr("Épargne et placements"), "revenu", "#2fae4a", "graphique", null],
  ].map(([id, name, kind, color, icon, monthlyCents], position) => ({ id, name, kind, color, icon, monthlyCents, position }) as BudgetCategory);
  const make = (input: TransactionInput, seriesId: string | null = null): Transaction => ({
    ...input,
    id: `apercu-op${++seq}`,
    createdAt: now(),
    updatedAt: now(),
    repeatNext: input.repeatMonths ? nextOccurrence(input.day, input.repeatMonths, input.day) : null,
    seriesId,
  });
  const op = (days: number, cents: number, label: string, categoryId: string, kind: "depense" | "revenu" = "depense", repeatMonths: number | null = null) =>
    make({ day: addDays(today, -days), amountCents: cents, kind, categoryId, label, notes: "", spaceId: null, repeatMonths, repeatUntil: null });
  let list: Transaction[] = [
    op(1, 4250, demo("Marché du samedi", "Saturday market"), "cat-courses"),
    op(3, 6890, demo("Supermarché", "Supermarket"), "cat-courses"),
    op(4, 2400, demo("Cinéma", "Cinema"), "cat-loisirs"),
    op(6, 5500, demo("Plein d'essence", "Fuel"), "cat-transports"),
    op(8, 3200, demo("Pizzeria", "Pizzeria"), "cat-restaurants"),
    op(10, 2500, demo("Pharmacie", "Pharmacy"), "cat-sante"),
    op(35, 9800, demo("Supermarché", "Supermarket"), "cat-courses"),
    op(40, 5200, demo("Plein d'essence", "Fuel"), "cat-transports"),
    op(62, 12000, demo("Courses du mois", "Monthly big shop"), "cat-courses"),
    // Opérations récurrentes : le salaire le 28, la salle de sport le 5.
    op(70, 245000, demo("Salaire", "Salary"), "cat-salaire", "revenu", 1),
    op(Number(today.slice(8, 10)) + 60, 3500, demo("Salle de sport", "Gym membership"), "cat-loisirs", "depense", 1),
  ];
  const generate = (day: string): Transaction[] => {
    const made: Transaction[] = [];
    list = list.map((t) => {
      if (!t.repeatMonths || !t.repeatNext) return t;
      let next = t.repeatNext;
      while (next <= day && (!t.repeatUntil || next <= t.repeatUntil)) {
        made.push(make({ ...t, day: next, repeatMonths: null, repeatUntil: null }, t.id));
        next = nextOccurrence(t.day, t.repeatMonths, next);
      }
      return { ...t, repeatNext: next };
    });
    list = [...made, ...list];
    return made;
  };
  const deleted = new Map<string, Transaction>();
  // Épargne d'exemple : un voyage daté, un coussin de sécurité sans date.
  let goals: SavingsGoal[] = [];
  let entries: SavingsEntry[] = [];
  const deletedGoals = new Map<string, SavingsGoal>();
  const saved = (id: string) => entries.filter((e) => e.goalId === id).reduce((s, e) => s + e.amountCents, 0);
  const withSaved = (g: SavingsGoal): SavingsGoal => ({ ...g, savedCents: saved(g.id) });
  const addGoal = (input: SavingsGoalInput): SavingsGoal => {
    const g: SavingsGoal = { ...input, id: `apercu-epargne${++seq}`, position: goals.length, createdAt: now(), updatedAt: now(), savedCents: 0 };
    goals = [...goals, g];
    return g;
  };
  const addEntry = (goalId: string, input: SavingsEntryInput): SavingsEntry => {
    const e: SavingsEntry = { ...input, id: `apercu-versement${++seq}`, goalId, createdAt: now() };
    entries = [e, ...entries];
    return e;
  };
  const trip = addGoal({ name: demo("Vacances au Japon", "Trip to Japan"), targetCents: 300_000, targetDate: `${Number(today.slice(0, 4)) + 1}-07-01`, color: "#e0508a", icon: "avion", spaceId: null });
  const cushion = addGoal({ name: demo("Coussin de sécurité", "Emergency fund"), targetCents: 500_000, targetDate: null, color: "#2fae4a", icon: "tirelire", spaceId: null });
  addEntry(trip.id, { day: addDays(today, -60), amountCents: 50_000, note: demo("Prime", "Bonus") });
  addEntry(trip.id, { day: addDays(today, -30), amountCents: 40_000, note: "" });
  addEntry(trip.id, { day: addDays(today, -2), amountCents: 25_000, note: "" });
  addEntry(cushion.id, { day: addDays(today, -90), amountCents: 240_000, note: "" });
  return {
    savings: async () => goals.map(withSaved),
    createSavings: async (input) => withSaved(addGoal(input)),
    updateSavings: async (id, input) => {
      const g = { ...goals.find((x) => x.id === id)!, ...input, updatedAt: now() };
      goals = goals.map((x) => (x.id === id ? g : x));
      return withSaved(g);
    },
    removeSavings: async (id) => {
      const g = goals.find((x) => x.id === id);
      if (!g) throw asDataError({ code: "notFound" });
      deletedGoals.set(id, g);
      goals = goals.filter((x) => x.id !== id);
    },
    restoreSavings: async (id) => {
      const g = deletedGoals.get(id);
      if (!g) throw asDataError({ code: "notFound" });
      goals = [...goals, g].sort((a, b) => a.position - b.position);
      return withSaved(g);
    },
    reorderSavings: async (ids) => {
      goals = goals.map((x) => (ids.includes(x.id) ? { ...x, position: ids.indexOf(x.id) } : x)).sort((a, b) => a.position - b.position);
    },
    savingsEntries: async () => entries.filter((e) => goals.some((g) => g.id === e.goalId)),
    addSavingsEntry: async (goalId, input) => addEntry(goalId, input),
    removeSavingsEntry: async (id) => {
      entries = entries.filter((e) => e.id !== id);
    },
    categories: async () => categories,
    createCategory: async (input) => {
      const c = { ...input, id: `apercu-cat${++seq}`, position: categories.length };
      categories = [...categories, c];
      return c;
    },
    updateCategory: async (id, input) => {
      const c = { ...categories.find((x) => x.id === id)!, ...input };
      categories = categories.map((x) => (x.id === id ? c : x));
      return c;
    },
    reorderCategories: async (ids) => {
      categories = categories.map((x) => (ids.includes(x.id) ? { ...x, position: ids.indexOf(x.id) } : x)).sort((a, b) => a.position - b.position);
    },
    removeCategory: async (id) => {
      categories = categories.filter((c) => c.id !== id);
      list = list.map((t) => (t.categoryId === id ? { ...t, categoryId: null } : t));
    },
    list: async () => list,
    create: async (input) => {
      const t = make(input);
      list = [t, ...list];
      return t;
    },
    update: async (id, input) => {
      const before = list.find((x) => x.id === id)!;
      const repeatNext =
        input.repeatMonths === before.repeatMonths && input.day === before.day ? before.repeatNext : input.repeatMonths ? nextOccurrence(input.day, input.repeatMonths, input.day) : null;
      const t = { ...before, ...input, repeatNext, updatedAt: now() };
      list = list.map((x) => (x.id === id ? t : x));
      return t;
    },
    remove: async (id) => {
      const t = list.find((x) => x.id === id);
      if (!t) throw asDataError({ code: "notFound" });
      deleted.set(id, t);
      list = list.filter((x) => x.id !== id);
    },
    restore: async (id) => {
      const t = deleted.get(id);
      if (!t) throw asDataError({ code: "notFound" });
      list = [t, ...list];
      return t;
    },
    generate: async (day) => generate(day),
  };
}

/** Enregistre un tableau d'opérations (.csv) dans un fichier choisi ; chemin, ou `null` si annulé. */
export async function exportBudgetCsv(name: string, content: string): Promise<string | null> {
  if (!inTauri && import.meta.env.DEV) return `C:\\Users\\…\\Documents\\${name}.csv`;
  try {
    return await invoke<string | null>("export_file", { name, format: "csv", content });
  } catch (e) {
    throw asDataError(e);
  }
}

export const budgetApi: BudgetApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
