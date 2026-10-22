/** Liste imprimée (Ctrl+P) : par rayon ou section, cases à cocher, valeurs des colonnes, total. */
import type { PrintDoc } from "../print/print";
import { cellText, totalOf, type List, type ListItem } from "./lists";
import { tr, trn } from "../i18n/i18n";

export function listPrintDoc(list: List, groups: readonly { section: string | null; items: readonly ListItem[] }[], all: readonly ListItem[]): PrintDoc {
  const price = list.columns.find((c) => c.kind === "prix");
  const items = groups.flatMap((g) => g.items);
  const done = items.filter((i) => i.done).length;
  const total =
    price && all.some((i) => typeof i.cells[price.id] === "number")
      ? list.template === "courses"
        ? tr("Reste à acheter : {total}", { total: cellText("prix", totalOf(price, all, true)) })
        : tr("Total : {total}", { total: cellText("prix", totalOf(price, all, false)) })
      : null;
  const subtitle = [trn(items.length, "{n} élément", "{n} éléments"), done > 0 ? trn(done, "{n} fait", "{n} faits") : null, total]
    .filter(Boolean)
    .join(" · ");
  return {
    title: list.name,
    subtitle,
    empty: tr("Aucun élément."),
    sections: groups.map((g) => ({
      heading: list.sections.length > 0 || g.section ? (g.section ?? (list.template === "courses" ? tr("Sans rayon") : tr("Sans section"))) : undefined,
      rows: g.items.map((i) => ({
        text: i.title,
        checked: i.done,
        meta:
          list.columns
            .map((c) => (c.kind === "case" ? (i.cells[c.id] ? c.name : "") : cellText(c.kind, i.cells[c.id])))
            .filter(Boolean)
            .join(" · ") || undefined,
      })),
    })),
  };
}
