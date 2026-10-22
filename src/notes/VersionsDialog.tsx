import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useState } from "react";
import { Dialog } from "../components/Dialog";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { notesApi } from "./api";
import { readOnlyExtensions } from "./editor/extensions";
import { EMPTY_DOC, noteTitle, type Note, type NoteVersion } from "./notes";
import { useNotes } from "./NotesProvider";
import { locale, tr } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

const when = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString(locale(), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

interface VersionsDialogProps {
  noteId: string;
  onRestored: (note: Note) => void;
  onClose: () => void;
}

/** Historique des versions d'une note : aperçu et « Rétablir ». */
export function VersionsDialog({ noteId, onRestored, onClose }: VersionsDialogProps) {
  const { restoreVersion } = useNotes();
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useEditor({
    extensions: readOnlyExtensions(),
    editable: false,
    injectCSS: false,
    content: EMPTY_DOC,
    editorProps: { attributes: { class: "note-content", "aria-label": tr("Texte de la version") } },
  });

  useEffect(() => {
    notesApi
      .versions(noteId)
      .then((list) => {
        setVersions(list);
        setSelected(list[0]?.id ?? null);
      })
      .catch((err: DataError) => setError(dataErrorMessage(err)));
  }, [noteId]);

  useEffect(() => {
    if (selected === null || !preview) return;
    let alive = true;
    notesApi
      .version(noteId, selected)
      .then((v) => {
        if (alive) preview.commands.setContent(JSON.parse(v.content), { emitUpdate: false });
      })
      .catch((err: DataError) => alive && setError(dataErrorMessage(err)));
    return () => {
      alive = false;
    };
  }, [noteId, selected, preview]);

  const restore = async () => {
    if (selected === null) return;
    setBusy(true);
    const note = await restoreVersion(noteId, selected);
    if (note) {
      onRestored(note);
      onClose();
    } else {
      setBusy(false);
    }
  };

  return (
    <Dialog title={tr("Historique des versions")} onClose={onClose} className="dialog--wide dialog--versions">
      {versions && versions.length === 0 ? (
        <p className="settings-intro">
          <Sentences text={tr("Aucune version antérieure. Pendant la saisie, une version est gardée toutes les 10 minutes, 50 au plus.")} />
        </p>
      ) : (
        <div className="note-versions">
          <ul className="note-versions-list" role="listbox" aria-label={tr("Versions")}>
            {(versions ?? []).map((v) => (
              <li
                key={v.id}
                role="option"
                aria-selected={v.id === selected}
                tabIndex={v.id === selected ? 0 : -1}
                className="note-version"
                onClick={() => setSelected(v.id)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                  e.preventDefault();
                  const list = versions ?? [];
                  const index = list.findIndex((x) => x.id === v.id) + (e.key === "ArrowDown" ? 1 : -1);
                  const next = list[Math.max(0, Math.min(list.length - 1, index))];
                  if (next) {
                    setSelected(next.id);
                    const el = e.currentTarget.parentElement?.children[list.indexOf(next)] as HTMLElement | undefined;
                    el?.focus();
                  }
                }}
              >
                <span className="note-version-date">{when(v.savedAt)}</span>
                <span className="note-version-title">{noteTitle(v)}</span>
                <span className="note-version-excerpt">{v.excerpt}</span>
              </li>
            ))}
          </ul>
          <div className="note-versions-preview" aria-label={tr("Aperçu de la version")}>
            <EditorContent editor={preview} className="note-content-wrap" />
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="onb-actions">
        <button type="button" className="btn-glass" onClick={onClose}>
          {tr("Fermer")}
        </button>
        {versions && versions.length > 0 && (
          <button type="button" className="btn-gel" disabled={busy || selected === null} onClick={() => void restore()}>
            {tr("Rétablir cette version")}
          </button>
        )}
      </div>
    </Dialog>
  );
}
