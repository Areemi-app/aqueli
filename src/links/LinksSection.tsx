/**
 * Section « Liens » d'un élément : ce qui lui est relié (tâches, notes, contacts, documents…),
 * à ouvrir ou à délier ; « Lier » choisit un élément de n'importe quel module.
 */
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useItemMenu } from "../components/ContextMenu";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { useDocumentsIfAny } from "../documents/DocumentsProvider";
import { KEYS } from "../lib/itemKeys";
import { getModule } from "../modules/modules";
import { matchScore, words } from "../search/fuzzy";
import { itemColor, KIND_LABELS, useItemIndex, type IndexedItem } from "./itemIndex";
import { LINK_KINDS, type ItemRef, type LinkKind } from "./links";
import { useLinksIfAny } from "./LinksProvider";
import { tr } from "../i18n/i18n";

const sameRef = (a: ItemRef, b: ItemRef) => a.kind === b.kind && a.id === b.id;

interface LinksSectionProps {
  item: ItemRef;
  /** Types montrés et proposés ; tous par défaut. */
  kinds?: readonly LinkKind[];
  title?: string;
  /** Texte du bouton (« Lier », « Joindre un document »). */
  action?: string;
  /** Phrase quand rien n'est lié ; rien n'est affiché sans elle. */
  empty?: string;
}

function LinkRow({ item, onOpen, onUnlink }: { item: IndexedItem; onOpen: () => void; onUnlink: () => void }) {
  const itemMenu = useItemMenu();
  const m = getModule(item.module);
  const menu = itemMenu(() => [
    { label: tr("Ouvrir"), icon: ICONS.enter, shortcut: KEYS.open, run: onOpen },
    { label: tr("Retirer le lien"), icon: ICONS.close, shortcut: KEYS.remove, danger: true, run: onUnlink },
  ]);
  return (
    <li className="link-row" style={{ "--row-color": itemColor(item) } as CSSProperties} onContextMenu={menu.onContextMenu} onKeyDown={menu.onKeyDown}>
      <ModuleChip color={itemColor(item)} icon={m.icon} size={22} />
      <button type="button" className="link-title" onClick={onOpen} data-closed={item.closed || undefined}>
        <span className="link-name">{item.title}</span>
        <span className="link-detail">{[KIND_LABELS[item.ref.kind].one, item.detail].filter(Boolean).join(" · ")}</span>
      </button>
      <button type="button" className="icon-btn icon-btn--sm link-remove" aria-label={tr("Retirer le lien avec « {title} »", { title: item.title })} title={tr("Retirer le lien")} onClick={onUnlink}>
        <Icon d={ICONS.close} size={12} stroke={2.4} />
      </button>
    </li>
  );
}

export function LinksSection({ item, kinds = LINK_KINDS, title = tr("Liens"), action = tr("Lier"), empty }: LinksSectionProps) {
  const links = useLinksIfAny();
  const index = useItemIndex();
  const [picking, setPicking] = useState(false);
  const linked = useMemo(
    () =>
      (links?.linked(item) ?? [])
        .filter((ref) => kinds.includes(ref.kind))
        .map((ref) => index.get(ref))
        .filter((i): i is IndexedItem => i !== null)
        .sort((a, b) => LINK_KINDS.indexOf(a.ref.kind) - LINK_KINDS.indexOf(b.ref.kind)),
    [links, item, kinds, index],
  );
  if (!links) return null;
  return (
    <section className="links-section" aria-label={title}>
      <div className="links-head">
        <span className="detail-label">{title}</span>
        <button type="button" className="link-btn links-add" onClick={() => setPicking(true)}>
          <Icon d={ICONS.plus} size={12} stroke={2.6} />
          {action}
        </button>
      </div>
      {linked.length > 0 ? (
        <ul className="links-list">
          {linked.map((i) => (
            <LinkRow key={`${i.ref.kind}:${i.ref.id}`} item={i} onOpen={() => index.open(i.ref)} onUnlink={() => void links.unlink(item, i.ref)} />
          ))}
        </ul>
      ) : (
        empty && <p className="links-empty">{empty}</p>
      )}
      {picking && (
        <LinkPicker
          kinds={kinds}
          exclude={[item, ...linked.map((i) => i.ref)]}
          onPick={(ref) => void links.link(item, ref)}
          onClose={() => setPicking(false)}
        />
      )}
    </section>
  );
}

const MAX_RESULTS = 60;

interface LinkPickerProps {
  kinds: readonly LinkKind[];
  exclude: readonly ItemRef[];
  onPick: (ref: ItemRef) => void;
  onClose: () => void;
}

/** Choix d'un élément à lier : recherche tolérante, filtre par type, flèches et Entrée. */
export function LinkPicker({ kinds, exclude, onPick, onClose }: LinkPickerProps) {
  const index = useItemIndex();
  const documents = useDocumentsIfAny();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<LinkKind | "tout">(kinds.length === 1 ? kinds[0]! : "tout");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const candidates = index.items.filter((i) => kinds.includes(i.ref.kind) && (kind === "tout" || i.ref.kind === kind) && !exclude.some((e) => sameRef(e, i.ref)));
    const q = words(query);
    if (q.length === 0) return candidates.filter((i) => !i.closed).slice(0, MAX_RESULTS);
    return candidates
      .map((i) => ({ i, score: matchScore(q, { titleWords: words(i.title), bodyWords: words(i.detail) }) - (i.closed ? 0.5 : 0) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.i);
  }, [index.items, kinds, kind, exclude, query]);
  const current = Math.min(active, Math.max(0, results.length - 1));

  const pick = (i: IndexedItem | undefined) => {
    if (!i) return;
    onPick(i.ref);
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, Math.min(results.length - 1, current + (e.key === "ArrowDown" ? 1 : -1)));
      setActive(next);
      listRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[current]);
    }
  };

  return (
    <Dialog title={kinds.length === 1 ? tr("Lier : {one}", { one: KIND_LABELS[kinds[0]!].one.toLowerCase() }) : tr("Lier un élément")} onClose={onClose} className="dialog--links">
      <div className="link-picker">
        <div className="field-box link-search">
          <Icon d={ICONS.search} size={15} stroke={2.2} />
          <input
            className="field-input"
            type="search"
            value={query}
            placeholder={tr("Rechercher")}
            aria-label={tr("Rechercher l'élément à lier")}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            data-autofocus
          />
        </div>
        {kinds.length > 1 && (
          <div className="link-kinds" role="group" aria-label={tr("Types")}>
            <button type="button" className="pill pill--button" aria-pressed={kind === "tout"} onClick={() => setKind("tout")}>
              {tr("Tout")}
            </button>
            {kinds.map((k) => (
              <button key={k} type="button" className="pill pill--button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {KIND_LABELS[k].many}
              </button>
            ))}
          </div>
        )}
        <ul ref={listRef} className="link-results" role="listbox" aria-label={tr("Éléments")}>
          {results.length === 0 && <li className="links-empty">{tr("Aucun élément.")}</li>}
          {results.map((i, n) => (
            <li
              key={`${i.ref.kind}:${i.ref.id}`}
              role="option"
              aria-selected={n === current}
              data-index={n}
              className="palette-item link-result"
              data-closed={i.closed || undefined}
              onPointerMove={() => n !== current && setActive(n)}
              onClick={() => pick(i)}
            >
              <ModuleChip color={itemColor(i)} icon={getModule(i.module).icon} size={24} />
              <span className="gsearch-text">
                <span className="palette-label">{i.title}</span>
                <span className="gsearch-detail">{[KIND_LABELS[i.ref.kind].one, i.detail].filter(Boolean).join(" · ")}</span>
              </span>
            </li>
          ))}
        </ul>
        {documents && kinds.includes("document") && (
          <div className="onb-actions">
            <button
              type="button"
              className="btn-glass"
              onClick={() =>
                void documents.pickAndAdd(null).then((added) => {
                  for (const d of added) onPick({ kind: "document", id: d.id });
                  if (added.length > 0) onClose();
                })
              }
            >
              <Icon d={ICONS.importFile} size={15} stroke={2.2} />
              {tr("Ajouter un fichier")}
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
