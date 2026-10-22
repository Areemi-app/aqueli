/**
 * Liste déroulante d'Aqueli : un bouton en verre et une liste en verre, à la place de celle de
 * Windows (motif « select-only combobox » du W3C). Le focus reste sur le bouton ; l'option
 * active est annoncée par `aria-activedescendant`.
 *
 * Clavier : ↓ ↑ Entrée Espace ouvrent ; dans la liste, ↓ ↑ Début Fin Page↑ Page↓ se déplacent,
 * une lettre va à l'option qui commence ainsi, Entrée, Espace ou Tab choisissent, Échap ferme
 * sans rien changer.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { fold } from "../lib/fold";
import { Icon } from "./Icon";
import { ICONS } from "./icons";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Groupe de la liste (« Europe »…) : les options d'un même groupe se suivent. */
  group?: string;
  /** Symbole affiché devant le libellé (chemin SVG). */
  icon?: string;
  /** Pastille de couleur devant le libellé. */
  color?: string;
  disabled?: boolean;
}

interface SelectProps<T extends string> {
  id?: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Nom lu par le Narrateur quand aucune étiquette `<label for>` ne désigne la liste. */
  label?: string;
  className?: string;
}

/** Hauteur maximale de la liste ouverte. */
const MAX_HEIGHT = 320;
/** Lettres tapées à la suite pour aller à une option (« fr » pour « France »). */
const TYPE_AHEAD_MS = 600;

/** Options regroupées dans leur ordre ; celles sans groupe restent à leur place. */
export function groupsOf<T extends string>(options: readonly SelectOption<T>[]): [string, SelectOption<T>[]][] {
  const groups: [string, SelectOption<T>[]][] = [];
  for (const o of options) {
    const last = groups[groups.length - 1];
    if (last && last[0] === (o.group ?? "")) last[1].push(o);
    else groups.push([o.group ?? "", [o]]);
  }
  return groups;
}

/** Option suivante (ou précédente) qui peut être choisie, à partir de `from`. */
export function nextEnabled<T extends string>(options: readonly SelectOption<T>[], from: number, step: number): number {
  for (let i = from + step; i >= 0 && i < options.length; i += step) if (!options[i]!.disabled) return i;
  return from;
}

/** Une page plus bas (`step` positif) ou plus haut, sur une option qui peut être choisie. */
export function pageFrom<T extends string>(options: readonly SelectOption<T>[], from: number, step: number): number {
  let i = Math.max(0, Math.min(options.length - 1, from + step));
  while (i !== from && options[i]!.disabled) i -= Math.sign(step);
  return i;
}

/** Première option dont le libellé commence par `typed` (sans accents ni majuscules), après `from`. */
export function matchTyped<T extends string>(options: readonly SelectOption<T>[], typed: string, from: number): number {
  const wanted = fold(typed);
  const n = options.length;
  // Une même lettre répétée passe d'une option à la suivante qui commence par elle.
  const repeated = wanted.length > 1 && [...wanted].every((c) => c === wanted[0]);
  const prefix = repeated ? wanted[0]! : wanted;
  const start = repeated || wanted.length === 1 ? from + 1 : from;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    const o = options[i]!;
    if (!o.disabled && fold(o.label).startsWith(prefix)) return i;
  }
  return -1;
}

function Swatch({ option }: { option: SelectOption<string> }) {
  if (option.color) return <span className="select-dot" style={{ "--dot": option.color } as CSSProperties} aria-hidden="true" />;
  if (option.icon) return <Icon d={option.icon} size={15} className="select-icon" />;
  return null;
}

export function Select<T extends string>({ id, value, options, onChange, disabled, label, className }: SelectProps<T>) {
  const autoId = useId();
  const listId = `${autoId}-liste`;
  const optionId = (i: number) => `${autoId}-option-${i}`;
  const selected = Math.max(0, options.findIndex((o) => o.value === value));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selected);
  const [place, setPlace] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const show = (at = selected) => {
    if (disabled) return;
    setActive(at);
    setOpen(true);
  };
  const choose = (i: number) => {
    const o = options[i];
    setOpen(false);
    if (o && !o.disabled && o.value !== value) onChange(o.value);
  };

  // Placée sous le bouton, ou au-dessus s'il n'y a pas la place ; au moins aussi large que lui.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < Math.min(MAX_HEIGHT, 180) && above > below;
    const left = Math.min(r.left, Math.max(8, window.innerWidth - Math.max(r.width, 200) - 8));
    setPlace({
      left,
      minWidth: r.width,
      maxWidth: window.innerWidth - left - 8,
      maxHeight: Math.min(MAX_HEIGHT, up ? above : below),
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  }, [open]);

  // L'option active reste visible quand on se déplace au clavier.
  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  // Fermée par un clic ailleurs, un défilement de la page ou un changement de taille de la fenêtre.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    };
    const scrolled = (e: Event) => {
      if (!listRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const resized = () => setOpen(false);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", resized);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", resized);
    };
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    const printable = e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.altKey && !e.metaKey;
    if (printable) {
      const now = Date.now();
      typed.current = { text: now - typed.current.at < TYPE_AHEAD_MS ? typed.current.text + e.key : e.key, at: now };
      const found = matchTyped(options, typed.current.text, open ? active : selected);
      if (found >= 0) open ? setActive(found) : show(found);
      else if (!open) show();
      handled();
      return;
    }
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) show();
      else if (e.key === "Home") show(nextEnabled(options, -1, 1));
      else if (e.key === "End") show(nextEnabled(options, options.length, -1));
      else return;
      handled();
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        setActive((i) => nextEnabled(options, i, 1));
        break;
      case "ArrowUp":
        setActive((i) => nextEnabled(options, i, -1));
        break;
      case "Home":
        setActive(nextEnabled(options, -1, 1));
        break;
      case "End":
        setActive(nextEnabled(options, options.length, -1));
        break;
      case "PageDown":
        setActive((i) => pageFrom(options, i, 10));
        break;
      case "PageUp":
        setActive((i) => pageFrom(options, i, -10));
        break;
      case "Enter":
      case " ":
        choose(active);
        break;
      case "Tab":
        choose(active);
        return;
      case "Escape":
        setOpen(false);
        break;
      default:
        return;
    }
    handled();
  };

  const current = options[selected];
  let index = -1;

  return (
    <div className={className ? `select-box ${className}` : "select-box"}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        className="select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-label={label}
        // Choix en entier au survol, s'il est coupé faute de place.
        title={current?.label}
        disabled={disabled}
        data-open={open || undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        {/* Toutes les options occupent la même case : la liste garde la largeur de la plus longue. */}
        <span className="select-sizer">
          {options.map((o, i) => (
            <span key={o.value} className="select-value" aria-hidden={i !== selected || undefined} data-shown={i === selected || undefined}>
              <Swatch option={o} />
              <span className="select-text">{o.label}</span>
            </span>
          ))}
          {!current && <span className="select-value" data-shown />}
        </span>
      </button>
      <Icon d={ICONS.chevronDown} size={14} stroke={2.4} className="select-chevron" />
      {open &&
        createPortal(
          <ul ref={listRef} id={listId} role="listbox" className="select-list glass-popover" style={place} aria-label={label} tabIndex={-1}>
            {groupsOf(options).map(([group, list]) => (
              <li key={group || "sans-groupe"} role="presentation" className="select-section">
                {group && <span className="select-group">{group}</span>}
                <ul role="group" aria-label={group || undefined} className="select-options">
                  {list.map((o) => {
                    index++;
                    const i = index;
                    return (
                      <li
                        key={o.value}
                        id={optionId(i)}
                        role="option"
                        className="select-option"
                        aria-selected={i === selected}
                        aria-disabled={o.disabled || undefined}
                        data-active={i === active || undefined}
                        onPointerMove={() => !o.disabled && i !== active && setActive(i)}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => {
                          choose(i);
                          buttonRef.current?.focus();
                        }}
                      >
                        <Swatch option={o} />
                        <span className="select-text">{o.label}</span>
                        {i === selected && <Icon d={ICONS.check} size={14} stroke={2.8} className="select-check" />}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
