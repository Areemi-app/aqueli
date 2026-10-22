import { useEffect, useRef, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { useSpaces } from "../spaces/SpacesProvider";
import { useNavigation } from "../navigation/NavigationProvider";
import { useShortcut } from "../prefs/PreferencesProvider";
import { preselectSettingsTab } from "../screens/settingsTab";
import type { SpaceFilter } from "../spaces/spaces";
import { tr } from "../i18n/i18n";

interface SpaceSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Dot({ color }: { color: string }) {
  return <span className="space-dot" style={{ background: color }} />;
}

/** Menu « Tous les espaces · Perso · Travail… » de la barre de titre (Ctrl+Maj+E). */
export function SpaceSelector({ open, onOpenChange }: SpaceSelectorProps) {
  const { spaces, filter, setFilter } = useSpaces();
  const { go } = useNavigation();
  const spacesKeys = useShortcut("spaces");
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const options: { id: SpaceFilter; name: string; colors: string[] }[] = [
    { id: "tous", name: tr("Tous les espaces"), colors: spaces.slice(0, 3).map((s) => s.color) },
    ...spaces.map((s) => ({ id: s.id, name: s.name, colors: [s.color] })),
  ];
  const current = options.find((o) => o.id === filter) ?? options[0]!;
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.id === filter),
  );

  // À l'ouverture, le focus va sur l'espace sélectionné ; un clic ailleurs referme le menu.
  useEffect(() => {
    if (!open) return;
    itemRefs.current[selectedIndex]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open, selectedIndex, onOpenChange]);

  const close = () => {
    onOpenChange(false);
    buttonRef.current?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current.filter((el): el is HTMLButtonElement => el !== null);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      onOpenChange(false);
    }
  };

  return (
    <div className="space-selector" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn-glass btn-glass--sm space-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={tr("Espace affiché : {name}. Changer d'espace ({spacesKeys})", { name: current.name, spacesKeys })}
        title={tr("Choisir l'espace affiché ({spacesKeys})", { spacesKeys })}
        onClick={() => onOpenChange(!open)}
      >
        <span className="space-dots">
          {current.colors.map((c) => (
            <Dot key={c} color={c} />
          ))}
        </span>
        <span className="space-name">{current.name}</span>
        <Icon d={ICONS.chevronDown} size={14} stroke={2.4} />
      </button>

      {open && (
        <div className="menu glass-popover" role="menu" aria-label={tr("Espaces")} onKeyDown={onMenuKeyDown}>
          {options.map((o, i) => (
            <button
              key={o.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={o.id === filter}
              className="menu-item"
              onClick={() => {
                setFilter(o.id);
                close();
              }}
            >
              <span className="space-dots space-dots--menu">
                {o.colors.map((c) => (
                  <Dot key={c} color={c} />
                ))}
              </span>
              <span className="menu-label">{o.name}</span>
              {o.id === filter && <Icon d={ICONS.check} size={14} stroke={3} className="menu-check" />}
            </button>
          ))}
          <div className="menu-sep" role="separator" />
          <button
            ref={(el) => {
              itemRefs.current[options.length] = el;
            }}
            type="button"
            role="menuitem"
            className="menu-item menu-item--quiet"
            onClick={() => {
              close();
              preselectSettingsTab("espaces");
              go("parametres");
            }}
          >
            <Icon d={ICONS.spaces} size={14} />
            <span className="menu-label">{tr("Gérer les espaces…")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
