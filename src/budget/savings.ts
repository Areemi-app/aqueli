/**
 * Objectifs d'épargne du Budget (src-tauri/src/data/savings.rs) : avancement, et ce qu'il reste à
 * mettre de côté chaque mois pour tenir la date. Fonctions pures.
 */
import { makeDay, type DayKey } from "../tasks/day";

export interface SavingsGoal {
  id: string;
  name: string;
  targetCents: number;
  targetDate: DayKey | null;
  color: string | null;
  icon: string;
  spaceId: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
  /** Somme des versements (retraits déduits), en centimes. */
  savedCents: number;
}

export type SavingsGoalInput = Pick<SavingsGoal, "name" | "targetCents" | "targetDate" | "color" | "icon" | "spaceId">;

export interface SavingsEntry {
  id: string;
  goalId: string;
  day: DayKey;
  /** Versement (positif) ou retrait (négatif), en centimes. */
  amountCents: number;
  note: string;
  createdAt: number;
}

export type SavingsEntryInput = Pick<SavingsEntry, "day" | "amountCents" | "note">;

export const toSavingsInput = (g: SavingsGoal): SavingsGoalInput => ({
  name: g.name,
  targetCents: g.targetCents,
  targetDate: g.targetDate,
  color: g.color,
  icon: g.icon,
  spaceId: g.spaceId,
});

/** Part atteinte, entre 0 et 1. */
export const savingsProgress = (g: Pick<SavingsGoal, "savedCents" | "targetCents">): number =>
  g.targetCents > 0 ? Math.max(0, Math.min(1, g.savedCents / g.targetCents)) : 0;

/** Mois entiers ou commencés entre aujourd'hui et la date visée (le mois en cours compte). */
export function monthsLeft(today: DayKey, target: DayKey): number {
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  const [y, m, d] = target.split("-").map(Number) as [number, number, number];
  const months = (y - ty) * 12 + (m - tm) + (d >= td ? 1 : 0);
  return Math.max(0, months);
}

export type SavingsStatus =
  | { kind: "atteint" }
  /** Date dépassée sans avoir atteint le montant. */
  | { kind: "depasse"; remainingCents: number }
  /** À mettre de côté chaque mois pour tenir la date. */
  | { kind: "mensuel"; perMonthCents: number; remainingCents: number }
  /** Sans date : reste seulement à réunir. */
  | { kind: "libre"; remainingCents: number };

export function savingsStatus(g: SavingsGoal, today: DayKey): SavingsStatus {
  const remainingCents = Math.max(0, g.targetCents - g.savedCents);
  if (remainingCents === 0) return { kind: "atteint" };
  if (!g.targetDate) return { kind: "libre", remainingCents };
  if (g.targetDate < today) return { kind: "depasse", remainingCents };
  const months = Math.max(1, monthsLeft(today, g.targetDate));
  return { kind: "mensuel", perMonthCents: Math.ceil(remainingCents / months), remainingCents };
}

/** Date valide ou rien (champ « Date visée » laissé vide). */
export const cleanTargetDate = (value: string): DayKey | null => {
  const [y, m, d] = value.split("-").map(Number);
  return y && m && d ? makeDay(y, m, d) : null;
};
