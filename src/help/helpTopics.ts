/**
 * Aide intégrée (F1), consultable hors ligne : une rubrique par module, plus les premiers pas et
 * les réglages. Chaque rubrique se lit comme un petit tutoriel : une introduction, « Les bases »
 * (ce qui sert dès le premier jour, dans l'ordre où on le découvre), puis « Pour aller plus loin ».
 *
 * Ton (demandé le 21/10/2026) : celui de la visite guidée. Phrases simples et complètes, au
 * « vous », avec des exemples concrets ; une idée par phrase, pas de listes de mots-clés.
 * Les raccourcis personnalisables s'écrivent `{palette}`, `{newItem}`… et sont remplacés à
 * l'affichage par ceux en vigueur (jamais écrits en dur) ; `{capture}` : capture rapide.
 */
import { ICONS } from "../components/icons";
import { fold } from "../lib/fold";
import { getModule, type ModuleKey } from "../modules/modules";
import type { TourRequestId } from "../tour/tourRequest";
import { SHORTCUTS_TOPIC } from "./helpRoutes";
import { tr } from "../i18n/i18n";

export { SHORTCUTS_TOPIC, topicForRoute } from "./helpRoutes";
export { fillShortcuts } from "./shortcutTokens";

/** Une étape du tutoriel : un titre court, une à trois phrases, parfois un exemple à saisir. */
export interface HelpStep {
  title: string;
  text: readonly string[];
  example?: string;
}

export type HelpGroup = "debuter" | "modules" | "reglages";

export interface HelpTopic {
  id: string;
  title: string;
  icon: string;
  color: string;
  group: HelpGroup;
  /** À quoi sert la rubrique, en une ou deux phrases. */
  intro: string;
  basics: readonly HelpStep[];
  advanced: readonly HelpStep[];
  /** Visites guidées proposées au bas de la rubrique. */
  tours?: readonly TourRequestId[];
}

export const HELP_GROUPS: readonly { key: HelpGroup; label: string }[] = [
  { key: "debuter", label: tr("Débuter") },
  { key: "modules", label: tr("Modules") },
  { key: "reglages", label: tr("Réglages et données") },
];

/** Pastille d'une rubrique : celle du module, sinon une icône sur la couleur du thème. */
const ofModule = (key: ModuleKey) => ({ icon: getModule(key).icon, color: getModule(key).color });
const plain = (icon: string) => ({ icon, color: "var(--aq-gel)" });

/** Rubrique d'un module : son nom, sa pastille et sa visite guidée. */
const moduleTopic = (key: ModuleKey) => ({ id: key, title: getModule(key).label, ...ofModule(key), group: "modules" as const, tours: [key] });

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "prise-en-main",
    title: tr("Premiers pas"),
    ...plain(ICONS.bulb),
    group: "debuter",
    intro: tr("Aqueli rassemble vos tâches, votre agenda, vos notes et votre suivi personnel dans une seule fenêtre. Tout reste sur ce PC, chiffré, sans connexion à Internet."),
    basics: [
      {
        title: tr("Se repérer dans la fenêtre"),
        text: [
          tr("À gauche, la barre latérale liste les modules, rangés en groupes qui se replient d'un clic sur leur nom."),
          tr("En haut, la barre de titre porte la recherche, le choix de l'espace, la sauvegarde et l'aide. En bas, la barre d'état rappelle l'espace et le thème affichés."),
        ],
      },
      {
        title: tr("Ouvrir un module"),
        text: [
          tr("Cliquez sur un module dans la barre latérale. Ctrl+1 à Ctrl+9 ouvrent les neuf premiers au clavier."),
          tr("Comme dans un navigateur, {back} revient à l'écran précédent et {forward} à l'écran suivant."),
        ],
      },
      {
        title: tr("Créer un élément"),
        text: [
          tr("{newItem} crée l'élément de l'écran affiché : une note dans les Notes, un événement dans le Calendrier, une tâche partout ailleurs."),
          tr("Chaque écran a aussi son bouton « Nouveau… », en haut, ou au centre quand la liste est encore vide."),
        ],
      },
      {
        title: tr("Ouvrir, modifier, supprimer"),
        text: [
          tr("Un clic ouvre un élément. Le clic droit affiche son menu, avec les actions les plus utiles et leurs raccourcis."),
          tr("Au clavier, Entrée ouvre l'élément choisi, F2 le modifie et Suppr le supprime."),
        ],
      },
      {
        title: tr("Revenir en arrière"),
        text: [
          tr("Ctrl+Z annule la dernière action, même une suppression."),
          tr("Un élément supprimé reste aussi 30 jours dans la Corbeille, d'où il se restaure."),
        ],
      },
    ],
    advanced: [
      {
        title: tr("Tout retrouver"),
        text: [
          tr("La palette de commandes ({palette}) lance une action, ouvre un module ou change de thème à partir de quelques lettres, par exemple « cal » pour le Calendrier."),
          tr("La recherche globale ({search}) parcourt tous vos éléments à la fois, sans tenir compte des accents ni des majuscules."),
        ],
      },
      {
        title: tr("Noter sans s'interrompre"),
        text: [
          tr("La capture rapide ({capture}) ouvre une petite fenêtre, même quand Aqueli est réduit dans la barre des tâches."),
          tr("Ce que vous y saisissez rejoint la Boîte de réception des tâches, à trier plus tard."),
        ],
      },
      {
        title: tr("Séparer vos domaines avec les espaces"),
        text: [
          tr("Chaque élément appartient à un espace, par exemple Perso, Travail ou Famille."),
          tr("Le choix de l'espace, en haut de la fenêtre ({spaces}), affiche un seul espace ou tous à la fois. Les espaces se créent et se remettent en ordre dans Paramètres › Espaces."),
        ],
      },
      {
        title: tr("Agir sur plusieurs éléments"),
        text: [
          tr("Ctrl+clic, Maj+clic ou Ctrl+A sélectionnent plusieurs éléments d'une liste."),
          tr("Une barre apparaît alors avec les actions possibles, appliquées à toute la sélection. Un seul « Annuler » défait le tout."),
        ],
      },
      {
        title: tr("Glisser-déposer"),
        text: [
          tr("Un élément se glisse sur une liste, un carnet, un dossier ou une catégorie pour s'y ranger. Les endroits possibles s'entourent de pointillés."),
          tr("Dans sa liste, il se glisse plus haut ou plus bas pour changer l'ordre. Échap annule le geste, et le clic droit propose les mêmes rangements au clavier."),
        ],
      },
      {
        title: tr("Garder un élément à portée de main"),
        text: [tr("Faites un clic droit sur un élément, puis « Ajouter à la barre latérale ». Il rejoint la rubrique « Épinglés » et s'ouvre ensuite d'un clic.")],
      },
      {
        title: tr("Rappels et aide"),
        text: [
          tr("La cloche de la barre de titre montre les rappels des 24 prochaines heures."),
          tr("{help} ouvre l'aide de l'écran affiché, et {shortcuts} la liste des raccourcis. Paramètres › Aide propose une visite guidée de chaque module."),
        ],
      },
    ],
    tours: ["general"],
  },
  {
    id: "accueil",
    title: getModule("accueil").label,
    ...ofModule("accueil"),
    group: "debuter",
    intro: tr("L'Accueil résume votre journée en cartes : les tâches du jour, les prochains rendez-vous, les échéances, les habitudes et bien d'autres."),
    basics: [
      {
        title: tr("Lire votre journée"),
        text: [tr("Chaque carte montre l'essentiel d'un module. Un clic sur une ligne ouvre l'élément, et le lien du bas, comme « 3 de plus », ouvre la liste complète.")],
      },
      {
        title: tr("Agir depuis une carte"),
        text: [
          tr("Les tâches se cochent directement sur la carte, tout comme les habitudes du jour et les articles de la liste de courses."),
          tr("Le clic droit sur une ligne propose les mêmes actions que dans son module."),
        ],
      },
      {
        title: tr("Personnaliser l'Accueil"),
        text: [
          tr("« Personnaliser », en haut de l'écran, passe en mode d'édition. Chaque carte se déplace par sa poignée, change de taille, ou se retire avec le bouton ×."),
          tr("Les cartes retirées s'affichent alors en haut de l'écran, prêtes à revenir d'un clic."),
        ],
      },
    ],
    advanced: [
      {
        title: tr("Choisir vos cartes"),
        text: [tr("En plus des cartes du quotidien, l'Accueil peut montrer vos objectifs, votre budget, les anniversaires, les projets en cours, une note épinglée ou la liste de courses.")],
      },
      {
        title: tr("Plusieurs mises en page"),
        text: [tr("En mode d'édition, enregistrez plusieurs mises en page, par exemple « Travail » et « Week-end », puis passez de l'une à l'autre.")],
      },
      {
        title: tr("Le clic droit sur une carte"),
        text: [tr("Sans passer par « Personnaliser », le clic droit sur une carte change sa taille ou la retire de l'Accueil.")],
      },
      {
        title: tr("Planifier ma journée"),
        text: [tr("« Planifier ma journée » rassemble les tâches en retard et celles du jour, puis vous aide à les placer dans l'agenda, entre vos rendez-vous.")],
      },
    ],
    tours: ["accueil"],
  },
  {
    ...moduleTopic("taches"),
    intro: tr("Les Tâches gardent tout ce que vous avez à faire, d'un simple appel au grand ménage de printemps, avec leurs échéances et leurs priorités."),
    basics: [
      {
        title: tr("Écrire une tâche"),
        text: [
          tr("Saisissez la tâche dans le champ en haut de la liste, puis appuyez sur Entrée."),
          tr("Une phrase suffit : Aqueli y repère la date, l'heure, l'étiquette et la priorité, et vous montre ce qu'il a compris avant l'ajout."),
        ],
        example: tr("Appeler le garage vendredi 14h #voiture !haute"),
      },
      {
        title: tr("Les listes"),
        text: [
          tr("La colonne de gauche range vos tâches. La Boîte de réception reçoit ce qui n'est pas encore trié."),
          tr("Viennent ensuite Aujourd'hui, À venir, En retard, Sans date et Terminées."),
        ],
      },
      {
        title: tr("Terminer une tâche"),
        text: [tr("Cochez la bulle devant la tâche. Elle rejoint « Terminées », et Ctrl+Z la ramène en cas d'erreur.")],
      },
      {
        title: tr("Compléter une tâche"),
        text: [tr("Un clic sur une tâche ouvre son panneau. Vous y ajoutez une description, un rappel, une répétition, des sous-tâches, un projet, une couleur ou des liens vers d'autres éléments.")],
      },
    ],
    advanced: [
      {
        title: tr("Dates et heures en toutes lettres"),
        text: [
          tr("La saisie rapide comprend « demain », « lundi prochain », « dans 3 jours », « le 5 » ou « 12/10 », et pour l'heure « 14h30 », « 18:45 » ou « midi »."),
          tr("La priorité s'écrit !haute, !moyenne ou !basse, et l'espace avec un +, comme +Travail."),
        ],
      },
      {
        title: tr("Répéter une tâche"),
        text: [
          tr("Ajoutez la répétition à la phrase : « chaque lundi », « tous les 2 mardis », « en semaine » ou « le dernier vendredi du mois »."),
          tr("Avec « 3 jours après achèvement », la tâche revient trois jours après avoir été cochée."),
        ],
        example: tr("Arroser les plantes chaque samedi"),
      },
      {
        title: tr("Citer un contact"),
        text: [
          tr("« @Léa » dans la phrase relie la tâche à la fiche de Léa, et son nom reste dans le titre."),
          tr("Si plusieurs contacts portent ce prénom, écrivez le nom complet, comme « @Léa_Bernard »."),
        ],
      },
      {
        title: tr("Choisir l'affichage"),
        text: [
          tr("Le menu « Affichage » trie et regroupe les tâches par échéance, priorité, espace, projet ou étiquette. Chaque liste garde son affichage."),
          tr("Il propose aussi trois autres vues. Le Kanban range les tâches en colonnes, la Matrice les classe en urgent et important, la Chronologie les place jour par jour."),
        ],
      },
      {
        title: tr("Glisser pour ranger"),
        text: [
          tr("Une tâche glissée sur « Aujourd'hui » prend l'échéance du jour. Sur « Sans date », elle perd la sienne ; sur une étiquette, elle la reçoit."),
          tr("Dans le Kanban ou la Matrice, la déposer dans une autre colonne change son avancement, sa priorité ou son échéance."),
        ],
      },
      {
        title: tr("Filtres enregistrés"),
        text: [tr("Le bouton + à côté de « Filtres » enregistre une recherche précise, par exemple les tâches #maison de priorité haute. Le filtre rejoint la colonne de gauche, avec son symbole et sa couleur.")],
      },
      {
        title: tr("Commencer plus tard"),
        text: [tr("« Commencer le », dans le panneau de la tâche, la garde dans « À venir » jusqu'à cette date. Ensuite, elle rejoint « Aujourd'hui ».")],
      },
    ],
  },
  {
    ...moduleTopic("calendrier"),
    intro: tr("Le Calendrier réunit vos rendez-vous. Il peut aussi afficher vos tâches datées, vos échéances et les anniversaires de vos contacts."),
    basics: [
      {
        title: tr("Ajouter un événement"),
        text: [tr("Saisissez l'événement en une phrase dans le champ en haut de l'écran, puis appuyez sur Entrée. Sans heure, il dure toute la journée.")],
        example: tr("Dîner avec Paul vendredi 20h"),
      },
      {
        title: tr("Changer de vue"),
        text: [tr("Jour, Semaine, Mois, Année ou Agenda : les onglets en haut changent la période affichée. « Aujourd'hui » y revient à tout moment.")],
      },
      {
        title: tr("Déplacer ou allonger"),
        text: [
          tr("Glissez un événement pour le déplacer, ou tirez son bord pour changer sa durée."),
          tr("Glisser dans un créneau vide de la grille crée un événement à cet endroit."),
        ],
      },
      {
        title: tr("Ouvrir un événement"),
        text: [tr("Un clic ouvre sa fenêtre, pour changer l'heure, ajouter un rappel, une répétition ou des notes.")],
      },
    ],
    advanced: [
      {
        title: tr("Plages horaires et répétitions"),
        text: [tr("La phrase comprend aussi une plage horaire, comme « Réunion lundi 14h-16h », et une répétition, comme « chaque mardi ».")],
        example: tr("Yoga chaque mardi 18h30"),
      },
      {
        title: tr("Au clavier"),
        text: [tr("Un événement sélectionné se déplace d'un jour avec ← et →, et d'un quart d'heure avec ↑ et ↓. Maj+↑ et Maj+↓ changent sa durée.")],
      },
      {
        title: tr("Choisir ce qui s'affiche"),
        text: [tr("« Mes calendriers » affiche ou masque chaque espace. « Afficher aussi » ajoute les tâches datées, les obligations et les anniversaires.")],
      },
      {
        title: tr("Jours fériés, vacances et fêtes"),
        text: [
          tr("« Jours fériés et fêtes » choisit le pays, les zones de vacances scolaires et les traditions à afficher."),
          tr("Un jour férié apparaît dans une bulle pleine de sa couleur, une fête dans une bulle cerclée. Une période de vacances teinte les jours concernés."),
          tr("Les fêtes juives commencent la veille au soir. Les dates des fêtes musulmanes sont indicatives et peuvent varier d'un jour selon l'observation de la lune."),
        ],
      },
      {
        title: tr("Vos horaires"),
        text: [tr("Paramètres › Calendrier règle vos heures de travail, la durée et le rappel d'un nouvel événement, les numéros de semaine et l'affichage du week-end.")],
      },
      {
        title: tr("Échanger avec d'autres agendas"),
        text: [tr("Le clic droit sur le calendrier exporte vos événements au format .ics, que lisent Google Agenda et Outlook. Un fichier .ics s'importe par « Importer un fichier ».")],
      },
    ],
  },
  {
    ...moduleTopic("obligations"),
    intro: tr("Les Obligations tiennent le registre de vos échéances administratives : impôts, factures, abonnements, assurances, contrats et garanties."),
    basics: [
      {
        title: tr("Ajouter une obligation"),
        text: [tr("« Nouvelle obligation » ouvre sa fiche. Indiquez son nom, sa catégorie et sa prochaine échéance, puis, si vous le souhaitez, le montant, l'organisme et la périodicité.")],
      },
      {
        title: tr("Marquer comme payée"),
        text: [tr("Une fois le paiement fait, le clic droit puis « Marquer comme payée » l'enregistre. Une obligation périodique passe alors d'elle-même à l'échéance suivante.")],
      },
      {
        title: tr("Être prévenu à temps"),
        text: [tr("Des rappels arrivent avant chaque échéance. Leur nombre et leurs délais se règlent par catégorie dans « Réglages des obligations ».")],
      },
    ],
    advanced: [
      {
        title: tr("Prélèvement automatique"),
        text: [tr("Avec le prélèvement automatique, l'obligation se paie d'elle-même à chaque échéance, sans aucun clic.")],
      },
      {
        title: tr("Penser à résilier"),
        text: [tr("La date limite de résiliation d'un contrat ou d'un abonnement s'affiche en évidence, pour qu'une reconduction ne vous surprenne pas.")],
      },
      {
        title: tr("L'année d'un coup d'œil"),
        text: [tr("La vue « Frise de l'année » place toutes les échéances sur douze mois, avec le total mensuel de vos abonnements.")],
      },
      {
        title: tr("Suivre les paiements"),
        text: [tr("La fenêtre d'une obligation garde chaque paiement, fait à la main ou prélevé, avec le total payé dans l'année et le coût annuel.")],
      },
      {
        title: tr("Ranger par catégorie"),
        text: [tr("Glissez une obligation, ou toute une sélection, sur une catégorie de la colonne de gauche pour l'y ranger.")],
      },
    ],
  },
  {
    ...moduleTopic("notes"),
    intro: tr("Les Notes accueillent tout ce qui s'écrit : comptes rendus, idées, recettes ou plans de projet, rangés dans des carnets."),
    basics: [
      {
        title: tr("Écrire une note"),
        text: [tr("« Nouvelle note » ouvre une page vide. Le titre se saisit en haut, le texte en dessous, et tout s'enregistre au fil de la saisie.")],
      },
      {
        title: tr("Mettre en forme"),
        text: [
          tr("Sélectionnez du texte pour utiliser la barre d'outils."),
          tr("Vous pouvez aussi commencer une ligne par « # » pour un titre, « - » pour une liste ou « [ ] » pour une case à cocher, suivi d'Espace."),
        ],
      },
      {
        title: tr("Ranger dans des carnets"),
        text: [tr("Les carnets, à gauche, regroupent les notes par sujet, et un carnet peut contenir des sous-carnets. Glissez une note sur un carnet pour l'y ranger.")],
      },
      {
        title: tr("Épingler et mettre en favori"),
        text: [tr("Une note épinglée reste en tête de la liste, et une note favorite rejoint les « Favoris ». Le clic droit propose ces deux choix.")],
      },
    ],
    advanced: [
      {
        title: tr("Le menu des blocs"),
        text: [tr("« / » en début de ligne ouvre le menu des blocs : titres, listes, citation, code, tableau, image, séparateur, lien vers une note ou date du jour. Quelques lettres filtrent ce menu.")],
      },
      {
        title: tr("Relier les notes"),
        text: [
          tr("« [[ » insère un lien vers une autre note. Le panneau « Rétroliens » montre les notes qui citent celle que vous lisez."),
          tr("« @ » propose vos contacts et relie la note à leur fiche."),
        ],
      },
      {
        title: tr("Partir d'un modèle"),
        text: [tr("« Nouvelle note à partir d'un modèle » prépare un compte rendu, une liste de courses, une recette ou un plan de projet. Toute note s'enregistre aussi comme modèle, par le clic droit.")],
      },
      {
        title: tr("Historique des versions"),
        text: [tr("L'historique garde les versions précédentes d'une note, à consulter ou à restaurer.")],
      },
      {
        title: tr("Une note dans sa propre fenêtre"),
        text: [tr("« Ouvrir dans une fenêtre », en haut de la note, la place à côté d'Aqueli, pour écrire en regardant autre chose. Ces fenêtres se ferment quand Aqueli se verrouille.")],
      },
      {
        title: tr("Archiver"),
        text: [tr("« Archiver », au clic droit, range une note hors de vue. Elle reste cherchable et se retrouve dans « Archives ».")],
      },
      {
        title: tr("Exporter ou imprimer"),
        text: [tr("Le clic droit exporte la note en Markdown (.md) ou en texte (.txt), ou l'imprime. Pour un PDF, choisissez l'imprimante « Microsoft Print to PDF ».")],
      },
    ],
  },
  {
    ...moduleTopic("journal"),
    intro: tr("Le Journal vous offre une page par jour, pour noter votre humeur, ce qui s'est passé et ce qui compte."),
    basics: [
      {
        title: tr("Écrire la page du jour"),
        text: [tr("Le Journal s'ouvre sur aujourd'hui. Choisissez votre humeur et votre énergie, cochez les activités du jour, puis écrivez librement.")],
      },
      {
        title: tr("Trois gratitudes"),
        text: [tr("Trois lignes invitent à noter ce qui a été agréable dans la journée, même de petites choses.")],
      },
      {
        title: tr("Une question pour commencer"),
        text: [tr("Chaque jour propose une question d'écriture. « Répondre » la place dans la page pour vous lancer.")],
      },
      {
        title: tr("Revenir sur un jour"),
        text: [tr("Le calendrier des humeurs colore chaque jour écrit. Un clic ouvre sa page, et les flèches passent au jour précédent ou suivant.")],
      },
    ],
    advanced: [
      {
        title: tr("Ce jour-là"),
        text: [tr("« Ce jour-là » montre les pages écrites à la même date les années précédentes.")],
      },
      {
        title: tr("Tendances"),
        text: [tr("L'onglet « Tendances » suit votre humeur sur 30 jours, 3 mois ou un an, et la compare selon vos activités. Un clic sur une activité affiche ses pages.")],
      },
      {
        title: tr("Photos"),
        text: [tr("Une photo se colle ou se glisse dans la page.")],
      },
      {
        title: tr("Rappel d'écriture"),
        text: [tr("Un rappel peut vous inviter à écrire chaque jour à l'heure choisie, tant que la page n'est pas écrite. Il se règle dans l'en-tête du Journal ou dans Paramètres › Rappels.")],
      },
      {
        title: tr("Chercher et imprimer"),
        text: [tr("Ctrl+F cherche dans toutes les pages. Ctrl+P imprime la page affichée.")],
      },
    ],
  },
  {
    ...moduleTopic("habitudes"),
    intro: tr("Les Habitudes vous aident à tenir ce qui compte au quotidien, qu'il s'agisse d'en prendre une nouvelle ou d'en arrêter une."),
    basics: [
      {
        title: tr("Créer une habitude"),
        text: [tr("« Nouvelle habitude » demande son nom et sa fréquence : chaque jour, certains jours de la semaine, ou un nombre de fois par semaine.")],
      },
      {
        title: tr("Cocher le jour"),
        text: [
          tr("Un clic sur la case de l'habitude la marque comme faite pour aujourd'hui. Au clavier, Espace fait de même."),
          tr("Une habitude chiffrée, comme 8 verres d'eau, avance avec les boutons + et −."),
        ],
      },
      {
        title: tr("Suivre vos progrès"),
        text: [tr("Chaque habitude montre sa série en cours, son record, son taux de réussite et la carte de l'année.")],
      },
    ],
    advanced: [
      {
        title: tr("La force de l'habitude"),
        text: [tr("La force monte quand l'habitude est tenue et baisse doucement après un oubli, au lieu de repartir de zéro comme la série.")],
      },
      {
        title: tr("Faire une pause"),
        text: [
          tr("Pour des vacances ou une maladie, le clic droit sur un jour le met en pause, et « Pause jusqu'au… » suspend toute l'habitude."),
          tr("Ces jours ne comptent ni comme réussis ni comme manqués, et la série continue."),
        ],
      },
      {
        title: tr("Les moments de la journée"),
        text: [tr("Rangez chaque habitude le matin, le midi ou le soir : la liste du jour suit ces moments. Glisser une habitude dans un autre moment le change.")],
      },
      {
        title: tr("Rappel et ordre"),
        text: [tr("Une habitude peut avoir un rappel à heure fixe. Les habitudes se remettent en ordre à la souris, ou par « Monter » et « Descendre » au clic droit.")],
      },
    ],
  },
  {
    ...moduleTopic("focus"),
    intro: tr("Le Focus vous aide à vous concentrer par séances chronométrées, entrecoupées de pauses."),
    basics: [
      {
        title: tr("Lancer une séance"),
        text: [tr("« Démarrer » lance une séance de concentration. Vous pouvez la rattacher à une tâche et noter votre intention, par exemple « Rédiger le rapport ».")],
      },
      {
        title: tr("Les pauses"),
        text: [tr("À la fin d'une séance, une pause commence, et une pause plus longue vient après plusieurs séances. Les durées se règlent sur l'écran Focus.")],
      },
      {
        title: tr("Le calme pendant la séance"),
        text: [tr("Pendant une séance, les sons de l'interface se taisent et les rappels attendent la fin.")],
      },
    ],
    advanced: [
      {
        title: tr("Séance libre"),
        text: [tr("En séance libre, le minuteur compte le temps écoulé. « Pause » termine la séance et ouvre une pause du cinquième de sa durée.")],
      },
      {
        title: tr("Le mini-lecteur"),
        text: [tr("Sur les autres écrans, un mini-lecteur garde la séance en vue, en bas à droite. Il suspend ou arrête la séance, et peut s'ouvrir dans une petite fenêtre toujours visible.")],
      },
      {
        title: tr("Ambiances et plein écran"),
        text: [tr("Une ambiance sonore peut accompagner la séance, et le plein écran « aquarium » cache tout le reste. Échap le quitte.")],
      },
      {
        title: tr("Objectif et historique"),
        text: [tr("L'objectif du jour et la liste des séances, avec leur heure et leur intention, suivent votre temps de concentration. Le clic droit supprime une séance.")],
      },
    ],
  },
  {
    ...moduleTopic("projets"),
    intro: tr("Les Projets rassemblent tout ce qui concerne un même but, comme un déménagement, un voyage ou un dossier au travail."),
    basics: [
      {
        title: tr("Créer un projet"),
        text: [tr("« Nouveau projet » demande son nom et son échéance. Un modèle, comme « Déménagement » ou « Voyage », prépare des tâches pour démarrer.")],
      },
      {
        title: tr("Ajouter des tâches"),
        text: [tr("Dans le projet, « Ajouter une tâche au projet » crée une tâche qui lui est rattachée. Elle apparaît aussi dans le module Tâches.")],
      },
      {
        title: tr("Suivre l'avancement"),
        text: [tr("L'avancement et l'état du projet, « Dans les temps », « À surveiller » ou « En retard », se mettent à jour à mesure que les tâches se terminent.")],
      },
    ],
    advanced: [
      {
        title: tr("Les étapes"),
        text: [tr("Les étapes marquent les grands moments du projet, comme une signature ou un départ. L'onglet « Étapes » les montre sur une frise.")],
      },
      {
        title: tr("Tout réunir"),
        text: [tr("Un projet rassemble aussi des notes, des événements et des documents liés. Ses tâches s'affichent en liste ou en tableau.")],
      },
      {
        title: tr("Comprendre l'état"),
        text: [tr("L'état tient compte des tâches en retard, des étapes dépassées, de l'échéance et de l'avancement comparé au temps écoulé. Le détail s'affiche au survol.")],
      },
      {
        title: tr("Statut et archives"),
        text: [tr("Le clic droit change le statut d'un projet. Un projet terminé s'archive et reste consultable. Les projets se remettent en ordre à la souris.")],
      },
    ],
  },
  {
    ...moduleTopic("listes"),
    intro: tr("Les Listes gardent les choses à suivre : courses, livres à lire, films, idées cadeaux, voyages ou envies."),
    basics: [
      {
        title: tr("Créer une liste"),
        text: [tr("« Nouvelle liste » propose plusieurs sortes de listes, chacune avec ses colonnes : les courses par rayon, les livres avec leur auteur, ou une liste libre.")],
      },
      {
        title: tr("Ajouter des éléments"),
        text: [
          tr("Saisissez un élément, puis appuyez sur Entrée."),
          tr("Pendant la saisie, la liste propose ses éléments connus. Un article déjà coché revient avec son rayon, au lieu d'être ajouté deux fois."),
        ],
      },
      {
        title: tr("Cocher"),
        text: [tr("Cochez un élément quand il est fait ou acheté. La carte « Liste de courses » de l'Accueil se coche aussi directement.")],
      },
    ],
    advanced: [
      {
        title: tr("Les derniers achats"),
        text: [tr("Pour les courses, les derniers achats s'affichent dès que le champ est vide. Les flèches et Entrée en choisissent un.")],
      },
      {
        title: tr("Affichage"),
        text: [tr("Le bouton « Affichage » trie la liste, masque ou supprime les éléments faits, et copie la liste en texte pour la coller dans un message.")],
      },
      {
        title: tr("Colonnes et galerie"),
        text: [tr("Les colonnes se personnalisent, et la vue galerie montre les images des éléments, cadrées à l'ajout.")],
      },
      {
        title: tr("Remettre en ordre"),
        text: [tr("À la souris, un élément se glisse plus haut ou plus bas, ou dans un autre rayon ou une autre section.")],
      },
    ],
  },
  {
    ...moduleTopic("contacts"),
    intro: tr("Les Contacts réunissent les personnes qui comptent, avec leurs coordonnées, leurs anniversaires et vos échanges."),
    basics: [
      {
        title: tr("Ajouter un contact"),
        text: [tr("« Nouveau contact » ouvre sa fiche : nom, photo, téléphones, adresses, anniversaire et notes.")],
      },
      {
        title: tr("La fiche"),
        text: [tr("La fiche se présente comme une carte d'identité. Le bouton « Thème de la carte » change ses couleurs et son motif.")],
      },
      {
        title: tr("Les anniversaires"),
        text: [tr("Un anniversaire renseigné s'affiche au calendrier et sur l'Accueil.")],
      },
    ],
    advanced: [
      {
        title: tr("Rester en contact"),
        text: [
          tr("« Rester en contact » fixe la fréquence des nouvelles, de chaque semaine à chaque année, et note vos échanges : appel, message, rencontre ou e-mail."),
          tr("L'onglet « À recontacter » rassemble ceux dont le moment est venu, et un rappel arrive ce jour-là à 10 h."),
        ],
      },
      {
        title: tr("Citer un contact"),
        text: [tr("« @Léa » dans une tâche, un événement ou une note relie l'élément à la fiche de Léa.")],
      },
      {
        title: tr("Catégories"),
        text: [tr("Glissez un contact sur une catégorie, au-dessus de la liste, pour l'y ranger. Les catégories se remettent en ordre à la souris.")],
      },
      {
        title: tr("Importer et exporter"),
        text: [tr("Le carnet s'exporte en .vcf ou en .csv. Les fichiers .vcf de votre téléphone ou de votre messagerie s'importent.")],
      },
    ],
  },
  {
    ...moduleTopic("documents"),
    intro: tr("Les Documents conservent vos papiers importants dans votre compte, chiffrés : factures, contrats, relevés ou fiches de paie."),
    basics: [
      {
        title: tr("Ajouter un document"),
        text: [tr("Glissez un fichier sur l'écran Documents, ou utilisez « Ajouter des documents ». Le fichier est copié, chiffré, dans votre compte.")],
      },
      {
        title: tr("La fiche du document"),
        text: [tr("À l'ajout, la sorte et la date sont devinées d'après le nom du fichier, par exemple « Facture EDF 2026-09-30.pdf ». La fiche précise aussi l'émetteur.")],
      },
      {
        title: tr("L'aperçu"),
        text: [tr("Les PDF et les images s'affichent directement dans Aqueli.")],
      },
    ],
    advanced: [
      {
        title: tr("Dossiers et étiquettes"),
        text: [tr("Glissez un document sur un dossier pour l'y ranger ; « Tous les documents » l'en fait sortir. Les étiquettes regroupent les documents par thème.")],
      },
      {
        title: tr("Date d'expiration"),
        text: [tr("Une date d'expiration, pour une carte d'identité ou une garantie, déclenche un rappel le moment venu.")],
      },
      {
        title: tr("Trier et filtrer"),
        text: [tr("La liste se trie par ajout, date, nom ou taille, et se filtre par sorte. La recherche porte aussi sur l'émetteur.")],
      },
    ],
  },
  {
    ...moduleTopic("objectifs"),
    intro: tr("Les Objectifs donnent un cap à l'année, au trimestre ou au mois, et mesurent le chemin parcouru."),
    basics: [
      {
        title: tr("Fixer un objectif"),
        text: [tr("« Nouvel objectif » demande son nom, son horizon (année, trimestre, mois ou libre) et la façon de mesurer vos progrès.")],
      },
      {
        title: tr("Mesurer les progrès"),
        text: [tr("La progression vient d'une valeur chiffrée, comme 12 livres lus, de tâches liées, d'une habitude ou d'étapes à cocher.")],
      },
      {
        title: tr("Ajouter une saisie"),
        text: [tr("Pour un objectif chiffré, ajoutez vos saisies au fil du temps, par exemple 3 livres lus ou 12 km courus.")],
      },
    ],
    advanced: [
      {
        title: tr("Le rythme à tenir"),
        text: [tr("La fiche indique ce qui reste, le rythme à tenir par semaine jusqu'à l'échéance et la date estimée au rythme actuel. Une courbe compare votre avancement au rythme idéal.")],
      },
      {
        title: tr("Reconduire"),
        text: [tr("« Reconduire », au clic droit, recrée l'objectif sur la période suivante. Les cartes des objectifs se remettent en ordre à la souris.")],
      },
    ],
  },
  {
    ...moduleTopic("budget"),
    intro: tr("Le Budget suit vos dépenses et vos revenus, mois par mois, uniquement sur ce PC."),
    basics: [
      {
        title: tr("Noter une opération"),
        text: [
          tr("« Nouvelle dépense » et « Nouveau revenu » ouvrent la fenêtre d'une opération : montant, libellé, catégorie et date."),
          tr("Une dépense s'affiche en rouge, un revenu en vert."),
        ],
      },
      {
        title: tr("Les budgets du mois"),
        text: [tr("Chaque catégorie de dépense peut recevoir un budget mensuel. Sa barre montre ce qui a été dépensé et ce qui reste.")],
      },
      {
        title: tr("Le mois d'un coup d'œil"),
        text: [tr("Sous les totaux s'affichent les charges fixes, les revenus à venir et ce qui reste par jour jusqu'à la fin du mois.")],
      },
    ],
    advanced: [
      {
        title: tr("Opérations récurrentes"),
        text: [
          tr("Pour un salaire ou un loyer, choisissez une répétition dans la fenêtre de l'opération."),
          tr("Chaque échéance s'ajoute le jour venu et se modifie seule ; celles à venir figurent sous « À venir ». Le clic droit propose « Arrêter la répétition »."),
        ],
      },
      {
        title: tr("Les abonnements"),
        text: [tr("Les abonnements des Obligations sont repris dans le budget, sans double saisie.")],
      },
      {
        title: tr("Relevé de banque"),
        text: [tr("Un relevé au format .csv ou .xlsx s'importe, et les opérations du mois s'exportent en .csv.")],
      },
      {
        title: tr("Chercher et ranger"),
        text: [tr("Ctrl+F cherche dans toutes les opérations, par libellé, catégorie, notes ou montant. Glissez une opération sur une catégorie de la colonne de droite pour l'y ranger.")],
      },
    ],
  },
  {
    ...moduleTopic("bilan"),
    intro: tr("Le Bilan vous aide à faire le point quand vous le souhaitez, par exemple le dimanche soir."),
    basics: [
      {
        title: tr("La revue de la semaine"),
        text: [tr("La revue vous accompagne étape par étape : la boîte de réception, les retards, la semaine à venir, vos objectifs, vos projets et vos réussites.")],
      },
      {
        title: tr("Terminer la revue"),
        text: [tr("À la fin, « Terminer la revue » l'enregistre. Les revues passées se relisent dans « Revues enregistrées ».")],
      },
    ],
    advanced: [
      {
        title: tr("Les projets dans la revue"),
        text: [tr("À l'étape des projets, chacun montre son état et sa prochaine action. Un projet sans action en reçoit une directement depuis la revue.")],
      },
      {
        title: tr("Statistiques"),
        text: [tr("L'onglet « Statistiques » résume la semaine, le mois ou l'année : tâches faites, habitudes, humeur, concentration et budget.")],
      },
      {
        title: tr("Rapport du mois"),
        text: [tr("Le rapport du mois s'imprime, ou s'enregistre en PDF avec l'imprimante « Microsoft Print to PDF ».")],
      },
    ],
  },
  {
    id: "import-export",
    title: tr("Import et export"),
    ...plain(ICONS.importFile),
    group: "reglages",
    intro: tr("Aqueli accueille vos données venues d'ailleurs, et vous permet de les reprendre à tout moment, dans des formats courants."),
    basics: [
      {
        title: tr("Importer un fichier"),
        text: [
          tr("Glissez un fichier sur la fenêtre, ou utilisez « Importer un fichier » dans la palette."),
          tr("Aqueli lit les classeurs Excel (.xlsx), les fichiers .csv, .txt et .md, les agendas (.ics) et les contacts (.vcf)."),
        ],
      },
      {
        title: tr("Vérifier avant d'ajouter"),
        text: [tr("Un aperçu montre ce qui sera créé, les lignes en erreur et les doublons. Rien n'est ajouté sans votre accord, et l'import entier s'annule d'un clic.")],
      },
      {
        title: tr("Le guide d'import"),
        text: [tr("Paramètres › Import › Ouvrir le guide décrit les colonnes, les formats de date et les valeurs admises, avec des modèles et des exemples prêts à remplir.")],
      },
    ],
    advanced: [
      {
        title: tr("Le dossier d'import"),
        text: [tr("Un fichier déposé dans le dossier Documents\\Aqueli\\Import est repéré en quelques secondes, et un message propose de l'importer. Paramètres › Import liste les fichiers en attente.")],
      },
      {
        title: tr("Imprimer"),
        text: [tr("Ctrl+P imprime la vue affichée : une liste de tâches, une période du calendrier, une note, les obligations ou le rapport du mois. La page imprimée est toujours en clair, quel que soit le thème."),
          tr("Pour obtenir un PDF, choisissez l'imprimante « Microsoft Print to PDF »."),
        ],
      },
      {
        title: tr("Exporter"),
        text: [tr("Le clic droit sur un écran exporte ce qu'il montre : les tâches en .csv, le calendrier en .ics, les contacts en .vcf ou .csv, le budget en .csv, une note en Markdown (.md) ou en texte (.txt).")],
      },
      {
        title: tr("Retoucher dans Excel"),
        text: [tr("Un tableau exporté garde une colonne « Identifiant ». Retravaillé dans Excel puis réimporté, il met à jour les éléments existants au lieu d'en créer de nouveaux, après confirmation.")],
      },
      {
        title: tr("Le compte entier"),
        text: [tr("Paramètres › Sauvegardes › Exporter le compte crée un fichier chiffré de toutes vos données.")],
      },
    ],
  },
  {
    id: "securite",
    title: tr("Sécurité et sauvegardes"),
    ...plain(ICONS.lock),
    group: "reglages",
    intro: tr("Vos données sont chiffrées sur ce PC, et ne sortent de votre compte que lorsque vous le décidez."),
    basics: [
      {
        title: tr("Verrouiller"),
        text: [
          tr("Le cadenas de la barre de titre, ou {lock}, verrouille Aqueli tout de suite."),
          tr("Aqueli se verrouille aussi de lui-même après un moment d'inactivité, à la mise en veille et au verrouillage de Windows."),
        ],
      },
      {
        title: tr("Déverrouiller"),
        text: [tr("Windows Hello déverrouille au quotidien. Le mot de passe reste demandé après chaque démarrage de Windows.")],
      },
      {
        title: tr("Les sauvegardes"),
        text: [tr("Aqueli fait une sauvegarde chiffrée par jour tant qu'il est ouvert, et garde 7 jours, 4 semaines et 12 mois. {backup}, ou le bouton à côté des espaces, en fait une tout de suite.")],
      },
      {
        title: tr("La clé de récupération"),
        text: [
          tr("C'est le seul moyen de retrouver votre compte si vous oubliez votre mot de passe. Conservez-la en lieu sûr, hors de ce PC."),
          tr("Aqueli n'utilise ni adresse e-mail ni service en ligne : personne d'autre ne peut rouvrir votre compte à votre place."),
        ],
      },
    ],
    advanced: [
      {
        title: tr("Une copie hors du PC"),
        text: [tr("Une destination externe, clé USB ou disque, protège vos données d'une panne du PC. Elle se choisit dans Paramètres › Sauvegardes.")],
      },
      {
        title: tr("Restaurer"),
        text: [tr("Une sauvegarde se restaure depuis Paramètres › Sauvegardes, ou au démarrage par « Restaurer une sauvegarde ».")],
      },
      {
        title: tr("Pseudo et image de profil"),
        text: [
          tr("Votre pseudo et votre image de profil vous accueillent sur l'écran de verrouillage et sur l'Accueil. Ils se changent dans Paramètres › Sécurité, rubrique « Profil »."),
          tr("La banque d'images propose des dizaines d'illustrations rangées par thème, des animaux aux voyages. Pseudo et image restent visibles sans mot de passe."),
        ],
      },
      {
        title: tr("Plusieurs comptes sur ce PC"),
        text: [
          tr("Chaque personne de la maison peut avoir son compte, avec son pseudo, son mot de passe, sa clé de récupération et ses données chiffrées à part."),
          tr("« Ajouter un compte », en bas de l'écran de verrouillage ou dans Paramètres › Sécurité, en crée un. Un clic sur un autre compte de l'écran de verrouillage l'ouvre, et Aqueli redémarre sur lui."),
          tr("Les rappels et la capture rapide suivent le compte ouvert. Chaque compte ajouté a son propre dossier d'import, à son nom, dans Documents\\Aqueli."),
        ],
      },
      {
        title: tr("Mode discret"),
        text: [tr("Le mode discret, dans Paramètres › Sécurité, cache le contenu d'Aqueli dans les captures et les partages d'écran.")],
      },
      {
        title: tr("Journal de sécurité"),
        text: [tr("Paramètres › Sécurité garde la trace des déverrouillages, des essais erronés et des exports.")],
      },
      {
        title: tr("Déplacer les données"),
        text: [tr("« Déplacer… », dans Paramètres › Sauvegardes, copie vos données vers un autre dossier ou un autre disque, vérifie la copie, efface l'ancien emplacement, puis redémarre Aqueli. Ce disque doit rester branché.")],
      },
      {
        title: tr("Supprimer le compte"),
        text: [tr("Paramètres › Sécurité supprime le compte ouvert après votre mot de passe et un mot de confirmation. Les fichiers sont écrasés puis effacés. Les autres comptes de ce PC et les sauvegardes copiées ailleurs ne sont pas touchés.")],
      },
    ],
  },
  {
    id: "apparence",
    title: tr("Apparence, sons et accessibilité"),
    ...plain(ICONS.palette),
    group: "reglages",
    intro: tr("Aqueli se décline en dizaines de thèmes, clairs ou sombres, et s'adapte à votre façon de lire et de travailler."),
    basics: [
      {
        title: tr("Choisir un thème"),
        text: [tr("Paramètres › Apparence présente les thèmes par familles, et un clic applique un thème tout de suite. Le bouton « Thème » de la barre d'état propose aussi ceux de la même famille.")],
      },
      {
        title: tr("Un thème qui change de lui-même"),
        text: [tr("Le thème peut suivre les fêtes, l'humeur du jour, l'heure ou la saison, tourner au hasard, ou suivre un planning que vous fixez.")],
      },
      {
        title: tr("La langue"),
        text: [tr("Paramètres › Langue propose 17 langues. Les dates et les nombres suivent la langue choisie.")],
      },
      {
        title: tr("Les sons"),
        text: [tr("Paramètres › Sons règle le volume et chaque catégorie de sons. Chaque thème a sa propre sonorité.")],
      },
    ],
    advanced: [
      {
        title: tr("Créer votre thème"),
        text: [tr("L'éditeur de thème part d'un thème existant : accent, fond d'écran personnel, flou et transparence. Un thème s'exporte et s'importe en .aqtheme.")],
      },
      {
        title: tr("La bannière illustrée"),
        text: [tr("Chaque thème a sa frise dessinée dans la barre de titre. Elle se désactive dans Paramètres › Apparence.")],
      },
      {
        title: tr("Accessibilité"),
        text: [tr("Paramètres › Accessibilité réduit les animations et la transparence, renforce le contraste et agrandit le texte. Aqueli suit aussi les réglages de Windows.")],
      },
      {
        title: tr("Vos raccourcis"),
        text: [tr("Paramètres › Clavier modifie les raccourcis propres à Aqueli. {shortcuts} affiche la liste complète.")],
      },
      {
        title: tr("Trouver un réglage"),
        text: [tr("Dans les Paramètres, Ctrl+F cherche un réglage par son nom. Sur une longue page, la bande du haut mène à chaque section.")],
      },
      {
        title: tr("Soutenir Aqueli"),
        text: [tr("« Soutenir Aqueli », dans la barre d'état, ouvre la page Ko-fi dans le navigateur. Le même bouton figure dans Paramètres › À propos et dans la palette.")],
      },
    ],
  },
  {
    id: SHORTCUTS_TOPIC,
    title: tr("Raccourcis clavier"),
    ...plain(ICONS.keyboard),
    group: "reglages",
    intro: "",
    basics: [],
    advanced: [],
  },
];

/** Tous les textes d'une rubrique, dans l'ordre de lecture. */
export function topicTexts(topic: HelpTopic): string[] {
  const steps = [...topic.basics, ...topic.advanced];
  return [topic.intro, ...steps.flatMap((s) => [s.title, ...s.text, s.example ?? ""])].filter(Boolean);
}

/** Rubriques qui contiennent tous les mots de la recherche (sans accents ni majuscules). */
export function searchHelp(query: string, topics: readonly HelpTopic[] = HELP_TOPICS): HelpTopic[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...topics];
  return topics.filter((t) => {
    const text = fold([t.title, ...topicTexts(t)].join(" "));
    return words.every((w) => text.includes(w));
  });
}
