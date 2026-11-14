/**
 * Sous-tâches sur plusieurs niveaux. La liste reste à plat, dans l'ordre d'affichage ; chaque
 * sous-tâche porte son niveau (0 : sous la tâche, jusqu'à `MAX_SUBTASK_LEVEL`). Une sous-tâche et
 * celles qui la suivent avec un niveau plus grand forment sa branche : elles bougent, se cochent et
 * se suppriment avec elle. Même règle dans le cœur (`clean_subtasks`, src-tauri/src/data/tasks.rs).
 */
import type { Subtask } from "./tasks";

/** Cinq niveaux : une sous-tâche, et jusqu'à quatre niveaux en dessous. */
export const MAX_SUBTASK_LEVEL = 4;

export const levelOf = (s: Subtask): number => s.level ?? 0;

/** Niveaux remis en ordre : le premier à 0, aucun saut de plus d'un niveau, aucun au-delà du maximum. */
export function normalizeLevels(list: readonly Subtask[]): Subtask[] {
  let previous = -1;
  return list.map((s) => {
    const level = Math.max(0, Math.min(levelOf(s), previous + 1, MAX_SUBTASK_LEVEL));
    previous = level;
    return levelOf(s) === level ? s : { ...s, level };
  });
}

/** Fin (exclue) de la branche de la sous-tâche `i`. */
export function branchEnd(list: readonly Subtask[], i: number): number {
  const level = levelOf(list[i]!);
  let j = i + 1;
  while (j < list.length && levelOf(list[j]!) > level) j++;
  return j;
}

/** Sous-tâche qui contient la sous-tâche `i`, ou -1. */
export function parentIndex(list: readonly Subtask[], i: number): number {
  const level = levelOf(list[i]!);
  for (let j = i - 1; j >= 0; j--) if (levelOf(list[j]!) < level) return j;
  return -1;
}

export const hasChildren = (list: readonly Subtask[], i: number): boolean => branchEnd(list, i) > i + 1;

const shift = (list: readonly Subtask[], from: number, to: number, by: number): Subtask[] =>
  list.map((s, k) => (k >= from && k < to ? { ...s, level: levelOf(s) + by } : s));

/** Tab : la sous-tâche passe sous celle du dessus, avec sa branche. */
export function canIndent(list: readonly Subtask[], i: number): boolean {
  if (i <= 0 || i >= list.length) return false;
  const end = branchEnd(list, i);
  const deepest = Math.max(...list.slice(i, end).map(levelOf));
  return levelOf(list[i]!) <= levelOf(list[i - 1]!) && deepest < MAX_SUBTASK_LEVEL;
}

export function indent(list: readonly Subtask[], i: number): Subtask[] {
  return canIndent(list, i) ? shift(list, i, branchEnd(list, i), 1) : [...list];
}

/** Maj+Tab : la sous-tâche remonte d'un niveau, avec sa branche. */
export const canOutdent = (list: readonly Subtask[], i: number): boolean => i >= 0 && i < list.length && levelOf(list[i]!) > 0;

export function outdent(list: readonly Subtask[], i: number): Subtask[] {
  return canOutdent(list, i) ? normalizeLevels(shift(list, i, branchEnd(list, i), -1)) : [...list];
}

/** Sœur précédente ou suivante (même niveau, même parent), ou -1. */
function sibling(list: readonly Subtask[], i: number, direction: -1 | 1): number {
  const level = levelOf(list[i]!);
  if (direction === 1) {
    const j = branchEnd(list, i);
    return j < list.length && levelOf(list[j]!) === level ? j : -1;
  }
  for (let j = i - 1; j >= 0; j--) {
    const l = levelOf(list[j]!);
    if (l === level) return j;
    if (l < level) return -1;
  }
  return -1;
}

export const canMove = (list: readonly Subtask[], i: number, direction: -1 | 1): boolean => sibling(list, i, direction) >= 0;

/** Monter ou descendre : la branche change de place avec sa sœur voisine. */
export function move(list: readonly Subtask[], i: number, direction: -1 | 1): Subtask[] {
  const j = sibling(list, i, direction);
  if (j < 0) return [...list];
  const [first, second] = direction === -1 ? [j, i] : [i, j];
  const firstEnd = branchEnd(list, first);
  const secondEnd = branchEnd(list, second);
  return [...list.slice(0, first), ...list.slice(second, secondEnd), ...list.slice(first, firstEnd), ...list.slice(secondEnd)];
}

/**
 * Cocher une sous-tâche coche toute sa branche ; la décocher décoche aussi celles qui la contiennent
 * (elles ne sont plus terminées).
 */
export function setDone(list: readonly Subtask[], i: number, done: boolean): Subtask[] {
  const end = branchEnd(list, i);
  const next = list.map((s, k) => (k >= i && (done ? k < end : k === i) ? { ...s, done } : s));
  if (!done) for (let p = parentIndex(next, i); p >= 0; p = parentIndex(next, p)) next[p] = { ...next[p]!, done: false };
  return next;
}

/** Supprimer une sous-tâche supprime sa branche. */
export function removeBranch(list: readonly Subtask[], i: number): Subtask[] {
  return [...list.slice(0, i), ...list.slice(branchEnd(list, i))];
}

/** Nouvelle sous-tâche au bout de la branche de `i`, un niveau en dessous. */
export function insertChild(list: readonly Subtask[], i: number, child: Subtask): Subtask[] {
  const level = Math.min(levelOf(list[i]!) + 1, MAX_SUBTASK_LEVEL);
  const at = branchEnd(list, i);
  return [...list.slice(0, at), { ...child, level }, ...list.slice(at)];
}

/**
 * Après un glisser-déposer qui n'a déplacé qu'une sous-tâche (`ids` : le nouvel ordre des
 * sous-tâches affichées), sa branche la suit, les branches repliées gardent leurs sous-tâches
 * cachées, et les niveaux sont remis en ordre.
 */
export function reorderBranch(list: readonly Subtask[], movedId: string, ids: readonly string[]): Subtask[] {
  const i = list.findIndex((s) => s.id === movedId);
  if (i < 0) return [...list];
  const branch = list.slice(i, branchEnd(list, i));
  const inBranch = new Set(branch.map((s) => s.id));
  const shown = new Set(ids);
  // Une sous-tâche affichée emporte les sous-tâches cachées qui la suivent (sa branche repliée).
  const group = (k: number) => {
    const out = [list[k]!];
    for (let j = k + 1; j < list.length && !shown.has(list[j]!.id) && !inBranch.has(list[j]!.id); j++) out.push(list[j]!);
    return out;
  };
  const ordered: Subtask[] = [];
  for (const id of ids) {
    if (id === movedId) ordered.push(...branch);
    else if (!inBranch.has(id)) {
      const k = list.findIndex((s) => s.id === id);
      if (k >= 0) ordered.push(...group(k));
    }
  }
  const placed = new Set(ordered.map((s) => s.id));
  for (const s of list) if (!placed.has(s.id)) ordered.push(s);
  return normalizeLevels(ordered);
}

/** Sous-tâches cachées par une branche repliée. */
export function hiddenByFold(list: readonly Subtask[], folded: ReadonlySet<string>): Set<string> {
  const hidden = new Set<string>();
  list.forEach((s, i) => {
    if (!folded.has(s.id) || hidden.has(s.id)) return;
    for (let k = i + 1; k < branchEnd(list, i); k++) hidden.add(list[k]!.id);
  });
  return hidden;
}

/** Écrit « > » par niveau devant le nom (exports CSV), lu par `parseSubtaskLine` à l'import. */
export const subtaskLine = (s: Subtask): string => `${">".repeat(levelOf(s))}${levelOf(s) ? " " : ""}${s.title}`;

/** « >> Verres » : niveau 2, « Verres ». */
export function parseSubtaskLine(line: string): { title: string; level: number } {
  const m = /^(>+)\s*(.*)$/.exec(line.trim());
  if (!m) return { title: line.trim(), level: 0 };
  return { title: m[2]!.trim(), level: m[1]!.length };
}
