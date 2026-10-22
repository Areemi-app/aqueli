/**
 * Écran Listes (cahier des charges § 4.11) : colonne des listes (archivées à part), liste ouverte
 * en vue liste (rangée par rayon, cases à cocher, valeurs des colonnes) ou galerie (images),
 * saisie rapide, fiche d'un élément, création d'après un modèle.
 */
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useBulk } from "../app/bulk";
import { dragLabel, mergeOrder, startDrag } from "../lib/dragDrop";
import { useAnchoredPopover } from "../components/popover";
import { ScreenTitle } from "../components/ScreenTitle";
import { useToast } from "../app/ToastProvider";
import { Checkbox } from "../components/Checkbox";
import { useContextMenu, useItemMenu, useScreenMenu, type MenuEntry } from "../components/ContextMenu";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ImageCropper, LIST_FORMATS } from "../components/ImageCropper";
import { ModuleChip } from "../components/ModuleChip";
import { Orb } from "../components/Orb";
import { Segmented } from "../components/Segmented";
import { Select } from "../components/SelectRow";
import { SelectionBar, selectionEntries, useSelection, type SelectionAction } from "../components/SelectionBar";
import { SymbolPicker } from "../components/SymbolPicker";
import { symbolPath } from "../components/symbols";
import { ColorChoices } from "../components/ColorChoices";
import { KEYS } from "../lib/itemKeys";
import { usePinEntry } from "../pins/pins";
import { printDoc, runPrint, usePrint } from "../print/print";
import { listPrintDoc } from "./listPrint";
import { listRequest, NEW_ITEM } from "../lib/request";
import { readPref, writePref } from "../lib/storage";
import { getModule } from "../modules/modules";
import { useNewItem } from "../shell/newItem";
import { useSpaces } from "../spaces/SpacesProvider";
import {
  cellText,
  columnId,
  COLUMN_KINDS,
  groupBySection,
  itemMatches,
  LIST_TEMPLATES,
  listAsText,
  listFromTemplate,
  parsePrice,
  sameTitle,
  sortOptions,
  suggestionsFor,
  templateOf,
  totalOf,
  type CellValue,
  type ColumnKind,
  type List,
  type ListColumn,
  type ListInput,
  type ListItem,
  type ListSort,
  type ListTemplate,
} from "./lists";
import { useLists } from "./ListsProvider";
import { tr, trn } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

const isString = (v: unknown): v is string => typeof v === "string";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isSort = (v: unknown): v is ListSort => typeof v === "string" && /^(manuel|nom|recent|colonne:.+)$/.test(v);

// ——— Fiche d'un élément ———

function CellField({ column, value, onChange }: { column: ListColumn; value: CellValue | undefined; onChange: (v: CellValue | null) => void }) {
  const id = useId();
  const [priceText, setPriceText] = useState(typeof value === "number" && column.kind === "prix" ? (value / 100).toFixed(2).replace(".", ",") : "");
  if (column.kind === "case") return <Checkbox checked={value === true} onChange={(on) => onChange(on || null)} label={column.name} />;
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {column.name}
      </label>
      {column.kind === "note" ? (
        <div className="list-stars" role="radiogroup" aria-label={column.name} id={id}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={tr("{n} sur 5", { n })} className="list-star" data-on={typeof value === "number" && n <= value ? true : undefined} onClick={() => onChange(value === n ? null : n)}>
              <Icon d={ICONS.star} size={20} filled={typeof value === "number" && n <= value} stroke={1.8} />
            </button>
          ))}
        </div>
      ) : (
        <div className="field-box">
          <input
            id={id}
            className="field-input"
            type={column.kind === "date" ? "date" : "text"}
            inputMode={column.kind === "prix" ? "decimal" : undefined}
            placeholder={column.kind === "prix" ? "0,00 €" : column.kind === "lien" ? "https://…" : ""}
            value={column.kind === "prix" ? priceText : typeof value === "string" ? value : ""}
            maxLength={1000}
            onChange={(e) => {
              const text = e.target.value;
              if (column.kind === "prix") {
                setPriceText(text);
                onChange(text.trim() ? parsePrice(text) : null);
              } else onChange(text || null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function ItemDialog({ list, item, onClose }: { list: List; item: ListItem; onClose: () => void }) {
  const { updateItem } = useLists();
  const [title, setTitle] = useState(item.title);
  const [section, setSection] = useState(item.section ?? "");
  const [cells, setCells] = useState<Record<string, CellValue>>(item.cells);
  const [done, setDone] = useState(item.done);
  const [image, setImage] = useState(item.image);
  const [cropping, setCropping] = useState<File | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(tr("Saisissez un titre."));
      return;
    }
    if (Object.entries(cells).some(([k, v]) => list.columns.find((c) => c.id === k)?.kind === "prix" && (v === null || Number.isNaN(v)))) {
      setError(tr("Prix illisible."));
      return;
    }
    void updateItem(item, { title: title.trim(), section: section || null, cells, done, image });
    onClose();
  };
  return (
    <Dialog title={tr("Élément")} onClose={onClose}>
      <form className="settings-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={`${ids}-titre`} className="field-label">
            {tr("Titre")}
          </label>
          <div className="field-box" data-invalid={error ? true : undefined}>
            <input id={`${ids}-titre`} className="field-input" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} data-autofocus />
          </div>
        </div>
        {list.sections.length > 0 && (
          <div className="field">
            <label htmlFor={`${ids}-rayon`} className="field-label">
              {list.template === "courses" ? tr("Rayon") : tr("Section")}
            </label>
            <Select id={`${ids}-rayon`} value={section} options={[{ value: "", label: tr("Aucun") }, ...list.sections.map((s) => ({ value: s, label: s }))]} onChange={setSection} />
          </div>
        )}
        {list.columns.map((c) => (
          <CellField
            key={c.id}
            column={c}
            value={cells[c.id]}
            onChange={(v) =>
              setCells((all) => {
                const next = { ...all };
                if (v === null || v === "") delete next[c.id];
                else next[c.id] = v;
                return next;
              })
            }
          />
        ))}
        <div className="field">
          <span className="field-label">{tr("Image")}</span>
          <div className="theme-wallpaper">
            <span className="theme-wallpaper-thumb" style={image ? ({ backgroundImage: `url("${image}")` } as CSSProperties) : undefined} aria-hidden="true">
              {!image && <Icon d={ICONS.image} size={20} stroke={2} />}
            </span>
            <span className="theme-wallpaper-actions">
              <button type="button" className="btn-glass btn-glass--sm" onClick={() => fileRef.current?.click()}>
                <Icon d={ICONS.image} size={14} stroke={2.2} />
                {image ? tr("Changer d'image…") : tr("Choisir une image…")}
              </button>
              {image && (
                <button type="button" className="btn-glass btn-glass--sm" onClick={() => setCropping(image)}>
                  {tr("Recadrer…")}
                </button>
              )}
              {image && (
                <button type="button" className="btn-glass btn-glass--sm" onClick={() => setImage(null)}>
                  {tr("Retirer")}
                </button>
              )}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) setCropping(file);
              }}
            />
          </div>
        </div>
        {cropping && (
          <ImageCropper
            source={cropping}
            formats={LIST_FORMATS}
            maxSide={640}
            maxChars={400_000}
            onDone={(data) => {
              setImage(data);
              setCropping(null);
            }}
            onCancel={() => setCropping(null)}
          />
        )}
        <Checkbox checked={done} onChange={setDone} label={list.template === "courses" ? tr("Dans le panier") : tr("Fait")} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel">
            {tr("Enregistrer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ——— Création et réglages d'une liste ———

function ListEditor({ list, onClose, onSaved }: { list?: List; onClose: () => void; onSaved: (l: List) => void }) {
  const { createList, updateList } = useLists();
  const { spaces, filter } = useSpaces();
  const [template, setTemplate] = useState<ListTemplate | null>(list ? templateOf(list.template) : null);
  const [form, setForm] = useState<ListInput | null>(list ? { name: list.name, template: list.template, columns: list.columns, sections: list.sections, view: list.view, color: list.color, icon: list.icon, spaceId: list.spaceId } : null);
  const [newSection, setNewSection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  if (!form || !template) {
    return (
      <Dialog title={tr("Nouvelle liste")} onClose={onClose} className="dialog--templates">
        <p className="settings-intro">{tr("Choisissez un modèle : ses colonnes et ses rayons se modifient ensuite.")}</p>
        <div className="template-list" role="list">
          {LIST_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="template-card"
              style={{ "--row-color": t.color } as CSSProperties}
              onClick={() => {
                setTemplate(t);
                setForm(listFromTemplate(t, t.id === "libre" ? "" : t.label, filter !== "tous" ? filter : null));
              }}
            >
              <ModuleChip color={t.color} icon={symbolPath(t.icon, ICONS.notes)} size={34} />
              <span className="template-text">
                <span className="template-name">{t.label}</span>
                <span className="template-desc">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
      </Dialog>
    );
  }

  const set = (changes: Partial<ListInput>) => setForm((f) => (f ? { ...f, ...changes } : f));
  const setColumn = (i: number, changes: Partial<ListColumn>) => set({ columns: form.columns.map((c, j) => (j === i ? { ...c, ...changes } : c)) });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError(tr("Saisissez un nom."));
      return;
    }
    if (form.columns.some((c) => !c.name.trim())) {
      setError(tr("Chaque colonne a un nom."));
      return;
    }
    const input = { ...form, name: form.name.trim(), columns: form.columns.map((c) => ({ ...c, name: c.name.trim() })) };
    if (list) {
      await updateList(list, input);
      onSaved(list);
    } else {
      const created = await createList(input);
      if (created) onSaved(created);
    }
    onClose();
  };
  return (
    <Dialog title={list ? tr("Liste") : tr("Nouvelle liste · {label}", { label: template.label })} onClose={onClose} className="dialog--list-form">
      <form className="settings-form" onSubmit={(e) => void submit(e)} noValidate>
        {/* Deux colonnes : la liste (nom, colonnes, sections), puis son apparence. */}
        <div className="list-form-grid">
          <div className="list-form-col">
            <div className="field">
              <label htmlFor={`${ids}-nom`} className="field-label">
                {tr("Nom")}
              </label>
              <div className="field-box" data-invalid={error && !form.name.trim() ? true : undefined}>
                <input id={`${ids}-nom`} className="field-input" value={form.name} maxLength={100} placeholder={tr("Courses de la semaine…")} onChange={(e) => set({ name: e.target.value })} data-autofocus />
              </div>
            </div>
            <div className="field">
              <span className="field-label">{tr("Colonnes")}</span>
              <div className="list-columns-editor">
                {form.columns.map((c, i) => (
                  <div key={c.id} className="list-column-row">
                    <div className="field-box">
                      <input className="field-input" value={c.name} maxLength={40} aria-label={tr("Nom de la colonne {x}", { x: i + 1 })} onChange={(e) => setColumn(i, { name: e.target.value })} />
                    </div>
                    <Select value={c.kind} options={COLUMN_KINDS.map((k) => ({ value: k.id, label: k.label }))} label={tr("Sorte de la colonne {x}", { x: i + 1 })} onChange={(kind) => setColumn(i, { kind: kind as ColumnKind })} />
                    <button type="button" className="icon-btn icon-btn--sm" aria-label={tr("Retirer la colonne « {name} »", { name: c.name })} title={tr("Retirer")} onClick={() => set({ columns: form.columns.filter((_, j) => j !== i) })}>
                      <Icon d={ICONS.close} size={12} stroke={2.6} />
                    </button>
                  </div>
                ))}
                {form.columns.length < 12 && (
                  <button type="button" className="link-btn" onClick={() => set({ columns: [...form.columns, { id: columnId("Colonne", form.columns), name: "", kind: "texte" }] })}>
                    <Icon d={ICONS.plus} size={12} stroke={2.6} />{tr(" Ajouter une colonne")}
                  </button>
                )}
              </div>
              {list && <p className="settings-hint">{tr("Une colonne retirée efface ses valeurs (Ctrl+Z les rétablit).")}</p>}
            </div>
            <div className="field">
              <span className="field-label">{form.template === "courses" ? tr("Rayons") : tr("Sections")}</span>
              <div className="list-sections-editor">
                {form.sections.map((s) => (
                  <span key={s} className="pill list-section-pill">
                    {s}
                    <button type="button" aria-label={tr("Retirer « {s} »", { s })} onClick={() => set({ sections: form.sections.filter((x) => x !== s) })}>
                      <Icon d={ICONS.close} size={10} stroke={2.8} />
                    </button>
                  </span>
                ))}
                <span className="field-box list-section-add">
                  <input
                    className="field-input"
                    value={newSection}
                    maxLength={60}
                    placeholder={form.template === "courses" ? tr("Nouveau rayon") : tr("Nouvelle section")}
                    aria-label={form.template === "courses" ? tr("Nouveau rayon") : tr("Nouvelle section")}
                    onChange={(e) => setNewSection(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const s = newSection.trim();
                      if (s && !form.sections.some((x) => x.toLowerCase() === s.toLowerCase())) set({ sections: [...form.sections, s] });
                      setNewSection("");
                    }}
                  />
                </span>
              </div>
            </div>
          </div>
          <div className="list-form-col">
            <div className="field">
              <span className="field-label">{tr("Vue")}</span>
              <Segmented value={form.view} options={[{ value: "liste", label: tr("Liste") }, { value: "galerie", label: tr("Galerie") }]} label={tr("Vue")} onChange={(view) => set({ view })} />
            </div>
            <div className="field">
              <span className="field-label">{tr("Symbole")}</span>
              <SymbolPicker value={form.icon} onChange={(icon) => set({ icon })} label={tr("Symbole de la liste")} color={form.color} />
            </div>
            <div className="field">
              <span className="field-label">{tr("Couleur")}</span>
              <ColorChoices value={form.color} onChange={(color) => set({ color })} label={tr("Couleur de la liste")} />
            </div>
            <div className="field">
              <label htmlFor={`${ids}-espace`} className="field-label">
                {tr("Espace")}
              </label>
              <Select id={`${ids}-espace`} value={form.spaceId ?? ""} options={[{ value: "", label: tr("Tous les espaces") }, ...spaces.map((s) => ({ value: s.id, label: s.name }))]} onChange={(v) => set({ spaceId: v || null })} />
            </div>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel">
            {list ? tr("Enregistrer") : tr("Créer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ——— Éléments ———

interface RowProps {
  list: List;
  item: ListItem;
  picked: boolean;
  bulk: MenuEntry[] | null;
  gallery: boolean;
  onPick: (e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => boolean;
  onOpen: () => void;
  /** Monter ou descendre ; absent quand la liste est triée autrement qu'à la main. */
  onMove?: (direction: -1 | 1) => void;
  /** Glisser : remettre en ordre, ou ranger dans une autre section. */
  onDrag?: (e: ReactPointerEvent<HTMLElement>) => void;
}

function ItemRow({ list, item, picked, bulk, gallery, onPick, onOpen, onMove, onDrag }: RowProps) {
  const { updateItem, removeItem, duplicateItem } = useLists();
  const itemMenu = useItemMenu();
  const color = list.color ?? getModule("listes").color;
  const menu = itemMenu(
    () =>
      bulk ?? [
        { label: tr("Ouvrir"), icon: ICONS.enter, shortcut: KEYS.open, run: onOpen },
        { label: item.done ? tr("Décocher") : tr("Cocher"), icon: ICONS.check, run: () => void updateItem(item, { done: !item.done }) },
        { label: tr("Dupliquer"), icon: ICONS.layers, shortcut: KEYS.duplicate, run: () => void duplicateItem(item) },
        ...(onMove
          ? ([
              "separator",
              { label: tr("Monter"), icon: ICONS.arrowUp, run: () => onMove(-1) },
              { label: tr("Descendre"), icon: ICONS.arrowDown, run: () => onMove(1) },
            ] as MenuEntry[])
          : []),
        ...(list.sections.length > 0
          ? (["separator", ...list.sections.filter((s) => s !== item.section).map((s) => ({ label: tr("Ranger dans « {s} »", { s }), icon: ICONS.folder, run: () => void updateItem(item, { section: s }) }))] as MenuEntry[])
          : []),
        "separator",
        { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void removeItem(item) },
      ],
  );
  const shown = list.columns.filter((c) => item.cells[c.id] !== undefined && cellText(c.kind, item.cells[c.id]));
  const open = (e: ReactMouseEvent) => {
    if (!onPick(e)) onOpen();
  };
  const check = (
    <button
      type="button"
      className="task-check"
      data-sans-son
      aria-label={item.done ? tr("Décocher « {title} »", { title: item.title }) : tr("Cocher « {title} »", { title: item.title })}
      onClick={(e) => {
        e.stopPropagation();
        void updateItem(item, { done: !item.done });
      }}
    >
      {item.done && <Icon d={ICONS.check} size={12} stroke={3.5} />}
    </button>
  );
  if (gallery) {
    return (
      <li className="list-card" data-done={item.done || undefined} data-picked={picked || undefined} style={{ "--row-color": color } as CSSProperties} data-sort-id={item.id} onPointerDown={onDrag} {...menu}>
        <button type="button" className="list-card-image" data-photo={item.image ? true : undefined} onClick={open} aria-label={tr("Ouvrir « {title} »", { title: item.title })}>
          {item.image ? <img src={item.image} alt="" draggable={false} /> : <Icon d={symbolPath(list.icon, ICONS.notes)} size={30} stroke={1.8} />}
        </button>
        <div className="list-card-body">
          {check}
          <button type="button" className="list-card-title" onClick={open}>
            {item.title}
          </button>
        </div>
        {shown.length > 0 && (
          <dl className="list-card-cells">
            {shown.slice(0, 3).map((c) => (
              <div key={c.id}>
                <dt>{c.name}</dt>
                <dd data-kind={c.kind}>{cellText(c.kind, item.cells[c.id])}</dd>
              </div>
            ))}
          </dl>
        )}
      </li>
    );
  }
  return (
    <li className="list-row" data-done={item.done || undefined} data-picked={picked || undefined} style={{ "--row-color": color } as CSSProperties} data-sort-id={item.id} onPointerDown={onDrag} {...menu}>
      {check}
      <button type="button" className="list-row-main" onClick={open}>
        <span className="list-row-title">{item.title}</span>
        {item.image && <span className="list-row-image" style={{ backgroundImage: `url("${item.image}")` } as CSSProperties} aria-hidden="true" />}
        {shown.map((c) => (
          <span key={c.id} className="list-cell" data-kind={c.kind} title={c.name}>
            {c.kind === "case" ? c.name : cellText(c.kind, item.cells[c.id])}
          </span>
        ))}
      </button>
    </li>
  );
}

function ListPanel({ list, query }: { list: List; query: string }) {
  const { items, createItem, updateItem, removeItem, reorder, archiveList } = useLists();
  const bulk = useBulk();
  const all = items.get(list.id) ?? [];
  const openMenu = useContextMenu();
  const doneCount = all.filter((i) => i.done).length;
  const [sort, setSort] = useState<ListSort>(() => readPref(`listeTri:${list.id}`, "manuel", isSort));
  const [hideDone, setHideDone] = useState(() => readPref(`listeMasquerFaits:${list.id}`, false, isBool));
  const sortShown = sortOptions(list).some((o) => o.value === sort) ? sort : "manuel";
  const shown = all.filter((i) => itemMatches(i, query) && !(hideDone && i.done));
  const groups = groupBySection(list, shown, sortShown);
  const template = templateOf(list.template);
  const [text, setText] = useState("");
  const [section, setSection] = useState("");
  const [opened, setOpened] = useState<ListItem | null>(null);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { updateList } = useLists();
  const order = groups.flatMap((g) => g.items.map((i) => i.id));
  const pick = useSelection(order);
  // Ctrl+P : la liste telle qu'affichée (tri, éléments faits masqués ou non).
  usePrint(() => () => printDoc(listPrintDoc(list, groups, all)));
  const picked = shown.filter((i) => pick.has(i.id));
  const price = list.columns.find((c) => c.kind === "prix");
  const label = list.template === "courses" ? tr("Rayon") : tr("Section");

  useNewItem(() => inputRef.current?.focus());

  const each = (fn: (i: ListItem) => Promise<unknown>) => async () => {
    for (const i of picked) await fn(i);
  };
  const bulkActions: SelectionAction[] = [
    { label: tr("Cocher"), icon: ICONS.check, run: () => void bulk(trn(picked.length, "Élément coché.", "{n} éléments cochés."), tr("éléments cochés"), each((i) => updateItem(i, { done: true }))) },
    { label: tr("Décocher"), icon: ICONS.undo, run: () => void bulk(trn(picked.length, "Élément décoché.", "{n} éléments décochés."), tr("éléments décochés"), each((i) => updateItem(i, { done: false }))) },
    ...(list.sections.length > 0
      ? [
          {
            label: label,
            icon: ICONS.folder,
            run: () => {},
            menu: () => list.sections.map((s) => ({ label: tr("Ranger dans « {s} »", { s }), icon: ICONS.folder, run: () => void bulk(trn(picked.length, "Élément rangé.", "{n} éléments rangés."), tr("rangement des éléments"), each((i) => updateItem(i, { section: s }))) })),
          },
        ]
      : []),
    { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void bulk(trn(picked.length, "Élément supprimé.", "{n} éléments supprimés."), tr("suppression des éléments"), each((i) => removeItem(i))) },
  ];
  const bulkEntries = pick.count > 1 ? selectionEntries(bulkActions) : null;

  // Saisie : suggestions tirées de la liste ; un élément déjà fait revient au lieu d'être doublé.
  const notify = useToast();
  const [suggesting, setSuggesting] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestId = useId();
  const recentOnEmpty = list.template === "courses";
  const suggestions = suggesting && (text.trim() || recentOnEmpty) ? suggestionsFor(all, text) : [];
  const addBoxRef = useRef<HTMLFormElement>(null);
  const suggestRef = useRef<HTMLUListElement>(null);
  const closeSuggest = useCallback(() => setSuggesting(false), []);
  const suggestPlace = useAnchoredPopover(suggestions.length > 0, addBoxRef, suggestRef, closeSuggest, { height: 280 });
  const addTitle = async (raw: string) => {
    const title = raw.trim();
    if (!title) return;
    setText("");
    setActive(-1);
    const existing = sameTitle(all, title);
    if (existing?.done) {
      await updateItem(existing, { done: false });
      notify(tr("« {title} » remis dans la liste.", { title: existing.title }));
    } else if (existing) notify(tr("« {title} » figure déjà dans la liste.", { title: existing.title }));
    else await createItem(list, { title, section: section || null, cells: {}, done: false, image: null });
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const chosen = active >= 0 ? suggestions[active] : undefined;
    await addTitle(chosen ? chosen.title : text);
  };
  const onAddKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setSuggesting(true);
      const n = suggestions.length;
      if (n > 0) setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    } else if (e.key === "Escape" && suggestions.length > 0) {
      e.stopPropagation();
      setSuggesting(false);
      setActive(-1);
    }
  };
  const move = (item: ListItem, direction: -1 | 1) => {
    const ids = [...all].sort((a, b) => a.position - b.position).map((i) => i.id);
    const at = ids.indexOf(item.id);
    const to = at + direction;
    if (at < 0 || to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to]!, ids[at]!];
    void reorder(list, ids);
  };
  const color = list.color ?? getModule("listes").color;

  // Glisser des éléments (ou la sélection) : nouvel ordre quand la liste est rangée à la main,
  // nouvelle section quand ils changent de groupe. Le clic droit reste l'équivalent au clavier.
  const draggable = sortShown === "manuel" || list.sections.length > 0;
  const dragItems = (item: ListItem) => (e: ReactPointerEvent<HTMLElement>) => {
    const moved = pick.has(item.id) && pick.count > 1 ? shown.filter((i) => pick.has(i.id)) : [item];
    startDrag(
      e,
      { kind: "element", ids: moved.map((i) => i.id), label: dragLabel(moved.length, item.title, tr("éléments")), color },
      {
        sort: {
          group: `liste:${list.id}`,
          onSort: (ids, into) => {
            const section = into === null || into === "" ? null : into;
            const changing = moved.filter((i) => (i.section ?? null) !== section);
            const order = groups.flatMap((g) => ((g.section ?? "") === (into ?? "") ? ids : g.items.map((i) => i.id).filter((id) => !ids.includes(id))));
            const full = mergeOrder([...all].sort((a, b) => a.position - b.position).map((i) => i.id), order);
            const work = async () => {
              for (const i of changing) await updateItem(i, { section });
              if (sortShown === "manuel") await reorder(list, full);
            };
            if (changing.length === 0) void work();
            else
              void bulk(
                section
                  ? trn(changing.length, "Élément rangé dans « {name} ».", "{n} éléments rangés dans « {name} ».", { name: section })
                  : trn(changing.length, "Élément rangé hors section.", "{n} éléments rangés hors section."),
                tr("déplacement des éléments"),
                work,
              );
          },
        },
      },
    );
  };

  return (
    <section className="list-panel glass" aria-label={list.name} style={{ "--row-color": color } as CSSProperties}>
      <header className="list-panel-head">
        <ModuleChip color={color} icon={symbolPath(list.icon, ICONS.notes)} size={34} />
        <div className="list-panel-title">
          <h2>{list.name}</h2>
          <span className="list-panel-meta">
            {all.length === 0 ? tr("Aucun élément") : list.template === "courses" ? tr("{done} sur {total} dans le panier", { done: doneCount, total: all.length }) : tr("{done} sur {total} faits", { done: doneCount, total: all.length })}
            {list.archived && tr(" · archivée")}
          </span>
        </div>
        <Segmented value={list.view} options={[{ value: "liste", label: tr("Liste") }, { value: "galerie", label: tr("Galerie") }]} label={tr("Vue")} onChange={(view) => void updateList(list, { view })} />
        <button
          type="button"
          className="btn-glass btn-glass--sm"
          aria-haspopup="menu"
          title={tr("Tri et éléments faits")}
          onClick={(e) =>
            openMenu(e, [
              ...sortOptions(list).map((o) => ({
                label: tr("Trier : {label}", { label: o.label }),
                checked: sortShown === o.value,
                run: () => {
                  setSort(o.value);
                  writePref(`listeTri:${list.id}`, o.value);
                },
              })),
              "separator",
              {
                label: list.template === "courses" ? tr("Masquer ce qui est dans le panier") : tr("Masquer les éléments faits"),
                checked: hideDone,
                run: () => {
                  setHideDone(!hideDone);
                  writePref(`listeMasquerFaits:${list.id}`, !hideDone);
                },
              },
              {
                label: list.template === "courses" ? tr("Vider le panier (tout décocher)") : tr("Tout décocher"),
                icon: ICONS.undo,
                disabled: doneCount === 0,
                run: () =>
                  void bulk(doneCount > 1 ? tr("{doneCount} éléments décochés.", { doneCount }) : tr("Élément décoché."), tr("éléments décochés"), async () => {
                    for (const i of all.filter((x) => x.done)) await updateItem(i, { done: false });
                  }),
              },
              {
                label: list.template === "courses" ? tr("Retirer ce qui est dans le panier") : tr("Supprimer les éléments faits"),
                icon: ICONS.trash,
                danger: true,
                disabled: doneCount === 0,
                run: () =>
                  void bulk(doneCount > 1 ? tr("{doneCount} éléments supprimés.", { doneCount }) : tr("Élément supprimé."), tr("suppression des éléments faits"), async () => {
                    for (const i of all.filter((x) => x.done)) await removeItem(i);
                  }),
              },
              "separator",
              {
                label: tr("Copier la liste en texte"),
                icon: ICONS.copy,
                disabled: all.length === 0,
                run: () =>
                  void navigator.clipboard
                    .writeText(listAsText(list.name, groups))
                    .then(() => notify(tr("Liste copiée. Elle se colle dans un message ou un document.")))
                    .catch(() => notify(tr("Copie impossible."))),
              },
            ])
          }
        >
          <Icon d={ICONS.filter} size={13} stroke={2.2} />
          {tr("Affichage")}
        </button>
        <button type="button" className="btn-glass btn-glass--sm" onClick={() => setEditing(true)} title={tr("Colonnes, rayons, symbole et couleur ({rename})", { rename: KEYS.rename })}>
          <Icon d={ICONS.pencil} size={13} stroke={2.2} />
          {tr("Personnaliser")}
        </button>
        {list.archived && (
          <button type="button" className="btn-glass btn-glass--sm" onClick={() => void archiveList(list, false)}>
            {tr("Ressortir des archives")}
          </button>
        )}
      </header>
      <form ref={addBoxRef} className="quick-add list-quick-add" onSubmit={(e) => void add(e)}>
        <Icon d={ICONS.plus} size={16} stroke={2.6} />
        <div className="list-add-box">
          <input
            ref={inputRef}
            className="quick-add-input"
            value={text}
            maxLength={300}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls={suggestId}
            aria-activedescendant={active >= 0 && suggestions[active] ? `${suggestId}-${active}` : undefined}
            autoComplete="off"
            onChange={(e) => {
              setText(e.target.value);
              setSuggesting(true);
              setActive(-1);
            }}
            onFocus={() => setSuggesting(true)}
            onBlur={() => setSuggesting(false)}
            onKeyDown={onAddKey}
            placeholder={template.placeholder}
            aria-label={tr("Ajouter à « {name} »", { name: list.name })}
          />
          {suggestions.length > 0 &&
            createPortal(
              <ul ref={suggestRef} id={suggestId} role="listbox" className="list-suggest glass-popover" aria-label={tr("Suggestions")} style={suggestPlace}>
                {!text.trim() && (
                  <li role="presentation" className="list-suggest-title">
                    {tr("Récemment achetés")}
                  </li>
                )}
                {suggestions.map((s, i) => (
                  <li
                    key={s.id}
                    id={`${suggestId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className="list-suggest-option"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      void addTitle(s.title);
                    }}
                  >
                    <span className="list-suggest-text">{s.title}</span>
                    <span className="list-suggest-meta">
                      {s.done ? tr("Remettre") : tr("Déjà dans la liste")}
                      {s.section ? ` · ${s.section}` : ""}
                    </span>
                  </li>
                ))}
              </ul>,
              document.body,
            )}
        </div>
        {list.sections.length > 0 && <Select value={section} options={[{ value: "", label: tr("Sans {label}", { label: label.toLowerCase() }) }, ...list.sections.map((s) => ({ value: s, label: s }))]} label={label} onChange={setSection} />}
      </form>
      <div className="task-scroll" onKeyDown={pick.onListKeyDown}>
        {all.length > 0 && shown.length === 0 && <p className="tasks-empty">{query ? tr("Aucun élément trouvé.") : tr("Tous les éléments sont faits.")}</p>}
        {all.length === 0 && <p className="tasks-empty">{tr("Aucun élément.")}</p>}
        {groups.map((g) => (
          <div key={g.section ?? "_"} className="task-section">
            {(list.sections.length > 0 || g.section) && (
              <h3 className="task-section-title">
                {g.section ?? tr("Sans {label}", { label: label.toLowerCase() })}
                <span className="task-section-sub"> · {g.items.length}</span>
              </h3>
            )}
            <ul className={list.view === "galerie" ? "list-gallery" : "list-rows"} data-sort={draggable ? `liste:${list.id}` : undefined} data-sort-axis={list.view === "galerie" ? "x" : undefined} data-sort-into={g.section ?? ""}>
              {g.items.map((i) => (
                <ItemRow
                  key={i.id}
                  list={list}
                  item={i}
                  gallery={list.view === "galerie"}
                  picked={pick.has(i.id)}
                  bulk={pick.has(i.id) ? bulkEntries : null}
                  onPick={(e) => pick.click(e, i.id)}
                  onOpen={() => setOpened(i)}
                  onMove={sortShown === "manuel" ? (d) => move(i, d) : undefined}
                  onDrag={draggable ? dragItems(i) : undefined}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <SelectionBar count={pick.count} label={[tr("élément sélectionné"), tr("éléments sélectionnés")]} actions={bulkActions} onClear={pick.clear} />
      {price && pick.count === 0 && all.some((i) => typeof i.cells[price.id] === "number") && (
        <p className="task-footer list-total">
          {list.template === "courses" ? tr("Reste à acheter") : tr("Total")} : <strong>{cellText("prix", totalOf(price, all, list.template === "courses"))}</strong>
        </p>
      )}
      {opened && <ItemDialog key={opened.id} list={list} item={all.find((i) => i.id === opened.id) ?? opened} onClose={() => setOpened(null)} />}
      {editing && <ListEditor list={list} onClose={() => setEditing(false)} onSaved={() => undefined} />}
    </section>
  );
}

// ——— Écran ———

export function ListsScreen() {
  const { visible, items, loaded, archiveList, removeList } = useLists();
  const itemMenu = useItemMenu();
  const pinEntry = usePinEntry();
  const [pending] = useState(listRequest.take);
  const [selectedId, setSelectedId] = useState<string | null>(() => (pending && pending !== NEW_ITEM ? pending : readPref("listeOuverte", "", isString) || null));
  const [creating, setCreating] = useState(pending === NEW_ITEM);
  const [editing, setEditing] = useState<List | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const m = getModule("listes");

  useEffect(
    () =>
      listRequest.on((id) => {
        if (id === NEW_ITEM) setCreating(true);
        else setSelectedId(id);
      }),
    [],
  );
  useEffect(() => writePref("listeOuverte", selectedId ?? ""), [selectedId]);
  useScreenMenu(() => [
    { label: tr("Nouvelle liste…"), icon: ICONS.plus, run: () => setCreating(true) },
    { label: tr("Rechercher dans la liste"), icon: ICONS.search, shortcut: KEYS.find, run: () => searchRef.current?.focus() },
    ...(selectedId ? [{ label: tr("Imprimer la liste…"), icon: ICONS.printer, shortcut: KEYS.print, run: () => void runPrint() }] : []),
  ]);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = visible.filter((l) => !l.archived);
  const archived = visible.filter((l) => l.archived);
  const selected = visible.find((l) => l.id === selectedId) ?? active[0] ?? null;

  const navKeys = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>(".lists-nav-item")];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) {
      e.preventDefault();
      next.focus();
      next.click();
    }
  };

  const navItem = (l: List) => {
    const open = (items.get(l.id) ?? []).filter((i) => !i.done).length;
    const menu = itemMenu(() => [
      { label: tr("Ouvrir"), icon: ICONS.enter, shortcut: KEYS.open, run: () => setSelectedId(l.id) },
      { label: tr("Personnaliser…"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => setEditing(l) },
      pinEntry({ kind: "list", id: l.id }),
      { label: l.archived ? tr("Ressortir des archives") : tr("Archiver"), icon: ICONS.inbox, run: () => void archiveList(l, !l.archived) },
      "separator",
      { label: tr("Supprimer la liste"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void removeList(l) },
    ]);
    return (
      <li key={l.id}>
        <button type="button" className="lists-nav-item" aria-current={selected?.id === l.id || undefined} onClick={() => setSelectedId(l.id)} {...menu}>
          <ModuleChip color={l.color ?? m.color} icon={symbolPath(l.icon, ICONS.notes)} size={24} />
          <span className="lists-nav-name">{l.name}</span>
          {open > 0 && <span className="lists-nav-count">{open}</span>}
        </button>
      </li>
    );
  };

  return (
    <div className="screen lists-screen">
      <header className="tasks-header">
        <ScreenTitle module="listes" />
        <div className="field-box notes-search">
          <Icon d={ICONS.search} size={15} />
          <input
            ref={searchRef}
            type="search"
            className="field-input"
            placeholder={tr("Rechercher dans la liste")}
            aria-label={tr("Rechercher dans la liste")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
              }
            }}
          />
        </div>
        <span className="tasks-header-spacer" />
        <button type="button" className="btn-gel" onClick={() => setCreating(true)}>
          <Icon d={ICONS.plus} size={16} stroke={2.8} />
          <span>{tr("Nouvelle liste")}</span>
        </button>
      </header>

      {loaded && visible.length === 0 ? (
        <section className="coming-soon glass habits-empty">
          <Orb color={m.color} icon={m.icon} size={110} />
          <h2 className="coming-title">{tr("Aucune liste")}</h2>
          <p className="settings-intro"><Sentences text={tr("Une liste pour tout ce qui n'est pas une tâche. Par exemple : courses, livres, films, idées cadeaux, voyages.")} /></p>
          <button type="button" className="btn-gel" onClick={() => setCreating(true)}>
            <Icon d={ICONS.plus} size={16} stroke={2.8} />
            {tr("Nouvelle liste")}
          </button>
        </section>
      ) : (
        <div className="lists-body">
          <nav className="lists-nav glass" aria-label={tr("Listes")}>
            <ul onKeyDown={navKeys}>{active.map(navItem)}</ul>
            {archived.length > 0 && (
              <>
                <button type="button" className="lists-archived-toggle" aria-expanded={showArchived} onClick={() => setShowArchived((s) => !s)}>
                  <Icon d={ICONS.chevronDown} size={12} stroke={2.6} />
                  {tr("Archivées · ")}{archived.length}
                </button>
                {showArchived && <ul onKeyDown={navKeys}>{archived.map(navItem)}</ul>}
              </>
            )}
          </nav>
          {selected ? <ListPanel key={selected.id} list={selected} query={query} /> : <section className="list-panel glass habit-detail--empty">{tr("Aucune liste ouverte.")}</section>}
        </div>
      )}

      {creating && <ListEditor onClose={() => setCreating(false)} onSaved={(l) => setSelectedId(l.id)} />}
      {editing && <ListEditor list={editing} onClose={() => setEditing(null)} onSaved={() => undefined} />}
    </div>
  );
}
