/**
 * Recherche de la palette de commandes : tolérante aux accents, aux majuscules
 * et aux lettres oubliées (« calndrier » trouve « Calendrier ») ; l'orthographe exacte
 * passe devant quand la saisie porte des accents.
 */
import { containsExactly, fold, hasAccents } from "../lib/fold";

export interface Searchable {
  label: string;
  keywords?: readonly string[];
}

/** « Thème : Nuit étoilée » → « theme : nuit etoilee ». */
export function normalize(text: string): string {
  return fold(text).replace(/\s+/g, " ").trim();
}

function words(text: string): string[] {
  return text.split(/[^a-z0-9]+/).filter(Boolean);
}

/** Vrai si toutes les lettres de `needle` apparaissent dans l'ordre dans `haystack`. */
function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return needle.length === 0;
}

function tokenScore(token: string, label: string, keywords: string): number {
  if (label.startsWith(token)) return 4;
  if (words(label).some((w) => w.startsWith(token))) return 3;
  if (label.includes(token)) return 2;
  if (words(keywords).some((w) => w.startsWith(token))) return 1.5;
  if (keywords.includes(token)) return 1;
  if (token.length >= 3 && words(label).some((w) => isSubsequence(token, w))) return 0.5;
  return 0;
}

/** 0 = aucun rapport ; plus le nombre est grand, meilleur est le résultat. */
export function scoreItem(query: string, item: Searchable): number {
  const q = normalize(query);
  if (q === "") return 1;
  const label = normalize(item.label);
  const keywords = normalize((item.keywords ?? []).join(" "));
  let total = 0;
  for (const token of words(q)) {
    const s = tokenScore(token, label, keywords);
    if (s === 0) return 0;
    total += s;
  }
  // Saisie accentuée : un libellé écrit exactement ainsi passe devant.
  const raw = query.trim();
  if (hasAccents(raw) && containsExactly(item.label, raw)) total += 0.5;
  return total;
}

/** Garde les éléments qui correspondent, du plus pertinent au moins pertinent. */
export function searchItems<T extends Searchable>(items: readonly T[], query: string): T[] {
  return items
    .map((item, order) => ({ item, order, score: scoreItem(query, item) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((r) => r.item);
}
