import { shortcutText, type ShortcutMap } from "../app/shortcuts";
import { ICONS } from "../components/icons";
import { MODULES, visibleModules } from "../modules/modules";
import type { RouteId } from "../navigation/routes";
import type { Preferences } from "../prefs/PreferencesProvider";
import type { SettingsTab } from "../screens/settingsTab";
import type { Space, SpaceFilter } from "../spaces/spaces";
import type { AnyThemeId, ThemeDef } from "../theme/themes";
import type { Searchable } from "./search";
import { tr, trValue } from "../i18n/i18n";
import { openSupport } from "../lib/support";

export type CommandGroup = "Module" | "Thème" | "Espace" | "Action";

export interface Command extends Searchable {
  id: string;
  group: CommandGroup;
  /** Pastille : couleur + icône. */
  color: string;
  icon: string;
  /** Raccourci affiché à droite. */
  shortcut?: string;
  run: () => void;
}

export interface CommandContext {
  go: (route: RouteId) => void;
  back: () => void;
  forward: () => void;
  themes: readonly ThemeDef[];
  currentThemeId: AnyThemeId;
  setThemeId: (id: AnyThemeId) => void;
  spaces: readonly Space[];
  setSpaceFilter: (filter: SpaceFilter) => void;
  prefs: Preferences;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  lock: () => void;
  /** Commande que lance Ctrl+N sur l'écran affiché (« task:new » par défaut). */
  createCommand: string;
  /** Raccourcis en vigueur (Paramètres › Clavier). */
  keys: ShortcutMap;
  /** Ouvre les Tâches, curseur dans la saisie rapide. */
  newTask: () => void;
  /** Ouvre l'Accueil et « Planifier ma journée ». */
  planDay: () => void;
  /** Ouvre le calendrier et « Nouvel événement ». */
  newEvent: () => void;
  /** Ouvre les Obligations et « Nouvelle obligation ». */
  newObligation: () => void;
  /** Ouvre les Notes sur une note nouvelle. */
  newNote: () => void;
  /** Ouvre le Journal sur la page du jour. */
  writeJournal: () => void;
  /** Ouvre les Habitudes et « Nouvelle habitude ». */
  newHabit: () => void;
  /** Démarre (ou reprend) la séance de Focus et ouvre son écran. */
  startFocus: () => void;
  /** Ouvre les Projets et « Nouveau projet ». */
  newProject: () => void;
  /** Ouvre les Contacts et « Nouveau contact ». */
  newContact: () => void;
  /** Ouvre les Documents et la fenêtre « Ouvrir » de Windows. */
  addDocuments: () => void;
  /** Ouvre les Listes et « Nouvelle liste ». */
  newList: () => void;
  /** Ouvre le Budget et « Nouvelle dépense ». */
  newExpense: () => void;
  /** Ouvre les Objectifs et « Nouvel objectif ». */
  newGoal: () => void;
  /** Ouvre le Bilan sur un onglet. */
  openReview: (tab: "revue" | "rapport") => void;
  /** Recherche globale (Ctrl+Maj+F). */
  searchEverywhere: () => void;
  /** Capture rapide (raccourci global). */
  quickCapture: () => void;
  /** « Importer un fichier » : fenêtre « Ouvrir », puis l'aperçu. */
  importFile: () => void;
  surpriseMe: () => void;
  keepToday: () => void;
  backToPreferred: () => void;
  /** Aide intégrée : la rubrique donnée, sinon celle de l'écran affiché. */
  openHelp: (topic?: string) => void;
  /** Imprime la vue affichée (Ctrl+P). */
  print: () => void;
  /** Visite guidée : générale, ou celle du module affiché. */
  startTour: (scope: "general" | "screen") => void;
  /** Ouvre les Paramètres sur l'onglet donné. */
  openSettings: (tab: SettingsTab) => void;
}

/** Toutes les commandes de la palette, construites à partir de l'état courant. */
export function buildCommands(ctx: CommandContext): Command[] {
  const modules: Command[] = visibleModules(ctx.prefs.hiddenModules).map((m, i) => ({
    id: `module:${m.key}`,
    group: "Module",
    label: m.label,
    keywords: [tr("ouvrir"), tr("module"), m.summary],
    color: m.color,
    icon: m.icon,
    shortcut: i < 9 ? `Ctrl ${i + 1}` : undefined,
    run: () => ctx.go(m.key),
  }));

  const places: Command[] = (
    [
    {
      id: "task:new",
      group: "Action",
      label: tr("Nouvelle tâche"),
      keywords: [tr("ajouter"), tr("créer"), tr("tâche"), tr("à faire")],
      color: MODULES.find((m) => m.key === "taches")?.color ?? "var(--aq-gel)",
      icon: ICONS.plus,
      run: ctx.newTask,
    },
    {
      id: "task:plan",
      group: "Action",
      label: tr("Planifier ma journée"),
      keywords: [tr("agenda"), tr("journée"), tr("organiser"), tr("créneaux"), tr("retard")],
      color: MODULES.find((m) => m.key === "taches")?.color ?? "var(--aq-gel)",
      icon: ICONS.sun,
      run: ctx.planDay,
    },
    {
      id: "event:new",
      group: "Action",
      label: tr("Nouvel événement"),
      keywords: [tr("rendez-vous"), tr("agenda"), tr("calendrier"), tr("créer"), tr("ajouter")],
      color: MODULES.find((m) => m.key === "calendrier")?.color ?? "var(--aq-gel)",
      icon: ICONS.calendar,
      run: ctx.newEvent,
    },
    {
      id: "obligation:new",
      group: "Action",
      label: tr("Nouvelle obligation"),
      keywords: [tr("facture"), tr("abonnement"), tr("contrat"), tr("impôt"), tr("échéance"), tr("assurance")],
      color: MODULES.find((m) => m.key === "obligations")?.color ?? "var(--aq-gel)",
      icon: MODULES.find((m) => m.key === "obligations")?.icon ?? ICONS.plus,
      run: ctx.newObligation,
    },
    {
      id: "note:new",
      group: "Action",
      label: tr("Nouvelle note"),
      keywords: [tr("écrire"), tr("carnet"), tr("idée"), tr("texte"), tr("créer"), tr("ajouter")],
      color: MODULES.find((m) => m.key === "notes")?.color ?? "var(--aq-gel)",
      icon: MODULES.find((m) => m.key === "notes")?.icon ?? ICONS.plus,
      run: ctx.newNote,
    },
    {
      id: "journal:today",
      group: "Action",
      label: tr("Écrire dans le journal"),
      keywords: [tr("journal"), tr("humeur"), tr("énergie"), tr("gratitude"), tr("page"), tr("aujourd'hui")],
      color: MODULES.find((m) => m.key === "journal")?.color ?? "var(--aq-gel)",
      icon: MODULES.find((m) => m.key === "journal")?.icon ?? ICONS.pencil,
      run: ctx.writeJournal,
    },
    {
      id: "habit:new",
      group: "Action",
      label: tr("Nouvelle habitude"),
      keywords: [tr("habitude"), tr("routine"), tr("suivi"), tr("créer"), tr("ajouter")],
      color: MODULES.find((m) => m.key === "habitudes")?.color ?? "var(--aq-gel)",
      icon: MODULES.find((m) => m.key === "habitudes")?.icon ?? ICONS.plus,
      run: ctx.newHabit,
    },
    {
      id: "focus:start",
      group: "Action",
      label: tr("Démarrer une séance Focus"),
      keywords: [tr("focus"), tr("minuteur"), tr("pomodoro"), tr("concentration"), tr("séance")],
      color: MODULES.find((m) => m.key === "focus")?.color ?? "var(--aq-gel)",
      icon: ICONS.play,
      run: ctx.startFocus,
    },
    {
      id: "project:new",
      group: "Action",
      label: tr("Nouveau projet"),
      keywords: [tr("projet"), tr("chantier"), tr("kanban"), tr("jalon"), tr("étape"), tr("créer"), tr("ajouter")],
      color: MODULES.find((m) => m.key === "projets")?.color ?? "var(--aq-gel)",
      icon: MODULES.find((m) => m.key === "projets")?.icon ?? ICONS.plus,
      run: ctx.newProject,
    },
    {
      id: "contact:new",
      group: "Action",
      label: tr("Nouveau contact"),
      keywords: [tr("contact"), tr("personne"), tr("téléphone"), tr("adresse"), tr("anniversaire"), tr("créer"), tr("ajouter")],
      color: MODULES.find((m) => m.key === "contacts")?.color ?? "var(--aq-gel)",
      icon: MODULES.find((m) => m.key === "contacts")?.icon ?? ICONS.plus,
      run: ctx.newContact,
    },
    {
      id: "document:new",
      group: "Action",
      label: tr("Ajouter des documents"),
      keywords: [tr("document"), tr("fichier"), tr("pdf"), tr("scan"), tr("papiers"), tr("coffre")],
      color: MODULES.find((m) => m.key === "documents")?.color ?? "var(--aq-gel)",
      icon: MODULES.find((m) => m.key === "documents")?.icon ?? ICONS.plus,
      run: ctx.addDocuments,
    },
    {
      id: "list:new",
      group: "Action",
      label: tr("Nouvelle liste"),
      keywords: [tr("liste"), tr("courses"), tr("livres"), tr("films"), tr("séries"), tr("cadeaux"), tr("voyages"), tr("envies"), tr("créer"), tr("ajouter")],
      color: MODULES.find((m) => m.key === "listes")?.color ?? "var(--aq-gel)",
      icon: MODULES.find((m) => m.key === "listes")?.icon ?? ICONS.plus,
      run: ctx.newList,
    },
    {
      id: "transaction:new",
      group: "Action",
      label: tr("Nouvelle dépense"),
      keywords: [tr("dépense"), tr("budget"), tr("achat"), tr("argent"), tr("revenu"), tr("opération"), tr("créer"), tr("ajouter")],
      color: MODULES.find((m) => m.key === "budget")?.color ?? "var(--aq-gel)",
      icon: MODULES.find((m) => m.key === "budget")?.icon ?? ICONS.plus,
      run: ctx.newExpense,
    },
    {
      id: "goal:new",
      group: "Action",
      label: tr("Nouvel objectif"),
      keywords: [tr("objectif"), tr("but"), tr("ambition"), tr("cible"), tr("résolution"), tr("créer"), tr("ajouter")],
      color: MODULES.find((m) => m.key === "objectifs")?.color ?? "var(--aq-gel)",
      icon: MODULES.find((m) => m.key === "objectifs")?.icon ?? ICONS.plus,
      run: ctx.newGoal,
    },
    {
      id: "review:week",
      group: "Action",
      label: tr("Revue de la semaine"),
      keywords: [tr("bilan"), tr("revue"), tr("semaine"), tr("réussites"), tr("priorités"), tr("hebdomadaire")],
      color: MODULES.find((m) => m.key === "bilan")?.color ?? "var(--aq-gel)",
      icon: MODULES.find((m) => m.key === "bilan")?.icon ?? ICONS.check,
      run: () => ctx.openReview("revue"),
    },
    {
      id: "review:report",
      group: "Action",
      label: tr("Rapport du mois"),
      keywords: [tr("bilan"), tr("rapport"), tr("mensuel"), tr("pdf"), tr("imprimer"), tr("exporter"), tr("statistiques")],
      color: MODULES.find((m) => m.key === "bilan")?.color ?? "var(--aq-gel)",
      icon: ICONS.printer,
      run: () => ctx.openReview("rapport"),
    },
    {
      id: "search:global",
      group: "Action",
      label: tr("Rechercher partout"),
      keywords: [tr("recherche"), tr("trouver"), tr("chercher"), tr("globale"), tr("tout")],
      color: "var(--aq-gel)",
      icon: ICONS.search,
      shortcut: shortcutText("search", ctx.keys, " "),
      run: ctx.searchEverywhere,
    },
    {
      id: "capture:open",
      group: "Action",
      label: tr("Capture rapide"),
      keywords: [tr("capturer"), tr("noter"), tr("vite"), tr("idée"), tr("boîte de réception")],
      color: "var(--aq-gel)",
      icon: ICONS.inbox,
      run: ctx.quickCapture,
    },
    {
      id: "import:file",
      group: "Action",
      label: tr("Importer un fichier"),
      keywords: [tr("import"), tr("excel"), tr("csv"), tr("texte"), tr("classeur"), tr("fichier"), tr("liste"), tr("ajouter")],
      color: "var(--aq-gel)",
      icon: ICONS.importFile,
      run: ctx.importFile,
    },
    {
      id: "vault:lock",
      group: "Action",
      label: tr("Verrouiller Aqueli"),
      keywords: [tr("cadenas"), tr("sécurité"), tr("fermer"), tr("protéger")],
      color: "var(--aq-gel)",
      icon: ICONS.lock,
      shortcut: shortcutText("lock", ctx.keys, " "),
      run: ctx.lock,
    },
    {
      id: "route:parametres",
      group: "Action",
      label: tr("Paramètres"),
      keywords: [tr("réglages"), tr("options"), tr("préférences"), tr("configuration")],
      color: "var(--aq-gel)",
      icon: ICONS.settings,
      shortcut: shortcutText("settings", ctx.keys, " "),
      run: () => ctx.go("parametres"),
    },
    {
      id: "view:print",
      group: "Action",
      label: tr("Imprimer"),
      keywords: [tr("pdf"), tr("papier"), tr("imprimante"), tr("exporter"), tr("vue")],
      color: "var(--aq-gel)",
      icon: ICONS.printer,
      shortcut: "Ctrl P",
      run: ctx.print,
    },
    {
      id: "help:open",
      group: "Action",
      label: tr("Aide"),
      keywords: [tr("comment"), tr("mode d'emploi"), tr("guide"), tr("question"), tr("utiliser")],
      color: "var(--aq-gel)",
      icon: ICONS.help,
      shortcut: shortcutText("help", ctx.keys, " "),
      run: () => ctx.openHelp(),
    },
    {
      id: "tour:general",
      group: "Action",
      label: tr("Visite guidée"),
      keywords: [tr("découvrir"), tr("présentation"), tr("tutoriel"), tr("prise en main"), tr("aide")],
      color: "var(--aq-gel)",
      icon: ICONS.play,
      run: () => ctx.startTour("general"),
    },
    {
      id: "tour:screen",
      group: "Action",
      label: tr("Visite guidée de cet écran"),
      keywords: [tr("découvrir"), tr("présentation"), tr("tutoriel"), tr("module"), tr("aide")],
      color: "var(--aq-gel)",
      icon: ICONS.play,
      run: () => ctx.startTour("screen"),
    },
    {
      id: "support",
      group: "Action",
      label: tr("Soutenir Aqueli"),
      keywords: [tr("don"), tr("soutien"), tr("Ko-fi"), tr("auteur"), tr("remercier")],
      color: "var(--aq-gel)",
      icon: ICONS.heart,
      run: openSupport,
    },
    {
      id: "help:shortcuts",
      group: "Action",
      label: tr("Raccourcis clavier"),
      keywords: [tr("touches"), tr("clavier"), tr("combinaisons"), tr("aide")],
      color: "var(--aq-gel)",
      icon: ICONS.keyboard,
      shortcut: shortcutText("shortcuts", ctx.keys, " "),
      run: () => ctx.openHelp("raccourcis"),
    },
    {
      id: "settings:calendrier",
      group: "Action",
      label: tr("Jours fériés et fêtes"),
      keywords: [tr("pays"), tr("vacances scolaires"), tr("zone"), tr("fêtes religieuses"), tr("ramadan"), tr("férié"), tr("calendrier"), tr("traditions")],
      color: "var(--aq-gel)",
      icon: ICONS.flag,
      run: () => ctx.openSettings("calendrier"),
    },
    {
      id: "route:corbeille",
      group: "Action",
      label: tr("Corbeille"),
      keywords: [tr("supprimés"), tr("restaurer")],
      color: "var(--aq-chip-neutral)",
      icon: ICONS.trash,
      run: () => ctx.go("corbeille"),
    },
    {
      id: "nav:back",
      group: "Action",
      label: tr("Précédent"),
      keywords: [tr("retour"), tr("arrière"), tr("revenir")],
      color: "var(--aq-chip-neutral)",
      icon: ICONS.arrowLeft,
      shortcut: shortcutText("back", ctx.keys, " "),
      run: ctx.back,
    },
    {
      id: "nav:forward",
      group: "Action",
      label: tr("Suivant"),
      keywords: [tr("avant"), tr("avancer")],
      color: "var(--aq-chip-neutral)",
      icon: ICONS.arrowRight,
      shortcut: shortcutText("forward", ctx.keys, " "),
      run: ctx.forward,
    },
    ] satisfies Command[]
  ).map((c): Command => (c.id === ctx.createCommand ? { ...c, shortcut: shortcutText("newItem", ctx.keys, " ") } : c));

  const themes: Command[] = ctx.themes.map((t) => ({
    id: `theme:${t.id}`,
    group: "Thème",
    label: tr("Thème : {name}", { name: t.name }),
    keywords: [tr("apparence"), tr("couleurs"), t.dark ? tr("sombre") : tr("clair"), trValue(t.family), t.description],
    color: t.swatches[2] ?? "var(--aq-gel)",
    icon: ICONS.palette,
    shortcut: t.id === ctx.currentThemeId ? tr("actuel") : undefined,
    run: () => ctx.setThemeId(t.id),
  }));

  themes.push(
    {
      id: "theme:surprise",
      group: "Thème",
      label: tr("Thème au hasard"),
      keywords: [tr("surprends-moi"), tr("aléatoire"), tr("rotation"), tr("apparence")],
      color: "var(--aq-gel)",
      icon: ICONS.sparkle,
      run: ctx.surpriseMe,
    },
    {
      id: "theme:keep",
      group: "Thème",
      label: tr("Garder ce thème aujourd'hui"),
      keywords: [tr("apparence"), tr("figer"), tr("conserver")],
      color: "var(--aq-gel)",
      icon: ICONS.pin,
      run: ctx.keepToday,
    },
    {
      id: "theme:preferred",
      group: "Thème",
      label: tr("Revenir au thème préféré"),
      keywords: [tr("apparence"), tr("favori"), tr("habituel")],
      color: "var(--aq-gel)",
      icon: ICONS.palette,
      run: ctx.backToPreferred,
    },
  );

  const spaces: Command[] = [
    {
      id: "space:tous",
      group: "Espace",
      label: tr("Espace : Tous"),
      keywords: [tr("filtre"), tr("espaces"), tr("tout voir")],
      color: "var(--aq-gel)",
      icon: ICONS.spaces,
      run: () => ctx.setSpaceFilter("tous"),
    },
    ...ctx.spaces.map<Command>((s) => ({
      id: `space:${s.id}`,
      group: "Espace",
      label: tr("Espace : {name}", { name: s.name }),
      keywords: [tr("filtre"), tr("espaces")],
      color: s.color,
      icon: ICONS.spaces,
      run: () => ctx.setSpaceFilter(s.id),
    })),
  ];

  const toggles: Command[] = [
    {
      id: "pref:reduceMotion",
      group: "Action",
      label: ctx.prefs.reduceMotion ? tr("Rétablir les animations") : tr("Réduire les animations"),
      keywords: [tr("accessibilité"), tr("mouvement"), tr("animations")],
      color: "var(--aq-gel)",
      icon: ICONS.motion,
      run: () => ctx.setPref("reduceMotion", !ctx.prefs.reduceMotion),
    },
    {
      id: "pref:reduceTransparency",
      group: "Action",
      label: ctx.prefs.reduceTransparency ? tr("Rétablir la transparence") : tr("Réduire la transparence"),
      keywords: [tr("accessibilité"), tr("verre"), tr("flou"), tr("transparence")],
      color: "var(--aq-gel)",
      icon: ICONS.layers,
      run: () => ctx.setPref("reduceTransparency", !ctx.prefs.reduceTransparency),
    },
  ];

  return [...modules, ...places, ...themes, ...spaces, ...toggles];
}
