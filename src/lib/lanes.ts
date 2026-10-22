/**
 * Éléments qui se chevauchent dans une journée (agenda du planificateur, grille du
 * calendrier) : chacun reçoit une colonne parmi celles de son groupe.
 */

export interface Laned {
  /** Colonne occupée parmi `lanes`. */
  lane: number;
  lanes: number;
}

/** Range les éléments (minutes de début et de fin) en colonnes, triés par début. */
export function withLanes<T extends { start: number; end: number }>(items: readonly T[]): (T & Laned)[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: (T & Laned)[] = [];
  let group: (T & Laned)[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const close = () => {
    for (const item of group) item.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    if (item.start >= groupEnd) close();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.end;
    const laned = { ...item, lane, lanes: 1 };
    group.push(laned);
    placed.push(laned);
    groupEnd = Math.max(groupEnd, item.end);
  }
  close();
  return placed;
}
