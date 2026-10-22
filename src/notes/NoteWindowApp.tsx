/**
 * Une note dans sa propre fenêtre : barre de titre, puis l'éditeur. Seuls les notes et les
 * espaces sont chargés. La fenêtre se ferme quand le compte se verrouille ; avant, ce qui est en
 * cours de saisie est enregistré (à la fermeture, sur demande de la fenêtre principale).
 */
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import logo from "../assets/aqueli-logo-256.png";
import { ToastProvider } from "../app/ToastProvider";
import { ContextMenuProvider } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { flushBeforeLock } from "../lib/beforeLock";
import { inTauri, revealWindow } from "../lib/windowControls";
import { PreferencesProvider } from "../prefs/PreferencesProvider";
import { runPrint } from "../print/print";
import { WindowControls } from "../shell/WindowControls";
import { SoundProvider } from "../sound/SoundProvider";
import { SpacesProvider } from "../spaces/SpacesProvider";
import { ThemeProvider } from "../theme/ThemeProvider";
import { NoteEditor } from "./editor/NoteEditor";
import { noteTitle } from "./notes";
import { NotesProvider, useNotes } from "./NotesProvider";
import { onFlushRequest, reportActivity, showInMain } from "./noteWindows";
import { tr } from "../i18n/i18n";

function NoteWindow({ id }: { id: string }) {
  const { notes, loaded } = useNotes();
  const note = notes.find((n) => n.id === id) ?? null;
  const title = note ? noteTitle(note) : tr("Note");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    document.title = `${title} · Aqueli`;
  }, [title]);

  // La fenêtre apparaît une fois la note chargée : pas de flash blanc.
  useEffect(() => {
    if (!loaded || revealed) return;
    setRevealed(true);
    requestAnimationFrame(() => requestAnimationFrame(() => void revealWindow()));
  }, [loaded, revealed]);

  // Activité de la personne (le verrouillage automatique attend), enregistrement demandé,
  // fermeture : ce qui est en cours de saisie est écrit d'abord.
  useEffect(() => {
    const onActivity = () => reportActivity();
    const events = ["keydown", "pointerdown", "wheel"] as const;
    for (const name of events) window.addEventListener(name, onActivity, { passive: true });
    const stopFlush = onFlushRequest(() => void flushBeforeLock());
    let stopClose: (() => void) | undefined;
    if (inTauri)
      void getCurrentWindow()
        .onCloseRequested(async () => {
          await flushBeforeLock();
        })
        .then((fn) => (stopClose = fn));
    // Pendant la saisie, la fenêtre perdue de vue (Win+L, autre fenêtre) enregistre tout de suite.
    const onBlur = () => void flushBeforeLock();
    window.addEventListener("blur", onBlur);
    return () => {
      for (const name of events) window.removeEventListener(name, onActivity);
      window.removeEventListener("blur", onBlur);
      stopFlush();
      stopClose?.();
    };
  }, []);

  // Raccourcis de la fenêtre : Ctrl+P imprime la note ; le navigateur intégré ne recharge pas la page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (ctrl && !e.altKey && !e.shiftKey && key === "p") {
        e.preventDefault();
        runPrint();
      } else if (e.key === "F5" || (ctrl && (key === "r" || key === "f" || key === "g"))) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const returnToMain = async () => {
    await flushBeforeLock();
    showInMain(id, true);
  };

  return (
    <div className="note-window">
      <header className="note-window-bar" data-tauri-drag-region="deep">
        <img className="titlebar-logo" src={logo} alt="" draggable={false} />
        <span className="note-window-title" data-tauri-drag-region="deep">
          {title}
        </span>
        <button type="button" className="btn-glass btn-glass--sm" title={tr("Ramener la note dans la fenêtre principale")} onClick={() => void returnToMain()}>
          <Icon d={ICONS.windowReturn} size={14} stroke={2.2} />
          {tr("Ramener dans Aqueli")}
        </button>
        <WindowControls />
      </header>
      <main className="note-window-body glass">
        {loaded && !note ? (
          <p className="tasks-empty">{tr("Cette note a été supprimée.")}</p>
        ) : (
          <NoteEditor noteId={id} onOpen={(other) => showInMain(other, false)} />
        )}
      </main>
    </div>
  );
}

export function NoteWindowApp({ id }: { id: string }) {
  return (
    <PreferencesProvider>
      <ThemeProvider>
        <SoundProvider>
          <ToastProvider>
            <ContextMenuProvider>
              <SpacesProvider>
                <NotesProvider>
                  <NoteWindow id={id} />
                </NotesProvider>
              </SpacesProvider>
            </ContextMenuProvider>
          </ToastProvider>
        </SoundProvider>
      </ThemeProvider>
    </PreferencesProvider>
  );
}
