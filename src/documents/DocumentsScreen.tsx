/**
 * Écran Documents (cahier des charges § 4.13) : dossiers, documents chiffrés avec leur date
 * d'expiration, aperçu intégré des PDF, images et textes, export, et éléments liés.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useBulk } from "../app/bulk";
import { useDropTarget } from "../app/fileDrop";
import { dragLabel, dropTarget, moved, startDrag } from "../lib/dragDrop";
import { useItemMenu, useScreenMenu, type MenuEntry } from "../components/ContextMenu";
import { EmptyState } from "../components/EmptyState";
import { ScreenTitle } from "../components/ScreenTitle";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { SelectionBar, selectionEntries, useSelection } from "../components/SelectionBar";
import { Select } from "../components/SelectRow";
import { symbolPath } from "../components/symbols";
import { fold } from "../lib/fold";
import { KEYS } from "../lib/itemKeys";
import { usePinEntry } from "../pins/pins";
import { documentRequest, NEW_ITEM } from "../lib/request";
import { useNow } from "../lib/useNow";
import { LinksSection } from "../links/LinksSection";
import { getModule } from "../modules/modules";
import { useNewItem } from "../shell/newItem";
import { useSpaces } from "../spaces/SpacesProvider";
import { dayKey, formatShortDay } from "../tasks/day";
import { readPref, writePref } from "../lib/storage";
import { documentsApi } from "./api";
import {
  DOC_SORTS,
  DOC_TYPES,
  docTypeOf,
  documentDetail,
  expiryOf,
  fileKind,
  KIND_COLORS,
  KIND_SYMBOLS,
  previewOf,
  REMIND_CHOICES,
  sortDocs,
  stemOf,
  type DocSort,
  type DocType,
  type Document,
  type Folder,
} from "./documents";
import { useDocumentBulk } from "./documentBulk";
import { useDocuments } from "./DocumentsProvider";
import { DateField } from "../components/DateField";
import { locale, tr, trn } from "../i18n/i18n";

/** « tous », « bientot » (expirent bientôt) ou l'identifiant d'un dossier. */
type Place = string;
const ALL = "tous";
const SOON = "bientot";

const ADDED = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric" });

function KindChip({ doc, size }: { doc: Pick<Document, "ext">; size: number }) {
  const kind = fileKind(doc.ext);
  return <ModuleChip color={KIND_COLORS[kind]} icon={symbolPath(KIND_SYMBOLS[kind], ICONS.file)} size={size} />;
}

// ——— Aperçu ———

function Preview({ doc }: { doc: Document }) {
  const how = previewOf(doc.ext);
  const [state, setState] = useState<{ url?: string; text?: string; failed?: boolean } | null>(null);
  useEffect(() => {
    if (!how) return;
    let alive = true;
    let url: string | undefined;
    setState(null);
    documentsApi
      .read(doc.id)
      .then((bytes) => {
        if (!alive) return;
        if (how.mode === "text") {
          const slice = bytes.slice(0, 200_000);
          let text: string;
          try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(slice);
          } catch {
            text = new TextDecoder("windows-1252").decode(slice);
          }
          setState({ text });
        } else {
          url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: how.type }));
          setState({ url });
        }
      })
      .catch(() => alive && setState({ failed: true }));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc.id, how?.mode, how?.type]);

  if (!how || state?.failed) {
    return (
      <div className="doc-preview doc-preview--none">
        <KindChip doc={doc} size={54} />
        <span>{state?.failed ? tr("Aperçu indisponible.") : tr("Aperçu indisponible pour ce type de fichier.")}</span>
      </div>
    );
  }
  if (!state) return <div className="doc-preview doc-preview--loading" aria-busy="true" />;
  if (state.text !== undefined) return <pre className="doc-preview doc-preview--text">{state.text}</pre>;
  if (how.mode === "pdf") return <iframe className="doc-preview doc-preview--pdf" src={state.url} title={tr("Aperçu de {name}", { name: doc.name })} />;
  return (
    <div className="doc-preview doc-preview--image">
      <img src={state.url} alt={tr("Aperçu de {name}", { name: doc.name })} draggable={false} />
    </div>
  );
}

/** Aperçu agrandi, toute la fenêtre. */
function PreviewDialog({ doc, onClose }: { doc: Document; onClose: () => void }) {
  return (
    <Dialog title={doc.name} onClose={onClose} className="dialog--preview">
      <Preview doc={doc} />
    </Dialog>
  );
}

// ——— Détail ———

function DocumentDetail({ doc, onPreview }: { doc: Document | null; onPreview: () => void }) {
  const { folders, update, remove, exportTo } = useDocuments();
  const { spaces } = useSpaces();
  const today = dayKey(useNow());
  const ids = useId();
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [issuer, setIssuer] = useState("");
  const { documents } = useDocuments();
  const issuers = useMemo(() => [...new Set(documents.map((d) => d.issuer).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [documents]);
  useEffect(() => {
    setName(doc ? stemOf(doc) : "");
    setTags(doc ? doc.tags.join(", ") : "");
    setNotes(doc?.notes ?? "");
    setIssuer(doc?.issuer ?? "");
  }, [doc]);
  if (!doc) return <aside className="doc-detail glass habit-detail--empty">{tr("Aucun document sélectionné.")}</aside>;
  const expiry = expiryOf(doc, today);
  const commitName = () => {
    const stem = name.trim();
    if (!stem || /[\\/:*?"<>|]/.test(stem)) {
      setName(stemOf(doc));
      return;
    }
    if (stem !== stemOf(doc)) void update(doc, { name: doc.ext ? `${stem}.${doc.ext}` : stem });
  };
  const commitTags = () => {
    const list = tags
      .split(/[\s,;]+/)
      .map((t) => t.replace(/^#+/, "").trim())
      .filter(Boolean);
    if (list.join(",") !== doc.tags.join(",")) void update(doc, { tags: list });
  };
  return (
    <aside className="doc-detail glass" aria-label={doc.name}>
      <button type="button" className="doc-preview-button" onClick={onPreview} aria-label={tr("Agrandir l'aperçu de {name}", { name: doc.name })}>
        <Preview doc={doc} />
      </button>
      <div className="doc-name-row">
        <div className="field-box doc-name">
          <label htmlFor={`${ids}-nom`} className="sr-only">
            {tr("Nom du document")}
          </label>
          <input
            id={`${ids}-nom`}
            className="field-input"
            value={name}
            maxLength={190}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") setName(stemOf(doc));
            }}
          />
          {doc.ext && <span className="field-suffix">.{doc.ext}</span>}
        </div>
      </div>
      <p className="doc-meta">
        {documentDetail(doc)}{tr(" · ajouté le {date}", { date: ADDED.format(new Date(doc.createdAt * 1000)) })}
      </p>
      {expiry && (
        <p className="doc-expiry" data-state={expiry.state}>
          {expiry.label}
        </p>
      )}

      <div className="detail-grid doc-grid">
        <label htmlFor={`${ids}-sorte`} className="detail-label">
          {tr("Sorte")}
        </label>
        <Select
          id={`${ids}-sorte`}
          value={doc.docType ?? ""}
          options={[{ value: "", label: tr("Non précisée") }, ...DOC_TYPES.map((t) => ({ value: t.id, label: t.label, icon: symbolPath(t.symbol, ICONS.notes) }))]}
          onChange={(v) => void update(doc, { docType: (v || null) as DocType | null })}
        />

        <label htmlFor={`${ids}-emetteur`} className="detail-label">
          {tr("Émetteur")}
        </label>
        <input
          id={`${ids}-emetteur`}
          className="detail-input"
          value={issuer}
          maxLength={150}
          list={`${ids}-emetteurs`}
          placeholder={tr("CAF, banque, assureur…")}
          onChange={(e) => setIssuer(e.target.value)}
          onBlur={() => issuer.trim() !== doc.issuer && void update(doc, { issuer: issuer.trim() })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <datalist id={`${ids}-emetteurs`}>
          {issuers.map((i) => (
            <option key={i} value={i} />
          ))}
        </datalist>

        <label htmlFor={`${ids}-date`} className="detail-label">
          {tr("Date")}
        </label>
        <div className="detail-when">
          <DateField id={`${ids}-date`} className="detail-input" clearable value={doc.docDate} placeholder={tr("Date du document")} onChange={(v) => void update(doc, { docDate: v || null })} />
        </div>

        <label htmlFor={`${ids}-dossier`} className="detail-label">
          {tr("Dossier")}
        </label>
        <Select
          id={`${ids}-dossier`}
          value={doc.folderId ?? ""}
          options={[{ value: "", label: tr("Aucun dossier") }, ...folders.map((f) => ({ value: f.id, label: f.name }))]}
          onChange={(v) => void update(doc, { folderId: v || null })}
        />

        <label htmlFor={`${ids}-expiration`} className="detail-label">
          {tr("Expiration")}
        </label>
        <div className="detail-when">
          <DateField
            id={`${ids}-expiration`}
            className="detail-input"
            clearable
            value={doc.expiresOn}
            onChange={(v) => void update(doc, { expiresOn: v || null, remindDays: v ? (doc.remindDays ?? 30) : null })}
          />
        </div>

        <label htmlFor={`${ids}-rappel`} className="detail-label">
          {tr("Rappel")}
        </label>
        <Select
          id={`${ids}-rappel`}
          value={doc.remindDays === null ? "" : String(doc.remindDays)}
          disabled={!doc.expiresOn}
          options={REMIND_CHOICES.map((c) => ({ value: c.value === null ? "" : String(c.value), label: c.value === null && !doc.expiresOn ? tr("Aucun (sans expiration)") : c.label }))}
          onChange={(v) => void update(doc, { remindDays: v === "" ? null : Number(v) })}
        />

        <label htmlFor={`${ids}-espace`} className="detail-label">
          {tr("Espace")}
        </label>
        <Select
          id={`${ids}-espace`}
          value={doc.spaceId ?? ""}
          options={[{ value: "", label: tr("Aucun espace") }, ...spaces.map((s) => ({ value: s.id, label: s.name }))]}
          onChange={(v) => void update(doc, { spaceId: v || null })}
        />

        <label htmlFor={`${ids}-etiquettes`} className="detail-label">
          {tr("Étiquettes")}
        </label>
        <input id={`${ids}-etiquettes`} className="detail-input" value={tags} placeholder={tr("identité, maison")} onChange={(e) => setTags(e.target.value)} onBlur={commitTags} />
      </div>

      <textarea
        className="detail-notes"
        placeholder={tr("Ajouter une note")}
        aria-label={tr("Note sur le document")}
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== doc.notes && void update(doc, { notes })}
      />

      <LinksSection item={{ kind: "document", id: doc.id }} kinds={["task", "obligation", "note", "project", "contact", "event"]} title={tr("Joint à")} empty={tr("Joint à aucun élément.")} />

      <div className="detail-foot">
        <button type="button" className="btn-glass btn-glass--sm" onClick={() => void exportTo(doc)}>
          <Icon d={ICONS.importFile} size={14} />
          {tr("Exporter")}
        </button>
        <span className="tasks-header-spacer" />
        <button type="button" className="btn-glass btn-glass--sm btn-danger" onClick={() => void remove(doc)}>
          <Icon d={ICONS.trash} size={14} />
          {tr("Supprimer")}
        </button>
      </div>
    </aside>
  );
}

// ——— Liste ———

interface DocumentRowProps {
  doc: Document;
  selected: boolean;
  /** Pris dans une sélection de plusieurs documents. */
  picked: boolean;
  /** Clic droit et touches d'un document sélectionné parmi d'autres : actions de la sélection. */
  bulk: MenuEntry[] | null;
  onSelect: (e: ReactMouseEvent | null) => void;
  onPreview: () => void;
  onRename: () => void;
  /** Glisser vers un dossier. */
  onDrag: (e: ReactPointerEvent<HTMLElement>) => void;
}

function DocumentRow({ doc, selected, picked, bulk, onSelect, onPreview, onRename, onDrag }: DocumentRowProps) {
  const { folders, update, remove, exportTo } = useDocuments();
  const today = dayKey(useNow());
  const itemMenu = useItemMenu();
  const pinEntry = usePinEntry();
  const expiry = expiryOf(doc, today);
  const moves: MenuEntry[] = [
    ...(doc.folderId ? [{ label: tr("Sortir du dossier"), icon: ICONS.folder, run: () => void update(doc, { folderId: null }) }] : []),
    ...folders.filter((f) => f.id !== doc.folderId).map((f) => ({ label: tr("Ranger dans « {name} »", { name: f.name }), icon: ICONS.folder, run: () => void update(doc, { folderId: f.id }) })),
  ];
  const menu = itemMenu(() => bulk ?? [
    { label: tr("Aperçu"), icon: ICONS.eye, shortcut: KEYS.open, run: onPreview },
    { label: tr("Renommer"), icon: ICONS.pencil, shortcut: KEYS.rename, run: onRename },
    { label: tr("Exporter…"), icon: ICONS.importFile, run: () => void exportTo(doc) },
    pinEntry({ kind: "document", id: doc.id }),
    ...(moves.length ? (["separator", ...moves] as MenuEntry[]) : []),
    "separator",
    { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void remove(doc) },
  ]);
  return (
    <li
      className="doc-row"
      style={{ "--row-color": KIND_COLORS[fileKind(doc.ext)] } as CSSProperties}
      data-selected={selected || undefined}
      data-picked={picked || undefined}
      aria-selected={selected || picked}
      tabIndex={0}
      onClick={onSelect}
      // Au clavier (flèches), le document qui reçoit le focus s'affiche ; à la souris, c'est le clic.
      onFocus={(e) => e.currentTarget.matches(":focus-visible") && onSelect(null)}
      onDoubleClick={onPreview}
      onPointerDown={onDrag}
      onContextMenu={menu.onContextMenu}
      onKeyDown={menu.onKeyDown}
    >
      <KindChip doc={doc} size={32} />
      <span className="doc-row-text">
        <span className="doc-row-name">{doc.name}</span>
        <span className="doc-row-detail">
          {[docTypeOf(doc.docType)?.label, doc.issuer, doc.docDate ? formatShortDay(doc.docDate, today) : null].filter(Boolean).join(" · ") || documentDetail(doc)}
        </span>
      </span>
      {expiry && expiry.state !== "valide" && (
        <span className="doc-badge" data-state={expiry.state}>
          {expiry.state === "expire" ? tr("Expiré") : expiry.days === 0 ? tr("Aujourd'hui") : tr("{n} j", { n: expiry.days })}
        </span>
      )}
    </li>
  );
}

function FolderEditor({ folder, onClose }: { folder?: Folder; onClose: () => void }) {
  const { createFolder, updateFolder } = useDocuments();
  const [name, setName] = useState(folder?.name ?? "");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (folder) await updateFolder(folder, { name: name.trim(), icon: folder.icon, color: folder.color });
    else await createFolder({ name: name.trim(), icon: "carnet", color: null });
    onClose();
  };
  return (
    <Dialog title={folder ? tr("Renommer le dossier") : tr("Nouveau dossier")} onClose={onClose}>
      <form className="event-form" onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label htmlFor="dossier-nom" className="field-label">
            {tr("Nom")}
          </label>
          <div className="field-box">
            <input id="dossier-nom" className="field-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} data-autofocus />
          </div>
        </div>
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel" disabled={!name.trim()}>
            {folder ? tr("Renommer") : tr("Créer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function FolderButton({ label, count, active, icon, color, onClick, menu, drop, sortId, onDrag }: { label: string; count: number; active: boolean; icon: string; color: string; onClick: () => void; menu?: () => MenuEntry[]; drop?: string; sortId?: string; onDrag?: (e: ReactPointerEvent<HTMLElement>) => void }) {
  const itemMenu = useItemMenu();
  const handlers = menu ? itemMenu(menu) : undefined;
  return (
    <li>
      <button
        type="button"
        className="doc-folder"
        aria-current={active || undefined}
        onClick={onClick}
        onContextMenu={handlers?.onContextMenu}
        onKeyDown={handlers?.onKeyDown}
        onPointerDown={onDrag}
        data-sort-id={sortId}
        {...(drop ? dropTarget(drop, "document") : {})}
      >
        <ModuleChip color={color} icon={icon} size={24} />
        <span className="doc-folder-name">{label}</span>
        <span className="doc-folder-count">{count}</span>
      </button>
    </li>
  );
}

export function DocumentsScreen() {
  const { visible, folders, loaded, pickAndAdd, add, removeFolder, update, reorderFolders } = useDocuments();
  const bulk = useBulk();
  const docBulk = useDocumentBulk();
  const today = dayKey(useNow());
  const [pending] = useState(documentRequest.take);
  const [place, setPlace] = useState<Place>(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(pending === NEW_ITEM ? null : pending);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<Document | null>(null);
  const [folderEdit, setFolderEdit] = useState<Folder | "nouveau" | null>(null);
  const [renaming, setRenaming] = useState(0);
  const [sort, setSort] = useState<DocSort>(() => readPref("triDocuments", "ajout", (v): v is DocSort => DOC_SORTS.some((s) => s.value === v)));
  const [typeFilter, setTypeFilter] = useState<DocType | "">("");
  const searchRef = useRef<HTMLInputElement>(null);
  const folderForNew = place !== ALL && place !== SOON ? place : null;

  useNewItem(() => void pickAndAdd(folderForNew));
  useScreenMenu(() => [{ label: tr("Ajouter des documents"), icon: ICONS.plus, shortcut: KEYS.create, run: () => void pickAndAdd(folderForNew) }]);
  useDropTarget(tr("Déposer pour ajouter aux documents"), tr("Copie chiffrée dans Aqueli"), (paths) => {
    void add(paths, folderForNew).then((added) => added[0] && setSelectedId(added[0].id));
  });
  useEffect(() => {
    if (pending === NEW_ITEM) void pickAndAdd(null);
    // Une seule fois, à l'ouverture.
  }, []);
  useEffect(
    () =>
      documentRequest.on((id) => {
        if (id === NEW_ITEM) void pickAndAdd(folderForNew);
        else {
          setSelectedId(id);
          setPlace(ALL);
          setQuery("");
        }
      }),
    [pickAndAdd, folderForNew],
  );
  // Ctrl+F : recherche dans les documents.
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

  const soon = useMemo(() => visible.filter((d) => expiryOf(d, today)?.state !== "valide" && d.expiresOn), [visible, today]);
  const list = useMemo(() => {
    const base = place === ALL ? visible : place === SOON ? soon : visible.filter((d) => d.folderId === place);
    const q = fold(query.trim());
    const typed = typeFilter ? base.filter((d) => d.docType === typeFilter) : base;
    const found = q ? typed.filter((d) => fold(`${d.name} ${d.tags.join(" ")} ${d.notes} ${d.issuer} ${docTypeOf(d.docType)?.label ?? ""}`).includes(q)) : typed;
    return place === SOON ? [...found].sort((a, b) => (a.expiresOn ?? "").localeCompare(b.expiresOn ?? "")) : sortDocs(found, sort);
  }, [visible, soon, place, query, sort, typeFilter]);
  const typesPresent = DOC_TYPES.filter((t) => visible.some((d) => d.docType === t.id));
  const selected = visible.find((d) => d.id === selectedId) ?? list[0] ?? null;
  // Plusieurs documents à la fois : Ctrl+clic, Maj+clic, Ctrl+A dans la liste.
  const pick = useSelection(
    list.map((d) => d.id),
    selected?.id ?? null,
  );
  const bulkActions = docBulk(list.filter((d) => pick.has(d.id)));
  const bulkEntries = pick.count > 1 ? selectionEntries(bulkActions) : null;

  // Glisser des documents (ou la sélection) sur un dossier, ou sur « Tous les documents » pour
  // les sortir de leur dossier. Le clic droit (« Ranger dans… ») reste l'équivalent au clavier.
  const dragDocs = (d: Document) => (e: ReactPointerEvent<HTMLElement>) => {
    const docs = pick.has(d.id) && pick.count > 1 ? list.filter((x) => pick.has(x.id)) : [d];
    const target = (key: string) => (key.startsWith("dossier:") ? key.slice(8) : null);
    startDrag(
      e,
      { kind: "document", ids: docs.map((x) => x.id), label: dragLabel(docs.length, d.name, "documents"), color: KIND_COLORS[fileKind(d.ext)] },
      {
        canDrop: (key) => docs.some((x) => x.folderId !== target(key)),
        onDrop: (key) => {
          const folderId = target(key);
          const folder = folders.find((f) => f.id === folderId);
          const many = docs.length > 1;
          const n = docs.length;
          const message = folder
            ? many
              ? tr("{n} documents rangés dans « {name} ».", { n, name: folder.name })
              : tr("Document rangé dans « {name} ».", { name: folder.name })
            : trn(n, "Document sorti de son dossier.", "{n} documents sortis de leur dossier.");
          void bulk(message, tr("déplacement des documents"), async () => {
            for (const x of docs) if (x.folderId !== folderId) await update(x, { folderId });
          });
        },
      },
    );
  };
  useEffect(() => {
    if (!renaming) return;
    document.querySelector<HTMLInputElement>(".doc-name input")?.focus();
  }, [renaming]);

  const onListKeys = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(".doc-row")];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = items[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  const m = getModule("documents");
  return (
    <div className="screen documents-screen" style={{ "--row-color": m.color } as CSSProperties}>
      <header className="tasks-header">
        <ScreenTitle module="documents" />
        <div className="field-box notes-search">
          <Icon d={ICONS.search} size={15} />
          <input
            ref={searchRef}
            type="search"
            className="field-input"
            placeholder={tr("Rechercher un document")}
            aria-label={tr("Rechercher un document")}
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
        <button type="button" className="btn-gel" onClick={() => void pickAndAdd(folderForNew).then((added) => added[0] && setSelectedId(added[0].id))}>
          <Icon d={ICONS.plus} size={16} stroke={2.8} />
          <span>{tr("Ajouter des documents")}</span>
        </button>
      </header>

      <div className="documents-body">
        <nav className="doc-folders glass" aria-label={tr("Dossiers")}>
          <ul>
            <FolderButton label={tr("Tous les documents")} count={visible.length} active={place === ALL} icon={m.icon} color={m.color} onClick={() => setPlace(ALL)} drop="sans-dossier" />
            {soon.length > 0 && (
              <FolderButton label={tr("Expirent bientôt")} count={soon.length} active={place === SOON} icon={ICONS.clock} color={KIND_COLORS.pdf} onClick={() => setPlace(SOON)} />
            )}
          </ul>
          <h3 className="doc-folders-title">{tr("Dossiers")}</h3>
          <ul data-sort="dossiers-documents">
            {folders.map((f, i) => (
              <FolderButton
                key={f.id}
                label={f.name}
                count={visible.filter((d) => d.folderId === f.id).length}
                active={place === f.id}
                icon={symbolPath(f.icon ?? "carnet", ICONS.folder)}
                color={f.color ?? m.color}
                onClick={() => setPlace(f.id)}
                drop={`dossier:${f.id}`}
                sortId={f.id}
                onDrag={(e) => startDrag(e, { kind: "dossier-documents", ids: [f.id], label: f.name, color: f.color ?? m.color }, { sort: { group: "dossiers-documents", onSort: (ids) => void reorderFolders(ids) } })}
                menu={() => [
                  { label: tr("Renommer"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => setFolderEdit(f) },
                  "separator",
                  { label: tr("Monter"), icon: ICONS.arrowUp, disabled: i === 0, run: () => void reorderFolders(moved(folders.map((x) => x.id), i, -1)) },
                  { label: tr("Descendre"), icon: ICONS.arrowDown, disabled: i === folders.length - 1, run: () => void reorderFolders(moved(folders.map((x) => x.id), i, 1)) },
                  "separator",
                  {
                    label: tr("Supprimer le dossier"),
                    icon: ICONS.trash,
                    shortcut: KEYS.remove,
                    danger: true,
                    run: () => {
                      if (place === f.id) setPlace(ALL);
                      void removeFolder(f);
                    },
                  },
                ]}
              />
            ))}
          </ul>
          <button type="button" className="link-btn doc-new-folder" onClick={() => setFolderEdit("nouveau")}>
            <Icon d={ICONS.plus} size={12} stroke={2.6} />
            {tr("Nouveau dossier")}
          </button>
        </nav>

        <section className="task-panel glass doc-list" aria-label={tr("Documents")}>
          {loaded && visible.length === 0 ? (
            <div className="doc-empty">
              <EmptyState
                color={m.color}
                icon={m.icon}
                size={90}
                text={tr("Aucun document. Glissez des fichiers sur la fenêtre pour les ajouter. Ils sont copiés et chiffrés dans Aqueli.")}
                action={{ label: tr("Ajouter des documents"), run: () => void pickAndAdd(folderForNew).then((added) => added[0] && setSelectedId(added[0].id)) }}
              />
            </div>
          ) : (
            <div className="task-scroll">
              <div className="doc-list-tools">
                {place !== SOON && (
                  <Select
                    value={sort}
                    options={DOC_SORTS}
                    label={tr("Trier les documents")}
                    className="doc-tool"
                    onChange={(v) => {
                      setSort(v);
                      writePref("triDocuments", v);
                    }}
                  />
                )}
                {typesPresent.length > 0 && (
                  <Select
                    value={typeFilter}
                    options={[{ value: "" as const, label: tr("Toutes les sortes") }, ...typesPresent.map((t) => ({ value: t.id, label: t.label, icon: symbolPath(t.symbol, ICONS.notes) }))]}
                    label={tr("Sorte de document")}
                    className="doc-tool"
                    onChange={(v) => setTypeFilter(v)}
                  />
                )}
              </div>
              {list.length === 0 &&
                (query || typeFilter || place === SOON ? (
                  <p className="tasks-empty">{query || typeFilter ? tr("Aucun document trouvé.") : tr("Aucun document n'expire bientôt.")}</p>
                ) : (
                  <EmptyState
                    color={m.color}
                    icon={m.icon}
                    text={tr("Aucun document dans ce dossier.")}
                    action={{ label: tr("Ajouter des documents"), run: () => void pickAndAdd(folderForNew).then((added) => added[0] && setSelectedId(added[0].id)) }}
                  />
                ))}
              <ul
                className="doc-rows"
                onKeyDown={(e) => {
                  pick.onListKeyDown(e);
                  if (!e.defaultPrevented) onListKeys(e);
                }}
              >
                {list.map((d) => (
                  <DocumentRow
                    key={d.id}
                    doc={d}
                    selected={selected?.id === d.id}
                    picked={pick.has(d.id)}
                    bulk={pick.has(d.id) ? bulkEntries : null}
                    onSelect={(e) => {
                      if (!e || !pick.click(e, d.id)) setSelectedId(d.id);
                    }}
                    onPreview={() => setPreview(d)}
                    onRename={() => {
                      setSelectedId(d.id);
                      setRenaming((n) => n + 1);
                    }}
                    onDrag={dragDocs(d)}
                  />
                ))}
              </ul>
            </div>
          )}
          <SelectionBar count={pick.count} label={[tr("document sélectionné"), tr("documents sélectionnés")]} actions={bulkActions} onClear={pick.clear} />
        </section>

        <DocumentDetail doc={selected} onPreview={() => selected && setPreview(selected)} />
      </div>

      {preview && <PreviewDialog doc={preview} onClose={() => setPreview(null)} />}
      {folderEdit && <FolderEditor folder={folderEdit === "nouveau" ? undefined : folderEdit} onClose={() => setFolderEdit(null)} />}
    </div>
  );
}
