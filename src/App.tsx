import { useEffect, type ReactNode } from "react";
import logo from "./assets/aqueli-logo-256.png";
import { startedHidden, syncBackground } from "./app/background";
import { ToastProvider } from "./app/ToastProvider";
import { revealWindow } from "./lib/windowControls";
import { FullWindow } from "./lock/FullWindow";
import { LockScreen } from "./lock/LockScreen";
import { NavigationProvider } from "./navigation/NavigationProvider";
import { Onboarding } from "./onboarding/Onboarding";
import { PreferencesProvider } from "./prefs/PreferencesProvider";
import { Shell } from "./shell/Shell";
import { SoundProvider } from "./sound/SoundProvider";
import { SpacesProvider } from "./spaces/SpacesProvider";
import { TasksProvider } from "./tasks/TasksProvider";
import { TaskFiltersProvider } from "./tasks/TaskFiltersProvider";
import { EventsProvider } from "./calendar/EventsProvider";
import { SpecialDaysProvider } from "./calendar/SpecialDaysProvider";
import { RemindersBridge } from "./app/RemindersBridge";
import { BackupNotices } from "./backups/BackupNotices";
import { ImportProvider } from "./import/ImportProvider";
import { JournalProvider } from "./journal/JournalProvider";
import { HabitsProvider } from "./habits/HabitsProvider";
import { FocusProvider } from "./focus/FocusProvider";
import { ProjectsProvider } from "./projects/ProjectsProvider";
import { ContactsProvider } from "./contacts/ContactsProvider";
import { DocumentsProvider } from "./documents/DocumentsProvider";
import { ListsProvider } from "./lists/ListsProvider";
import { BudgetProvider } from "./budget/BudgetProvider";
import { GoalsProvider } from "./goals/GoalsProvider";
import { LinksProvider } from "./links/LinksProvider";
import { NotesProvider } from "./notes/NotesProvider";
import { ObligationsProvider } from "./obligations/ObligationsProvider";
import { ContextMenuProvider } from "./components/ContextMenu";
import { ThemeProvider } from "./theme/ThemeProvider";
import { vaultErrorMessage } from "./vault/messages";
import { useVault, VaultProvider } from "./vault/VaultProvider";
import { tr } from "./i18n/i18n";

/** La fenêtre apparaît une fois la police chargée et le premier écran dessiné. */
function useRevealWhenReady(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      // Lancé au démarrage de Windows : Aqueli reste caché près de l'horloge.
      void startedHidden().then((hidden) => {
        if (!hidden) requestAnimationFrame(() => requestAnimationFrame(() => void revealWindow()));
      });
    };
    document.fonts.ready.then(reveal, reveal);
    const fallback = window.setTimeout(reveal, 800);
    return () => window.clearTimeout(fallback);
  }, [ready]);
}

function VaultErrorScreen() {
  const { loadError, retry } = useVault();
  return (
    <FullWindow>
      <section className="lock-card" aria-labelledby="titre-erreur">
        <img className="lock-logo lock-logo--small" src={logo} alt="" draggable={false} />
        <div className="lock-title">
          <h1 id="titre-erreur">{tr("Ouverture impossible")}</h1>
        </div>
        <p className="form-error" role="alert">
          {loadError ? vaultErrorMessage(loadError) : tr("Erreur inconnue.")}
        </p>
        <button type="button" className="btn-gel" onClick={retry}>
          {tr("Réessayer")}
        </button>
      </section>
    </FullWindow>
  );
}

/** Choisit l'écran selon l'état du coffre : rien de personnel ne s'affiche tant qu'il est fermé. */
function Root() {
  const { phase } = useVault();
  useRevealWhenReady(phase !== "chargement");

  switch (phase) {
    case "chargement":
      return <div className="app-loading" />;
    case "erreur":
      return <VaultErrorScreen />;
    case "nouveau":
      return <Onboarding />;
    case "verrouille":
      return <LockScreen />;
    case "ouvert":
      return (
        <NavigationProvider>
          <SpacesProvider>
            <TasksProvider>
              <TaskFiltersProvider>
              <EventsProvider>
                <ObligationsProvider>
                  <NotesProvider>
                    <JournalProvider>
                      <HabitsProvider>
                        <FocusProvider>
                          <ProjectsProvider>
                            <ContactsProvider>
                              <DocumentsProvider>
                                <ListsProvider>
                                <BudgetProvider>
                                <GoalsProvider>
                                <LinksProvider>
                                <SpecialDaysProvider>
                                  <ImportProvider>
                                    <RemindersBridge />
                                    <BackupNotices />
                                    <Shell />
                                  </ImportProvider>
                                </SpecialDaysProvider>
                                </LinksProvider>
                                </GoalsProvider>
                                </BudgetProvider>
                                </ListsProvider>
                              </DocumentsProvider>
                            </ContactsProvider>
                          </ProjectsProvider>
                        </FocusProvider>
                      </HabitsProvider>
                    </JournalProvider>
                  </NotesProvider>
                </ObligationsProvider>
              </EventsProvider>
              </TaskFiltersProvider>
            </TasksProvider>
          </SpacesProvider>
        </NavigationProvider>
      );
  }
}

/** Menus du clic droit : fermés dès que le compte se verrouille (rien ne reste visible ni cliquable). */
function Menus({ children }: { children: ReactNode }) {
  const { phase } = useVault();
  return <ContextMenuProvider closed={phase !== "ouvert"}>{children}</ContextMenuProvider>;
}

export function App() {
  useEffect(() => {
    void syncBackground();
  }, []);
  return (
    <PreferencesProvider>
      <ThemeProvider>
        <SoundProvider>
          <VaultProvider>
            <ToastProvider>
              <Menus>
                <Root />
              </Menus>
            </ToastProvider>
          </VaultProvider>
        </SoundProvider>
      </ThemeProvider>
    </PreferencesProvider>
  );
}
