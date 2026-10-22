import { isModuleKey, getModule, type ModuleKey } from "../modules/modules";
import { tr } from "../i18n/i18n";

/** Un écran de l'application : un module, les Paramètres ou la Corbeille. */
export type RouteId = ModuleKey | "parametres" | "corbeille";

export const HOME_ROUTE: RouteId = "accueil";

export function isRouteId(value: unknown): value is RouteId {
  return value === "parametres" || value === "corbeille" || isModuleKey(value);
}

export function routeLabel(route: RouteId): string {
  if (route === "parametres") return tr("Paramètres");
  if (route === "corbeille") return tr("Corbeille");
  return getModule(route).label;
}
