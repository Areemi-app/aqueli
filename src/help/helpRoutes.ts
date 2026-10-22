/** Rubrique d'aide ouverte par F1 selon l'écran affiché (le texte de l'aide, plus lourd, se charge avec la fenêtre). */
import type { RouteId } from "../navigation/routes";

/** Rubrique des raccourcis : la liste complète, affichée à part (Ctrl+/). */
export const SHORTCUTS_TOPIC = "raccourcis";

/** Chaque module a sa rubrique, du même nom ; les Paramètres ouvrent celle de l'apparence. */
export const topicForRoute = (route: RouteId): string => (route === "parametres" ? "apparence" : route === "corbeille" ? "prise-en-main" : route);
