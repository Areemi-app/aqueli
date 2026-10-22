/**
 * Export des opérations du budget en tableau CSV (séparateur « ; », UTF-8 avec BOM pour Excel),
 * aux colonnes du modèle d'import « Dépenses » : le fichier se réimporte tel quel. Colonnes et
 * valeurs en français, ou en anglais dans toute autre langue ; l'import lit les deux. Fonctions pures.
 */
import { lang, trExport } from "../i18n/i18n";
import type { Space } from "../spaces/spaces";
import type { BudgetCategory, Transaction } from "./budget";

/** Colonnes du modèle d'import « Dépenses », puis l'identifiant (mise à jour à la réimportation). */
export const BUDGET_CSV_COLUMNS = ["Date", "Libellé", "Montant", "Catégorie", "Sens", "Débit", "Crédit", "Répétition", "Jusqu'au", "Espace", "Notes", "Identifiant"] as const;

const cell = (text: string) => (/[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
const frDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
// Hors du français, l'export est en anglais : l'import le relit dans les deux langues.
const en = () => lang() !== "fr";
const euros = (cents: number) => (en() ? (cents / 100).toFixed(2) : (cents / 100).toFixed(2).replace(".", ","));
/** Répétition telle que l'import la lit (« chaque mois », « tous les 3 mois », « chaque année »). */
const repeatText = (months: number) =>
  en()
    ? months === 1
      ? "every month"
      : months === 12
        ? "every year"
        : `every ${months} months`
    : months === 1
      ? "chaque mois"
      : months === 12
        ? "chaque année"
        : `tous les ${months} mois`;

export function toBudgetCsv(transactions: readonly Transaction[], categories: readonly Pick<BudgetCategory, "id" | "name">[], spaces: readonly Pick<Space, "id" | "name">[]): string {
  const rows = [...transactions]
    .sort((a, b) => a.day.localeCompare(b.day) || a.createdAt - b.createdAt)
    .map((t) =>
      [
        frDay(t.day),
        t.label,
        euros(t.amountCents),
        categories.find((c) => c.id === t.categoryId)?.name ?? "",
        t.kind === "revenu" ? (en() ? "income" : "revenu") : en() ? "expense" : "dépense",
        "",
        "",
        t.repeatMonths ? repeatText(t.repeatMonths) : "",
        t.repeatMonths && t.repeatUntil ? frDay(t.repeatUntil) : "",
        spaces.find((s) => s.id === t.spaceId)?.name ?? "",
        t.notes,
        t.id,
      ]
        .map(cell)
        .join(";"),
    );
  return `﻿${[BUDGET_CSV_COLUMNS.map((c) => trExport(c)).join(";"), ...rows].join("\r\n")}\r\n`;
}
