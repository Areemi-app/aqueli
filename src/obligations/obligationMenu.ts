/** Menu du clic droit d'une obligation (liste, frise, Accueil, calendrier). */
import type { MenuEntry } from "../components/ContextMenu";
import { ICONS } from "../components/icons";
import { KEYS } from "../lib/itemKeys";
import { usePinEntry } from "../pins/pins";
import type { Obligation } from "./obligations";
import { useObligations } from "./ObligationsProvider";
import { tr } from "../i18n/i18n";

export function useObligationMenu(): (obligation: Obligation, open: () => void) => MenuEntry[] {
  const { pay, update, remove, duplicate } = useObligations();
  const pinEntry = usePinEntry();
  return (o, open) => [
    { label: tr("Modifier"), icon: ICONS.pencil, shortcut: KEYS.open, run: open },
    ...(o.status === "a-faire" ? [{ label: tr("Marquer comme payée"), icon: ICONS.check, run: () => void pay(o) }] : []),
    ...(o.status === "paye" ? [{ label: tr("Marquer à payer"), icon: ICONS.repeat, run: () => void update(o, { status: "a-faire" }) }] : []),
    o.status === "resilie"
      ? { label: tr("Réactiver"), icon: ICONS.repeat, run: () => void update(o, { status: "a-faire" }) }
      : { label: tr("Marquer comme résiliée"), icon: ICONS.close, run: () => void update(o, { status: "resilie" }) },
    "separator",
    { label: tr("Dupliquer"), icon: ICONS.layers, shortcut: KEYS.duplicate, run: () => void duplicate(o) },
    pinEntry({ kind: "obligation", id: o.id }),
    "separator",
    { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void remove(o) },
  ];
}
