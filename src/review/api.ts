/** Revues de la semaine, dans la base chiffrée (src-tauri/src/data/reviews.rs). */
import { invoke } from "@tauri-apps/api/core";
import { asDataError } from "../lib/dataError";
import { inTauri } from "../lib/windowControls";
import type { Review, ReviewInput } from "./review";

export interface ReviewsApi {
  list(): Promise<Review[]>;
  save(week: string, review: ReviewInput): Promise<Review>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: ReviewsApi = {
  list: () => call("reviews_list"),
  save: (week, review) => call("reviews_save", { week, review }),
};

/** Revues gardées en mémoire pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): ReviewsApi {
  let reviews: Review[] = [];
  return {
    list: async () => [...reviews].sort((a, b) => b.week.localeCompare(a.week)),
    save: async (week, input) => {
      const now = Math.floor(Date.now() / 1000);
      const before = reviews.find((r) => r.week === week);
      const review: Review = {
        week,
        wins: input.wins.trim(),
        lessons: input.lessons.trim(),
        priorities: input.priorities.trim(),
        doneAt: input.done ? (before?.doneAt ?? now) : null,
        updatedAt: now,
      };
      reviews = [...reviews.filter((r) => r.week !== week), review];
      return review;
    },
  };
}

export const reviewsApi: ReviewsApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
