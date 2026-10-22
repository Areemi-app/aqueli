/** Barre latérale › Épinglés : les éléments épinglés, ouverts d'un clic (absents s'il n'y en a aucun). */
import { useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { useContextMenu } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { listRequest } from "../lib/request";
import { startDrag } from "../lib/dragDrop";
import { readPref, writePref } from "../lib/storage";
import { itemColor, KIND_LABELS, useItemIndex } from "../links/itemIndex";
import { useListsIfAny } from "../lists/ListsProvider";
import { getModule } from "../modules/modules";
import { useNavigation } from "../navigation/NavigationProvider";
import { pinKey, usePins, type Pin } from "./pins";
import { tr } from "../i18n/i18n";

const CLOSED = "epinglesReplies";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

interface PinView {
  pin: Pin;
  title: string;
  kindLabel: string;
  color: string;
  icon: string;
  open: () => void;
}

/** Titre, pastille et ouverture d'un élément épinglé ; `null` s'il n'existe plus (supprimé). */
function usePinViews(pins: readonly Pin[]): PinView[] {
  const index = useItemIndex();
  const lists = useListsIfAny()?.lists ?? [];
  const { go } = useNavigation();
  return pins.flatMap((pin): PinView[] => {
    if (pin.kind === "list") {
      const list = lists.find((l) => l.id === pin.id);
      if (!list) return [];
      const m = getModule("listes");
      return [
        {
          pin,
          title: list.name,
          kindLabel: tr("Liste"),
          color: list.color ?? m.color,
          icon: m.icon,
          open: () => {
            go("listes");
            listRequest.request(list.id);
          },
        },
      ];
    }
    const ref = { kind: pin.kind, id: pin.id };
    const item = index.get(ref);
    if (!item) return [];
    return [
      {
        pin,
        title: item.title,
        kindLabel: KIND_LABELS[pin.kind].one,
        color: itemColor(item),
        icon: getModule(item.module).icon,
        open: () => index.open(ref),
      },
    ];
  });
}

export function PinnedSection() {
  const { pins, toggle, move, reorder } = usePins();
  const views = usePinViews(pins);
  const openMenu = useContextMenu();
  const [closed, setClosed] = useState(() => readPref(CLOSED, false, isBool));
  if (views.length === 0) return null;

  const toggleClosed = () =>
    setClosed((c) => {
      writePref(CLOSED, !c);
      return !c;
    });

  const menu = (e: MouseEvent, v: PinView, i: number) =>
    openMenu(e, [
      { label: tr("Ouvrir"), icon: ICONS.enter, run: v.open },
      "separator",
      { label: tr("Monter"), icon: ICONS.arrowUp, disabled: i === 0, run: () => move(v.pin, -1) },
      { label: tr("Descendre"), icon: ICONS.arrowDown, disabled: i === views.length - 1, run: () => move(v.pin, 1) },
      "separator",
      { label: tr("Retirer de la barre latérale"), icon: ICONS.close, run: () => toggle(v.pin) },
    ]);

  // Glisser un épinglé pour le remettre en ordre (« Monter », « Descendre » au clic droit).
  const drag = (v: PinView) => (e: PointerEvent<HTMLElement>) =>
    startDrag(e, { kind: "epingle", ids: [pinKey(v.pin)], label: v.title, color: v.color }, { sort: { group: "epingles", onSort: (keys) => reorder(keys) } });

  return (
    <div className="nav-group nav-pins" data-closed={closed || undefined}>
      <button type="button" className="nav-group-head" aria-expanded={!closed} title={closed ? tr("Déplier « Épinglés »") : tr("Replier « Épinglés »")} onClick={toggleClosed}>
        <span className="nav-group-label">{tr("Épinglés")}</span>
        <span className="nav-group-line" aria-hidden="true" />
        <Icon d={ICONS.chevronDown} size={11} stroke={2.6} />
      </button>
      {closed ? (
        <div className="nav-group-chips" data-sort="epingles">
          {views.map((v, i) => (
            <button
              key={`${v.pin.kind}:${v.pin.id}`}
              type="button"
              className="nav-mini"
              style={{ "--nav-color": v.color } as CSSProperties}
              aria-label={tr("{kind} : {title}", { kind: v.kindLabel, title: v.title })}
              title={`${v.title} · ${v.kindLabel}`}
              onClick={v.open}
              onContextMenu={(e) => menu(e, v, i)}
              data-sort-id={pinKey(v.pin)}
              onPointerDown={drag(v)}
            >
              <ModuleChip color={v.color} icon={v.icon} size={24} />
            </button>
          ))}
        </div>
      ) : (
        <div className="nav-pins-list" data-sort="epingles">
        {views.map((v, i) => (
          <button
            key={`${v.pin.kind}:${v.pin.id}`}
            type="button"
            className="nav-item nav-pin"
            style={{ "--nav-color": v.color } as CSSProperties}
            aria-label={tr("{kind} : {title}", { kind: v.kindLabel, title: v.title })}
            title={`${v.title} · ${v.kindLabel}`}
            onClick={v.open}
            onContextMenu={(e) => menu(e, v, i)}
            data-sort-id={pinKey(v.pin)}
            onPointerDown={drag(v)}
          >
            <ModuleChip color={v.color} icon={v.icon} />
            <span className="nav-label">{v.title}</span>
          </button>
        ))}
        </div>
      )}
    </div>
  );
}
