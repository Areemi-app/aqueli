import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import type { Command, CommandGroup } from "./commands";
import { searchItems } from "./search";
import { tr } from "../i18n/i18n";

const GROUP_LABELS: Record<CommandGroup, string> = { Module: tr("Module"), Thème: tr("Thème"), Espace: tr("Espace"), Action: tr("Action") };
interface CommandPaletteProps {
  commands: readonly Command[];
  onClose: () => void;
  /** Dernier choix de la liste : « Rechercher « … » partout ». */
  onSearchEverywhere?: (query: string) => void;
}

/** Palette de commandes (Ctrl+K) : taper quelques lettres, flèches pour choisir, Entrée pour lancer. */
export function CommandPalette({ commands, onClose, onSearchEverywhere }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();

  const found = useMemo(() => searchItems(commands, query), [commands, query]);
  // Une saisie peut aussi viser le contenu : dernier choix, la recherche globale.
  const results = useMemo<Command[]>(
    () =>
      query.trim() && onSearchEverywhere
        ? [
            ...found,
            {
              id: "search:query",
              group: "Action",
              label: tr("Rechercher « {query} » partout", { query: query.trim() }),
              color: "var(--aq-gel)",
              icon: ICONS.search,
              run: () => onSearchEverywhere(query.trim()),
            },
          ]
        : found,
    [found, query, onSearchEverywhere],
  );
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  // Le focus revient là où il était quand la palette se ferme.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    // Laisse la palette se fermer avant de lancer la commande (le fondu de thème en profite).
    window.setTimeout(command.run, 0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(results.length ? (activeIndex + 1) % results.length : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(results.length ? (activeIndex - 1 + results.length) % results.length : 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[activeIndex]);
    } else if (e.key === "Tab") {
      e.preventDefault(); // le focus reste dans la palette
    }
  };

  const optionId = (i: number) => `${baseId}-option-${i}`;

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="palette glass-popover"
        role="dialog"
        aria-modal="true"
        aria-label={tr("Palette de commandes")}
        onKeyDown={onKeyDown}
      >
        <div className="palette-input">
          <Icon d={ICONS.search} size={18} stroke={2.2} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${baseId}-list`}
            aria-activedescendant={results.length ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
            placeholder={tr("Rechercher une commande")}
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <kbd className="kbd">{tr("Échap")}</kbd>
        </div>

        <ul ref={listRef} id={`${baseId}-list`} role="listbox" aria-label={tr("Commandes")} className="palette-list">
          {results.map((c, i) => (
            <li
              key={c.id}
              id={optionId(i)}
              data-index={i}
              role="option"
              aria-selected={i === activeIndex}
              className="palette-item"
              onPointerMove={() => i !== activeIndex && setActive(i)}
              onClick={() => run(c)}
            >
              <ModuleChip color={c.color} icon={c.icon} size={26} />
              <span className="palette-label">{c.label}</span>
              <span className="palette-group">{GROUP_LABELS[c.group]}</span>
              {c.shortcut && <kbd className="kbd">{c.shortcut}</kbd>}
            </li>
          ))}
        </ul>

        {found.length === 0 && !onSearchEverywhere && (
          <p className="palette-empty">{tr("Aucun résultat pour « {query} ».", { query })}</p>
        )}

        <div className="palette-footer">
          <span>
            <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd>{tr(" Naviguer")}
          </span>
          <span>
            <kbd className="kbd">{tr("Entrée")}</kbd>{tr(" Valider")}
          </span>
          <span>
            <kbd className="kbd">{tr("Échap")}</kbd>{tr(" Fermer")}
          </span>
        </div>
      </div>
    </div>
  );
}
