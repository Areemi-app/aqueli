import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUndoAction } from "../app/ToastProvider";
import { resolveShortcuts, shortcutFor, shortcutText } from "../app/shortcuts";
import { SHORTCUTS_TOPIC, topicForRoute } from "../help/helpRoutes";
import { onHelpRequest } from "../help/helpRequest";
import { clearWelcomeTour, onTourRequest, requestTour, welcomeTourPending, type TourRequestId } from "../tour/tourRequest";
import { runPrint } from "../print/print";
import { useToast } from "../app/ToastProvider";
import { submenuEntry, useContextMenu, useScreenMenuEntries, type MenuEntry } from "../components/ContextMenu";
import { ICONS } from "../components/icons";
import { isModuleKey, visibleModules } from "../modules/modules";
import { useNavigation } from "../navigation/NavigationProvider";
import { routeLabel, type RouteId } from "../navigation/routes";
import { CommandPalette } from "../palette/CommandPalette";
import { buildCommands } from "../palette/commands";
import { usePreferences } from "../prefs/PreferencesProvider";
import { HomeScreen } from "../screens/HomeScreen";
import { ModuleScreen } from "../screens/ComingSoonScreen";
import { FocusDock } from "../focus/FocusDock";
import { WallpaperBridge } from "../theme/customActions";
import { requestBackup } from "../backups/backupState";
import { preselectSettingsTab } from "../screens/settingsTab";
import { requestCalendar } from "../calendar/calendarRequest";
import { requestObligation } from "../obligations/obligationRequest";
import { requestNote } from "../notes/noteRequest";
import { flushNoteWindows, onOpenNoteRequest, watchNoteWindows } from "../notes/noteWindows";
import { onBeforeLock } from "../lib/beforeLock";
import { useFocus } from "../focus/FocusProvider";
import { NEW_HABIT, requestHabit } from "../habits/habitRequest";
import { requestJournal } from "../journal/journalRequest";
import { dayKey } from "../tasks/day";
import { contactRequest, documentRequest, goalRequest, listRequest, NEW_ITEM, projectRequest, reviewRequest, transactionRequest } from "../lib/request";
import { requestDayPlanner } from "../planner/plannerRequest";
import { requestQuickAdd } from "../tasks/quickAddFocus";
import { useSpaces } from "../spaces/SpacesProvider";
import { useTheme } from "../theme/ThemeProvider";
import { useAutoLock, useVault } from "../vault/VaultProvider";
import { Decor } from "./Decor";
import { GlobalSearch } from "../search/GlobalSearch";
import { captureApi } from "../capture/captureApi";
import { useImport } from "../import/ImportProvider";
import { runNewItem } from "./newItem";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { TitleBar } from "./TitleBar";
import { tr } from "../i18n/i18n";

/**
 * Écrans chargés à leur première ouverture : l'application s'ouvre plus vite (l'éditeur de
 * notes, le calendrier ou le Bilan ne sont lus que s'ils servent).
 */
const TasksScreen = lazy(() => import("../tasks/TasksScreen").then((m) => ({ default: m.TasksScreen })));
const HabitsScreen = lazy(() => import("../habits/HabitsScreen").then((m) => ({ default: m.HabitsScreen })));
const FocusScreen = lazy(() => import("../focus/FocusScreen").then((m) => ({ default: m.FocusScreen })));
const SettingsScreen = lazy(() => import("../screens/SettingsScreen").then((m) => ({ default: m.SettingsScreen })));
const TrashScreen = lazy(() => import("../trash/TrashScreen").then((m) => ({ default: m.TrashScreen })));
const JournalScreen = lazy(() => import("../journal/JournalScreen").then((m) => ({ default: m.JournalScreen })));
const ProjectsScreen = lazy(() => import("../projects/ProjectsScreen").then((m) => ({ default: m.ProjectsScreen })));
const ContactsScreen = lazy(() => import("../contacts/ContactsScreen").then((m) => ({ default: m.ContactsScreen })));
const DocumentsScreen = lazy(() => import("../documents/DocumentsScreen").then((m) => ({ default: m.DocumentsScreen })));
const ListsScreen = lazy(() => import("../lists/ListsScreen").then((m) => ({ default: m.ListsScreen })));
const BudgetScreen = lazy(() => import("../budget/BudgetScreen").then((m) => ({ default: m.BudgetScreen })));
const GoalsScreen = lazy(() => import("../goals/GoalsScreen").then((m) => ({ default: m.GoalsScreen })));
const ReviewScreen = lazy(() => import("../review/ReviewScreen").then((m) => ({ default: m.ReviewScreen })));
const CalendarScreen = lazy(() => import("../calendar/CalendarScreen").then((m) => ({ default: m.CalendarScreen })));
const ObligationsScreen = lazy(() => import("../obligations/ObligationsScreen").then((m) => ({ default: m.ObligationsScreen })));
const NotesScreen = lazy(() => import("../notes/NotesScreen").then((m) => ({ default: m.NotesScreen })));
const HelpDialog = lazy(() => import("../help/HelpDialog").then((m) => ({ default: m.HelpDialog })));
const TourOverlay = lazy(() => import("../tour/TourOverlay").then((m) => ({ default: m.TourOverlay })));

function Screen({ route }: { route: RouteId }) {
  if (route === "accueil") return <HomeScreen />;
  if (route === "parametres") return <SettingsScreen />;
  if (route === "corbeille") return <TrashScreen />;
  if (route === "taches") return <TasksScreen />;
  if (route === "calendrier") return <CalendarScreen />;
  if (route === "obligations") return <ObligationsScreen />;
  if (route === "notes") return <NotesScreen />;
  if (route === "journal") return <JournalScreen />;
  if (route === "habitudes") return <HabitsScreen />;
  if (route === "focus") return <FocusScreen />;
  if (route === "projets") return <ProjectsScreen />;
  if (route === "contacts") return <ContactsScreen />;
  if (route === "documents") return <DocumentsScreen />;
  if (route === "listes") return <ListsScreen />;
  if (route === "budget") return <BudgetScreen />;
  if (route === "objectifs") return <GoalsScreen />;
  if (route === "bilan") return <ReviewScreen />;
  return <ModuleScreen moduleKey={route} />;
}

/** Ce que crée Ctrl+N sur chaque écran (une tâche ailleurs), pour l'afficher dans la palette. */
const CREATE_COMMANDS: Partial<Record<RouteId, string>> = {
  notes: "note:new",
  obligations: "obligation:new",
  calendrier: "event:new",
  journal: "journal:today",
  habitudes: "habit:new",
  projets: "project:new",
  contacts: "contact:new",
  documents: "document:new",
  budget: "transaction:new",
  objectifs: "goal:new",
  // Dans les Listes, Ctrl+N ajoute un élément à la liste ouverte.
  listes: "",
};

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
  );
}

/** La fenêtre principale : barre de titre, barre latérale, zone de travail, barre d'état. */
export function Shell() {
  const nav = useNavigation();
  const { theme, themes, setThemeId, surpriseMe, keepToday, backToPreferred } = useTheme();
  const focus = useFocus();
  const { spaces, setFilter } = useSpaces();
  const { prefs, setPref } = usePreferences();
  const { lock, autoLockMinutes } = useVault();
  const { pick: pickImport } = useImport();
  const lockNow = useCallback(() => void lock("manuel"), [lock]);
  const lockIdle = useCallback(() => void lock("auto"), [lock]);
  useAutoLock(autoLockMinutes, lockIdle);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** Recherche globale ouverte, avec son texte de départ. */
  const [search, setSearch] = useState<string | null>(null);
  const [spacesOpen, setSpacesOpen] = useState(false);
  // Aide ouverte : sa rubrique.
  const [help, setHelp] = useState<string | null>(null);
  // Visite guidée en cours.
  const [tour, setTour] = useState<TourRequestId | null>(null);
  const notify = useToast();
  const printView = () => {
    if (!runPrint()) notify(tr("Impression indisponible pour cet écran."));
  };
  const printRef = useRef(printView);
  printRef.current = printView;
  const openMenu = useContextMenu();
  const screenEntries = useScreenMenuEntries();

  // Les écouteurs clavier lisent toujours la dernière version de la navigation.
  const navRef = useRef(nav);
  navRef.current = nav;
  const lockRef = useRef(lockNow);
  lockRef.current = lockNow;
  const undo = useUndoAction();
  const undoRef = useRef(undo);
  undoRef.current = undo;
  // Ctrl+1 à Ctrl+9 suivent l'ordre des modules affichés dans la barre latérale.
  const modulesRef = useRef(visibleModules(prefs.hiddenModules));
  modulesRef.current = visibleModules(prefs.hiddenModules);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = shortcutFor(e);
      if (!action) return;
      // Ctrl+Z dans un texte ou une fenêtre ouverte : l'annulation de la saisie reste celle du champ.
      if (action.type === "undo") {
        if (e.defaultPrevented || isEditable(e.target) || document.querySelector('[aria-modal="true"]')) return;
        e.preventDefault();
        void undoRef.current();
        return;
      }
      const n = navRef.current;
      e.preventDefault();
      switch (action.type) {
        case "palette":
          setSpacesOpen(false);
          setSearch(null);
          setPaletteOpen((open) => !open);
          break;
        case "search":
          setSpacesOpen(false);
          setPaletteOpen(false);
          setSearch((current) => (current === null ? "" : null));
          break;
        case "spaces":
          setPaletteOpen(false);
          setSpacesOpen((open) => !open);
          break;
        case "module": {
          const m = modulesRef.current[action.index];
          if (m) {
            setPaletteOpen(false);
            n.go(m.key);
          }
          break;
        }
        case "settings":
          setPaletteOpen(false);
          n.go("parametres");
          break;
        case "back":
          n.back();
          break;
        case "forward":
          n.forward();
          break;
        case "lock":
          lockRef.current();
          break;
        case "backup":
          requestBackup();
          break;
        case "help":
          setPaletteOpen(false);
          setHelp((open) => (open ? null : topicForRoute(n.route)));
          break;
        case "shortcuts":
          setPaletteOpen(false);
          setHelp((open) => (open === SHORTCUTS_TOPIC ? null : SHORTCUTS_TOPIC));
          break;
        case "print":
          // Dans une fenêtre de dialogue, rien ne s'imprime.
          if (document.querySelector('[aria-modal="true"]')) break;
          printRef.current();
          break;
        case "newItem":
          setPaletteOpen(false);
          // Dans une fenêtre de dialogue, Ctrl+N n'a pas d'effet.
          if (document.querySelector('[aria-modal="true"]')) break;
          if (!runNewItem()) {
            n.go("taches");
            requestQuickAdd();
          }
          break;
        case "block":
          break;
      }
    };
    // Boutons « précédent / suivant » sur le côté de la souris.
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        navRef.current.back();
      } else if (e.button === 4) {
        e.preventDefault();
        navRef.current.forward();
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) e.preventDefault();
    };
    // Le menu du navigateur intégré (Actualiser, Inspecter…) n'a pas sa place dans l'application.
    const onContextMenu = (e: MouseEvent) => {
      if (import.meta.env.PROD && !isEditable(e.target)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  useEffect(() => {
    document.title = `${routeLabel(nav.route)} · Aqueli`;
  }, [nav.route]);

  // Notes ouvertes dans leur fenêtre : suivies, enregistrées avant un verrouillage ; une note
  // demandée depuis l'une d'elles (lien, « Ramener dans Aqueli ») s'ouvre ici.
  useEffect(() => {
    const stopWatch = watchNoteWindows();
    const stopFlush = onBeforeLock(flushNoteWindows);
    const stopOpen = onOpenNoteRequest((id) => {
      navRef.current.go("notes");
      requestNote({ id });
    });
    return () => {
      stopWatch();
      stopFlush();
      stopOpen();
    };
  }, []);

  // Aide demandée par la palette ou les Paramètres.
  useEffect(() => onHelpRequest((topic) => setHelp(topic ?? topicForRoute(navRef.current.route))), []);

  // La visite est chargée en avance, quand la fenêtre est au repos : elle s'ouvre sans attente.
  useEffect(() => {
    const idle = requestIdleCallback(() => void import("../tour/TourOverlay"), { timeout: 5000 });
    return () => cancelIdleCallback(idle);
  }, []);

  // Visite demandée (Paramètres › Aide, palette, aide), ou proposée après la création du compte.
  useEffect(() => {
    const start = (id: TourRequestId) => {
      setPaletteOpen(false);
      setHelp(null);
      setSearch(null);
      setTour(id);
    };
    const off = onTourRequest(start);
    // La demande n'est effacée qu'au démarrage effectif de la visite.
    const timer = welcomeTourPending()
      ? window.setTimeout(() => {
          clearWelcomeTour();
          start("general");
        }, 900)
      : 0;
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, []);

  // « Nouvelle tâche » depuis l'icône près de l'horloge.
  const commands = useMemo(
    () =>
      buildCommands({
        createCommand: CREATE_COMMANDS[nav.route] ?? "task:new",
        keys: resolveShortcuts(prefs.shortcuts),
        go: nav.go,
        back: nav.back,
        forward: nav.forward,
        themes,
        currentThemeId: theme.id,
        setThemeId,
        spaces,
        setSpaceFilter: setFilter,
        prefs,
        setPref,
        lock: lockNow,
        newTask: () => {
          nav.go("taches");
          requestQuickAdd();
        },
        planDay: () => {
          nav.go("accueil");
          requestDayPlanner();
        },
        newEvent: () => {
          nav.go("calendrier");
          requestCalendar({ create: true });
        },
        newObligation: () => {
          nav.go("obligations");
          requestObligation({ create: true });
        },
        searchEverywhere: () => setSearch(""),
        quickCapture: () => void captureApi.show(),
        importFile: () => void pickImport(),
        newNote: () => {
          nav.go("notes");
          requestNote({ create: true });
        },
        writeJournal: () => {
          nav.go("journal");
          requestJournal(dayKey(new Date()));
        },
        newHabit: () => {
          nav.go("habitudes");
          requestHabit(NEW_HABIT);
        },
        startFocus: () => {
          focus.start();
          nav.go("focus");
        },
        newProject: () => {
          nav.go("projets");
          projectRequest.request(NEW_ITEM);
        },
        newContact: () => {
          nav.go("contacts");
          contactRequest.request(NEW_ITEM);
        },
        addDocuments: () => {
          nav.go("documents");
          documentRequest.request(NEW_ITEM);
        },
        newList: () => {
          nav.go("listes");
          listRequest.request(NEW_ITEM);
        },
        newExpense: () => {
          nav.go("budget");
          transactionRequest.request(NEW_ITEM);
        },
        newGoal: () => {
          nav.go("objectifs");
          goalRequest.request(NEW_ITEM);
        },
        openReview: (tab) => {
          nav.go("bilan");
          reviewRequest.request(tab);
        },
        surpriseMe,
        keepToday,
        backToPreferred,
        openHelp: (topic) => setHelp(topic ?? topicForRoute(nav.route)),
        print: () => printRef.current(),
        startTour: (scope) => requestTour(scope === "general" || !isModuleKey(nav.route) ? "general" : nav.route),
        openSettings: (tab) => {
          preselectSettingsTab(tab);
          nav.go("parametres");
        },
      }),
    [nav.go, nav.back, nav.forward, nav.route, themes, theme.id, setThemeId, spaces, setFilter, prefs, setPref, lockNow, pickImport, surpriseMe, keepToday, backToPreferred, focus.start],
  );

  const commandsRun = (id: string) => commands.find((c) => c.id === id)?.run();

  return (
    <div
      className="app"
      onContextMenu={(e) => {
        // Champs de saisie : menu Couper, Copier, Coller de Windows. En développement,
        // Maj + clic droit garde le menu du navigateur (Inspecter).
        if (e.defaultPrevented || isEditable(e.target) || (import.meta.env.DEV && e.shiftKey)) return;
        const selection = window.getSelection()?.toString() ?? "";
        const fromScreen = screenEntries();
        // Ctrl+N crée l'élément de l'écran s'il en a un, une tâche sinon : le raccourci s'affiche là où il agit.
        const screenCreates = fromScreen.some((entry) => entry !== "separator" && entry.shortcut === shortcutText("newItem"));
        const create: MenuEntry[] = [
          { label: tr("Nouvelle tâche"), icon: ICONS.plus, shortcut: screenCreates ? undefined : shortcutText("newItem"), run: () => commandsRun("task:new") },
          { label: tr("Nouvel événement"), icon: ICONS.calendar, run: () => commandsRun("event:new") },
          { label: tr("Nouvelle obligation"), icon: ICONS.notes, run: () => commandsRun("obligation:new") },
          { label: tr("Nouvelle note"), icon: ICONS.pencil, run: () => commandsRun("note:new") },
        ];
        // Ordre commun : copier la sélection, les actions de l'écran, créer, puis la fenêtre.
        const entries: MenuEntry[] = [
          ...(selection
            ? [
                {
                  label: tr("Copier"),
                  icon: ICONS.layers,
                  shortcut: "Ctrl+C",
                  run: () => void navigator.clipboard.writeText(selection).catch(() => document.execCommand("copy")),
                },
                "separator" as const,
              ]
            : []),
          ...fromScreen,
          "separator",
          // Les quatre créations, sauf si l'écran (l'Accueil) les propose déjà.
          ...(fromScreen.length === 0
            ? create
            : create.every((c) => c !== "separator" && fromScreen.some((e) => e !== "separator" && e.label === c.label))
              ? []
              : [submenuEntry(tr("Créer"), ICONS.plus, create)]),
          "separator",
          ...(nav.canBack ? [{ label: tr("Précédent"), icon: ICONS.arrowLeft, shortcut: shortcutText("back"), run: nav.back }] : []),
          ...(nav.canForward ? [{ label: tr("Suivant"), icon: ICONS.arrowRight, shortcut: shortcutText("forward"), run: nav.forward }] : []),
          { label: tr("Rechercher une commande"), icon: ICONS.search, shortcut: shortcutText("palette"), run: () => setPaletteOpen(true) },
          { label: tr("Aide"), icon: ICONS.help, shortcut: shortcutText("help"), run: () => setHelp(topicForRoute(nav.route)) },
        ];
        openMenu(e, entries);
      }}
    >
      <Decor />
      <TitleBar
        onOpenPalette={() => {
          setSpacesOpen(false);
          setPaletteOpen(true);
        }}
        spacesOpen={spacesOpen}
        onSpacesOpenChange={setSpacesOpen}
      />
      <div className="workspace">
        <Sidebar />
        <main className="main" key={nav.route} aria-label={routeLabel(nav.route)}>
          <Suspense fallback={<div className="screen" aria-busy="true" />}>
            <Screen route={nav.route} />
          </Suspense>
        </main>
      </div>
      <StatusBar />
      <FocusDock />
      <WallpaperBridge />
      {paletteOpen && (
        <CommandPalette
          commands={commands}
          onClose={() => setPaletteOpen(false)}
          onSearchEverywhere={(query) => {
            setPaletteOpen(false);
            setSearch(query);
          }}
        />
      )}
      {search !== null && <GlobalSearch initialQuery={search} onClose={() => setSearch(null)} />}
      {tour !== null && (
        <Suspense fallback={null}>
          <TourOverlay key={tour} id={tour} onClose={() => setTour(null)} />
        </Suspense>
      )}
      {help !== null && (
        <Suspense fallback={null}>
          <HelpDialog
            topic={help}
            keys={resolveShortcuts(prefs.shortcuts)}
            onTopic={setHelp}
            onClose={() => setHelp(null)}
            onEditShortcuts={() => {
              setHelp(null);
              preselectSettingsTab("clavier");
              nav.go("parametres");
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
