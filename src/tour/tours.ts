/**
 * Visites guidées (cahier des charges § 7 : « visite guidée optionnelle par bulles ») : la visite
 * générale, proposée après la création du compte, et une visite par module (Paramètres › Aide).
 * Chaque étape éclaire un élément de l'écran (sélecteurs essayés dans l'ordre) ; sans élément
 * trouvé, la bulle s'affiche au centre. Les raccourcis personnalisables s'écrivent `{palette}`…
 *
 * Ton (demandé le 08/10/2026) : la visite s'adresse à quelqu'un qui découvre Aqueli. Phrases
 * simples et complètes, au « vous », avec des exemples concrets ; plus longues que les textes de
 * l'interface s'il le faut, mais sans listes à deux-points ni formules toutes faites.
 */
import type { ModuleKey } from "../modules/modules";
import type { RouteId } from "../navigation/routes";
import { tr } from "../i18n/i18n";

export interface TourStep {
  /** Sélecteurs de l'élément éclairé, essayés dans l'ordre ; absent : bulle au centre. */
  target?: readonly string[];
  title: string;
  text: string;
}

export type TourId = "general" | ModuleKey;

export interface Tour {
  id: TourId;
  title: string;
  /** Écran ouvert au début de la visite. */
  route: RouteId;
  steps: readonly TourStep[];
}

export const GENERAL_TOUR: Tour = {
  id: "general",
  title: tr("Visite d'Aqueli"),
  route: "accueil",
  steps: [
    {
      title: tr("Bienvenue dans Aqueli"),
      text: tr("Voici un tour rapide de la fenêtre pour bien démarrer. Avancez avec « Suivant » ou la flèche droite du clavier, et arrêtez quand vous voulez avec « Passer la visite ». Vous retrouverez cette visite, et celle de chaque module, dans Paramètres › Aide."),
    },
    {
      target: [".sidebar"],
      title: tr("Les modules"),
      text: tr("À gauche se trouvent tous les modules, comme les Tâches, le Calendrier ou les Notes. Ils sont rangés en groupes, et chaque groupe se replie d'un clic sur son nom. Si vous utilisez souvent une liste ou une note, un clic droit dessus puis « Ajouter à la barre latérale » la place ici."),
    },
    {
      target: [".search-field"],
      title: tr("Retrouver et lancer"),
      text: tr("Cette barre vous emmène partout. Saisissez quelques lettres, par exemple « cal » pour le Calendrier ou « thème » pour changer de couleurs, puis Entrée. Elle s'ouvre aussi avec {palette}. Pour chercher dans le contenu lui-même, comme une note qui parle de vacances, utilisez {search}."),
    },
    {
      target: ["[data-tour=capture]"],
      title: tr("Capture rapide"),
      text: tr("Ce bouton ouvre une petite fenêtre pour noter une idée, une tâche ou un rendez-vous en quelques secondes, puis revenir à ce que vous faisiez. Avec {capture}, elle s'ouvre même quand Aqueli est réduit dans la barre des tâches."),
    },
    {
      target: [".space-selector"],
      title: tr("Espaces"),
      text: tr("Les espaces séparent les différents domaines de votre quotidien, par exemple Perso, Travail ou Famille. Chaque tâche, note ou rendez-vous appartient à un espace. Choisissez-en un ici pour n'afficher que lui, ou « Tous les espaces » pour tout voir. Le raccourci {spaces} ouvre aussi ce choix."),
    },
    {
      target: [".backup-button"],
      title: tr("Sauvegarde"),
      text: tr("Aqueli fait chaque jour une copie chiffrée de vos données. Ce bouton, ou {backup}, en fait une tout de suite, ce qui est utile avant un gros changement. La pastille est verte quand la dernière copie est récente, et devient ambre au bout de trois jours."),
    },
    {
      target: [".help-button"],
      title: tr("Aide"),
      text: tr("L'ampoule ouvre l'aide de l'écran où vous êtes. Depuis le Calendrier, elle explique le Calendrier. La touche {help} fait la même chose, et {shortcuts} affiche la liste de tous les raccourcis clavier."),
    },
    {
      target: ["[data-tour=verrouiller]"],
      title: tr("Verrouillage"),
      text: tr("Quand vous vous éloignez de l'ordinateur, le cadenas ou {lock} met Aqueli sous clé. Pour revenir, il faudra votre mot de passe ou Windows Hello. Aqueli se verrouille aussi de lui-même après un moment d'inactivité, et ce délai se règle dans Paramètres › Sécurité."),
    },
    {
      target: [".nav-featured"],
      title: tr("Bilan"),
      text: tr("Le Bilan sert à faire le point quand vous en avez envie, par exemple le dimanche soir. Il passe la semaine en revue avec vous, étape par étape, et rassemble vos statistiques et le rapport du mois."),
    },
    {
      target: [".sidebar-footer"],
      title: tr("Paramètres et corbeille"),
      text: tr("Les Paramètres ({settings}) adaptent Aqueli à vos goûts. Vous y choisirez le thème, les sons, les options d'accessibilité et les raccourcis clavier. Juste à côté, la corbeille garde pendant 30 jours tout ce que vous supprimez."),
    },
    {
      title: tr("Fin de la visite"),
      text: tr("Deux gestes vous serviront partout. Le clic droit sur un élément montre tout ce que vous pouvez en faire, avec les raccourcis correspondants. Et Ctrl+Z annule votre dernière action en cas d'erreur. Bonne découverte d'Aqueli."),
    },
  ],
};

export const MODULE_TOURS: Record<ModuleKey, Tour> = {
  accueil: {
    id: "accueil",
    title: tr("Accueil"),
    route: "accueil",
    steps: [
      {
        target: [".home-grid"],
        title: tr("Vos cartes"),
        text: tr("L'Accueil rassemble ce qui compte aujourd'hui. Vous y voyez les tâches du jour, les prochains rendez-vous, les factures à venir, vos habitudes et votre note épinglée. Cliquez sur un élément pour l'ouvrir dans son module."),
      },
      {
        target: [".screen-header .btn-glass"],
        title: tr("Personnaliser"),
        text: tr("Ce bouton vous laisse choisir les cartes affichées et les déplacer. Vous pouvez garder plusieurs mises en page, par exemple une pour le travail et une pour le week-end, et passer de l'une à l'autre."),
      },
      {
        target: [".screen-header .btn-gel"],
        title: tr("Planifier ma journée"),
        text: tr("Le matin, ce bouton reprend les tâches en retard et celles du jour, et vous aide à leur trouver une place dans l'agenda."),
      },
    ],
  },
  bilan: {
    id: "bilan",
    title: tr("Bilan"),
    route: "bilan",
    steps: [
      {
        target: [".review-doors", ".review-window"],
        title: tr("Faire le point"),
        text: tr("Le Bilan a trois parties. La revue de la semaine vous guide pas à pas. Les statistiques montrent ce que vous avez accompli par semaine, par mois ou par année. Le rapport résume le mois écoulé."),
      },
      {
        target: [".review-window-body", ".review-window"],
        title: tr("Revue de la semaine"),
        text: tr("La revue avance en six étapes. Vous videz d'abord la boîte de réception, puis vous décidez quoi faire des tâches en retard. Vous regardez ensuite la semaine qui arrive, vos objectifs et vos projets : un projet sans prochaine action, comme « appeler le déménageur », reçoit la sienne d'un mot. Vous terminez par ce que vous avez réussi."),
      },
      {
        title: tr("Rapport du mois"),
        text: tr("Le rapport du mois s'imprime avec Ctrl+P. Pour le garder en PDF, choisissez « Microsoft Print to PDF » dans la fenêtre d'impression."),
      },
    ],
  },
  taches: {
    id: "taches",
    title: tr("Tâches"),
    route: "taches",
    steps: [
      {
        target: [".quick-add"],
        title: tr("Ajouter une tâche"),
        text: tr("Écrivez la tâche comme vous la diriez. « Appeler le garage vendredi 14h #voiture !haute » crée la tâche pour vendredi à 14 h, avec l'étiquette « voiture » et une priorité haute. {newItem} vous amène directement ici."),
      },
      {
        target: [".task-lists"],
        title: tr("Listes et filtres"),
        text: tr("À gauche, vos tâches sont déjà triées. La boîte de réception reçoit ce qui n'est pas encore rangé, puis viennent Aujourd'hui et À venir. Faites glisser une tâche sur « Aujourd'hui » et elle est prévue pour aujourd'hui, sur « Terminées » et elle est faite, sur une étiquette et elle la reçoit. Si vous refaites souvent la même sélection, le + à côté de « Filtres » l'enregistre sous un nom."),
      },
      {
        target: [".tasks-header .tabs-fit"],
        title: tr("Façons d'afficher"),
        text: tr("Vos tâches peuvent s'afficher en liste, en colonnes avec le Kanban, dans la Matrice urgent / important ou sur la Chronologie. En Kanban et dans la Matrice, faites glisser une tâche pour la changer de colonne."),
      },
      {
        target: [".task-panel"],
        title: tr("Vos tâches"),
        text: tr("Cliquez sur une tâche pour voir son détail, avec l'échéance, le rappel, la répétition et les sous-tâches. Le clic droit propose toutes les actions. Pour traiter plusieurs tâches d'un coup, sélectionnez-les avec Ctrl+clic ou Maj+clic. Vous pouvez aussi faire glisser une tâche de « Demain » vers une autre journée : sa date suit."),
      },
    ],
  },
  calendrier: {
    id: "calendrier",
    title: tr("Calendrier"),
    route: "calendrier",
    steps: [
      {
        target: [".cal-header .tabs-fit"],
        title: tr("Vues"),
        text: tr("Passez du jour à la semaine, au mois ou à l'année. La vue Agenda présente simplement les rendez-vous à venir, les uns sous les autres."),
      },
      {
        target: [".cal-main"],
        title: tr("La grille"),
        text: tr("Le plus rapide est d'écrire le rendez-vous en une phrase, tout en haut, par exemple « Dîner avec Paul vendredi 20h » ou « Réunion lundi 14h-16h ». Vous pouvez aussi faire glisser la souris sur les heures voulues. Un rendez-vous se déplace en le faisant glisser, et sa durée change quand vous tirez son bord du bas."),
      },
      {
        target: [".cal-aside"],
        title: tr("Ce que le calendrier affiche"),
        text: tr("Chaque espace a son propre calendrier, que vous pouvez masquer. En dessous, choisissez ce qui s'ajoute à vos rendez-vous, comme les tâches datées, les factures ou les anniversaires. Vous y choisissez aussi votre pays, pour les jours fériés et les vacances scolaires, et les fêtes d'autres traditions."),
      },
      {
        target: [".cal-header .btn-gel"],
        title: tr("Nouvel événement"),
        text: tr("Ce bouton, ou {newItem}, crée un rendez-vous. Un clic droit sur le calendrier permet aussi d'exporter vos rendez-vous dans un fichier .ics ou d'imprimer la période affichée."),
      },
    ],
  },
  obligations: {
    id: "obligations",
    title: tr("Obligations"),
    route: "obligations",
    steps: [
      {
        target: [".obl-summary"],
        title: tr("Résumé"),
        text: tr("En haut s'affiche l'essentiel. Vous voyez ce qui est en retard, ce qui arrive bientôt et ce que vos abonnements vous coûtent chaque mois."),
      },
      {
        target: [".task-lists"],
        title: tr("Catégories"),
        text: tr("Impôts, factures, abonnements, assurances… Chaque catégorie a sa couleur et ses rappels. Faites un clic droit sur une catégorie pour les changer."),
      },
      {
        target: [".task-panel"],
        title: tr("Échéances"),
        text: tr("Les échéances sont rangées par date, des retards aux 30 prochains jours, puis plus tard. Une fois la facture réglée, « Marquer comme payée » la range et prépare la suivante. Pour ce qui est prélevé sur votre compte, comme le loyer ou la box, cochez « Prélèvement automatique » : Aqueli le marque payé de lui-même chaque mois."),
      },
      {
        target: [".tasks-header .tabs-fit"],
        title: tr("Frise de l'année"),
        text: tr("La frise montre toute l'année, mois par mois. Vous voyez ainsi venir les grosses dépenses, comme la taxe foncière ou l'assurance de la voiture."),
      },
    ],
  },
  notes: {
    id: "notes",
    title: tr("Notes"),
    route: "notes",
    steps: [
      {
        target: [".notes-nav", ".notes-list-pick"],
        title: tr("Carnets"),
        text: tr("Rangez vos notes dans des carnets, par exemple « Cuisine » ou « Maison », avec des sous-carnets si besoin. Le plus simple est de faire glisser une note sur son carnet. Un carnet se glisse aussi dans un autre pour devenir un sous-carnet, ou dans un dossier. Les favoris, les étiquettes et les archives se trouvent ici, et acceptent les notes de la même façon."),
      },
      {
        target: [".notes-list"],
        title: tr("Vos notes"),
        text: tr("Les notes épinglées restent en haut. Un clic droit sur une note permet de l'épingler, de l'archiver, de l'imprimer ou de l'enregistrer dans un fichier texte."),
      },
      {
        target: [".notes-editor-panel"],
        title: tr("Écrire"),
        text: tr("Écrivez directement dans la note. Saisissez « / » pour choisir un bloc à insérer : titre, liste, tableau, image… Vous pouvez aussi commencer une ligne par « # » pour un titre, « - » pour une liste ou « [ ] » pour une case à cocher. Saisissez « [[ » pour créer un lien vers une autre note. « Ouvrir dans une fenêtre » garde la note sous vos yeux pendant que vous travaillez ailleurs."),
      },
      {
        target: [".notes-new"],
        title: tr("Nouvelle note"),
        text: tr("Ce bouton, ou {newItem}, crée une note vide. La flèche juste à côté propose des modèles, comme un compte rendu ou une fiche recette."),
      },
    ],
  },
  journal: {
    id: "journal",
    title: tr("Journal"),
    route: "journal",
    steps: [
      {
        target: [".journal-page"],
        title: tr("La page du jour"),
        text: tr("Chaque jour a sa page. Notez votre humeur et votre énergie, ce que vous avez fait (une balade, un repas en famille, une journée de travail), trois motifs de gratitude, puis écrivez librement. Si l'inspiration manque, des questions vous sont proposées. Vous pouvez aussi y glisser des photos."),
      },
      {
        target: [".journal-side"],
        title: tr("Vos humeurs"),
        text: tr("Le calendrier colore chaque jour selon votre humeur, et « Ce jour-là » vous montre ce que vous écriviez à la même date les années passées. Dans « Tendances », après quelques semaines, vous verrez par exemple que vos journées avec du sport sont souvent meilleures que les autres."),
      },
    ],
  },
  habitudes: {
    id: "habitudes",
    title: tr("Habitudes"),
    route: "habitudes",
    steps: [
      {
        target: [".habits-body .task-panel"],
        title: tr("Aujourd'hui"),
        text: tr("Voici vos habitudes du jour. Un clic sur l'une d'elles la coche. Au clavier, la barre d'espace fait la même chose."),
      },
      {
        target: [".habit-detail"],
        title: tr("Vos progrès"),
        text: tr("Pour chaque habitude, vous voyez votre série en cours, votre record et la carte de l'année, où chaque jour réussi est coloré."),
      },
      {
        target: [".tasks-header .btn-gel"],
        title: tr("Nouvelle habitude"),
        text: tr("Une habitude peut être à prendre, comme boire de l'eau, ou à arrêter. Elle se coche simplement ou se compte, par exemple 8 verres ou 30 minutes. Elle peut revenir tous les jours ou seulement certains jours, avec un rappel si vous le souhaitez."),
      },
    ],
  },
  focus: {
    id: "focus",
    title: tr("Focus"),
    route: "focus",
    steps: [
      {
        target: [".focus-main-panel"],
        title: tr("Minuteur"),
        text: tr("Lancez une séance de travail suivie d'une pause, par exemple 25 minutes puis 5. Notez en quelques mots ce que vous comptez faire, « relire le rapport » par exemple, et rattachez la séance à une tâche si vous le souhaitez. Quand vous ne savez pas combien de temps il vous faudra, la séance libre compte le temps écoulé et vous laisse choisir le moment de la pause."),
      },
      {
        target: [".focus-stats"],
        title: tr("Statistiques"),
        text: tr("Ici s'affichent votre objectif du jour, les séances de la journée avec leur intention, et vos minutes de concentration semaine après semaine. Pendant une séance, Aqueli se fait discret. Les sons se taisent et les rappels attendent la fin."),
      },
    ],
  },
  projets: {
    id: "projets",
    title: tr("Projets"),
    route: "projets",
    steps: [
      {
        target: [".projects-body .task-panel"],
        title: tr("Vos projets"),
        text: tr("Un projet regroupe tout ce qui concerne un même but, comme un déménagement ou un voyage. Sa barre montre où vous en êtes. Le clic droit change son statut, ou l'archive une fois terminé."),
      },
      {
        target: [".project-view"],
        title: tr("Le projet ouvert"),
        text: tr("Vous y retrouvez ses tâches, en liste ou en tableau, ainsi que les notes, les rendez-vous et les documents qui s'y rapportent. Les jalons marquent les grandes étapes."),
      },
      {
        target: [".tasks-header .btn-gel"],
        title: tr("Nouveau projet"),
        text: tr("Partez d'un projet vide ou d'un modèle. Le modèle « Déménagement », par exemple, prépare déjà les démarches habituelles, du préavis du logement au changement d'adresse."),
      },
    ],
  },
  listes: {
    id: "listes",
    title: tr("Listes"),
    route: "listes",
    steps: [
      {
        target: [".lists-nav"],
        title: tr("Vos listes"),
        text: tr("Les listes servent à tout ce qui n'est pas vraiment une tâche. Pensez aux courses, aux livres à lire, aux films à voir ou aux idées de cadeaux."),
      },
      {
        target: [".list-quick-add", ".list-panel"],
        title: tr("Ajouter"),
        text: tr("Saisissez un élément puis appuyez sur Entrée. Pour les courses, choisissez aussi le rayon, et la liste se range par rayon comme dans le magasin. La semaine suivante, tapez « pa » et Aqueli vous propose les pâtes déjà achetées : elles reviennent dans la liste, au bon rayon."),
      },
      {
        target: [".list-panel"],
        title: tr("La liste"),
        text: tr("Cochez ce qui est fait ou acheté. « Affichage » trie la liste et peut cacher les éléments cochés. Pour l'emporter au magasin, Ctrl+P l'imprime avec ses cases à cocher."),
      },
    ],
  },
  contacts: {
    id: "contacts",
    title: tr("Contacts"),
    route: "contacts",
    steps: [
      {
        target: [".contacts-body .task-panel"],
        title: tr("Le carnet"),
        text: tr("Vos contacts sont rangés par catégorie, les favoris en premier. Ctrl+F lance une recherche dans le carnet."),
      },
      {
        target: [".contact-detail"],
        title: tr("La fiche"),
        text: tr("La fiche ressemble à une carte de visite, avec la photo, les téléphones, l'adresse et vos notes. Si vous indiquez un anniversaire, il apparaît dans le calendrier. Pour ne pas perdre de vue une grand-mère ou un ami éloigné, choisissez « Chaque mois » dans « Rester en contact » et notez vos appels : Aqueli vous rappellera de prendre des nouvelles."),
      },
      {
        target: [".contacts-export"],
        title: tr("Importer et exporter"),
        text: tr("Ce bouton enregistre vos contacts dans un fichier .vcf ou .csv. Dans l'autre sens, un fichier .vcf tiré de votre téléphone ou de votre messagerie s'importe dans Aqueli."),
      },
    ],
  },
  documents: {
    id: "documents",
    title: tr("Documents"),
    route: "documents",
    steps: [
      {
        target: [".doc-folders"],
        title: tr("Dossiers"),
        text: tr("Classez vos papiers dans des dossiers, par exemple « Maison », « Voiture » ou « Santé », et ajoutez des étiquettes pour les retrouver plus vite."),
      },
      {
        target: [".doc-list"],
        title: tr("Vos documents"),
        text: tr("Pour ajouter un document, faites-le glisser sur la fenêtre. Aqueli en garde une copie chiffrée. Un fichier nommé « Facture EDF 2026-09-30 » est rangé tout seul comme une facture datée du 30 septembre. Si vous indiquez une date d'expiration, comme pour un passeport, un rappel vous prévient à temps."),
      },
      {
        target: [".doc-detail"],
        title: tr("Aperçu"),
        text: tr("Les PDF et les images s'affichent directement ici. « Exporter » en enregistre une copie où vous voulez, par exemple pour l'envoyer à quelqu'un."),
      },
    ],
  },
  objectifs: {
    id: "objectifs",
    title: tr("Objectifs"),
    route: "objectifs",
    steps: [
      {
        target: [".goals-grid-panel"],
        title: tr("Vos objectifs"),
        text: tr("Fixez-vous des objectifs pour l'année, le trimestre ou le mois. L'anneau autour de chacun montre où vous en êtes, et le rythme indique si vous êtes dans les temps. Dans la fiche, Aqueli calcule aussi ce qu'il vous reste à faire chaque semaine, par exemple « 0,8 livre par semaine », et la date à laquelle vous y arriverez si vous gardez votre rythme."),
      },
      {
        target: [".goal-detail"],
        title: tr("Le détail"),
        text: tr("Un objectif peut avancer avec un chiffre, comme lire 20 livres, ou avec des tâches, une habitude ou une suite d'étapes. Quand la période se termine, « Reconduire » le recrée pour la suivante."),
      },
    ],
  },
  budget: {
    id: "budget",
    title: tr("Budget"),
    route: "budget",
    steps: [
      {
        target: [".budget-month"],
        title: tr("Le mois"),
        text: tr("Le budget se lit mois par mois. Les flèches permettent de revenir aux mois passés ou de regarder le mois prochain."),
      },
      {
        target: [".btn-money", ".budget-main"],
        title: tr("Dépenses et revenus"),
        text: tr("Ajoutez une dépense ou un revenu avec ces boutons. Les dépenses s'affichent en rouge et les revenus en vert. Pour votre salaire ou votre loyer, choisissez « Chaque mois » dans la répétition : Aqueli l'ajoutera de lui-même chaque mois, le bon jour. Les abonnements notés dans les Obligations sont repris automatiquement."),
      },
      {
        target: [".budget-side"],
        title: tr("Répartition"),
        text: tr("Le graphique montre où part votre argent ce mois-ci. En dessous, vous pouvez fixer un budget par catégorie et comparer avec les six derniers mois."),
      },
      {
        target: [".contacts-export"],
        title: tr("Exporter"),
        text: tr("Les opérations du mois s'exportent dans un fichier .csv, que vous pouvez ouvrir dans Excel. Vous pouvez aussi importer le relevé de votre banque, au format .csv ou .xlsx."),
      },
    ],
  },
};

export const tourOf = (id: TourId): Tour => (id === "general" ? GENERAL_TOUR : MODULE_TOURS[id]);
