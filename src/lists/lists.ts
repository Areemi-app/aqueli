/**
 * Listes (cahier des charges § 4.11) côté interface : modèles (courses par rayon, livres, films,
 * idées cadeaux, voyages, envies), colonnes, valeurs, regroupement par rayon. Fonctions pures ;
 * les données sont vérifiées par le cœur (src-tauri/src/data/lists.rs).
 */
import { fold } from "../lib/fold";
import { locale, tr } from "../i18n/i18n";

export type ColumnKind = "texte" | "note" | "date" | "case" | "lien" | "prix";
export type ListView = "liste" | "galerie";
export type TemplateId = "libre" | "courses" | "livres" | "films" | "cadeaux" | "voyages" | "envies";

export interface ListColumn {
  id: string;
  name: string;
  kind: ColumnKind;
}

export interface List {
  id: string;
  name: string;
  template: TemplateId;
  columns: ListColumn[];
  /** Rayons (courses) ou sections, dans l'ordre. */
  sections: string[];
  view: ListView;
  color: string | null;
  icon: string;
  spaceId: string | null;
  archived: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export type ListInput = Pick<List, "name" | "template" | "columns" | "sections" | "view" | "color" | "icon" | "spaceId">;

/** Valeur d'une colonne : texte, lien, date (« AAAA-MM-JJ »), note (1 à 5), prix (centimes), case. */
export type CellValue = string | number | boolean;

export interface ListItem {
  id: string;
  listId: string;
  title: string;
  section: string | null;
  cells: Record<string, CellValue>;
  done: boolean;
  /** Image réduite (« data:image/jpeg;base64,… »), pour la vue galerie. */
  image: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export type ListItemInput = Pick<ListItem, "title" | "section" | "cells" | "done" | "image">;

export const COLUMN_KINDS: readonly { id: ColumnKind; label: string }[] = [
  { id: "texte", label: tr("Texte") },
  { id: "note", label: tr("Note sur 5") },
  { id: "date", label: tr("Date") },
  { id: "case", label: tr("Case à cocher") },
  { id: "lien", label: tr("Lien") },
  { id: "prix", label: tr("Prix") },
];

export interface ListTemplate {
  id: TemplateId;
  label: string;
  description: string;
  icon: string;
  color: string;
  view: ListView;
  columns: ListColumn[];
  sections: string[];
  /** Exemples d'éléments, pour le libellé de la saisie rapide. */
  placeholder: string;
}

const col = (id: string, name: string, kind: ColumnKind): ListColumn => ({ id, name, kind });

/** Modèles de listes (cahier des charges § 4.11). */
export const LIST_TEMPLATES: readonly ListTemplate[] = [
  {
    id: "courses",
    label: tr("Courses"),
    description: tr("Par rayon, avec quantités et prix."),
    icon: "panier",
    color: "#2fae4a",
    view: "liste",
    columns: [col("quantite", tr("Quantité"), "texte"), col("prix", tr("Prix"), "prix")],
    sections: [tr("Fruits et légumes"), tr("Frais"), tr("Boulangerie"), tr("Épicerie"), tr("Surgelés"), tr("Boissons"), tr("Hygiène"), tr("Maison")],
    placeholder: tr("Pommes, lait, pain…"),
  },
  {
    id: "livres",
    label: tr("Livres"),
    description: tr("À lire, lus, avec auteur et note."),
    icon: "livre",
    color: "#e0671f",
    view: "galerie",
    columns: [col("auteur", tr("Auteur"), "texte"), col("note", tr("Note|appréciation"), "note"), col("lu", tr("Lu le"), "date"), col("lien", tr("Lien"), "lien")],
    sections: [tr("À lire"), tr("En cours"), tr("Lus")],
    placeholder: tr("Le Petit Prince…"),
  },
  {
    id: "films",
    label: tr("Films et séries"),
    description: tr("À voir, vus, avec plateforme et note."),
    icon: "film",
    color: "#7a5ce6",
    view: "galerie",
    columns: [col("genre", tr("Genre"), "texte"), col("plateforme", tr("Plateforme"), "texte"), col("note", tr("Note|appréciation"), "note"), col("vu", tr("Vu"), "case")],
    sections: [tr("Films"), tr("Séries")],
    placeholder: tr("Un film, une série…"),
  },
  {
    id: "cadeaux",
    label: tr("Idées cadeaux"),
    description: tr("Pour qui, prix, lien, offert."),
    icon: "cadeau",
    color: "#e0508a",
    view: "liste",
    columns: [col("pour", tr("Pour"), "texte"), col("prix", tr("Prix"), "prix"), col("lien", tr("Lien"), "lien"), col("offert", tr("Offert"), "case")],
    sections: [],
    placeholder: tr("Une idée de cadeau…"),
  },
  {
    id: "voyages",
    label: tr("Voyages"),
    description: tr("Destinations, dates, budget."),
    icon: "valise",
    color: "#0a9fd8",
    view: "galerie",
    columns: [col("pays", tr("Pays"), "texte"), col("quand", tr("Quand"), "date"), col("budget", tr("Budget"), "prix"), col("fait", tr("Fait"), "case")],
    sections: [tr("Envies"), tr("Prévus"), tr("Faits")],
    placeholder: tr("Lisbonne, la Bretagne…"),
  },
  {
    id: "envies",
    label: tr("Envies"),
    description: tr("Ce qui fait envie, avec prix et priorité."),
    icon: "etoile",
    color: "#e89a1c",
    view: "liste",
    columns: [col("prix", tr("Prix"), "prix"), col("priorite", tr("Priorité"), "note"), col("lien", tr("Lien"), "lien")],
    sections: [],
    placeholder: tr("Un vélo, un cours de poterie…"),
  },
  {
    id: "libre",
    label: tr("Liste libre"),
    description: tr("Sans colonne au départ."),
    icon: "carnet",
    color: "#16a3a3",
    view: "liste",
    columns: [],
    sections: [],
    placeholder: tr("Ajouter un élément…"),
  },
];

export function templateOf(id: TemplateId): ListTemplate {
  return LIST_TEMPLATES.find((t) => t.id === id) ?? LIST_TEMPLATES[LIST_TEMPLATES.length - 1]!;
}

/** Nouvelle liste d'après un modèle. */
export function listFromTemplate(t: ListTemplate, name = t.label, spaceId: string | null = null): ListInput {
  return { name, template: t.id, columns: t.columns.map((c) => ({ ...c })), sections: [...t.sections], view: t.view, color: t.color, icon: t.icon, spaceId };
}

export function toListInput(l: List): ListInput {
  const { name, template, columns, sections, view, color, icon, spaceId } = l;
  return { name, template, columns, sections, view, color, icon, spaceId };
}

export function toItemInput(i: ListItem): ListItemInput {
  const { title, section, cells, done, image } = i;
  return { title, section, cells, done, image };
}

/** Identifiant d'une nouvelle colonne, unique dans la liste (« prix », « prix-2 »). */
export function columnId(name: string, taken: readonly ListColumn[]): string {
  const base = fold(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "colonne";
  let id = base;
  for (let n = 2; taken.some((c) => c.id === id); n++) id = `${base}-${n}`;
  return id;
}

const EUROS = new Intl.NumberFormat(locale(), { style: "currency", currency: "EUR" });
const DAY = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric" });

/** « 12,50 € » (centimes). */
export function formatPrice(cents: number): string {
  return EUROS.format(cents / 100);
}

/** Saisie d'un prix (« 12,5 », « 12.50 € ») en centimes ; nul si illisible. */
export function parsePrice(text: string): number | null {
  const clean = text.replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** Valeur affichée d'une colonne. */
export function cellText(kind: ColumnKind, value: CellValue | undefined): string {
  if (value === undefined || value === "" || value === false) return "";
  if (kind === "prix" && typeof value === "number") return formatPrice(value);
  if (kind === "note" && typeof value === "number") return "★".repeat(value) + "☆".repeat(5 - value);
  if (kind === "date" && typeof value === "string") return DAY.format(new Date(`${value}T12:00:00`));
  if (kind === "case") return value ? tr("Oui") : "";
  return String(value);
}

/** Éléments d'une liste, rangés par rayon (dans l'ordre de la liste), puis ceux sans rayon. */
/** Tri des éléments : ordre choisi à la main, nom, ajout récent, ou valeur d'une colonne (« colonne:prix »). */
export type ListSort = "manuel" | "nom" | "recent" | `colonne:${string}`;

/** Tris proposés pour une liste : les trois de base, puis un par colonne. */
export function sortOptions(list: Pick<List, "columns">): { value: ListSort; label: string }[] {
  return [
    { value: "manuel", label: tr("Ordre manuel") },
    { value: "nom", label: tr("Nom (A → Z)") },
    { value: "recent", label: tr("Ajout récent") },
    ...list.columns.map((c) => ({ value: `colonne:${c.id}` as ListSort, label: c.kind === "note" ? tr("{name} (meilleures d'abord)", { name: c.name }) : c.name })),
  ];
}

const byManual = (a: ListItem, b: ListItem) => a.position - b.position || a.createdAt - b.createdAt;

/** Éléments triés ; une valeur vide passe toujours après les autres. */
export function sortItems(list: Pick<List, "columns">, items: readonly ListItem[], sort: ListSort = "manuel"): ListItem[] {
  const out = [...items];
  if (sort === "nom") return out.sort((a, b) => a.title.localeCompare(b.title, "fr", { sensitivity: "base", numeric: true }) || byManual(a, b));
  if (sort === "recent") return out.sort((a, b) => b.createdAt - a.createdAt || byManual(a, b));
  if (sort.startsWith("colonne:")) {
    const column = list.columns.find((c) => c.id === sort.slice(8));
    if (column) {
      const value = (i: ListItem) => i.cells[column.id];
      const empty = (v: CellValue | undefined) => v === undefined || v === "" || v === false;
      return out.sort((a, b) => {
        const [va, vb] = [value(a), value(b)];
        if (empty(va) !== empty(vb)) return empty(va) ? 1 : -1;
        if (empty(va)) return byManual(a, b);
        let diff = 0;
        if (column.kind === "note") diff = (vb as number) - (va as number);
        else if (column.kind === "prix") diff = (va as number) - (vb as number);
        else diff = String(va).localeCompare(String(vb), "fr", { sensitivity: "base", numeric: true });
        return diff || byManual(a, b);
      });
    }
  }
  return out.sort(byManual);
}

export function groupBySection(list: Pick<List, "sections" | "columns">, items: readonly ListItem[], sort: ListSort = "manuel"): { section: string | null; items: ListItem[] }[] {
  const sorted = sortItems(list, items, sort);
  const groups = list.sections.map((section) => ({ section: section as string | null, items: sorted.filter((i) => i.section === section) }));
  const loose = sorted.filter((i) => i.section === null || !list.sections.includes(i.section));
  return [...groups.filter((g) => g.items.length > 0), ...(loose.length > 0 ? [{ section: null, items: loose }] : [])];
}

/** Somme des prix d'une colonne (éléments non cochés seulement : ce qui reste à acheter). */
export function totalOf(column: ListColumn, items: readonly ListItem[], onlyOpen = false): number {
  return items.filter((i) => !onlyOpen || !i.done).reduce((sum, i) => sum + (typeof i.cells[column.id] === "number" ? (i.cells[column.id] as number) : 0), 0);
}

/** La recherche trouve-t-elle cet élément (titre, valeurs) ? */
export function itemMatches(item: ListItem, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  const text = fold([item.title, item.section ?? "", ...Object.values(item.cells).map(String)].join(" "));
  return q.split(/\s+/).every((w) => text.includes(w));
}

/** Élément de la liste qui porte déjà ce titre (sans accents ni majuscules). */
export function sameTitle(items: readonly ListItem[], title: string): ListItem | undefined {
  const t = fold(title.trim());
  return t ? items.find((i) => fold(i.title.trim()) === t) : undefined;
}

/**
 * Suggestions pendant la saisie : éléments de la liste dont le titre contient ce qui est saisi,
 * ceux déjà faits (à remettre dans la liste) en tête, les plus récents d'abord. Sans saisie :
 * les derniers éléments faits.
 */
export function suggestionsFor(items: readonly ListItem[], text: string, max = 6): ListItem[] {
  const q = fold(text.trim());
  const recent = (a: ListItem, b: ListItem) => Number(b.done) - Number(a.done) || b.updatedAt - a.updatedAt;
  if (!q) return items.filter((i) => i.done).sort(recent).slice(0, max);
  const words = q.split(/\s+/);
  return items
    .filter((i) => {
      const title = fold(i.title);
      return words.every((w) => title.includes(w)) && title !== q;
    })
    .sort((a, b) => Number(fold(b.title).startsWith(q)) - Number(fold(a.title).startsWith(q)) || recent(a, b))
    .slice(0, max);
}

/** Liste en texte, pour la coller dans un message : sections en titre, une case par élément. */
export function listAsText(name: string, groups: readonly { section: string | null; items: readonly ListItem[] }[]): string {
  const lines = [name];
  for (const g of groups) {
    if (g.items.length === 0) continue;
    if (g.section) lines.push("", g.section);
    for (const i of g.items) lines.push(`${i.done ? "☑" : "☐"} ${i.title}`);
  }
  return lines.join("\n");
}
