import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import {
  canGoBack,
  canGoForward,
  createHistory,
  currentRoute,
  goBack,
  goForward,
  navigateTo,
  type NavHistory,
} from "./history";
import { HOME_ROUTE, isRouteId, type RouteId } from "./routes";
import { readPref, writePref } from "../lib/storage";

type NavAction = { type: "go"; route: RouteId } | { type: "back" } | { type: "forward" };

function reducer(state: NavHistory, action: NavAction): NavHistory {
  switch (action.type) {
    case "go":
      return navigateTo(state, action.route);
    case "back":
      return goBack(state);
    case "forward":
      return goForward(state);
  }
}

interface NavigationContextValue {
  route: RouteId;
  go: (route: RouteId) => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  // La fenêtre rouvre le dernier écran consulté.
  const [history, dispatch] = useReducer(reducer, undefined, () =>
    createHistory(readPref("dernierEcran", HOME_ROUTE, isRouteId)),
  );
  const route = currentRoute(history);

  useEffect(() => writePref("dernierEcran", route), [route]);

  const value = useMemo<NavigationContextValue>(
    () => ({
      route,
      go: (r) => dispatch({ type: "go", route: r }),
      back: () => dispatch({ type: "back" }),
      forward: () => dispatch({ type: "forward" }),
      canBack: canGoBack(history),
      canForward: canGoForward(history),
    }),
    [route, history],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation doit être utilisé dans NavigationProvider");
  return ctx;
}
