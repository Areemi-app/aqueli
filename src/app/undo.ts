/**
 * Annuler (Ctrl+Z) : les dernières actions sur les données — suppression, modification,
 * déplacement, tâche terminée, copie… —, de la plus récente à la plus ancienne. Chaque fournisseur
 * de données note ce qui défait son action (`recordUndo`) ; les messages « Annuler » y sont aussi
 * inscrits. Pendant une annulation, rien n'est noté : annuler n'ajoute pas d'action à annuler.
 */

export interface UndoEntry {
  id: number;
  /** Ce qui est annulé, pour le message : « suppression de la tâche ». */
  label: string;
  run: () => unknown;
  /** Élément visé (« task:abc ») : ses modifications rapprochées ne font qu'une action. */
  key?: string;
  at: number;
}

/** Actions gardées (les plus anciennes s'effacent). */
export const MAX_UNDO = 30;
/** Modifications du même élément regroupées si elles se suivent de moins de 3 secondes. */
export const GROUP_MS = 3000;

let stack: UndoEntry[] = [];
let replaying = 0;
let seq = 0;
/** Pendant une action sur plusieurs éléments : ce qui défait chacun, réuni en une seule entrée. */
let collecting: (() => unknown)[] | null = null;

/**
 * Note ce qui défait une action ; renvoie son numéro (nul pendant une annulation). Avec `key`,
 * une modification qui suit de près la précédente du même élément s'y ajoute : Ctrl+Z revient
 * à l'état d'avant la première (saisie d'un texte, glissement…).
 */
export function recordUndo(label: string, run: () => unknown, key?: string, now = Date.now()): number | null {
  if (replaying > 0) return null;
  if (collecting) {
    collecting.push(run);
    return null;
  }
  const last = stack[stack.length - 1];
  if (key && last?.key === key && now - last.at < GROUP_MS) {
    last.at = now;
    return last.id;
  }
  seq += 1;
  stack = [...stack.slice(-(MAX_UNDO - 1)), { id: seq, label, run, key, at: now }];
  return seq;
}

/** Retire une action de la liste (annulée par le bouton de son message). */
export function forgetUndo(id: number): void {
  stack = stack.filter((e) => e.id !== id);
}

/** Retire et renvoie la dernière action, s'il y en a une. */
export function popUndo(): UndoEntry | null {
  const entry = stack[stack.length - 1] ?? null;
  if (entry) stack = stack.slice(0, -1);
  return entry;
}

/** Exécute `run` comme une annulation : ce qu'elle fait n'est pas noté à son tour. */
export async function replay(run: () => unknown): Promise<void> {
  replaying += 1;
  try {
    await run();
  } finally {
    replaying -= 1;
  }
}

/** Vrai pendant une annulation. */
export function isReplaying(): boolean {
  return replaying > 0;
}

/** Au verrouillage : plus rien à annuler. */
export function clearUndo(): void {
  stack = [];
}

export function undoCount(): number {
  return stack.length;
}

/**
 * Action sur plusieurs éléments à la fois (sélection) : ce que chacune inscrit pour être
 * défait est réuni ; renvoie de quoi tout défaire d'un coup (nul si rien n'a été inscrit),
 * à confier au message « Annuler ».
 */
export async function collectUndo(work: () => Promise<unknown>): Promise<(() => Promise<void>) | null> {
  const runs: (() => unknown)[] = [];
  const outer = collecting;
  collecting = runs;
  try {
    await work();
  } finally {
    collecting = outer;
  }
  if (runs.length === 0) return null;
  return async () => {
    for (const run of [...runs].reverse()) await run();
  };
}

/** Vrai pendant une action sur plusieurs éléments. */
export function isCollecting(): boolean {
  return collecting !== null;
}
