/**
 * Obligations côté interface (src-tauri/src/data/obligations.rs) : catégories, périodicités,
 * montants, sections de la liste, échéances à venir et total des abonnements. Fonctions pures.
 */
import { ICONS } from "../components/icons";
import { symbolOf, symbolPath } from "../components/symbols";
import { addDays, daysBetween, formatShortDay, makeDay, type DayKey } from "../tasks/day";
import { locale, tr, trn } from "../i18n/i18n";

export const CATEGORY_IDS = [
  "impots",
  "factures",
  "abonnements",
  "assurances",
  "contrats",
  "garanties",
  "identite",
  "sante",
  "vehicule",
  "logement",
] as const;
export type ObligationCategory = (typeof CATEGORY_IDS)[number];

export type ObligationStatus = "a-faire" | "paye" | "resilie";

export interface Obligation {
  id: string;
  title: string;
  category: ObligationCategory;
  organization: string;
  reference: string;
  amountCents: number | null;
  /** Tous les combien de mois ; ponctuelle si `null`. */
  periodMonths: number | null;
  dueDate: DayKey;
  /** Jour du mois des échéances (le dernier jour si le mois est plus court). */
  anchorDay: number;
  /** Date limite de résiliation (reconduction tacite). */
  cancelBy: DayKey | null;
  status: ObligationStatus;
  spaceId: string | null;
  /** Couleur choisie, sinon celle de la catégorie. */
  color: string | null;
  notes: string;
  lastPaidOn: DayKey | null;
  createdAt: number;
  updatedAt: number;
  /** Prélèvement automatique : payée d'elle-même à son échéance. */
  autoPay: boolean;
}

/** Paiement enregistré (historique). */
export interface Payment {
  id: number;
  obligationId: string;
  /** Échéance réglée. */
  dueDate: DayKey;
  paidOn: DayKey;
  amountCents: number | null;
  /** Prélèvement automatique. */
  auto: boolean;
}

/** Total payé sur l'année `year` (« AAAA »). */
export function paidInYear(payments: readonly Payment[], year: string): number {
  return payments.filter((p) => p.paidOn.startsWith(year)).reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
}

export type ObligationInput = Omit<Obligation, "id" | "anchorDay" | "lastPaidOn" | "createdAt" | "updatedAt">;

export function toObligationInput(o: Obligation): ObligationInput {
  const { id: _id, anchorDay: _a, lastPaidOn: _l, createdAt: _c, updatedAt: _u, ...input } = o;
  return input;
}

export interface CategoryDef {
  id: ObligationCategory;
  label: string;
  /** Couleur par défaut des obligations de la catégorie (palette de src/tasks/colors.ts). */
  color: string;
  /** Symbole (src/components/symbols.ts). */
  symbol: string;
  /** Dessin du symbole. */
  icon: string;
}

const category = (id: ObligationCategory, label: string, color: string, symbol: string): CategoryDef => ({
  id,
  label,
  color,
  symbol,
  icon: symbolPath(symbol, ICONS.notes),
});

export const CATEGORIES: readonly CategoryDef[] = [
  category("impots", tr("Impôts et déclarations"), "#4f5bd5", "banque"),
  category("factures", tr("Factures"), "#e89a1c", "facture"),
  category("abonnements", tr("Abonnements"), "#7a5ce6", "repetition"),
  category("assurances", tr("Assurances"), "#2d6ff0", "bouclier"),
  category("contrats", tr("Contrats"), "#64788c", "contrat"),
  category("garanties", tr("Garanties"), "#16a3a3", "garantie"),
  category("identite", tr("Papiers d'identité"), "#c2479a", "carte"),
  category("sante", tr("Santé"), "#e0508a", "coeur"),
  category("vehicule", tr("Véhicule"), "#e0671f", "voiture"),
  category("logement", tr("Logement"), "#2fae4a", "maison"),
];

/** Catégorie d'une obligation (la première si l'identifiant est inconnu). */
export function categoryOf(id: ObligationCategory, categories: readonly CategoryDef[] = CATEGORIES): CategoryDef {
  return categories.find((c) => c.id === id) ?? categories[0]!;
}

/** Nom, couleur et symbole choisis par la personne ; `null` : ceux d'origine. */
export interface CategoryCustom {
  id: ObligationCategory;
  label: string | null;
  color: string | null;
  icon: string | null;
}

/** Catégories à afficher : celles d'origine, avec les noms, couleurs et symboles choisis. */
export function mergeCategories(custom: readonly CategoryCustom[]): CategoryDef[] {
  return CATEGORIES.map((c) => {
    const mine = custom.find((x) => x.id === c.id);
    const symbol = mine?.icon && symbolOf(mine.icon) ? mine.icon : c.symbol;
    return { ...c, label: mine?.label || c.label, color: mine?.color || c.color, symbol, icon: symbolPath(symbol, c.icon) };
  });
}

export const PERIODS: readonly { value: number | null; label: string }[] = [
  { value: null, label: tr("Ponctuelle") },
  { value: 1, label: tr("Mensuelle") },
  { value: 2, label: tr("Bimestrielle") },
  { value: 3, label: tr("Trimestrielle") },
  { value: 6, label: tr("Semestrielle") },
  { value: 12, label: tr("Annuelle") },
];

export const STATUS_LABELS: Record<ObligationStatus, string> = { "a-faire": tr("À payer"), paye: tr("Payée"), resilie: tr("Résiliée") };

const EURO = new Intl.NumberFormat(locale(), { style: "currency", currency: "EUR" });

/** « 45,90 € ». */
export function formatAmount(cents: number): string {
  return EURO.format(cents / 100);
}

/** Montant saisi (« 45,9 », « 1 234,50 € », « 12.5 ») en centimes ; `null` si vide, `NaN` s'il est illisible. */
export function parseAmount(text: string): number | null {
  const clean = text.replace(/[\s  €]/g, "").replace(",", ".");
  if (clean === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return Number.NaN;
  return Math.round(Number(clean) * 100);
}

/** Échéance `months` mois plus tard, au jour `anchor` (comme le cœur). */
export function addMonthsAnchored(day: DayKey, months: number, anchor: number): DayKey {
  const index = Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1 + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(year, month, 0).getDate();
  return makeDay(year, month, Math.min(anchor, last))!;
}

/** Échéances de `from` à `to` : l'échéance en cours, puis les suivantes d'une obligation périodique. */
export function dueDatesBetween(o: Pick<Obligation, "dueDate" | "periodMonths" | "anchorDay">, from: DayKey, to: DayKey): DayKey[] {
  const dates: DayKey[] = [];
  let day = o.dueDate;
  for (let i = 0; i < 400 && day <= to; i++) {
    if (day >= from) dates.push(day);
    if (o.periodMonths === null) break;
    day = addMonthsAnchored(o.dueDate, o.periodMonths * (i + 1), o.anchorDay);
  }
  return dates;
}

/** Montant ramené au mois (obligation périodique en cours), sinon 0. */
export function monthlyAmount(o: Pick<Obligation, "amountCents" | "periodMonths" | "status">): number {
  if (o.status === "resilie" || o.periodMonths === null || o.amountCents === null) return 0;
  return o.amountCents / o.periodMonths;
}

/** Total mensuel des abonnements en cours, en centimes. */
export function subscriptionsPerMonth(list: readonly Obligation[]): number {
  return Math.round(list.filter((o) => o.category === "abonnements").reduce((sum, o) => sum + monthlyAmount(o), 0));
}

/** Total annuel des abonnements en cours, en centimes. */
export function subscriptionsPerYear(list: readonly Obligation[]): number {
  return Math.round(list.filter((o) => o.category === "abonnements").reduce((sum, o) => sum + monthlyAmount(o) * 12, 0));
}

export type SectionId = "retard" | "bientot" | "plus-tard" | "payees" | "resiliees";

export interface ObligationSection {
  id: SectionId;
  title: string;
  obligations: Obligation[];
}

const byDue = (a: Obligation, b: Obligation) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.title.localeCompare(b.title, "fr"));

/** Sections de la liste : en retard, 30 prochains jours, plus tard, payées, résiliées (non vides). */
export function sectionsOf(list: readonly Obligation[], today: DayKey): ObligationSection[] {
  const soon = addDays(today, 30);
  const open = list.filter((o) => o.status === "a-faire");
  const sections: ObligationSection[] = [
    { id: "retard", title: tr("En retard"), obligations: open.filter((o) => o.dueDate < today) },
    { id: "bientot", title: tr("30 prochains jours"), obligations: open.filter((o) => o.dueDate >= today && o.dueDate <= soon) },
    { id: "plus-tard", title: tr("Plus tard"), obligations: open.filter((o) => o.dueDate > soon) },
    { id: "payees", title: tr("Payées"), obligations: list.filter((o) => o.status === "paye") },
    { id: "resiliees", title: tr("Résiliées"), obligations: list.filter((o) => o.status === "resilie") },
  ];
  return sections.filter((s) => s.obligations.length > 0).map((s) => ({ ...s, obligations: [...s.obligations].sort(byDue) }));
}

/** « Aujourd'hui », « Demain », « Dans 5 jours », « En retard de 3 jours », sinon « ven. 2 oct. ». */
export function dueLabel(day: DayKey, today: DayKey): string {
  const diff = daysBetween(today, day);
  if (diff < 0) return trn(-diff, "En retard de {n} jour", "En retard de {n} jours");
  if (diff === 0) return tr("Aujourd'hui");
  if (diff === 1) return tr("Demain");
  if (diff <= 30) return tr("Dans {n} jours", { n: diff });
  return formatShortDay(day, today);
}

/** Date limite de résiliation proche (60 jours) d'une obligation à payer. */
export function cancelSoon(o: Pick<Obligation, "cancelBy" | "status">, today: DayKey): boolean {
  return o.status === "a-faire" && o.cancelBy !== null && o.cancelBy >= today && daysBetween(today, o.cancelBy) <= 60;
}
