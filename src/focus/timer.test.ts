import { describe, expect, it } from "vitest";
import { cleanPlan, clock, countsUp, durationLabel, flowPause, initialState, PLANS, progress, remainingMs, shownMs, skip, start, stop, suspend, tick } from "./timer";

const MIN = 60_000;
const T0 = 1_000_000;

describe("minuteur Focus", () => {
  it("démarre, se suspend et reprend sans perdre de temps", () => {
    let s = start(initialState(PLANS.classique, "t1"), T0);
    expect(remainingMs(s, T0 + 10 * MIN)).toBe(15 * MIN);
    expect(progress(s, T0 + 5 * MIN)).toBeCloseTo(0.2);
    s = suspend(s, T0 + 10 * MIN);
    expect(remainingMs(s, T0 + 60 * MIN)).toBe(15 * MIN);
    s = start(s, T0 + 60 * MIN);
    expect(s.endsAt).toBe(T0 + 75 * MIN);
    expect(s.startedAt).toBe(T0);
  });

  it("enchaîne séance, pause, puis attend le démarrage de la séance suivante", () => {
    let s = start(initialState(PLANS.classique, "t1"), T0);
    let r = tick(s, T0 + 25 * MIN, false);
    expect(r.ended).toEqual(["concentration"]);
    expect(r.records).toEqual([{ taskId: "t1", startedAt: T0, minutes: 25, note: null }]);
    expect(r.state).toMatchObject({ phase: "pause", status: "en-cours", endsAt: T0 + 30 * MIN });
    r = tick(r.state, T0 + 31 * MIN, false);
    expect(r.ended).toEqual(["pause"]);
    expect(r.state).toMatchObject({ phase: "concentration", status: "arret", cycle: 2, remaining: 25 * MIN });
    s = r.state;
    expect(tick(s, T0 + 99 * MIN, false).ended).toEqual([]);
  });

  it("rattrape plusieurs phases écoulées pendant un verrouillage, longue pause comprise", () => {
    const s = { ...start(initialState(PLANS.classique), T0), cycle: 4 };
    const r = tick(s, T0 + 25 * MIN + 15 * MIN + 25 * MIN + 1, true);
    expect(r.ended).toEqual(["concentration", "longue-pause", "concentration"]);
    expect(r.records).toHaveLength(2);
    expect(r.state).toMatchObject({ phase: "pause", cycle: 1 });
  });

  it("arrêter ou passer compte le temps de concentration déjà passé", () => {
    const s = start(initialState(PLANS.classique, "t1"), T0);
    const stopped = stop(s, T0 + 12 * MIN + 30_000);
    expect(stopped.record).toEqual({ taskId: "t1", startedAt: T0, minutes: 12, note: null });
    expect(stopped.state).toMatchObject({ status: "arret", phase: "concentration", cycle: 1, taskId: "t1" });
    expect(stop(s, T0 + 40_000).record).toBeNull();
    const skipped = skip(s, T0 + 5 * MIN);
    expect(skipped.record?.minutes).toBe(5);
    expect(skipped.state).toMatchObject({ phase: "pause", status: "en-cours", endsAt: T0 + 10 * MIN });
    const afterPause = skip(skipped.state, T0 + 6 * MIN);
    expect(afterPause.record).toBeNull();
    expect(afterPause.state).toMatchObject({ phase: "concentration", status: "arret", cycle: 2 });
  });

  it("séance libre : le temps écoulé s'affiche, la pause vaut le cinquième de la séance", () => {
    const s = start(initialState(PLANS.libre, null, "Lecture"), T0);
    expect(countsUp(s)).toBe(true);
    expect(shownMs(s, T0 + 37 * MIN)).toBe(37 * MIN);
    // « Pause » après 40 minutes : 8 minutes de pause, jamais de longue pause.
    const paused = skip({ ...s, cycle: 4 }, T0 + 40 * MIN);
    expect(paused.record).toEqual({ taskId: null, startedAt: T0, minutes: 40, note: "Lecture" });
    expect(paused.state).toMatchObject({ phase: "pause", status: "en-cours", endsAt: T0 + 48 * MIN, total: 8 * MIN });
    expect(countsUp(paused.state)).toBe(false);
    expect(shownMs(paused.state, T0 + 44 * MIN)).toBe(4 * MIN);
    expect(progress(paused.state, T0 + 44 * MIN)).toBeCloseTo(0.5);
    // Fin de la pause : la séance suivante repart de zéro, avec la même intention.
    const after = tick(paused.state, T0 + 48 * MIN, false).state;
    expect(after).toMatchObject({ phase: "concentration", status: "arret", total: undefined, intention: "Lecture" });
    expect(shownMs(after, T0 + 50 * MIN)).toBe(0);
    expect(flowPause(3)).toBe(1);
    expect(flowPause(240)).toBe(30);
  });

  it("affiche l'heure et les durées", () => {
    expect(clock(25 * MIN)).toBe("25:00");
    expect(clock(61_000)).toBe("01:01");
    expect(clock(59_001)).toBe("01:00");
    expect(clock(65 * MIN)).toBe("1:05:00");
    expect(durationLabel(45)).toBe("45 min");
    expect(durationLabel(75)).toBe("1 h 15");
    expect(durationLabel(120)).toBe("2 h");
    expect(cleanPlan({ focus: 0, pause: 999, longPause: 15.6, every: 1 })).toEqual({ focus: 1, pause: 60, longPause: 16, every: 2 });
  });
});
