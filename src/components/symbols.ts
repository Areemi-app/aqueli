/**
 * Symboles proposés pour tout ce qui se personnalise (espaces, catégories, carnets, listes,
 * habitudes, objectifs…), rangés par catégories pour le sélecteur (SymbolPicker). Grille 24 × 24,
 * trait seul, comme les icônes de l'interface. Les mots-clés servent à la recherche (sans accents).
 * Les identifiants sont aussi vérifiés par le cœur (src-tauri/src/data/symbols.rs, même ordre).
 */
import { ICONS } from "./icons";
import { tr } from "../i18n/i18n";

export interface SymbolDef {
  id: string;
  label: string;
  path: string;
  /** Mots qui le désignent aussi, pour la recherche. */
  keywords: string;
}

export interface SymbolCategory {
  id: string;
  label: string;
  /** Symbole de l'onglet de la catégorie. */
  icon: string;
  symbols: readonly SymbolDef[];
}

export const SYMBOL_CATEGORIES: readonly SymbolCategory[] = [
  {
    id: "maison",
    label: tr("Maison et famille"),
    icon: "maison",
    symbols: [
      { id: "maison", label: tr("Maison"), path: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z", keywords: tr("domicile logement appartement foyer") },
      { id: "famille", label: tr("Famille"), path: "M8 11a3 3 0 1 0 0-6a3 3 0 0 0 0 6z M16 12a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5z M2 20a6 6 0 0 1 12 0 M13 20a4.5 4.5 0 0 1 9 0", keywords: tr("parents proches") },
      { id: "personne", label: tr("Personne"), path: "M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0", keywords: tr("moi profil utilisateur") },
      { id: "couple", label: tr("Couple"), path: "M8.5 10a3 3 0 1 0 0-6a3 3 0 0 0 0 6z M15.5 10a3 3 0 1 0 0-6a3 3 0 0 0 0 6z M3 20a5.5 5.5 0 0 1 11 0 M10 20a5.5 5.5 0 0 1 11 0", keywords: tr("amoureux conjoint duo") },
      { id: "amis", label: tr("Amis"), path: "M12 10a3 3 0 1 0 0-6a3 3 0 0 0 0 6z M5 11a2 2 0 1 0 0-4a2 2 0 0 0 0 4z M19 11a2 2 0 1 0 0-4a2 2 0 0 0 0 4z M6 20a6 6 0 0 1 12 0 M2 18a3.5 3.5 0 0 1 4-3.4 M22 18a3.5 3.5 0 0 0-4-3.4", keywords: tr("groupe bande association equipe") },
      { id: "bebe", label: tr("Bébé"), path: "M12 21a8 8 0 1 0 0-16a8 8 0 0 0 0 16z M9.5 12h.01 M14.5 12h.01 M10 16c1.2.8 2.8.8 4 0 M12 5c0-1.5 1.5-2.2 2.5-1.5", keywords: tr("naissance nourrisson") },
      { id: "enfant", label: tr("Enfant"), path: "M12 7.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5z M5 8l4 3h6l4-3 M9 11v4l-2 6 M15 11v4l2 6 M9 15h6", keywords: tr("enfants ecole garde") },
      { id: "coeur", label: tr("Cœur"), path: "M12 20s-7-4.4-9-9a4.6 4.6 0 0 1 9-3 4.6 4.6 0 0 1 9 3c-2 4.6-9 9-9 9z", keywords: tr("amour sante affection") },
      { id: "cadeau", label: tr("Cadeau"), path: "M4 11h16v9H4z M3 7h18v4H3z M12 7v13 M12 7c-2-4-6-3-5 0 M12 7c2-4 6-3 5 0", keywords: tr("anniversaire fete surprise") },
      { id: "cle", label: tr("Clé"), path: ICONS.key, keywords: tr("acces serrure logement") },
      { id: "porte", label: tr("Entrée"), path: "M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17 M3 21h18 M15 12h.01", keywords: tr("porte logement demenagement") },
      { id: "lit", label: tr("Chambre"), path: "M3 19V6 M21 19v-5 M3 14h18 M3 10h4.5a2 2 0 0 1 2 2v2 M9.5 14v-3h8a3 3 0 0 1 3 3", keywords: tr("lit sommeil chambre hotel") },
      { id: "canape", label: tr("Salon"), path: "M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3 M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2z M5 18v2 M19 18v2", keywords: tr("canape meubles detente") },
      { id: "lampe", label: tr("Lampe"), path: "M8 3h8l3 7H5z M12 10v8 M8 21h8", keywords: tr("luminaire eclairage deco") },
      { id: "bougie", label: tr("Bougie"), path: "M9 10h6v11H9z M12 10V7 M12 3c1.5 1.5 1.5 3 0 4-1.5-1-1.5-2.5 0-4z", keywords: tr("ambiance calme") },
      { id: "plante", label: tr("Plante"), path: "M7 14h10l-1.5 7h-7z M12 14V8 M12 10c-3 0-5-2-5-5 3 0 5 2 5 5z M12 8c0-3 2-5 5-5 0 3-2 5-5 5z", keywords: tr("plantes interieur pot") },
      { id: "arrosoir", label: tr("Jardin"), path: "M5 10h9v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z M14 12l6-5 M18.5 4.5l3 3 M5 12H3.5a1.5 1.5 0 0 1 0-3H5 M8 10V7a2 2 0 0 1 4 0", keywords: tr("jardinage arroser potager") },
      { id: "balai", label: tr("Ménage"), path: "M19 3l-7 7 M10 9l5 5 M10 9c-2.5 0-6 2-7 9 3 1 7-.5 9-3 1-1 2-1.5 3-1", keywords: tr("nettoyage entretien proprete") },
      { id: "lessive", label: tr("Linge"), path: "M4 3h16v18H4z M4 8h16 M12 17.5a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M7 5.5h.01 M10 5.5h.01", keywords: tr("lessive machine laver vetements") },
      { id: "panier", label: tr("Courses"), path: "M3 9.5h18l-2 10.5H5z M8 9.5l3-6 M16 9.5l-3-6 M9.5 13.5v3 M14.5 13.5v3", keywords: tr("courses supermarche achats") },
    ],
  },
  {
    id: "travail",
    label: tr("Travail et études"),
    icon: "valise",
    symbols: [
      { id: "valise", label: tr("Travail"), path: "M4 8h16v11H4z M9 8V5h6v3 M4 13h16", keywords: tr("bureau emploi metier") },
      { id: "ordinateur", label: tr("Ordinateur"), path: "M4 5h16v10H4z M8 19h8 M12 15v4", keywords: tr("pc informatique ecran") },
      { id: "telephone", label: tr("Téléphone"), path: "M7 2.5h10a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1z M11 18h2", keywords: tr("portable smartphone appel") },
      { id: "ecole", label: tr("Études"), path: "M2 9l10-5 10 5-10 5z M6 11v5c3 2 9 2 12 0v-5", keywords: tr("etudes universite cours diplome") },
      { id: "livre", label: tr("Livre"), path: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19a2 2 0 0 1 2-2h13", keywords: tr("lecture bibliotheque") },
      { id: "carnet", label: tr("Carnet"), path: ICONS.notebook, keywords: tr("notes cahier") },
      { id: "idee", label: tr("Idée"), path: ICONS.bulb, keywords: tr("ampoule inspiration creativite") },
      { id: "outils", label: tr("Bricolage"), path: "M14.7 6.3a4 4 0 0 0-5.4 5.1l-5.8 5.8a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.1-5.4l-2.5 2.5-2.4-.4-.4-2.4z", keywords: tr("bricolage reparation cle") },
      { id: "graphique", label: tr("Graphique"), path: "M3 20h18 M7 16v-5 M12 16V6 M17 16V9", keywords: tr("statistiques chiffres resultats") },
      { id: "cible", label: tr("Objectif"), path: "M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M12 16.5a4.5 4.5 0 1 0 0-9a4.5 4.5 0 0 0 0 9z M12 12h.01", keywords: tr("objectif but") },
      { id: "crayon", label: tr("Écriture"), path: ICONS.pencil, keywords: tr("ecrire rediger stylo") },
      { id: "dossier", label: tr("Dossier"), path: ICONS.folder, keywords: tr("classement rangement") },
      { id: "document", label: tr("Document"), path: ICONS.file, keywords: tr("fichier page papier") },
      { id: "trombone", label: tr("Pièce jointe"), path: "M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8", keywords: tr("attache joindre") },
      { id: "tableau", label: tr("Tableau"), path: ICONS.table, keywords: tr("tableur excel donnees") },
      { id: "presentation", label: tr("Présentation"), path: "M3 4h18 M4 4v11h16V4 M12 15v3 M8 21l4-3 4 3 M8 11l3-3 2 2 3-3", keywords: tr("reunion expose diaporama") },
      { id: "discussion", label: tr("Discussion"), path: "M3 5h12v8H8l-4 3v-3H3z M15 9h6v8h-1v3l-4-3h-5v-4", keywords: tr("reunion echange conversation") },
      { id: "calculatrice", label: tr("Calculs"), path: "M6 2.5h12a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1z M8 6h8v4H8z M8.5 14h.01 M12 14h.01 M15.5 14h.01 M8.5 18h.01 M12 18h.01 M15.5 18h.01", keywords: tr("comptabilite mathematiques") },
      { id: "diplome", label: tr("Diplôme"), path: "M4 4h16v11H4z M8 8h8 M8 11h5 M15 13v8l2-1.5 2 1.5v-8", keywords: tr("certificat examen reussite") },
      { id: "badge", label: tr("Badge"), path: "M7 3h10v18H7z M10 3v3h4V3 M12 13a2 2 0 1 0 0-4a2 2 0 0 0 0 4z M9 17c.7-1.3 5.3-1.3 6 0", keywords: tr("identite entreprise acces") },
      { id: "code", label: tr("Programmation"), path: ICONS.code, keywords: tr("informatique developpement") },
      { id: "fusee", label: tr("Lancement"), path: "M12 15l-3-3c1-5 4.5-8.5 10-9-.5 5.5-4 9-7 12z M9 12H5l2.5-3.5H11 M12 15v4l3.5-2.5V13 M7 17c-1.5.5-2.5 2-2.5 4 2 0 3.5-1 4-2.5", keywords: tr("projet demarrage ambition") },
    ],
  },
  {
    id: "argent",
    label: tr("Argent et démarches"),
    icon: "argent",
    symbols: [
      { id: "argent", label: tr("Argent"), path: "M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3z M3 7l12-3v3 M16 13h2", keywords: tr("finances budget portefeuille") },
      { id: "banque", label: tr("Banque"), path: "M3 10h18 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 21h18 M12 3l9 5H3z", keywords: tr("compte epargne credit") },
      { id: "facture", label: tr("Facture"), path: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h3", keywords: tr("paiement depense") },
      { id: "contrat", label: tr("Contrat"), path: "M6 3h9l4 4v14H6z M14 3v5h5 M9 13h7 M9 17h5", keywords: tr("abonnement engagement") },
      { id: "carte", label: tr("Carte"), path: "M3 6h18v12H3z M7 10.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0 M6 15.5c.8-1.5 4.2-1.5 5 0 M14 10h4 M14 13h4", keywords: tr("carte bancaire identite") },
      { id: "portemonnaie", label: tr("Porte-monnaie"), path: "M4 7a2 2 0 0 1 2-2h12v4 M4 7v11a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2z M16.5 14.5h.01", keywords: tr("portefeuille argent liquide") },
      { id: "tirelire", label: tr("Épargne"), path: "M19 10.5c1 .3 2 1 2 2.5 M4 12c0-3.9 3.6-7 8-7 1.5 0 2.9.4 4 1l2.5-1.5-.5 3c1 1 1.5 2.3 1.5 3.5 0 2-1 3.7-2.5 4.8V20h-3v-1.5h-3V20H8v-2.2C5.6 16.6 4 14.5 4 12z M15 10h.01", keywords: tr("economies cagnotte") },
      { id: "pieces", label: tr("Pièces"), path: "M5 7a7 3 0 1 0 14 0a7 3 0 1 0-14 0 M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7 M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5", keywords: tr("monnaie economies") },
      { id: "euro", label: tr("Euro"), path: "M17 6.5A6.5 6.5 0 1 0 17 17.5 M5 10.5h8 M5 13.5h8", keywords: tr("monnaie prix") },
      { id: "pourcentage", label: tr("Réduction"), path: "M19 5L5 19 M7.5 9.5a2 2 0 1 0 0-4a2 2 0 0 0 0 4z M16.5 18.5a2 2 0 1 0 0-4a2 2 0 0 0 0 4z", keywords: tr("promotion taux interet") },
      { id: "tendance", label: tr("Tendance"), path: "M3 17l6-6 4 4 8-8 M15 7h6v6", keywords: tr("hausse progression croissance") },
      { id: "balance", label: tr("Justice"), path: "M12 3v18 M8 21h8 M5 7h14 M5 7l-3 7a3 3 0 0 0 6 0z M19 7l-3 7a3 3 0 0 0 6 0z", keywords: tr("droit avocat juridique") },
      { id: "tampon", label: tr("Administration"), path: "M9 3h6v5l2 4H7l2-4z M5 12h14v4H5z M5 20h14", keywords: tr("demarches mairie officiel") },
      { id: "signature", label: tr("Signature"), path: "M3 17c3-4 5-12 7-11s-3 11-1 11 3-5 5-5 1 4 3 4 3-2 3-2 M3 21h18", keywords: tr("signer contrat") },
      { id: "passeport", label: tr("Passeport"), path: "M6 2.5h12a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1z M12 13a3 3 0 1 0 0-6a3 3 0 0 0 0 6z M9 17h6", keywords: tr("identite voyage papiers") },
      { id: "parapluie", label: tr("Assurance"), path: "M3 12a9 9 0 0 1 18 0z M12 12v6.5a2 2 0 0 1-4 0", keywords: tr("protection parapluie pluie") },
      { id: "bouclier", label: tr("Protection"), path: ICONS.shield, keywords: tr("securite protection assurance") },
      { id: "garantie", label: tr("Garantie"), path: "M12 3l2.4 1.8 3-.2.8 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.8 2.9-3-.2L12 21l-2.4-1.8-3 .2-.8-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.8-2.9 3 .2z M8.5 12l2.5 2.5 4.5-5", keywords: tr("qualite certificat") },
      { id: "cadenas", label: tr("Cadenas"), path: ICONS.lock, keywords: tr("securite verrou prive") },
      { id: "repetition", label: tr("Répétition"), path: ICONS.repeat, keywords: tr("abonnement recurrent") },
    ],
  },
  {
    id: "sante",
    label: tr("Santé et sport"),
    icon: "sante",
    symbols: [
      { id: "sante", label: tr("Santé"), path: "M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z", keywords: tr("medecin soin hopital") },
      { id: "pilule", label: tr("Médicament"), path: "M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7z M8.5 8.5l7 7", keywords: tr("medicament traitement pharmacie") },
      { id: "stethoscope", label: tr("Médecin"), path: "M5 3v6a4 4 0 0 0 8 0V3 M9 13v2a5 5 0 0 0 10 0v-2 M19 13a2 2 0 1 0 0-4a2 2 0 0 0 0 4z M4 3h2 M12 3h2", keywords: tr("docteur consultation") },
      { id: "pouls", label: tr("Rythme cardiaque"), path: "M3 12h4l2-5 4 10 2-5h6", keywords: tr("coeur pouls cardio") },
      { id: "dent", label: tr("Dentiste"), path: "M7 3c-2.5 0-4 2-4 4.5 0 3 1.5 4.5 2 7.5.4 2.5 1 5.5 2.5 5.5s1.8-3.5 2.5-6c.3-1 .8-1.5 2-1.5s1.7.5 2 1.5c.7 2.5 1 6 2.5 6s2.1-3 2.5-5.5c.5-3 2-4.5 2-7.5C21 5 19.5 3 17 3c-2 0-3 1-5 1S9 3 7 3z", keywords: tr("dents bouche") },
      { id: "oeil", label: tr("Vue"), path: ICONS.eye, keywords: tr("yeux ophtalmologue lunettes") },
      { id: "thermometre", label: tr("Température"), path: "M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z M12 9v8", keywords: tr("fievre") },
      { id: "seringue", label: tr("Vaccin"), path: "M17 3l4 4 M19 5l-11 11 M13 7l4 4 M8 16l-3 1 1-3 M5 17l-2 2 M10 10l1.5 1.5 M12 8l1.5 1.5", keywords: tr("piqure prise de sang") },
      { id: "sommeil", label: tr("Sommeil"), path: "M18.5 15.5A7.5 7.5 0 1 1 8.5 5.5a6 6 0 0 0 10 10z M14 3h4l-4 4h4", keywords: tr("dormir nuit repos") },
      { id: "pesee", label: tr("Poids"), path: "M4 4h16v16H4z M8.5 10a4 4 0 0 1 7 0 M12 10l1.5-2", keywords: tr("balance regime") },
      { id: "sport", label: tr("Sport"), path: "M6 7v10 M3 9.5v5 M18 7v10 M21 9.5v5 M6 12h12", keywords: tr("musculation halteres salle") },
      { id: "course", label: tr("Course à pied"), path: "M13 4.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 0 0-3 0 M6 21l3.5-5.5 3 2.5V22 M9.5 15.5l1.5-6.5 3.5 3 3 .5 M11 9L8 8.5 5.5 11", keywords: tr("courir jogging marathon") },
      { id: "velo", label: tr("Vélo"), path: "M5.5 19.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z M18.5 19.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z M5.5 16L9 9h7l2.5 7 M9 9l3 7h-6.5 M12 16l4-7 M8 6h3 M15 6h2l-1 3", keywords: tr("cyclisme bicyclette") },
      { id: "natation", label: tr("Natation"), path: "M2 17c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5 M2 21c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5 M17 9.5a2 2 0 1 0 0-.01 M6 13l4-4 3 3 3-1", keywords: tr("nager piscine") },
      { id: "yoga", label: tr("Méditation"), path: "M12 6.5a2 2 0 1 0 0-4a2 2 0 0 0 0 4z M12 9v5 M6 11l6 3 6-3 M4 18c3-1.5 5.5-2 8-2s5 .5 8 2 M8 21h8", keywords: tr("yoga zen relaxation respiration") },
      { id: "ballon", label: tr("Football"), path: "M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M12 7.5l3.5 2.5-1.3 4h-4.4l-1.3-4z M12 7.5V3.5 M15.5 10l3.5-1.5 M14.2 14l2.3 3.5 M9.8 14l-2.3 3.5 M8.5 10L5 8.5", keywords: tr("foot sport collectif match") },
      { id: "medaille", label: tr("Médaille"), path: "M8 2.5l2.5 6 M16 2.5l-2.5 6 M12 21.5a6 6 0 1 0 0-12a6 6 0 0 0 0 12z M12 13v4", keywords: tr("victoire recompense podium") },
      { id: "trophee", label: tr("Trophée"), path: "M8 4h8v5a4 4 0 0 1-8 0z M8 6.5H5a3 3 0 0 0 3.3 3.5 M16 6.5h3a3 3 0 0 1-3.3 3.5 M12 13v4 M8 21h8 M10 17h4v4h-4z", keywords: tr("victoire coupe reussite") },
    ],
  },
  {
    id: "loisirs",
    label: tr("Loisirs et culture"),
    icon: "musique",
    symbols: [
      { id: "musique", label: tr("Musique"), path: "M9 18V5l11-2v13 M9 18a3 3 0 1 1-6 0a3 3 0 0 1 6 0z M20 16a3 3 0 1 1-6 0a3 3 0 0 1 6 0z", keywords: tr("chanson concert ecouter") },
      { id: "casque", label: tr("Casque audio"), path: "M4 15v-3a8 8 0 0 1 16 0v3 M4 14h3v7H5a1 1 0 0 1-1-1z M20 14h-3v7h2a1 1 0 0 0 1-1z", keywords: tr("ecouter podcast musique") },
      { id: "guitare", label: tr("Guitare"), path: "M14 10l6-6 M18 2l4 4 M10.5 9.5c-1.5-1-4-.5-5 1.5-.5 1-1 1.5-2.5 2-1.5 1-1 4 1 6s5 2.5 6 1c.5-1.5 1-2 2-2.5 2-1 2.5-3.5 1.5-5z M9 15h.01", keywords: tr("instrument musique") },
      { id: "micro", label: tr("Micro"), path: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3 M8 21h8", keywords: tr("chant voix enregistrement") },
      { id: "film", label: tr("Film"), path: "M4 4h16v16H4z M8 4v16 M16 4v16 M4 9h4 M4 15h4 M16 9h4 M16 15h4", keywords: tr("cinema video serie") },
      { id: "television", label: tr("Télévision"), path: "M3 7h18v12H3z M8 3l4 4 4-4", keywords: tr("tv series ecran") },
      { id: "theatre", label: tr("Théâtre"), path: "M3 4h10v6a5 5 0 0 1-10 0z M6 7h.01 M10 7h.01 M6 11c1 .7 3 .7 4 0 M13 9h8v6a5 5 0 0 1-10 0v-1 M16 12h.01 M19 12h.01 M16 17c1-.7 2-.7 3 0", keywords: tr("spectacle culture masques") },
      { id: "ticket", label: tr("Billet"), path: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z M14 7.5v1.5 M14 11v2 M14 15v1.5", keywords: tr("entree concert spectacle") },
      { id: "lecture", label: tr("Lecture"), path: "M12 6c-2-1.5-5-2-9-1.5V19c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V4.5C17 4 14 4.5 12 6z M12 6v14.5", keywords: tr("livre roman lire") },
      { id: "jeu", label: tr("Jeu"), path: "M7 8h10a4 4 0 0 1 4 4v2a3 3 0 0 1-5.5 1.7L14.5 14h-5l-1 1.7A3 3 0 0 1 3 14v-2a4 4 0 0 1 4-4z M8 10.5v3 M6.5 12h3 M15.5 11h.01 M17.5 13h.01", keywords: tr("manette jeux video console") },
      { id: "puzzle", label: tr("Puzzle"), path: "M4 8h4a2 2 0 0 1 4 0h4v4a2 2 0 0 1 0 4v4H4v-4a2 2 0 0 0 0-4z", keywords: tr("casse-tete jeu") },
      { id: "des", label: tr("Dés"), path: "M4 4h16v16H4z M8.5 8.5h.01 M15.5 8.5h.01 M12 12h.01 M8.5 15.5h.01 M15.5 15.5h.01", keywords: tr("jeux societe hasard") },
      { id: "echecs", label: tr("Échecs"), path: "M12 9a3 3 0 1 0 0-6a3 3 0 0 0 0 6z M9 9.5h6 M10 10l-1.5 7h7L14 10 M6 21h12l-1-4H7z", keywords: tr("pion strategie") },
      { id: "photo", label: tr("Photo"), path: "M4 8h3.5l2-3h5l2 3H20v11H4z M12 17a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z", keywords: tr("appareil photographie souvenir") },
      { id: "palette", label: tr("Dessin"), path: ICONS.palette, keywords: tr("peinture art dessin") },
      { id: "pinceau", label: tr("Peinture"), path: "M18.5 2.5l3 3-9 9-3-3z M9.5 11.5c-2 0-4 1.5-4 4 0 1.5-1 3-2.5 3.5 2.5 1.5 7 1 7.5-3.5", keywords: tr("art bricolage creation") },
      { id: "fete", label: tr("Fête"), path: "M3 21l5-14 9 9z M13 3c-.5 2 .5 3.5 2 4 M19 9c1.5-1.5 3-.5 3-.5 M10 2l.5 1.5 M21 2.5l-1 1 M16.5 3.5h.01", keywords: tr("soiree anniversaire celebration") },
    ],
  },
  {
    id: "cuisine",
    label: tr("Cuisine et repas"),
    icon: "cafe",
    symbols: [
      { id: "cuisine", label: tr("Cuisine"), path: "M7 3v18 M4.5 3v5a2.5 2.5 0 0 0 5 0V3 M17 21V3c-2.2 1.4-3.5 4.3-3.5 8h3.5", keywords: tr("repas manger couverts") },
      { id: "restaurant", label: tr("Restaurant"), path: "M3 18h18 M4 18a8 8 0 0 1 16 0 M12 7V5 M10 5h4", keywords: tr("repas sortie diner") },
      { id: "cafe", label: tr("Café"), path: "M4 9h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M17 10.5h1a2.5 2.5 0 0 1 0 5h-1.5 M4 21h13 M8 3.5v2.5 M12 3.5v2.5", keywords: tr("boisson pause petit-dejeuner") },
      { id: "the", label: tr("Thé"), path: "M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z M16 11h1.5a2.5 2.5 0 0 1 0 5H16 M3 21h15 M9 3c-1 1.5 1 2 0 3.5 M12.5 3c-1 1.5 1 2 0 3.5", keywords: tr("tisane infusion boisson") },
      { id: "vin", label: tr("Vin"), path: "M8 3h8l.5 5a4.5 4.5 0 0 1-9 0z M12 12.5V20 M8.5 21h7 M7.7 7h8.6", keywords: tr("apero boisson cave") },
      { id: "bouteille", label: tr("Boissons"), path: "M10 2h4v4l2 3v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3z M8 13h8", keywords: tr("eau bouteille hydratation") },
      { id: "pomme", label: tr("Fruits"), path: "M12 7c-1.5-1.5-4-2-6-.5-2.5 2-2 6.5.5 10.5 1.5 2.5 3 3.5 5.5 2.5 2.5 1 4 0 5.5-2.5 2.5-4 3-8.5.5-10.5-2-1.5-4.5-1-6 .5z M12 7c0-2 1-3.5 3-4", keywords: tr("fruit alimentation sain") },
      { id: "carotte", label: tr("Légumes"), path: "M4 20l9-11.5a2.2 2.2 0 0 1 3 3z M15 8.5c-.2-2 .4-3.6 2-4.8 M17.2 10.5c2 .2 3.6-.4 4.8-2 M16.5 9l3-3 M8 15.6l1.4 1 M10.3 12.7l1.4 1", keywords: tr("legume potager alimentation") },
      { id: "pain", label: tr("Boulangerie"), path: "M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 2 7.5V19H6v-5.5A4 4 0 0 1 4 10z M9 10l2-2 M13 11l2-2", keywords: tr("pain viennoiserie") },
      { id: "fromage", label: tr("Fromage"), path: "M3 17V10l14-6 4 6v7z M3 10h18 M8 14h.01 M15 13.5h.01", keywords: tr("cremerie") },
      { id: "oeuf", label: tr("Œuf"), path: "M12 21a6.5 6.5 0 0 0 6.5-6.5C18.5 9 15.5 3 12 3S5.5 9 5.5 14.5A6.5 6.5 0 0 0 12 21z", keywords: tr("oeufs paques petit-dejeuner") },
      { id: "pizza", label: tr("Pizza"), path: "M12 21L3 6a14 14 0 0 1 18 0z M5 9.5a11 11 0 0 1 14 0 M10 12h.01 M14 14h.01 M12 17h.01", keywords: tr("repas restauration rapide") },
      { id: "gateau", label: tr("Gâteau"), path: "M4 21V12h16v9 M4 15.5c2 1 4 1 6 0s4-1 6 0 4 1 4 0 M2 21h20 M8 12V9 M12 12V9 M16 12V9 M8 6v.5 M12 6v.5 M16 6v.5", keywords: tr("anniversaire patisserie dessert") },
      { id: "glace", label: tr("Dessert"), path: "M7.5 10.5a4.5 4.5 0 1 1 9 0 M6.5 10.5h11l-5.5 10.5z", keywords: tr("glace sucre") },
    ],
  },
  {
    id: "voyage",
    label: tr("Voyages et transports"),
    icon: "avion",
    symbols: [
      { id: "voyage", label: tr("Voyage"), path: "M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M3 12h18 M12 3c-3 3-3 15 0 18 M12 3c3 3 3 15 0 18", keywords: tr("monde globe international") },
      { id: "avion", label: tr("Avion"), path: "M12 2.5c.8 0 1.5 1 1.5 2.5v4.5l7.5 4.5v2l-7.5-2v4.5l2.5 2V22L12 21l-4 1v-1.5l2.5-2V14L3 16v-2l7.5-4.5V5c0-1.5.7-2.5 1.5-2.5z", keywords: tr("vol aeroport vacances") },
      { id: "voiture", label: tr("Voiture"), path: "M5 16l1.5-5.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 16 M4 16h16v3H4z M7.5 13.5h.01 M16.5 13.5h.01", keywords: tr("auto conduite vehicule") },
      { id: "bus", label: tr("Bus"), path: "M5 4h14a1 1 0 0 1 1 1v12H4V5a1 1 0 0 1 1-1z M4 11h16 M4 17v3h3v-3 M17 17v3h3v-3 M7.5 14h.01 M16.5 14h.01", keywords: tr("transports en commun car") },
      { id: "train", label: tr("Train"), path: "M6 3h12a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2z M4 10h16 M8 14.5h.01 M16 14.5h.01 M7 21l2-3 M17 21l-2-3", keywords: tr("metro tgv rail") },
      { id: "bateau", label: tr("Bateau"), path: "M3 16l2 4h14l2-4z M12 3v13 M12 4l6.5 9H12", keywords: tr("voilier croisiere mer") },
      { id: "essence", label: tr("Carburant"), path: "M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16 M3 21h13 M6.5 7h6v4h-6z M15 10h2a2 2 0 0 1 2 2v4.5a1.5 1.5 0 0 0 3 0V8l-3-3", keywords: tr("station plein essence") },
      { id: "plan", label: tr("Carte routière"), path: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15", keywords: tr("itineraire plan route") },
      { id: "lieu", label: tr("Lieu"), path: "M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z M12 12.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5z", keywords: tr("adresse localisation endroit") },
      { id: "boussole", label: tr("Boussole"), path: "M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M15.5 8.5l-2 5-5 2 2-5z", keywords: tr("orientation randonnee aventure") },
      { id: "hotel", label: tr("Hôtel"), path: "M5 21V3h14v18 M3 21h18 M9 7h.01 M15 7h.01 M9 11h.01 M15 11h.01 M10 21v-5h4v5", keywords: tr("hebergement immeuble") },
      { id: "tente", label: tr("Camping"), path: "M2 20h20 M12 4L3.5 20 M12 4l8.5 16 M12 14l-3 6 M12 14l3 6", keywords: tr("camping nature bivouac") },
      { id: "palmier", label: tr("Vacances"), path: "M12 21c0-5 .5-9 1.5-12 M13.5 9C11 6 7 6 5 8 M13.5 9c2-3 6-3.5 8-1 M13.5 9c-1-3-4-5-7-4 M13.5 9c3-1.5 5.5-4 5-6.5 M5 21h14", keywords: tr("plage ete soleil") },
      { id: "montagne", label: tr("Montagne"), path: "M3 20l6.5-11 4 6.5 2.5-4 5 8.5z", keywords: tr("randonnee ski sommet") },
    ],
  },
  {
    id: "nature",
    label: tr("Nature et météo"),
    icon: "feuille",
    symbols: [
      { id: "feuille", label: tr("Nature"), path: "M5 19C5 10 11 5 20 4c-1 9-6 15-15 15z M5 19l8-8", keywords: tr("ecologie vert plante") },
      { id: "pousse", label: tr("Pousse"), path: "M12 21v-9 M12 12c0-4-3-6-7-6 0 4 3 6 7 6z M12 14c0-3 2-5 6-5 0 3-2 5-6 5z", keywords: tr("croissance germe progres") },
      { id: "arbre", label: tr("Arbre"), path: "M12 21v-6 M12 15c-4 0-7-2.5-7-6s3-6 7-6 7 2.5 7 6-3 6-7 6z M9 21h6", keywords: tr("foret nature parc") },
      { id: "fleur", label: tr("Fleur"), path: "M12 21v-8 M12 13c-3 0-5-2-5-5V4l2.5 2L12 3l2.5 3L17 4v4c0 3-2 5-5 5z M12 17c-2.5 0-4.5-1.5-5-4 M12 18c2.5 0 4.5-1.5 5-4", keywords: tr("tulipe printemps jardin") },
      { id: "soleil", label: tr("Soleil"), path: ICONS.sun, keywords: tr("beau temps ete chaleur") },
      { id: "lune", label: tr("Lune"), path: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z", keywords: tr("nuit soir") },
      { id: "nuage", label: tr("Nuage"), path: "M7 19a5 5 0 0 1-.5-9.98A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 10z", keywords: tr("meteo gris") },
      { id: "pluie", label: tr("Pluie"), path: "M7 15a5 5 0 0 1-.5-9.98A6 6 0 0 1 18 5a4.5 4.5 0 0 1-.5 10z M8 18l-1 3 M12 18l-1 3 M16 18l-1 3", keywords: tr("meteo averse") },
      { id: "orage", label: tr("Orage"), path: "M7 14a5 5 0 0 1-.5-9.98A6 6 0 0 1 18 4a4.5 4.5 0 0 1-.5 10 M13 13l-3 4h4l-3 4", keywords: tr("tempete eclair") },
      { id: "neige", label: tr("Neige"), path: "M12 2v20 M3.3 7l17.4 10 M3.3 17l17.4-10 M9.5 4l2.5 2 2.5-2 M9.5 20l2.5-2 2.5 2", keywords: tr("hiver flocon froid ski") },
      { id: "vent", label: tr("Vent"), path: "M3 8h10a3 3 0 1 0-3-3 M3 12h15a3 3 0 1 1-3 3 M3 16h7", keywords: tr("air brise") },
      { id: "arcenciel", label: tr("Arc-en-ciel"), path: "M2 18a10 10 0 0 1 20 0 M5.5 18a6.5 6.5 0 0 1 13 0 M9 18a3 3 0 0 1 6 0", keywords: tr("couleurs espoir") },
      { id: "vague", label: tr("Mer"), path: "M2 8c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2 M2 13c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2 M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2", keywords: tr("ocean plage vagues") },
      { id: "goutte", label: tr("Eau"), path: "M12 3.5s-6 6.8-6 11a6 6 0 0 0 12 0c0-4.2-6-11-6-11z", keywords: tr("eau hydratation boire") },
      { id: "flamme", label: tr("Énergie"), path: "M12 21.5c-3.9 0-6.5-2.6-6.5-6.2 0-3.9 3.3-5.6 3.8-9.8 2.4 1.8 3.8 3.7 4.2 6.3.9-.7 1.5-1.8 1.6-3 1.9 1.9 3.4 4.2 3.4 6.8 0 3.4-2.6 5.9-6.5 5.9z", keywords: tr("energie feu motivation") },
      { id: "eclair", label: tr("Électricité"), path: "M13 2.5L4.5 13.5h7l-1 8 8.5-11h-7z", keywords: tr("electricite energie rapide") },
    ],
  },
  {
    id: "animaux",
    label: tr("Animaux"),
    icon: "animal",
    symbols: [
      { id: "animal", label: tr("Animal"), path: "M12 21c-3.2 0-5.5-1.6-5.5-4.2 0-2.3 2.6-4.8 5.5-4.8s5.5 2.5 5.5 4.8c0 2.6-2.3 4.2-5.5 4.2z M5.5 11a1.8 1.8 0 1 0 0-3.6a1.8 1.8 0 0 0 0 3.6z M9.5 7.5a1.8 1.8 0 1 0 0-3.6a1.8 1.8 0 0 0 0 3.6z M14.5 7.5a1.8 1.8 0 1 0 0-3.6a1.8 1.8 0 0 0 0 3.6z M18.5 11a1.8 1.8 0 1 0 0-3.6a1.8 1.8 0 0 0 0 3.6z", keywords: tr("patte animaux compagnie veterinaire") },
      { id: "chat", label: tr("Chat"), path: "M5 4l3 4.5h8L19 4v9a7 7 0 0 1-14 0z M9.5 13h.01 M14.5 13h.01 M11 16.5h2", keywords: tr("chaton animal compagnie") },
      { id: "chien", label: tr("Chien"), path: "M6 9.5C6 7.5 8.5 6 12 6s6 1.5 6 3.5V14a6 6 0 0 1-12 0z M8 6.3C5 6 3 8 3.5 12c.2 1.3 1.5 1.8 2.5 1.3 M16 6.3c3-.3 5 1.7 4.5 5.7-.2 1.3-1.5 1.8-2.5 1.3 M9.5 11h.01 M14.5 11h.01 M11 15h2l-1 1.2z", keywords: tr("chiot promenade animal compagnie") },
      { id: "oiseau", label: tr("Oiseau"), path: "M4 18h8a7 7 0 0 0 7-7l2-2-3-.5A4.5 4.5 0 0 0 10 10c0 1.5-.5 3-2 4.5z M15.5 9.5h.01 M9 15c2 0 4-1 5-3", keywords: tr("oiseaux voler") },
      { id: "poisson", label: tr("Poisson"), path: "M3 7l3 5-3 5 M6 12c2.5-4 6-6 9-6 3 0 5.5 2.5 6.5 6-1 3.5-3.5 6-6.5 6-3 0-6.5-2-9-6z M16.5 10.5h.01", keywords: tr("peche aquarium mer") },
      { id: "lapin", label: tr("Lapin"), path: "M9 9V4.5a1.5 1.5 0 0 1 3 0V9 M12 9V4.5a1.5 1.5 0 0 1 3 0V9 M6 15a6 6 0 0 1 12 0c0 3-2.5 5-6 5s-6-2-6-5z M10 14.5h.01 M14 14.5h.01", keywords: tr("paques rongeur") },
      { id: "papillon", label: tr("Papillon"), path: "M12 8v12 M12 9c-1-3-4-5-7-5-1.5 0-2 1-2 2.5C3 10 6 12 9 12c-2.5.5-4 2.5-4 4.5 0 1.5 1 2.5 2.5 2.5 2 0 4-2.5 4.5-5 M12 9c1-3 4-5 7-5 1.5 0 2 1 2 2.5C21 10 18 12 15 12c2.5.5 4 2.5 4 4.5 0 1.5-1 2.5-2.5 2.5-2 0-4-2.5-4.5-5 M10 4l2 4 2-4", keywords: tr("insecte printemps changement") },
      { id: "tortue", label: tr("Tortue"), path: "M5 14a7 5 0 0 1 14 0z M3 14h18 M19 12.5c1-.5 3 0 3 1.5s-1.5 1.5-3 1 M7 14l-1 3 M17 14l1 3 M10 9.5l2 4 2-4", keywords: tr("lenteur patience") },
    ],
  },
  {
    id: "reperes",
    label: tr("Repères et formes"),
    icon: "etoile",
    symbols: [
      { id: "etoile", label: tr("Étoile"), path: "M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z", keywords: tr("favori important prefere") },
      { id: "drapeau", label: tr("Drapeau"), path: ICONS.flag, keywords: tr("priorite signal") },
      { id: "calendrier", label: tr("Calendrier"), path: ICONS.calendar, keywords: tr("date agenda planning") },
      { id: "horloge", label: tr("Horloge"), path: ICONS.clock, keywords: tr("heure temps") },
      { id: "message", label: tr("Message"), path: "M4 5h16v11H10l-5 4v-4H4z", keywords: tr("bulle conversation") },
      { id: "enveloppe", label: tr("Courrier"), path: "M3 6h18v12H3z M3.5 6.5l8.5 6.5 8.5-6.5", keywords: tr("courrier lettre email") },
      { id: "cloche", label: tr("Notification"), path: ICONS.bell, keywords: tr("rappel alerte sonnerie") },
      { id: "epingle", label: tr("Épingle"), path: ICONS.pin, keywords: tr("epingler fixer") },
      { id: "signet", label: tr("Marque-page"), path: "M6 3h12v18l-6-4-6 4z", keywords: tr("favori signet lecture") },
      { id: "etiquette", label: tr("Étiquette"), path: ICONS.tag, keywords: tr("tag categorie prix") },
      { id: "lien", label: tr("Lien"), path: ICONS.link, keywords: tr("relier chaine url") },
      { id: "loupe", label: tr("Recherche"), path: ICONS.search, keywords: tr("chercher trouver") },
      { id: "coche", label: tr("Validé"), path: "M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M8 12l3 3 5-6", keywords: tr("fait termine ok") },
      { id: "info", label: tr("Information"), path: ICONS.info, keywords: tr("aide renseignement") },
      { id: "alerte", label: tr("Attention"), path: ICONS.warning, keywords: tr("urgent danger important") },
      { id: "sourire", label: tr("Sourire"), path: "M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M8 14c1.2 1.6 2.5 2.2 4 2.2s2.8-.6 4-2.2 M9 9.5h.01 M15 9.5h.01", keywords: tr("humeur joie content") },
      { id: "couronne", label: tr("Couronne"), path: "M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z", keywords: tr("roi reine meilleur") },
      { id: "diamant", label: tr("Diamant"), path: "M6 3h12l3.5 6L12 21 2.5 9z M2.5 9h19 M12 21L8.5 9 10 3 M12 21l3.5-12L14 3", keywords: tr("precieux luxe bijou") },
      { id: "infini", label: tr("Infini"), path: "M12 12c-2-2.7-3.8-4-5.5-4a4 4 0 0 0 0 8c1.7 0 3.5-1.3 5.5-4s3.8-4 5.5-4a4 4 0 0 1 0 8c-1.7 0-3.5-1.3-5.5-4z", keywords: tr("toujours illimite") },
      { id: "fleche", label: tr("Flèche"), path: "M5 12h14 M13 6l6 6-6 6", keywords: tr("direction suivant") },
      { id: "cercle", label: tr("Cercle"), path: "M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z", keywords: tr("rond forme") },
      { id: "carre", label: tr("Carré"), path: "M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z", keywords: tr("forme") },
      { id: "triangle", label: tr("Triangle"), path: "M12 4l9 16H3z", keywords: tr("forme") },
      { id: "losange", label: tr("Losange"), path: "M12 3l9 9-9 9-9-9z", keywords: tr("forme") },
      { id: "hexagone", label: tr("Hexagone"), path: "M12 2.5l8.5 4.9v9.2L12 21.5l-8.5-4.9V7.4z", keywords: tr("forme ruche") },
    ],
  },
];

export const SYMBOLS: readonly SymbolDef[] = SYMBOL_CATEGORIES.flatMap((c) => c.symbols);

const BY_ID = new Map(SYMBOLS.map((s) => [s.id, s]));

export function symbolOf(id: string | null | undefined): SymbolDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** Tracé d'un symbole ; `fallback` s'il est inconnu (ancienne version, valeur effacée). */
export function symbolPath(id: string | null | undefined, fallback: string): string {
  return symbolOf(id)?.path ?? fallback;
}
