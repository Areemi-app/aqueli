/**
 * Impression et PDF (cahier des charges § 5 : « toute vue imprimable ou exportable en PDF ») :
 * l'écran affiché donne ce qu'il imprime avec `usePrint` ; Ctrl+P, la palette ou son menu
 * l'impriment. Le PDF s'obtient avec l'imprimante « Microsoft Print to PDF ».
 *
 * La feuille est construite à part, en clair quel que soit le thème, puis retirée après
 * l'impression (voir `.print-sheet`, version3.css). Seul le texte est repris (`textContent`).
 */
import { useEffect, useRef } from "react";
import { locale, tr } from "../i18n/i18n";

export interface PrintRow {
  text: string;
  /** Détails à droite : échéance, lieu, prix… */
  meta?: string;
  /** Case à cocher : cochée, vide, ou aucune (`undefined`). */
  checked?: boolean;
  /** Retrait (sous-tâche, élément d'un groupe). */
  indent?: boolean;
  tone?: "late";
}

export interface PrintSection {
  heading?: string;
  rows: PrintRow[];
}

export interface PrintDoc {
  title: string;
  /** Sous le titre : période, espace, filtre. */
  subtitle?: string;
  sections: PrintSection[];
  /** Phrase affichée si aucune section n'a de ligne. */
  empty: string;
}

const PRINTED = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long", year: "numeric" });

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Feuille d'impression d'un document (sans l'ajouter à la page). */
export function buildSheet(doc: PrintDoc, printedOn: Date = new Date()): HTMLElement {
  const sheet = el("section", "print-sheet view-print");
  sheet.setAttribute("aria-hidden", "true");
  const head = el("header", "view-print-head");
  head.append(el("h1", "view-print-title", doc.title));
  const sub = [doc.subtitle, tr("Imprimé le {date}", { date: PRINTED.format(printedOn) })].filter(Boolean).join(" · ");
  head.append(el("p", "view-print-sub", sub));
  sheet.append(head);
  const filled = doc.sections.filter((s) => s.rows.length > 0);
  if (filled.length === 0) {
    sheet.append(el("p", "view-print-empty", doc.empty));
    return sheet;
  }
  for (const section of filled) {
    const block = el("section", "view-print-section");
    if (section.heading) block.append(el("h2", "view-print-heading", section.heading));
    const list = el("ul", "view-print-rows");
    for (const row of section.rows) {
      const item = el("li", "view-print-row");
      if (row.indent) item.dataset.indent = "true";
      if (row.tone) item.dataset.tone = row.tone;
      if (row.checked !== undefined) {
        const box = el("span", "view-print-check", row.checked ? "✓" : "");
        if (row.checked) item.dataset.done = "true";
        item.append(box);
      }
      item.append(el("span", "view-print-text", row.text));
      if (row.meta) item.append(el("span", "view-print-meta", row.meta));
      list.append(item);
    }
    block.append(list);
    sheet.append(block);
  }
  return sheet;
}

/** Ajoute la feuille, ouvre l'impression de Windows, puis la retire. */
export function printDoc(doc: PrintDoc): void {
  document.querySelectorAll(".print-sheet.view-print, .print-sheet.note-print").forEach((n) => n.remove());
  const sheet = buildSheet(doc);
  document.body.append(sheet);
  window.addEventListener("afterprint", () => sheet.remove(), { once: true });
  window.print();
}

// ——— Ce que l'écran affiché imprime ———

type PrintAction = () => void;
/** Le plus récent d'abord : l'éditeur d'une note ouverte passe avant la liste des notes. */
const stack: { run: () => PrintAction | null }[] = [];

/**
 * L'écran (ou le panneau) affiché déclare son impression : `build` renvoie l'action, ou `null`
 * s'il n'y a rien à imprimer pour le moment.
 */
export function usePrint(build: () => PrintAction | null): void {
  const latest = useRef(build);
  latest.current = build;
  useEffect(() => {
    const entry = { run: () => latest.current() };
    stack.unshift(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, []);
}

/** Imprime la vue affichée ; faux si elle n'a rien à imprimer. */
export function runPrint(): boolean {
  for (const entry of stack) {
    const action = entry.run();
    if (action) {
      action();
      return true;
    }
  }
  return false;
}
