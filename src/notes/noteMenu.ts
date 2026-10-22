/** Menu du clic droit d'une note (liste, éditeur, Accueil). */
import { useToast } from "../app/ToastProvider";
import { submenuEntry, type MenuEntry } from "../components/ContextMenu";
import { ICONS } from "../components/icons";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { KEYS } from "../lib/itemKeys";
import { usePinEntry } from "../pins/pins";
import { exportNoteFile } from "./api";
import { isNoteWindow } from "./noteWindows";
import { noteExport, type NoteFormat } from "./noteExport";
import { EMPTY_DOC, noteTitle, type DocNode, type NoteSummary } from "./notes";
import { useNotes } from "./NotesProvider";
import { tr } from "../i18n/i18n";

export interface NoteMenuActions {
  /** Ouvrir la note (absent quand elle est déjà ouverte). */
  open?: () => void;
  move: () => void;
  saveAsTemplate: () => void;
  /** Après « Dupliquer » : la copie. */
  opened?: (copy: NoteSummary) => void;
  /** Note ouverte : son titre et son texte tels qu'affichés (modifications pas encore enregistrées comprises). */
  current?: () => { title: string; doc: DocNode };
}

const parse = (content: string): DocNode => {
  try {
    return JSON.parse(content) as DocNode;
  } catch {
    return EMPTY_DOC;
  }
};

/** Exporte une note en .md ou .txt, ou l'imprime (« pdf ») ; le texte affiché si la note est ouverte. */
function useNoteExport(): (note: NoteSummary, format: NoteFormat | "pdf", current?: NoteMenuActions["current"]) => Promise<void> {
  const { load } = useNotes();
  const notify = useToast();
  return async (n, format, current) => {
    try {
      const { title, doc } = current?.() ?? { title: n.title, doc: parse((await load(n.id)).content) };
      const name = noteTitle({ title });
      if (format === "pdf") {
        const { printNote } = await import("./notePrint");
        printNote(name, doc);
        return;
      }
      const path = await exportNoteFile(name, format, noteExport(doc, name, format));
      if (path) notify(tr("Note exportée."));
    } catch (err) {
      notify(dataErrorMessage(err as DataError));
    }
  };
}

export function useNoteMenu(): (note: NoteSummary, actions: NoteMenuActions) => MenuEntry[] {
  const { updateMeta, duplicate, remove } = useNotes();
  const exportNote = useNoteExport();
  const pinEntry = usePinEntry();
  return (n, actions) => [
    ...(actions.open ? [{ label: tr("Ouvrir"), icon: ICONS.enter, shortcut: KEYS.open, run: actions.open }] : []),
    { label: n.pinned ? tr("Désépingler") : tr("Épingler"), icon: ICONS.pin, run: () => void updateMeta(n, { pinned: !n.pinned }) },
    { label: n.favorite ? tr("Retirer des favoris") : tr("Ajouter aux favoris"), icon: ICONS.star, run: () => void updateMeta(n, { favorite: !n.favorite }) },
    ...(isNoteWindow() ? [] : [pinEntry({ kind: "note", id: n.id })]),
    "separator",
    {
      label: tr("Dupliquer"),
      icon: ICONS.layers,
      shortcut: actions.open ? KEYS.duplicate : undefined,
      run: () => {
        void duplicate(n).then((copy) => copy && actions.opened?.(copy));
      },
    },
    { label: tr("Déplacer vers un carnet…"), icon: ICONS.notebook, run: actions.move },
    { label: tr("Enregistrer comme modèle…"), icon: ICONS.template, run: actions.saveAsTemplate },
    { label: n.archived ? tr("Ressortir des archives") : tr("Archiver"), icon: ICONS.archive, run: () => void updateMeta(n, { archived: !n.archived }) },
    "separator",
    // Ctrl+P imprime la note ouverte : le raccourci ne vaut que dans la note.
    { label: tr("Imprimer ou enregistrer en PDF…"), icon: ICONS.printer, shortcut: actions.open ? undefined : KEYS.print, run: () => void exportNote(n, "pdf", actions.current) },
    submenuEntry(tr("Exporter"), ICONS.save, [
      { label: tr("Exporter en Markdown (.md)…"), icon: ICONS.save, run: () => void exportNote(n, "md", actions.current) },
      { label: tr("Exporter en texte (.txt)…"), icon: ICONS.save, run: () => void exportNote(n, "txt", actions.current) },
    ]),
    "separator",
    // Dans la note ouverte, Suppr efface du texte : le raccourci ne vaut que dans la liste.
    { label: tr("Supprimer"), icon: ICONS.trash, shortcut: actions.open ? KEYS.remove : undefined, danger: true, run: () => void remove(n) },
  ];
}
