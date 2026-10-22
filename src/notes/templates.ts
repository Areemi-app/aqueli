/**
 * Modèles de notes (cahier des charges § 4.5) : compte rendu, liste de courses, fiche recette,
 * plan de projet. Variables remplacées à la création : {date} et {semaine}.
 */
import type { DocNode } from "./notes";
import { locale, tr } from "../i18n/i18n";

export interface BuiltinTemplate {
  id: string;
  name: string;
  /** Titre donné à la note. */
  title: string;
  doc: DocNode;
}

const text = (value: string): DocNode => ({ type: "text", text: value });
const p = (value = ""): DocNode => (value ? { type: "paragraph", content: [text(value)] } : { type: "paragraph" });
const h = (level: number, value: string): DocNode => ({ type: "heading", attrs: { level }, content: [text(value)] });
const bullets = (...items: string[]): DocNode => ({ type: "bulletList", content: items.map((i) => ({ type: "listItem", content: [p(i)] })) });
const numbered = (...items: string[]): DocNode => ({ type: "orderedList", attrs: { start: 1 }, content: items.map((i) => ({ type: "listItem", content: [p(i)] })) });
const tasks = (...items: string[]): DocNode => ({
  type: "taskList",
  content: items.map((i) => ({ type: "taskItem", attrs: { checked: false }, content: [p(i)] })),
});
const table = (header: string[], rows: number): DocNode => ({
  type: "table",
  content: [
    { type: "tableRow", content: header.map((c) => ({ type: "tableHeader", content: [p(c)] })) },
    ...Array.from({ length: rows }, () => ({ type: "tableRow", content: header.map(() => ({ type: "tableCell", content: [p()] })) })),
  ],
});

export const BUILTIN_TEMPLATES: readonly BuiltinTemplate[] = [
  {
    id: "compte-rendu",
    name: tr("Compte rendu"),
    title: tr("Compte rendu du {date}"),
    doc: {
      type: "doc",
      content: [
        h(2, tr("Participants")),
        bullets(""),
        h(2, tr("Ordre du jour")),
        numbered(""),
        h(2, tr("Décisions")),
        bullets(""),
        h(2, tr("Actions")),
        tasks(""),
      ],
    },
  },
  {
    id: "courses",
    name: tr("Liste de courses"),
    title: tr("Courses du {date}"),
    doc: {
      type: "doc",
      content: [h(3, tr("Fruits et légumes")), tasks(""), h(3, tr("Épicerie")), tasks(""), h(3, tr("Produits frais")), tasks(""), h(3, tr("Maison")), tasks("")],
    },
  },
  {
    id: "recette",
    name: tr("Fiche recette"),
    title: tr("Recette"),
    doc: {
      type: "doc",
      content: [
        p(tr("Pour 4 personnes · Préparation : · Cuisson : ")),
        h(2, tr("Ingrédients")),
        bullets(""),
        h(2, tr("Préparation")),
        numbered(""),
        h(2, tr("Remarques")),
        p(),
      ],
    },
  },
  {
    id: "projet",
    name: tr("Plan de projet"),
    title: tr("Projet"),
    doc: {
      type: "doc",
      content: [
        h(2, tr("Objectif")),
        p(),
        h(2, tr("Étapes")),
        tasks(""),
        h(2, tr("Échéances")),
        table([tr("Étape"), tr("Date")], 3),
        h(2, tr("Ressources")),
        bullets(""),
        h(2, tr("Risques")),
        bullets(""),
      ],
    },
  },
];

/** Semaine ISO 8601 (du lundi au dimanche). */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Remplace {date} (« 29 septembre 2026 ») et {semaine} (« semaine 40 »). */
export function fillVariables(value: string, date: Date): string {
  return value
    .replace(/\{date\}/g, date.toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" }))
    .replace(/\{semaine\}/g, tr("semaine {week}", { week: isoWeek(date) }));
}

/** Copie du document, variables remplacées. */
export function fillDoc(doc: DocNode, date: Date): DocNode {
  return {
    ...doc,
    ...(doc.text !== undefined ? { text: fillVariables(doc.text, date) } : {}),
    ...(doc.content ? { content: doc.content.map((c) => fillDoc(c, date)) } : {}),
  };
}
