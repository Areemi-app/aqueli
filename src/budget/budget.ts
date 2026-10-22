/**
 * Budget (cahier des charges § 4.15) côté interface : mois, totaux par catégorie, budget du mois,
 * obligations (abonnements, factures) du mois reprises automatiquement, opérations récurrentes
 * (échéances à venir), charges fixes, reste par jour, recherche, historique. Fonctions pures ;
 * les données sont vérifiées par le cœur (src-tauri/src/data/budget.rs).
 */
import { fold } from "../lib/fold";
import type { Obligation } from "../obligations/obligations";
import { addMonthsAnchored } from "../obligations/obligations";
import { fromDayKey, makeDay, type DayKey } from "../tasks/day";
import { locale, tr } from "../i18n/i18n";

export type TransactionKind = "depense" | "revenu";

export interface BudgetCategory {
  id: string;
  name: string;
  kind: TransactionKind;
  color: string | null;
  icon: string;
  /** Budget du mois, en centimes ; nul s'il n'y en a pas. */
  monthlyCents: number | null;
  position: number;
}

export type CategoryInput = Pick<BudgetCategory, "name" | "kind" | "color" | "icon" | "monthlyCents">;

export interface Transaction {
  id: string;
  day: DayKey;
  /** Montant positif, en centimes. */
  amountCents: number;
  kind: TransactionKind;
  categoryId: string | null;
  label: string;
  notes: string;
  spaceId: string | null;
  createdAt: number;
  updatedAt: number;
  /** Répétition : tous les N mois (opération d'origine d'une série). */
  repeatMonths: number | null;
  /** Dernière date possible d'une échéance (comprise). */
  repeatUntil: DayKey | null;
  /** Prochaine échéance, créée par le cœur le jour venu. */
  repeatNext: DayKey | null;
  /** Opération d'origine, pour une échéance créée par la répétition. */
  seriesId: string | null;
}

export type TransactionInput = Pick<Transaction, "day" | "amountCents" | "kind" | "categoryId" | "label" | "notes" | "spaceId" | "repeatMonths" | "repeatUntil">;

export function toTransactionInput(t: Transaction): TransactionInput {
  const { day, amountCents, kind, categoryId, label, notes, spaceId, repeatMonths, repeatUntil } = t;
  return { day, amountCents, kind, categoryId, label, notes, spaceId, repeatMonths, repeatUntil };
}

/** Répétitions proposées (les mêmes que celles des obligations). */
export const REPEAT_CHOICES: readonly { value: number | null; label: string }[] = [
  { value: null, label: tr("Une seule fois") },
  { value: 1, label: tr("Chaque mois") },
  { value: 2, label: tr("Tous les 2 mois") },
  { value: 3, label: tr("Tous les 3 mois") },
  { value: 6, label: tr("Tous les 6 mois") },
  { value: 12, label: tr("Chaque année") },
];

export function repeatLabel(months: number | null): string {
  return REPEAT_CHOICES.find((c) => c.value === months)?.label ?? tr("Tous les {months} mois", { months });
}

/** Opération répétée, ou échéance d'une répétition. */
export const isRecurring = (t: Pick<Transaction, "repeatMonths" | "seriesId">) => t.repeatMonths !== null || t.seriesId !== null;

/** `months` mois après `start`, le même jour du mois (le dernier si le mois est plus court). */
export function addMonthsDay(start: DayKey, months: number): DayKey {
  const index = Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7)) - 1 + months;
  const year = Math.floor(index / 12);
  const month = (((index % 12) + 12) % 12) + 1;
  const last = new Date(year, month, 0).getDate();
  return makeDay(year, month, Math.min(Number(start.slice(8, 10)), last))!;
}

/** Échéance qui suit `after` dans une série commencée le `start`, tous les `period` mois. */
export function nextOccurrence(start: DayKey, period: number, after: DayKey): DayKey {
  const elapsed = (Number(after.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(after.slice(5, 7)) - Number(start.slice(5, 7));
  let k = Math.max(0, Math.floor(elapsed / period)) + 1;
  let next = addMonthsDay(start, k * period);
  while (next <= after) next = addMonthsDay(start, ++k * period);
  return next;
}

/** Échéance à venir d'une opération récurrente (pas encore créée). */
export interface ScheduledOccurrence {
  source: Transaction;
  day: DayKey;
}

/** Échéances à venir du mois : celles que le cœur créera le jour venu. */
export function scheduledIn(transactions: readonly Transaction[], month: MonthKey): ScheduledOccurrence[] {
  const [from, to] = monthBounds(month);
  const out: ScheduledOccurrence[] = [];
  for (const t of transactions) {
    if (!t.repeatMonths || !t.repeatNext) continue;
    let day = t.repeatNext;
    for (let guard = 0; guard < 600 && day <= to && (!t.repeatUntil || day <= t.repeatUntil); guard++) {
      if (day >= from) out.push({ source: t, day });
      day = nextOccurrence(t.day, t.repeatMonths, day);
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/** Opérations dont le libellé, les notes, la catégorie ou le montant correspondent, des plus récentes aux plus anciennes. */
export function searchTransactions(transactions: readonly Transaction[], query: string, categories: readonly Pick<BudgetCategory, "id" | "name">[]): Transaction[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const names = new Map(categories.map((c) => [c.id, c.name]));
  return transactions
    .filter((t) => {
      const amount = (t.amountCents / 100).toFixed(2);
      const text = fold(`${t.label} ${t.notes} ${t.categoryId ? (names.get(t.categoryId) ?? "") : ""} ${amount} ${amount.replace(".", ",")}`);
      return words.every((w) => text.includes(w));
    })
    .sort((a, b) => b.day.localeCompare(a.day) || b.createdAt - a.createdAt);
}

/** Reste par jour jusqu'à la fin du mois (aujourd'hui compris), pour le mois en cours seulement. */
export function perDayLeft(balance: number, today: DayKey, month: MonthKey): number | null {
  if (today.slice(0, 7) !== month || balance <= 0) return null;
  const [, last] = monthBounds(month);
  const days = Math.round((fromDayKey(last).getTime() - fromDayKey(today).getTime()) / 86_400_000) + 1;
  return Math.floor(balance / Math.max(1, days));
}

/** Mois « AAAA-MM ». */
export type MonthKey = string;

export const monthOf = (day: DayKey): MonthKey => day.slice(0, 7);

export function shiftMonth(month: MonthKey, by: number): MonthKey {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Premier et dernier jour du mois. */
export function monthBounds(month: MonthKey): [DayKey, DayKey] {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return [makeDay(year, m, 1)!, makeDay(year, m, new Date(year, m, 0).getDate())!];
}

const MONTH = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" });
const SHORT_MONTH = new Intl.DateTimeFormat(locale(), { month: "short" });

/** « Octobre 2026 ». */
export function monthLabel(month: MonthKey): string {
  const text = MONTH.format(new Date(`${month}-15T12:00:00`));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** « oct. ». */
export const shortMonthLabel = (month: MonthKey) => SHORT_MONTH.format(new Date(`${month}-15T12:00:00`));

/** Obligation à payer dans le mois (abonnement, facture…), avec sa date. */
export interface PlannedPayment {
  obligation: Obligation;
  day: DayKey;
  amountCents: number;
}

/**
 * Échéances du mois des obligations chiffrées (Obligations › montant) : celles d'une obligation
 * ponctuelle à sa date, celles d'une obligation périodique tous les N mois, passées comme à venir.
 * Une obligation résiliée n'est plus comptée après sa date.
 */
export function plannedPayments(obligations: readonly Obligation[], month: MonthKey): PlannedPayment[] {
  const [from, to] = monthBounds(month);
  const out: PlannedPayment[] = [];
  for (const o of obligations) {
    if (o.amountCents === null) continue;
    if (o.periodMonths === null) {
      if (o.dueDate >= from && o.dueDate <= to) out.push({ obligation: o, day: o.dueDate, amountCents: o.amountCents });
      continue;
    }
    // Écart en mois entre l'échéance de référence et le mois demandé : une échéance tous les N mois.
    const gap = (Number(month.slice(0, 4)) - Number(o.dueDate.slice(0, 4))) * 12 + Number(month.slice(5, 7)) - Number(o.dueDate.slice(5, 7));
    if (((gap % o.periodMonths) + o.periodMonths) % o.periodMonths !== 0) continue;
    const day = addMonthsAnchored(o.dueDate, gap, o.anchorDay);
    if (o.status === "resilie" && day > o.dueDate) continue;
    out.push({ obligation: o, day, amountCents: o.amountCents });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

export interface MonthSummary {
  /** Dépenses saisies et échéances à venir des opérations récurrentes, en centimes. */
  spent: number;
  /** Obligations du mois. */
  planned: number;
  /** Revenus saisis et à venir. */
  income: number;
  /** Revenus à venir (opérations récurrentes pas encore arrivées). */
  upcomingIncome: number;
  /** Charges fixes : obligations et dépenses récurrentes. */
  fixed: number;
  /** Revenus moins dépenses et obligations. */
  balance: number;
  /** Dépenses par catégorie (« null » : sans catégorie). */
  byCategory: Map<string | null, number>;
}

export function summarize(transactions: readonly Transaction[], payments: readonly PlannedPayment[], month: MonthKey, scheduled: readonly ScheduledOccurrence[] = []): MonthSummary {
  const inMonth = transactions.filter((t) => monthOf(t.day) === month);
  const byCategory = new Map<string | null, number>();
  let spent = 0;
  let income = 0;
  let upcomingIncome = 0;
  let recurring = 0;
  const count = (t: Pick<Transaction, "kind" | "amountCents" | "categoryId">, repeats: boolean, upcoming: boolean) => {
    if (t.kind === "revenu") {
      income += t.amountCents;
      if (upcoming) upcomingIncome += t.amountCents;
      return;
    }
    spent += t.amountCents;
    if (repeats) recurring += t.amountCents;
    byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + t.amountCents);
  };
  for (const t of inMonth) count(t, isRecurring(t), false);
  for (const s of scheduled) if (monthOf(s.day) === month) count(s.source, true, true);
  const planned = payments.reduce((s, p) => s + p.amountCents, 0);
  return { spent, planned, income, upcomingIncome, fixed: planned + recurring, balance: income - spent - planned, byCategory };
}

/** Dépenses (saisies et obligations) des `count` derniers mois, du plus ancien au plus récent. */
export function history(transactions: readonly Transaction[], obligations: readonly Obligation[], month: MonthKey, count = 6): { month: MonthKey; spent: number; income: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const m = shiftMonth(month, i - count + 1);
    const s = summarize(transactions, plannedPayments(obligations, m), m, scheduledIn(transactions, m));
    return { month: m, spent: s.spent + s.planned, income: s.income };
  });
}

/** Part du budget consommée (0 à 1 et plus), ou nulle sans budget. */
export function budgetUse(category: Pick<BudgetCategory, "monthlyCents">, spent: number): number | null {
  return category.monthlyCents ? spent / category.monthlyCents : null;
}
