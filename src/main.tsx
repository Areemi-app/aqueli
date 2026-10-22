import { lazy, StrictMode, Suspense, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
// Police Figtree embarquée dans l'application (aucun téléchargement).
import "@fontsource-variable/figtree/wght.css";
import "./styles/base.css";
import "./styles/controls.css";
import "./styles/shell.css";
import "./styles/screens.css";
import "./styles/overlays.css";
import "./styles/vault.css";
import "./styles/tasks.css";
import "./styles/planner.css";
import "./styles/calendar.css";
import "./styles/obligations.css";
import "./styles/notes.css";
import "./styles/capture.css";
import "./styles/import.css";
import "./styles/wellbeing.css";
import "./styles/organize.css";
import "./styles/version3.css";
import "./styles/accounts.css";
import "./styles/signature.css";
import { initLanguage, lang } from "./i18n/i18n";
import { prefsBackend } from "./lib/prefsBackend";
import { flushPrefs, loadPrefs } from "./lib/storage";
import { installTruncationTitles } from "./lib/truncationTitles";
import { noteWindowId } from "./notes/noteWindows";

// Texte coupé par « … » : son contenu entier au survol, dans toutes les fenêtres.
installTruncationTitles();

// Le reste du code est lu une fois la langue connue : les textes calculés au chargement la suivent.
// Fenêtre d'une note : son code (l'éditeur) n'est lu que là, jamais au démarrage d'Aqueli.
const NoteWindowApp = lazy(() => import("./notes/NoteWindowApp").then((m) => ({ default: m.NoteWindowApp })));

// La capture rapide est une seconde fenêtre, sans accès aux données du compte.
const isCapture = window.location.hash === "#capture";
if (isCapture) document.documentElement.dataset.window = "capture";
// Mini-lecteur du Focus : une autre petite fenêtre, qui ne voit que l'état du minuteur.
const isMini = window.location.hash === "#focus";
if (isMini) document.documentElement.dataset.window = "focus";
// Une note dans sa propre fenêtre : seules les notes et les espaces y sont chargés.
const noteId = noteWindowId();
if (noteId) document.documentElement.dataset.window = "note";

const root = document.getElementById("root");
if (!root) throw new Error("Élément #root introuvable");
const container = root;

/** Les préférences sont chargées avant le premier affichage (au plus 1 s d'attente). */
function localStorageOrNothing(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const loaded = loadPrefs(prefsBackend, localStorageOrNothing());
const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 1000));

/** L'écran de la fenêtre : capture rapide, mini-lecteur du Focus, note ou Aqueli. */
async function windowApp(): Promise<ComponentType | null> {
  if (isCapture) return (await import("./capture/CaptureApp")).CaptureApp;
  if (isMini) return (await import("./focus/FocusMiniApp")).FocusMiniApp;
  if (noteId) return null;
  // Fenêtre principale : elle fait tourner le minuteur et répond au mini-lecteur.
  (await import("./focus/miniWindow")).startMiniBridge();
  return (await import("./App")).App;
}

void Promise.race([loaded, timeout])
  // Traduction illisible : l'interface reste en français.
  .then(() => initLanguage().catch(() => undefined))
  .then(windowApp)
  .then((Screen) => {
    // Un changement fait juste avant la fermeture est enregistré quand même.
    window.addEventListener("pagehide", () => void flushPrefs());
    if (isCapture || isMini || noteId) {
      window.addEventListener("focus", () => {
        void prefsBackend
          .load()
          .then((prefs) => {
            if ((prefs.langue === "fr" || prefs.langue === "en") && prefs.langue !== lang()) window.location.reload();
          })
          .catch(() => undefined);
      });
    }
    createRoot(container).render(
      <StrictMode>
        {Screen ? (
          <Screen />
        ) : noteId ? (
          <Suspense fallback={null}>
            <NoteWindowApp id={noteId} />
          </Suspense>
        ) : null}
      </StrictMode>,
    );
  });
