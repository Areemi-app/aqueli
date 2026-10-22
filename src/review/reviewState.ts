/**
 * État de la revue de la semaine en cours, pour la barre latérale : faite, ou à faire.
 * L'écran Bilan prévient (`announceReview`) à chaque revue enregistrée.
 */
import { useEffect, useState } from "react";
import { useNow } from "../lib/useNow";
import { dayKey } from "../tasks/day";
import { reviewsApi } from "./api";
import { isoWeek, type Review } from "./review";

const EVENT = "aqueli:revue";

/** Une revue vient d'être enregistrée. */
export function announceReview(review: Review): void {
  window.dispatchEvent(new CustomEvent<Review>(EVENT, { detail: review }));
}

export function useWeekReviewState(): "faite" | "a-faire" | null {
  const week = isoWeek(dayKey(useNow()));
  const [done, setDone] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    let live = true;
    reviewsApi
      .list()
      .then((list) => live && setDone(new Set(list.filter((r) => r.doneAt !== null).map((r) => r.week))))
      .catch(() => undefined);
    const onSaved = (e: Event) => {
      const r = (e as CustomEvent<Review>).detail;
      setDone((set) => {
        const next = new Set(set ?? []);
        if (r.doneAt !== null) next.add(r.week);
        else next.delete(r.week);
        return next;
      });
    };
    window.addEventListener(EVENT, onSaved);
    return () => {
      live = false;
      window.removeEventListener(EVENT, onSaved);
    };
  }, []);
  if (done === null) return null;
  return done.has(week) ? "faite" : "a-faire";
}
