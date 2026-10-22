/**
 * Espaces : enregistrés dans la base chiffrée (src-tauri/src/data/spaces.rs).
 * Ce fichier décrit les couleurs et icônes proposées, et le filtre « Tous / un espace ».
 */
import { symbolPath } from "../components/symbols";
import { tr } from "../i18n/i18n";

export interface Space {
  id: string;
  name: string;
  color: string;
  icon: SpaceIcon;
  position: number;
}

/** Couleurs proposées : celles des espaces par défaut, puis celles des modules. */
export const SPACE_COLORS: readonly { value: string; label: string }[] = [
  // Dans l'ordre du spectre, du rouge au rose.
  { value: "#e04848", label: tr("Rouge") },
  { value: "#e0671f", label: tr("Orange") },
  { value: "#e89a1c", label: tr("Ambre") },
  { value: "#7f9a14", label: tr("Olive") },
  { value: "#2fae4a", label: tr("Vert") },
  { value: "#1f9a6e", label: tr("Émeraude") },
  { value: "#16a3a3", label: tr("Turquoise") },
  { value: "#0a9fd8", label: tr("Bleu ciel") },
  { value: "#3d6fb8", label: tr("Bleu acier") },
  { value: "#7a5ce6", label: tr("Violet") },
  { value: "#c2479a", label: tr("Prune") },
  { value: "#e0508a", label: tr("Rose") },
];

/** Symbole d'un espace : un de la liste commune (src/components/symbols.ts). */
export type SpaceIcon = string;

/** Dessin du symbole ; l'étoile s'il est inconnu. */
export function spaceIconPath(icon: string): string {
  return symbolPath(icon, symbolPath("etoile", ""));
}

/** « tous » = aucun filtre, sinon l'identifiant d'un espace. */
export type SpaceFilter = "tous" | string;

export function isSpaceFilter(value: unknown): value is SpaceFilter {
  return typeof value === "string" && value.length > 0;
}

export function spaceFilterLabel(filter: SpaceFilter, spaces: readonly Space[]): string {
  if (filter === "tous") return tr("Tous");
  return spaces.find((s) => s.id === filter)?.name ?? tr("Tous");
}

/** Déplace l'espace `id` d'un cran vers le haut (-1) ou vers le bas (+1). */
export function moveSpace(ids: readonly string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return [...ids];
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
