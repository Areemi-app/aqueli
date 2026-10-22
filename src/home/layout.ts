import { tr } from "../i18n/i18n";
/**
 * Mises en page de l'Accueil : cartes affichées, leur ordre et leur taille, plusieurs
 * mises en page enregistrées (« Travail », « Week-end »…). Fonctions pures.
 */

export const WIDGET_IDS = [
  "aujourdhui",
  "a-venir",
  "rendez-vous",
  "obligations",
  "habitudes",
  "humeur",
  "focus",
  "note",
  "objectifs",
  "budget",
  "contacts",
  "projets",
  "courses",
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

/** Normale (une case), large (deux colonnes) ou haute (deux rangées). */
export const WIDGET_SIZES = ["normal", "large", "haute"] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export interface Placement {
  id: WidgetId;
  size: WidgetSize;
}

export interface HomeLayout {
  id: string;
  name: string;
  /** Cartes affichées, dans l'ordre ; les autres sont masquées. */
  widgets: Placement[];
}

export interface HomeLayouts {
  active: string;
  layouts: HomeLayout[];
}

export const MAX_LAYOUTS = 6;
const MAX_NAME = 30;

/** Maquette Main.dc.html. */
const DEFAULT_WIDGETS: readonly WidgetId[] = ["aujourdhui", "rendez-vous", "obligations", "habitudes", "focus", "note"];

export function defaultLayouts(): HomeLayouts {
  return {
    active: "principale",
    layouts: [{ id: "principale", name: tr("Principale"), widgets: DEFAULT_WIDGETS.map((id) => ({ id, size: "normal" })) }],
  };
}

export function activeLayout(l: HomeLayouts): HomeLayout {
  return l.layouts.find((x) => x.id === l.active) ?? l.layouts[0] ?? defaultLayouts().layouts[0]!;
}

export function hiddenWidgets(layout: HomeLayout): WidgetId[] {
  return WIDGET_IDS.filter((id) => !layout.widgets.some((w) => w.id === id));
}

export function moveWidget(layout: HomeLayout, id: WidgetId, to: number): HomeLayout {
  const moving = layout.widgets.find((w) => w.id === id);
  if (!moving) return layout;
  const rest = layout.widgets.filter((w) => w.id !== id);
  const index = Math.min(Math.max(to, 0), rest.length);
  return { ...layout, widgets: [...rest.slice(0, index), moving, ...rest.slice(index)] };
}

export function setWidgetSize(layout: HomeLayout, id: WidgetId, size: WidgetSize): HomeLayout {
  return { ...layout, widgets: layout.widgets.map((w) => (w.id === id ? { ...w, size } : w)) };
}

export function hideWidget(layout: HomeLayout, id: WidgetId): HomeLayout {
  return { ...layout, widgets: layout.widgets.filter((w) => w.id !== id) };
}

export function showWidget(layout: HomeLayout, id: WidgetId): HomeLayout {
  if (layout.widgets.some((w) => w.id === id)) return layout;
  return { ...layout, widgets: [...layout.widgets, { id, size: "normal" }] };
}

/** Remplace la mise en page de même identifiant. */
export function withLayout(l: HomeLayouts, layout: HomeLayout): HomeLayouts {
  return { ...l, layouts: l.layouts.map((x) => (x.id === layout.id ? layout : x)) };
}

/** Nom sans espaces superflus, 30 caractères au plus ; `null` s'il est vide. */
export function cleanName(name: string): string | null {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME).trim();
  return clean || null;
}

export function nameTaken(l: HomeLayouts, name: string, exceptId?: string): boolean {
  const wanted = name.toLocaleLowerCase("fr");
  return l.layouts.some((x) => x.id !== exceptId && x.name.toLocaleLowerCase("fr") === wanted);
}

/** Nouvelle mise en page, copie de celle affichée ; elle devient active. */
export function addLayout(l: HomeLayouts, name: string, id: string): HomeLayouts {
  const copy = activeLayout(l).widgets.map((w) => ({ ...w }));
  return { active: id, layouts: [...l.layouts, { id, name, widgets: copy }] };
}

export function renameLayout(l: HomeLayouts, id: string, name: string): HomeLayouts {
  return { ...l, layouts: l.layouts.map((x) => (x.id === id ? { ...x, name } : x)) };
}

/** Supprime une mise en page ; la dernière reste. */
export function removeLayout(l: HomeLayouts, id: string): HomeLayouts {
  const layouts = l.layouts.filter((x) => x.id !== id);
  if (layouts.length === 0 || layouts.length === l.layouts.length) return l;
  return { active: l.active === id ? layouts[0]!.id : l.active, layouts };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeWidgets(value: unknown): Placement[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const widgets: Placement[] = [];
  for (const w of value) {
    if (!isObject(w) || !WIDGET_IDS.includes(w.id as WidgetId) || seen.has(w.id as string)) continue;
    seen.add(w.id as string);
    const size = WIDGET_SIZES.includes(w.size as WidgetSize) ? (w.size as WidgetSize) : "normal";
    widgets.push({ id: w.id as WidgetId, size });
  }
  return widgets;
}

/** Préférence enregistrée, vérifiée ; la mise en page par défaut si elle est inutilisable. */
export function sanitizeLayouts(value: unknown): HomeLayouts {
  if (!isObject(value) || !Array.isArray(value.layouts)) return defaultLayouts();
  const layouts: HomeLayout[] = [];
  for (const x of value.layouts) {
    if (layouts.length >= MAX_LAYOUTS) break;
    if (!isObject(x) || typeof x.id !== "string" || !x.id || typeof x.name !== "string") continue;
    const name = cleanName(x.name);
    if (!name || layouts.some((y) => y.id === x.id)) continue;
    layouts.push({ id: x.id, name, widgets: sanitizeWidgets(x.widgets) });
  }
  if (layouts.length === 0) return defaultLayouts();
  const active = layouts.some((x) => x.id === value.active) ? (value.active as string) : layouts[0]!.id;
  return { active, layouts };
}
