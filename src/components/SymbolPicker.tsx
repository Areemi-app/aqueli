/**
 * Choix d'un symbole. Dans la fenêtre d'édition : le symbole choisi, les derniers utilisés et
 * « Tous les symboles… », qui ouvre le sélecteur complet : recherche (sans accents, avec des
 * synonymes), onglets des catégories, grille de toute la bibliothèque.
 *
 * Clavier : dans les grilles, flèches pour se déplacer (haut et bas d'une rangée), Début et Fin,
 * Entrée ou Espace pour choisir ; dans le sélecteur, ↓ depuis la recherche descend dans la
 * grille et Échap le ferme.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { fold } from "../lib/fold";
import { readPref, writePref } from "../lib/storage";
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import { useAnchoredPopover } from "./popover";
import { SYMBOL_CATEGORIES, SYMBOLS, symbolOf, type SymbolDef } from "./symbols";
import { tr, trn } from "../i18n/i18n";

const RECENT_KEY = "symbolesRecents";
/** Symboles récents gardés (et montrés en tête du sélecteur). */
const MAX_RECENT = 16;
/** Symboles proposés dans la fenêtre d'édition, à côté du symbole choisi. */
const STRIP = 7;

const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

export function readRecentSymbols(): string[] {
  return readPref<string[]>(RECENT_KEY, [], isIdList).filter((id) => symbolOf(id));
}

function rememberSymbol(id: string) {
  writePref(RECENT_KEY, [id, ...readRecentSymbols().filter((x) => x !== id)].slice(0, MAX_RECENT));
}

/** Symboles dont le nom ou les mots-clés contiennent tous les mots cherchés. */
export function searchSymbols(query: string): SymbolDef[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return SYMBOLS.filter((s) => {
    const text = fold(`${s.label} ${s.keywords} ${s.id}`);
    return words.every((w) => text.includes(w));
  });
}

/** Proposés dans la fenêtre d'édition : les récents, puis un symbole de chaque catégorie. */
export function stripSymbols(recent: readonly string[], selected: string | null): SymbolDef[] {
  const ids = [...recent, ...SYMBOL_CATEGORIES.map((c) => c.icon)].filter((id) => id !== selected);
  return [...new Set(ids)].slice(0, STRIP).map((id) => symbolOf(id)!);
}

/** Déplacement au clavier dans une grille de boutons ; rend le bouton à focaliser. */
function gridMove(e: KeyboardEvent<HTMLElement>, container: HTMLElement): HTMLButtonElement | null {
  const buttons = [...container.querySelectorAll<HTMLButtonElement>("button[data-symbol]")];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return null;
  const current = buttons[index]!;
  let next: HTMLButtonElement | undefined;
  if (e.key === "ArrowRight") next = buttons[index + 1];
  else if (e.key === "ArrowLeft") next = buttons[index - 1];
  else if (e.key === "Home") next = buttons[0];
  else if (e.key === "End") next = buttons[buttons.length - 1];
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    // Le bouton le plus proche à la verticale, dans la rangée suivante (ou précédente).
    const down = e.key === "ArrowDown";
    const candidates = buttons.filter((b) => (down ? b.offsetTop > current.offsetTop + 4 : b.offsetTop < current.offsetTop - 4));
    if (candidates.length) {
      const rowTop = down ? Math.min(...candidates.map((b) => b.offsetTop)) : Math.max(...candidates.map((b) => b.offsetTop));
      const row = candidates.filter((b) => Math.abs(b.offsetTop - rowTop) < 4);
      next = row.reduce((best, b) => (Math.abs(b.offsetLeft - current.offsetLeft) < Math.abs(best.offsetLeft - current.offsetLeft) ? b : best), row[0]!);
    }
  } else return null;
  e.preventDefault();
  return next ?? null;
}

interface SymbolPickerProps {
  /** `null` : aucun choix (le symbole par défaut s'applique). */
  value: string | null;
  onChange: (id: string) => void;
  /** Nom du groupe pour les lecteurs d'écran (« Symbole du carnet »). */
  label: string;
  /** Couleur de la pastille choisie (sinon celle du thème). */
  color?: string | null;
}

function SymbolButton({ symbol, selected, tabbable, onPick }: { symbol: SymbolDef; selected: boolean; tabbable: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      data-symbol={symbol.id}
      aria-checked={selected}
      tabIndex={tabbable ? 0 : -1}
      aria-label={symbol.label}
      title={symbol.label}
      className="icon-choice symbol-choice"
      onClick={onPick}
    >
      <Icon d={symbol.path} size={18} />
    </button>
  );
}

export function SymbolPicker({ value, onChange, label, color }: SymbolPickerProps) {
  const selected = symbolOf(value) ?? null;
  const [recent, setRecent] = useState(readRecentSymbols);
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const strip = stripSymbols(recent, selected?.id ?? null);
  const shown = selected ? [selected, ...strip] : strip;
  const tabbable = shown[0]?.id;
  const style = color ? ({ "--symbol-color": color } as CSSProperties) : undefined;

  const pick = (id: string) => {
    rememberSymbol(id);
    setRecent(readRecentSymbols());
    onChange(id);
  };

  return (
    <div className="symbol-field" style={style}>
      <div
        className="symbol-strip"
        role="radiogroup"
        aria-label={label}
        onKeyDown={(e) => {
          const next = gridMove(e, e.currentTarget);
          if (next) {
            next.focus();
            next.click();
          }
        }}
      >
        {shown.map((s) => (
          <SymbolButton key={s.id} symbol={s} selected={s.id === selected?.id} tabbable={s.id === tabbable} onPick={() => pick(s.id)} />
        ))}
      </div>
      <button ref={moreRef} type="button" className="btn-glass btn-glass--sm symbol-more" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon d={ICONS.spaces} size={14} stroke={2.2} />
        {tr("Tous les symboles…")}
      </button>
      {open && (
        <SymbolBrowser
          anchor={moreRef}
          label={label}
          selected={selected?.id ?? null}
          recent={recent}
          style={style}
          onPick={(id) => {
            pick(id);
            setOpen(false);
            moreRef.current?.focus();
          }}
          onClose={() => {
            setOpen(false);
            moreRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

interface BrowserProps {
  anchor: RefObject<HTMLButtonElement | null>;
  label: string;
  selected: string | null;
  recent: readonly string[];
  style?: CSSProperties;
  onPick: (id: string) => void;
  onClose: () => void;
}

/** Sélecteur complet : recherche, onglets des catégories, grille de toute la bibliothèque. */
function SymbolBrowser({ anchor, label, selected, recent, style, onPick, onClose }: BrowserProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(recent.length ? "recents" : SYMBOL_CATEGORIES[0]!.id);
  const popRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const close = useCallback(() => onClose(), [onClose]);
  const place = useAnchoredPopover(true, anchor, popRef, close, { height: 440, minWidth: 340 });

  const sections = useMemo(() => {
    const recents = recent.map((id) => symbolOf(id)!).filter(Boolean);
    return [
      ...(recents.length ? [{ id: "recents", label: tr("Récents"), icon: "horloge", symbols: recents }] : []),
      ...SYMBOL_CATEGORIES.map((c) => ({ id: c.id, label: c.label, icon: c.icon, symbols: c.symbols })),
    ];
  }, [recent]);
  const results = query.trim() ? searchSymbols(query) : null;
  // Le premier symbole joignable au clavier : le choisi s'il est affiché, sinon le premier.
  const firstShown = results ? results[0]?.id : sections[0]?.symbols[0]?.id;
  const tabbable = selected && (results ? results.some((s) => s.id === selected) : true) ? selected : firstShown;
  // Un seul bouton joignable par Tab, même si le symbole figure aussi dans « Récents ».
  const tabSection = sections.find((c) => c.symbols.some((x) => x.id === tabbable))?.id;

  useEffect(() => searchRef.current?.focus(), []);

  // L'onglet suit la catégorie visible pendant le défilement.
  const onScroll = () => {
    const box = scrollRef.current;
    if (!box || results) return;
    const heads = [...box.querySelectorAll<HTMLElement>("[data-section]")];
    const current = heads.filter((h) => h.offsetTop - box.offsetTop <= box.scrollTop + 12).pop();
    if (current) setActive(current.dataset.section!);
  };
  const goTo = (id: string) => {
    setQuery("");
    setActive(id);
    requestAnimationFrame(() => {
      const box = scrollRef.current;
      const head = box?.querySelector<HTMLElement>(`[data-section="${id}"]`);
      if (box && head) box.scrollTop = head.offsetTop - box.offsetTop;
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.target === searchRef.current) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollRef.current?.querySelector<HTMLButtonElement>("button[data-symbol]")?.focus();
      } else if (e.key === "Enter" && results?.[0]) {
        e.preventDefault();
        onPick(results[0].id);
      }
      return;
    }
    if (!scrollRef.current?.contains(e.target as Node)) return;
    if (e.key === "ArrowUp") {
      // Depuis la première rangée, la flèche vers le haut remonte à la recherche.
      const first = scrollRef.current.querySelector<HTMLButtonElement>("button[data-symbol]");
      if (first && (e.target as HTMLElement).offsetTop <= first.offsetTop + 4) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
    }
    const next = gridMove(e, scrollRef.current);
    next?.focus();
  };

  return createPortal(
    <div ref={popRef} className="symbol-pop glass-popover" style={{ ...place, ...style }} role="dialog" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <h2 id={titleId} className="sr-only">
        {label}
      </h2>
      <div className="symbol-search field-box">
        <Icon d={ICONS.search} size={15} stroke={2.2} />
        <input
          ref={searchRef}
          className="field-input"
          value={query}
          placeholder={tr("Rechercher un symbole : maison, sport, argent…")}
          aria-label={tr("Rechercher un symbole")}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="symbol-tabs" role="tablist" aria-label={tr("Catégories de symboles")}>
        {sections.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            className="symbol-tab"
            aria-selected={!results && active === c.id}
            aria-label={c.label}
            title={c.label}
            onClick={() => goTo(c.id)}
          >
            <Icon d={c.id === "recents" ? ICONS.history : symbolOf(c.icon)!.path} size={16} stroke={2} />
          </button>
        ))}
      </div>
      <div ref={scrollRef} className="symbol-scroll" role="radiogroup" aria-label={label} onScroll={onScroll}>
        {results ? (
          results.length === 0 ? (
            <p className="symbol-empty">{tr("Aucun symbole ne correspond.")}</p>
          ) : (
            <section className="symbol-section">
              <h3 className="symbol-section-title">
                {trn(results.length, "{n} résultat", "{n} résultats")}
              </h3>
              <div className="symbol-grid">
                {results.map((s) => (
                  <SymbolButton key={s.id} symbol={s} selected={s.id === selected} tabbable={s.id === tabbable} onPick={() => onPick(s.id)} />
                ))}
              </div>
            </section>
          )
        ) : (
          sections.map((c) => (
            <section key={c.id} className="symbol-section">
              <h3 className="symbol-section-title" data-section={c.id}>
                {c.label}
              </h3>
              <div className="symbol-grid">
                {c.symbols.map((s) => (
                  <SymbolButton
                    key={`${c.id}-${s.id}`}
                    symbol={s}
                    selected={s.id === selected}
                    tabbable={s.id === tabbable && c.id === tabSection}
                    onPick={() => onPick(s.id)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
