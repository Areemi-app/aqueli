/**
 * Éléments épinglés dans la barre latérale (cahier des charges § 5 : « tout élément peut être
 * épinglé dans la barre latérale ») : une note, une liste, un projet, un contact… ouvert d'un clic.
 * Seuls la sorte et l'identifiant sont gardés (préférences), jamais le titre ni le contenu.
 */
import { useSyncExternalStore } from "react";
import type { MenuAction } from "../components/ContextMenu";
import { ICONS } from "../components/icons";
import { mergeOrder } from "../lib/dragDrop";
import { readPref, writePref } from "../lib/storage";
import { LINK_KINDS, type LinkKind } from "../links/links";
import { tr } from "../i18n/i18n";

export type PinKind = LinkKind | "list";

export interface Pin {
  kind: PinKind;
  id: string;
}

export const MAX_PINS = 12;
const PREF = "epingles";

const isPinKind = (v: unknown): v is PinKind => v === "list" || LINK_KINDS.includes(v as LinkKind);

export function isPinList(value: unknown): value is Pin[] {
  return (
    Array.isArray(value) &&
    value.every((p) => typeof p === "object" && p !== null && isPinKind((p as Pin).kind) && typeof (p as Pin).id === "string" && (p as Pin).id.length > 0)
  );
}

export const samePin = (a: Pin, b: Pin) => a.kind === b.kind && a.id === b.id;

/** Épingle ou retire ; au-delà de la limite, le plus ancien épinglé laisse sa place. */
export function togglePin(pins: readonly Pin[], pin: Pin): Pin[] {
  if (pins.some((p) => samePin(p, pin))) return pins.filter((p) => !samePin(p, pin));
  const next = [...pins, { kind: pin.kind, id: pin.id }];
  return next.length > MAX_PINS ? next.slice(next.length - MAX_PINS) : next;
}

/** Déplace un élément épinglé d'un cran vers le haut (-1) ou le bas (+1). */
export function movePin(pins: readonly Pin[], pin: Pin, by: -1 | 1): Pin[] {
  const i = pins.findIndex((p) => samePin(p, pin));
  const j = i + by;
  if (i < 0 || j < 0 || j >= pins.length) return [...pins];
  const next = [...pins];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Clé d'un élément épinglé, pour le glisser-déposer : « note:12 ». */
export const pinKey = (p: Pin) => `${p.kind}:${p.id}`;

/** Nouvel ordre des épinglés affichés ; ceux qui ne s'affichent pas (supprimés) gardent leur place. */
export function reorderPins(pins: readonly Pin[], keys: readonly string[]): Pin[] {
  const order = mergeOrder(pins.map(pinKey), keys);
  return order.map((k) => pins.find((p) => pinKey(p) === k)!).filter(Boolean);
}

// ——— Magasin partagé (barre latérale et menus) ———

let current: Pin[] | null = null;
const listeners = new Set<() => void>();

function read(): Pin[] {
  current ??= readPref(PREF, [] as Pin[], isPinList).slice(0, MAX_PINS);
  return current;
}

function write(next: Pin[]): void {
  current = next;
  writePref(PREF, next);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface PinsApi {
  pins: readonly Pin[];
  isPinned: (pin: Pin) => boolean;
  toggle: (pin: Pin) => void;
  move: (pin: Pin, by: -1 | 1) => void;
  /** Nouvel ordre (glisser-déposer), d'après les clés `pinKey`. */
  reorder: (keys: string[]) => void;
}

/** Entrée de menu « Ajouter à la barre latérale » ou « Retirer de la barre latérale ». */
export function usePinEntry(): (pin: Pin) => MenuAction {
  const { isPinned, toggle } = usePins();
  return (pin) => ({
    label: isPinned(pin) ? tr("Retirer de la barre latérale") : tr("Ajouter à la barre latérale"),
    icon: ICONS.sidebar,
    run: () => toggle(pin),
  });
}

export function usePins(): PinsApi {
  const pins = useSyncExternalStore(subscribe, read);
  return {
    pins,
    isPinned: (pin) => pins.some((p) => samePin(p, pin)),
    toggle: (pin) => write(togglePin(read(), pin)),
    move: (pin, by) => write(movePin(read(), pin, by)),
    reorder: (keys) => write(reorderPins(read(), keys)),
  };
}
