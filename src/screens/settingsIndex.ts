/**
 * Rubriques des Paramètres (volet de navigation) et index de leurs réglages pour la recherche
 * (« Rechercher un réglage »). Le libellé de chaque réglage est celui affiché à l'écran : il
 * sert à le retrouver et à le mettre en valeur après la navigation.
 */
import { ICONS } from "../components/icons";
import { fold } from "../lib/fold";
import { tr } from "../i18n/i18n";

export type SettingsTab =
  | "apparence"
  | "espaces"
  | "modules"
  | "sons"
  | "rappels"
  | "calendrier"
  | "sauvegardes"
  | "import"
  | "securite"
  | "accessibilite"
  | "clavier"
  | "langue"
  | "aide"
  | "a-propos";

export interface SettingsPage {
  id: SettingsTab;
  label: string;
  icon: string;
  /** Pastille de la rubrique dans le volet et en tête de page (comme les Paramètres de Windows). */
  color: string;
  /** Ce que la rubrique règle, sous son nom dans le volet. */
  hint: string;
}

export const SETTINGS_GROUPS: readonly { label: string; pages: readonly SettingsPage[] }[] = [
  {
    label: tr("Personnalisation"),
    pages: [
      { id: "apparence", label: tr("Apparence"), icon: ICONS.palette, color: "#7a4fd0", hint: tr("Thèmes, changement automatique") },
      { id: "sons", label: tr("Sons"), icon: ICONS.speaker, color: "#d9567a", hint: tr("Sons de l'interface par catégorie") },
      { id: "accessibilite", label: tr("Accessibilité"), icon: ICONS.accessibility, color: "#2d6ff0", hint: tr("Contraste, animations, taille du texte") },
      { id: "clavier", label: tr("Clavier"), icon: ICONS.keyboard, color: "#5f7489", hint: tr("Raccourcis, capture rapide") },
      { id: "langue", label: tr("Langue"), icon: ICONS.globe, color: "#c2479a", hint: tr("Langue de l'interface, dates et nombres") },
    ],
  },
  {
    label: tr("Organisation"),
    pages: [
      { id: "espaces", label: tr("Espaces"), icon: ICONS.spaces, color: "#0a9cc4", hint: tr("Perso, Travail, Santé…") },
      { id: "modules", label: tr("Modules"), icon: ICONS.sidebar, color: "#6d5ce0", hint: tr("Modules affichés, ordre") },
      { id: "calendrier", label: tr("Calendrier"), icon: ICONS.calendar, color: "#2fae4a", hint: tr("Affichage, jours fériés, vacances, fêtes") },
      { id: "rappels", label: tr("Rappels"), icon: ICONS.bell, color: "#e3a712", hint: tr("Notifications, démarrage") },
    ],
  },
  {
    label: tr("Données et sécurité"),
    pages: [
      { id: "sauvegardes", label: tr("Sauvegardes"), icon: ICONS.save, color: "#16a3a3", hint: tr("Sauvegardes, emplacement des données") },
      { id: "import", label: tr("Import"), icon: ICONS.importFile, color: "#e0671f", hint: tr("Dossier d'import, guide") },
      { id: "securite", label: tr("Sécurité"), icon: ICONS.shield, color: "#1f9a6e", hint: tr("Mot de passe, verrouillage, Windows Hello") },
    ],
  },
  {
    label: tr("Aide"),
    pages: [
      { id: "aide", label: tr("Aide"), icon: ICONS.help, color: "#e3a712", hint: tr("Aide intégrée, visite guidée") },
      { id: "a-propos", label: tr("À propos"), icon: ICONS.info, color: "#1e90e0", hint: tr("Version, confidentialité") },
    ],
  },
];

export const SETTINGS_PAGES: readonly SettingsPage[] = SETTINGS_GROUPS.flatMap((g) => g.pages);

export const pageOf = (id: SettingsTab): SettingsPage => SETTINGS_PAGES.find((p) => p.id === id)!;

export const isSettingsTab = (value: unknown): value is SettingsTab => SETTINGS_PAGES.some((p) => p.id === value);

export interface SettingEntry {
  tab: SettingsTab;
  /** Libellé affiché à l'écran (réglage ou rubrique). */
  label: string;
  /** Autres mots qui y mènent. */
  keywords?: string;
}

export const SETTINGS_INDEX: readonly SettingEntry[] = [
  { tab: "apparence", label: tr("Thème actuel"), keywords: tr("couleurs clair sombre galerie fond") },
  { tab: "apparence", label: tr("Thème préféré"), keywords: tr("favori") },
  { tab: "apparence", label: tr("Bannière illustrée"), keywords: tr("image dessin decor frise barre titre") },
  { tab: "apparence", label: tr("Changer de thème automatiquement"), keywords: tr("automatique fetes saisons heure") },
  { tab: "apparence", label: tr("Mode sombre de Windows"), keywords: tr("nuit noir dark") },
  { tab: "apparence", label: tr("Rotation aléatoire"), keywords: tr("hasard changer") },
  { tab: "apparence", label: tr("Planning des thèmes"), keywords: tr("periode calendrier") },
  { tab: "apparence", label: tr("Éditeur de thème"), keywords: tr("personnaliser fond ecran image accent flou") },
  { tab: "sons", label: tr("Sons d'Aqueli"), keywords: tr("son bruit audio volume silence muet") },
  { tab: "sons", label: tr("Sons du thème"), keywords: tr("ambiance") },
  { tab: "accessibilite", label: tr("Réduire les animations"), keywords: tr("mouvement") },
  { tab: "accessibilite", label: tr("Contraste élevé"), keywords: tr("lisibilite vue") },
  { tab: "accessibilite", label: tr("Réduire la transparence"), keywords: tr("verre flou opaque") },
  { tab: "accessibilite", label: tr("Taille du texte"), keywords: tr("police zoom agrandir lettres") },
  { tab: "clavier", label: tr("Capture rapide"), keywords: tr("raccourci global ctrl alt") },
  { tab: "clavier", label: tr("Raccourci"), keywords: tr("touches clavier modifier") },
  { tab: "langue", label: tr("Langue de l'interface"), keywords: "english anglais français francais language español deutsch italiano português русский 中文 日本語 한국어 हिन्दी" },
  { tab: "a-propos", label: tr("Soutenir Aqueli"), keywords: tr("don soutien ko-fi auteur licence") },
  { tab: "espaces", label: tr("Espaces"), keywords: tr("perso travail sante famille creer renommer") },
  { tab: "modules", label: tr("Barre latérale"), keywords: tr("masquer afficher modules ordre") },
  { tab: "calendrier", label: tr("Heures de travail"), keywords: tr("journee bureau horaires griser") },
  { tab: "calendrier", label: tr("Durée d'un nouvel événement"), keywords: tr("evenement longueur rendez-vous") },
  { tab: "calendrier", label: tr("Rappel d'un nouvel événement"), keywords: tr("notification alerte evenement") },
  { tab: "calendrier", label: tr("Afficher les numéros de semaine"), keywords: tr("semaine numero") },
  { tab: "calendrier", label: tr("Afficher le samedi et le dimanche"), keywords: tr("week-end weekend jours ouvres") },
  { tab: "calendrier", label: tr("Pays ou région"), keywords: tr("jours feries pays france belgique suisse canada") },
  { tab: "calendrier", label: tr("Vacances scolaires"), keywords: tr("zone a b c ecole") },
  { tab: "calendrier", label: tr("Fêtes et traditions"), keywords: tr("religion ramadan noel paques fetes juives musulmanes") },
  { tab: "rappels", label: tr("Rappel par défaut"), keywords: tr("notification avant echeance") },
  { tab: "rappels", label: tr("Notification d'essai"), keywords: tr("tester notification") },
  { tab: "rappels", label: tr("Afficher le titre des tâches quand Aqueli est verrouillé"), keywords: tr("confidentialite notification") },
  { tab: "rappels", label: tr("Garder Aqueli en arrière-plan à la fermeture"), keywords: tr("icone horloge zone notification fermer") },
  { tab: "rappels", label: tr("Lancer Aqueli au démarrage de Windows"), keywords: tr("demarrage automatique") },
  { tab: "rappels", label: tr("Rappels des obligations"), keywords: tr("factures echeances") },
  { tab: "rappels", label: tr("Anniversaires"), keywords: tr("contacts rappel") },
  { tab: "rappels", label: tr("Rappel d'écriture"), keywords: tr("journal page du jour notification") },
  { tab: "rappels", label: tr("Rester en contact"), keywords: tr("contacts nouvelles recontacter suivi") },
  { tab: "sauvegardes", label: tr("Sauvegarde automatique"), keywords: tr("quotidienne copie") },
  { tab: "sauvegardes", label: tr("Destination externe"), keywords: tr("cle usb disque dur") },
  { tab: "sauvegardes", label: tr("Dernières sauvegardes"), keywords: tr("restaurer historique") },
  { tab: "sauvegardes", label: tr("Restaurer depuis un fichier"), keywords: tr("recuperer") },
  { tab: "sauvegardes", label: tr("Exporter le compte"), keywords: tr("transferer autre pc") },
  { tab: "sauvegardes", label: tr("Emplacement des données"), keywords: tr("deplacer dossier disque") },
  { tab: "import", label: tr("Importer un fichier"), keywords: tr("excel csv ics vcf") },
  { tab: "import", label: tr("Dossier d'import"), keywords: tr("documents") },
  { tab: "import", label: tr("Surveiller le dossier d'import"), keywords: tr("automatique") },
  { tab: "import", label: tr("Guide d'import"), keywords: tr("aide modele exemple colonnes") },
  { tab: "securite", label: tr("Pseudo"), keywords: tr("nom prenom profil accueil bonjour ecran de verrouillage") },
  { tab: "securite", label: tr("Image de profil"), keywords: tr("avatar photo portrait image compte") },
  { tab: "securite", label: tr("Comptes de ce PC"), keywords: tr("ajouter changer autre compte utilisateur famille") },
  { tab: "securite", label: tr("Verrouiller automatiquement après"), keywords: tr("delai inactivite verrouillage") },
  { tab: "securite", label: tr("Déverrouiller avec Windows Hello"), keywords: tr("visage empreinte code pin") },
  { tab: "securite", label: tr("Mot de passe"), keywords: tr("changer modifier") },
  { tab: "securite", label: tr("Clé de récupération"), keywords: tr("oubli perdu nouvelle cle") },
  { tab: "securite", label: tr("Mode discret"), keywords: tr("capture ecran partage confidentialite") },
  { tab: "securite", label: tr("Journal de sécurité"), keywords: tr("historique connexions") },
  { tab: "securite", label: tr("Suppression du compte"), keywords: tr("supprimer effacer tout") },
  { tab: "aide", label: tr("Aide intégrée"), keywords: tr("f1 mode d'emploi") },
  { tab: "aide", label: tr("Visite guidée"), keywords: tr("decouvrir tutoriel") },
  { tab: "aide", label: tr("Raccourcis clavier"), keywords: tr("liste touches") },
  { tab: "a-propos", label: tr("À propos"), keywords: tr("version licence") },
];

/** Réglages dont le libellé, la rubrique ou les mots-clés contiennent tous les mots cherchés. */
export function searchSettings(query: string): SettingEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return SETTINGS_INDEX.filter((e) => {
    const text = fold(`${e.label} ${pageOf(e.tab).label} ${e.keywords ?? ""}`);
    return words.every((w) => text.includes(w));
  });
}
