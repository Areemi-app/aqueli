/**
 * Correspondance tolérante pour la recherche globale : sans majuscules ni accents (src/lib/fold.ts),
 * début de mot accepté (« cour » trouve « courses »), et une faute de frappe par mot (deux pour les
 * mots longs : « reunoin » trouve « réunion »). Fonctions pures.
 */
import { fold } from "../lib/fold";

/** Mots d'un texte, sans majuscules ni accents. */
export function words(text: string): string[] {
  return fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Distance entre deux mots : insertions, suppressions, remplacements et lettres inversées. */
export function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2]! + 1);
      row.push(d);
      best = Math.min(best, d);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length]!;
}

/** Fautes permises selon la longueur du mot cherché. */
const allowed = (q: string) => (q.length >= 8 ? 2 : q.length >= 4 ? 1 : 0);

/** Qualité de la rencontre d'un mot cherché avec un mot du texte : 0 si aucune. */
export function wordScore(q: string, w: string): number {
  if (w === q) return 4;
  if (w.startsWith(q)) return 3;
  const max = allowed(q);
  if (max === 0 || w[0] !== q[0]) return 0;
  // Faute dans le mot entier (« reunoin »).
  if (distance(q, w, max) <= max) return 2;
  // Faute dans le début d'un mot : seulement à partir de 5 lettres (« maif » ne trouve pas « mairie »).
  if (q.length >= 5 && w.length > q.length && distance(q, w.slice(0, q.length), max) <= max) return 1.5;
  return 0;
}

/** Meilleure rencontre d'un mot cherché parmi des mots. */
function best(q: string, list: readonly string[]): number {
  let score = 0;
  for (const w of list) {
    const s = wordScore(q, w);
    if (s > score) score = s;
    if (score === 4) break;
  }
  return score;
}

export interface Searchable {
  titleWords: readonly string[];
  bodyWords: readonly string[];
}

/** Score d'un élément : chaque mot cherché doit se retrouver (le titre compte double). 0 : écarté. */
export function matchScore(query: readonly string[], item: Searchable): number {
  let total = 0;
  for (const q of query) {
    const inTitle = best(q, item.titleWords) * 2;
    const inBody = inTitle >= 8 ? 0 : best(q, item.bodyWords);
    const s = Math.max(inTitle, inBody);
    if (s === 0) return 0;
    total += s;
  }
  return total;
}
