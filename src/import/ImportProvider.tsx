import { dropTarget } from "../app/fileDrop";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useToast } from "../app/ToastProvider";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { readPref, writePref } from "../lib/storage";
import { inTauri } from "../lib/windowControls";
import { importApi, importErrorMessage, type ImportFile, type ImportPlace, type ImportStatus } from "./importApi";
import { extensionOf, IMPORT_EXTENSIONS } from "./extensions";
import { tr } from "../i18n/i18n";

export interface ImportPrefs {
  /** Surveiller le dossier d'import. */
  watch: boolean;
  /** Après l'import : ranger le fichier dans Import\Traités plutôt que le supprimer. */
  keepFiles: boolean;
}

/** Aperçu de l'import et lecteurs de fichiers (Excel, CSV, agenda, contacts) : chargés au premier import. */
const ImportDialog = lazy(() => import("./ImportDialog").then((m) => ({ default: m.ImportDialog })));

const DEFAULT_PREFS: ImportPrefs = { watch: true, keepFiles: false };

const isPrefs = (v: unknown): v is Partial<ImportPrefs> => typeof v === "object" && v !== null;

function readImportPrefs(): ImportPrefs {
  const saved = readPref<Partial<ImportPrefs>>("import", {}, isPrefs);
  return {
    watch: typeof saved.watch === "boolean" ? saved.watch : DEFAULT_PREFS.watch,
    keepFiles: typeof saved.keepFiles === "boolean" ? saved.keepFiles : DEFAULT_PREFS.keepFiles,
  };
}

/** Surveillance du dossier : toutes les 5 secondes, fenêtre visible. */
const POLL_MS = 5000;
/** Un fichier modifié depuis moins de 3 secondes est peut-être encore en cours d'écriture. */
const SETTLE_SECONDS = 3;

const isImportable = (path: string) => (IMPORT_EXTENSIONS as readonly string[]).includes(extensionOf(path));
const fileKey = (f: ImportFile) => `${f.path}|${f.modified}|${f.size}`;

interface ImportContextValue {
  status: ImportStatus | null;
  /** Fichiers du dossier d'import prêts à importer. */
  pending: readonly ImportFile[];
  prefs: ImportPrefs;
  setPrefs: (changes: Partial<ImportPrefs>) => void;
  /** Ouvre l'aperçu d'un fichier. */
  open: (file: ImportFile) => void;
  /** « Importer un fichier » : fenêtre « Ouvrir » de Windows, puis l'aperçu. */
  pick: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Ouvre le dossier d'import, le guide ou les modèles. */
  reveal: (place: ImportPlace) => void;
}

const ImportContext = createContext<ImportContextValue | null>(null);

/**
 * Import de fichiers, une fois le compte ouvert : surveillance du dossier Documents\Aqueli\Import
 * (message à l'arrivée d'un fichier), fichiers glissés sur la fenêtre, « Importer un fichier ».
 */
export function ImportProvider({ children }: { children: ReactNode }) {
  const notify = useToast();
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [prefs, setPrefsState] = useState<ImportPrefs>(readImportPrefs);
  const [current, setCurrent] = useState<ImportFile | null>(null);
  const [queue, setQueue] = useState<ImportFile[]>([]);
  const [dragging, setDragging] = useState<{ title: string; text: string } | null>(null);
  const [clock, setClock] = useState(() => Math.floor(Date.now() / 1000));
  const announced = useRef(new Set<string>());
  const currentRef = useRef<ImportFile | null>(null);
  currentRef.current = current;

  const open = useCallback((file: ImportFile) => {
    if (currentRef.current) setQueue((q) => (q.some((f) => f.path === file.path) ? q : [...q, file]));
    else setCurrent(file);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await importApi.status();
      setStatus(next);
      setClock(Math.floor(Date.now() / 1000));
    } catch {
      // Dossier indisponible : Paramètres › Import l'indique.
    }
  }, []);

  const pending = useMemo(() => (status?.files ?? []).filter((f) => f.modified <= clock - SETTLE_SECONDS), [status, clock]);

  // Arrivée d'un fichier dans le dossier : un message, une fois par fichier.
  useEffect(() => {
    if (!prefs.watch || current) return;
    const fresh = pending.filter((f) => !announced.current.has(fileKey(f)));
    if (fresh.length === 0) return;
    for (const f of fresh) announced.current.add(fileKey(f));
    const first = fresh[0]!;
    notify(fresh.length === 1 ? tr("Fichier à importer : {name}.", { name: first.name }) : tr("{length} fichiers à importer.", { length: fresh.length }), {
      label: tr("Afficher"),
      run: () => open(first),
    });
  }, [pending, prefs.watch, current, notify, open]);

  useEffect(() => {
    void refresh();
    if (!prefs.watch) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [prefs.watch, refresh]);

  // Fichiers glissés sur la fenêtre.
  useEffect(() => {
    if (!inTauri) return;
    let stop: (() => void) | undefined;
    let stopped = false;
    const describe = async (path: string): Promise<ImportFile> => {
      try {
        return await importApi.describe(path);
      } catch {
        // Le cœur retient le fichier au même moment : un second essai, un peu après.
        await new Promise((r) => window.setTimeout(r, 300));
        return importApi.describe(path);
      }
    };
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        const target = dropTarget();
        if (payload.type === "enter") {
          if (target) setDragging(payload.paths.length > 0 ? { title: target.title, text: target.text } : null);
          else setDragging(payload.paths.some(isImportable) ? { title: tr("Déposer pour importer"), text: tr("Excel, CSV, texte, agenda ou contacts") } : null);
        } else if (payload.type === "leave") setDragging(null);
        else if (payload.type === "drop") {
          setDragging(null);
          if (target) {
            if (payload.paths.length > 0) target.drop(payload.paths);
            return;
          }
          const paths = payload.paths.filter(isImportable);
          if (paths.length === 0) {
            if (payload.paths.length > 0) notify(tr("Format non pris en charge. Formats acceptés : .xlsx, .csv, .txt, .md, .ics et .vcf."));
            return;
          }
          for (const path of paths) {
            describe(path)
              .then(open)
              .catch((e: unknown) => notify(importErrorMessage(e)));
          }
        }
      })
      .then((fn) => {
        if (stopped) fn();
        else stop = fn;
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
      stop?.();
    };
  }, [notify, open]);

  const pick = useCallback(async () => {
    try {
      const file = await importApi.pickFile();
      if (file) open(file);
    } catch (e) {
      notify(importErrorMessage(e));
    }
  }, [open, notify]);

  const value = useMemo<ImportContextValue>(
    () => ({
      status,
      pending,
      prefs,
      setPrefs: (changes) =>
        setPrefsState((p) => {
          const next = { ...p, ...changes };
          writePref("import", next);
          return next;
        }),
      open,
      pick,
      refresh,
      reveal: (place) => {
        importApi.open(place).catch((e: unknown) => notify(importErrorMessage(e)));
      },
    }),
    [status, pending, prefs, open, pick, refresh, notify],
  );

  const close = () => {
    setCurrent(queue[0] ?? null);
    setQueue((q) => q.slice(1));
    void refresh();
  };

  return (
    <ImportContext.Provider value={value}>
      {children}
      {current && (
        <Suspense fallback={null}>
          <ImportDialog key={current.path} file={current} keepFiles={prefs.keepFiles} onClose={close} />
        </Suspense>
      )}
      {dragging && (
        <div className="import-drop" aria-hidden="true">
          <div className="import-drop-panel glass-popover">
            <span className="import-drop-icon">
              <Icon d={ICONS.importFile} size={30} stroke={2.2} />
            </span>
            <span className="import-drop-title">{dragging.title}</span>
            <span className="import-drop-text">{dragging.text}</span>
          </div>
        </div>
      )}
    </ImportContext.Provider>
  );
}

export function useImport(): ImportContextValue {
  const ctx = useContext(ImportContext);
  if (!ctx) throw new Error("useImport doit être utilisé dans ImportProvider");
  return ctx;
}
