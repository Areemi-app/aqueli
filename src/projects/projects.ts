/**
 * Projets côté interface (src-tauri/src/data/projects.rs) : statuts, avancement, colonnes du
 * tableau, jalons, modèles. Fonctions pures.
 */
import { addDays, daysBetween, type DayKey } from "../tasks/day";
import type { Task, TaskInput } from "../tasks/tasks";
import { tr } from "../i18n/i18n";

export type ProjectStatus = "en-cours" | "en-pause" | "termine";

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  startDate: DayKey | null;
  endDate: DayKey | null;
  /** Symbole (src/components/symbols.ts). */
  icon: string;
  color: string | null;
  spaceId: string | null;
  position: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ProjectInput = Pick<Project, "name" | "description" | "status" | "startDate" | "endDate" | "icon" | "color" | "spaceId">;

export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  dueDate: DayKey | null;
  doneAt: number | null;
  position: number;
}

export type MilestoneInput = Pick<Milestone, "title" | "dueDate">;

export const STATUS_LABELS: Record<ProjectStatus, string> = { "en-cours": tr("En cours"), "en-pause": tr("En pause"), termine: tr("Terminé") };

export function toInput(p: Project): ProjectInput {
  const { name, description, status, startDate, endDate, icon, color, spaceId } = p;
  return { name, description, status, startDate, endDate, icon, color, spaceId };
}

/** Colonnes du tableau d'un projet. */
export type Stage = "a-faire" | "en-cours" | "termine";

export const STAGES: readonly { id: Stage; label: string }[] = [
  { id: "a-faire", label: tr("À faire") },
  { id: "en-cours", label: tr("En cours") },
  { id: "termine", label: tr("Terminé") },
];

export function stageOf(t: Pick<Task, "doneAt" | "doing">): Stage {
  return t.doneAt !== null ? "termine" : t.doing ? "en-cours" : "a-faire";
}

export interface Progress {
  done: number;
  total: number;
  /** 0 à 100. */
  percent: number;
}

/** Avancement : tâches et jalons terminés, sur le total. */
export function progressOf(tasks: readonly Pick<Task, "doneAt">[], milestones: readonly Pick<Milestone, "doneAt">[]): Progress {
  const total = tasks.length + milestones.length;
  const done = tasks.filter((t) => t.doneAt !== null).length + milestones.filter((m) => m.doneAt !== null).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((100 * done) / total) };
}

/** « Dans 12 jours », « Aujourd'hui », « Dépassée de 3 jours » : échéance d'un projet ou d'un jalon. */
export function deadlineLabel(day: DayKey, today: DayKey): string {
  const n = daysBetween(today, day);
  if (n === 0) return tr("Aujourd'hui");
  if (n === 1) return tr("Demain");
  if (n > 0) return tr("Dans {n} jours", { n });
  return n === -1 ? tr("Dépassée d'un jour") : tr("Dépassée de {n} jours", { n: -n });
}

export type HealthLevel = "bon" | "attention" | "retard";

export interface Health {
  level: HealthLevel;
  /** Ce qui l'explique : « 2 tâches en retard », « Échéance dépassée »… */
  reasons: string[];
  /** Tâches ouvertes en retard, et à faire dans les 7 prochains jours. */
  late: number;
  week: number;
}

export const HEALTH_LABELS: Record<HealthLevel, string> = { bon: tr("Dans les temps"), attention: tr("À surveiller"), retard: tr("En retard|rythme") };

/**
 * État d'un projet en cours : en retard (échéance dépassée, étape dépassée, 3 tâches en retard
 * ou plus), à surveiller (une tâche en retard, ou avancement loin derrière le temps écoulé), sinon
 * dans les temps. Nul pour un projet en pause ou terminé.
 */
export function healthOf(
  project: Pick<Project, "status" | "startDate" | "endDate">,
  tasks: readonly Pick<Task, "doneAt" | "dueDate">[],
  milestones: readonly Pick<Milestone, "doneAt" | "dueDate">[],
  today: DayKey,
): Health | null {
  if (project.status !== "en-cours") return null;
  const open = tasks.filter((t) => t.doneAt === null);
  const late = open.filter((t) => t.dueDate !== null && t.dueDate < today).length;
  const week = open.filter((t) => t.dueDate !== null && t.dueDate >= today && t.dueDate <= addDays(today, 6)).length;
  const lateSteps = milestones.filter((m) => m.doneAt === null && m.dueDate !== null && m.dueDate < today).length;
  const progress = progressOf(tasks, milestones);
  const reasons: string[] = [];
  const endPassed = project.endDate !== null && project.endDate < today && progress.percent < 100;
  if (endPassed) reasons.push(tr("Échéance dépassée"));
  if (lateSteps > 0) reasons.push(lateSteps > 1 ? tr("{lateSteps} étapes dépassées", { lateSteps }) : tr("1 étape dépassée"));
  if (late > 0) reasons.push(late > 1 ? tr("{late} tâches en retard", { late }) : tr("1 tâche en retard"));
  // Avancement loin derrière le temps écoulé entre le début et l'échéance.
  let behind = false;
  if (project.startDate && project.endDate && project.startDate < project.endDate && today > project.startDate && !endPassed && progress.total > 0) {
    const elapsed = Math.min(1, daysBetween(project.startDate, today) / daysBetween(project.startDate, project.endDate));
    behind = progress.percent < elapsed * 100 - 20;
    if (behind) reasons.push(tr("Avancement en retard sur le calendrier"));
  }
  const level: HealthLevel = endPassed || lateSteps > 0 || late >= 3 ? "retard" : late > 0 || behind ? "attention" : "bon";
  return { level, reasons, late, week };
}

/** Prochaine action d'un projet : la tâche en cours, sinon celle dont l'échéance arrive la première. */
export function nextAction<T extends Pick<Task, "doneAt" | "doing" | "dueDate" | "createdAt">>(tasks: readonly T[]): T | null {
  const open = tasks.filter((t) => t.doneAt === null);
  open.sort((a, b) => Number(b.doing) - Number(a.doing) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.createdAt - b.createdAt);
  return open[0] ?? null;
}

/** Position (0 à 1) d'une date entre deux autres, pour la frise du projet. */
export function timelinePosition(day: DayKey, from: DayKey, to: DayKey): number {
  const span = daysBetween(from, to);
  return span <= 0 ? 0 : Math.min(1, Math.max(0, daysBetween(from, day) / span));
}

/** Jalons dans l'ordre : à venir par date (sans date à la fin), puis les atteints. */
export function sortMilestones(list: readonly Milestone[]): Milestone[] {
  return [...list].sort((a, b) => {
    if ((a.doneAt === null) !== (b.doneAt === null)) return a.doneAt === null ? -1 : 1;
    if (a.dueDate !== b.dueDate) return a.dueDate === null ? 1 : b.dueDate === null ? -1 : a.dueDate < b.dueDate ? -1 : 1;
    return a.position - b.position;
  });
}

/** Prochain jalon à atteindre. */
export function nextMilestone(list: readonly Milestone[]): Milestone | null {
  return sortMilestones(list).find((m) => m.doneAt === null) ?? null;
}

/** Projets dans l'ordre : en cours, en pause, terminés ; archivés à part. */
export function sortProjects(list: readonly Project[]): Project[] {
  const rank: Record<ProjectStatus, number> = { "en-cours": 0, "en-pause": 1, termine: 2 };
  return [...list].sort((a, b) => Number(a.archived) - Number(b.archived) || rank[a.status] - rank[b.status] || a.position - b.position);
}

// ——— Modèles ———

interface TemplateTask {
  title: string;
  /** Échéance : jours après le début du projet. */
  day?: number;
}

export interface ProjectTemplate {
  id: string;
  label: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  /** Durée conseillée, en jours (fin du projet). */
  days: number;
  tasks: readonly TemplateTask[];
  milestones: readonly { title: string; day: number }[];
}

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    id: "demenagement",
    label: tr("Déménagement"),
    name: tr("Déménagement"),
    icon: "maison",
    color: "#e0671f",
    description: tr("Cartons, démarches et changements d'adresse."),
    days: 45,
    tasks: [
      { title: tr("Donner le préavis du logement"), day: 0 },
      { title: tr("Comparer les devis de déménageurs ou réserver un camion"), day: 5 },
      { title: tr("Demander une autorisation de stationnement"), day: 10 },
      { title: tr("Acheter des cartons et du ruban adhésif"), day: 14 },
      { title: tr("Trier, donner ou vendre ce qui ne part pas"), day: 18 },
      { title: tr("Résilier ou transférer l'électricité et le gaz"), day: 28 },
      { title: tr("Transférer la box internet"), day: 28 },
      { title: tr("Mettre à jour l'assurance habitation"), day: 30 },
      { title: tr("Faire suivre le courrier"), day: 35 },
      { title: tr("Préparer un carton « premiers jours »"), day: 40 },
      { title: tr("Faire l'état des lieux de sortie"), day: 43 },
      { title: tr("Changer d'adresse : banque, employeur, assurance maladie, impôts"), day: 45 },
    ],
    milestones: [
      { title: tr("Cartons prêts"), day: 40 },
      { title: tr("Jour du déménagement"), day: 42 },
    ],
  },
  {
    id: "voyage",
    label: tr("Voyage"),
    name: tr("Voyage"),
    icon: "avion",
    color: "#2d9be0",
    description: tr("Réservations, papiers et valise."),
    days: 30,
    tasks: [
      { title: tr("Fixer le budget"), day: 0 },
      { title: tr("Réserver le transport"), day: 2 },
      { title: tr("Réserver l'hébergement"), day: 4 },
      { title: tr("Vérifier les passeports ou cartes d'identité"), day: 5 },
      { title: tr("Vérifier les visas et les vaccins"), day: 7 },
      { title: tr("Souscrire une assurance voyage"), day: 10 },
      { title: tr("Préparer l'itinéraire et les visites"), day: 18 },
      { title: tr("Prévoir la garde des animaux ou l'arrosage des plantes"), day: 22 },
      { title: tr("Prévenir la banque ou changer des devises"), day: 25 },
      { title: tr("Télécharger ou imprimer les billets"), day: 28 },
      { title: tr("Faire la valise"), day: 29 },
    ],
    milestones: [
      { title: tr("Réservations faites"), day: 10 },
      { title: tr("Départ"), day: 30 },
    ],
  },
  {
    id: "rentree",
    label: tr("Rentrée scolaire"),
    name: tr("Rentrée"),
    icon: "ecole",
    color: "#7a5ce6",
    description: tr("Fournitures, inscriptions et organisation."),
    days: 21,
    tasks: [
      { title: tr("Récupérer la liste des fournitures"), day: 0 },
      { title: tr("Acheter les fournitures"), day: 5 },
      { title: tr("Renouveler l'assurance scolaire"), day: 7 },
      { title: tr("Inscrire aux activités et au sport"), day: 7 },
      { title: tr("Prévoir la cantine et la garde périscolaire"), day: 10 },
      { title: tr("Faire le point sur les vêtements et les chaussures"), day: 12 },
      { title: tr("Prendre rendez-vous chez le médecin ou le dentiste"), day: 14 },
      { title: tr("Étiqueter les affaires"), day: 18 },
      { title: tr("Préparer le cartable"), day: 20 },
    ],
    milestones: [{ title: tr("Jour de la rentrée"), day: 21 }],
  },
  {
    id: "mariage",
    label: tr("Mariage"),
    name: tr("Mariage"),
    icon: "coeur",
    color: "#e0508a",
    description: tr("Lieu, invités, prestataires et formalités."),
    days: 300,
    tasks: [
      { title: tr("Fixer la date et le budget"), day: 0 },
      { title: tr("Établir la liste des invités"), day: 14 },
      { title: tr("Réserver le lieu de réception"), day: 30 },
      { title: tr("Choisir le traiteur"), day: 60 },
      { title: tr("Réserver le photographe et la musique"), day: 90 },
      { title: tr("Déposer le dossier à la mairie"), day: 120 },
      { title: tr("Envoyer les faire-part"), day: 180 },
      { title: tr("Choisir les tenues"), day: 200 },
      { title: tr("Préparer le plan de table"), day: 270 },
      { title: tr("Confirmer les prestataires"), day: 290 },
    ],
    milestones: [
      { title: tr("Lieu réservé"), day: 30 },
      { title: tr("Faire-part envoyés"), day: 180 },
      { title: tr("Jour du mariage"), day: 300 },
    ],
  },
  {
    id: "bebe",
    label: tr("Arrivée d'un bébé"),
    name: tr("Arrivée de bébé"),
    icon: "famille",
    color: "#f0a52c",
    description: tr("Suivi, démarches, chambre et équipement."),
    days: 240,
    tasks: [
      { title: tr("Déclarer la grossesse"), day: 0 },
      { title: tr("Choisir la maternité"), day: 14 },
      { title: tr("Planifier les rendez-vous de suivi"), day: 14 },
      { title: tr("Chercher un mode de garde"), day: 60 },
      { title: tr("Préparer la chambre"), day: 150 },
      { title: tr("Acheter le siège auto et la poussette"), day: 170 },
      { title: tr("Prévenir l'employeur et préparer le congé"), day: 180 },
      { title: tr("Préparer la valise de maternité"), day: 210 },
      { title: tr("Déclarer la naissance à la mairie"), day: 243 },
      { title: tr("Ajouter l'enfant à la mutuelle et aux allocations familiales"), day: 250 },
    ],
    milestones: [
      { title: tr("Chambre prête"), day: 200 },
      { title: tr("Naissance prévue"), day: 240 },
    ],
  },
  {
    id: "travaux",
    label: tr("Travaux de rénovation"),
    name: tr("Travaux"),
    icon: "outils",
    color: "#8a6a3a",
    description: tr("Devis, autorisations, chantier et réception."),
    days: 90,
    tasks: [
      { title: tr("Définir les travaux et le budget"), day: 0 },
      { title: tr("Demander trois devis"), day: 7 },
      { title: tr("Vérifier les autorisations en mairie"), day: 14 },
      { title: tr("Vérifier les aides disponibles"), day: 21 },
      { title: tr("Choisir l'artisan et signer le devis"), day: 21 },
      { title: tr("Commander les matériaux"), day: 30 },
      { title: tr("Vider et protéger les pièces"), day: 40 },
      { title: tr("Faire un point de chantier"), day: 60 },
      { title: tr("Faire la réception des travaux"), day: 85 },
      { title: tr("Classer les factures et les garanties"), day: 90 },
    ],
    milestones: [
      { title: tr("Devis signé"), day: 21 },
      { title: tr("Début du chantier"), day: 45 },
      { title: tr("Fin des travaux"), day: 85 },
    ],
  },
  {
    id: "fete",
    label: tr("Fête d'anniversaire"),
    name: tr("Fête d'anniversaire"),
    icon: "cadeau",
    color: "#e04848",
    description: tr("Invités, lieu, repas et décoration."),
    days: 30,
    tasks: [
      { title: tr("Fixer la date et le budget"), day: 0 },
      { title: tr("Établir la liste des invités"), day: 2 },
      { title: tr("Réserver le lieu"), day: 5 },
      { title: tr("Envoyer les invitations"), day: 7 },
      { title: tr("Commander le gâteau et prévoir le repas"), day: 20 },
      { title: tr("Préparer la décoration et la musique"), day: 25 },
      { title: tr("Acheter le cadeau"), day: 25 },
      { title: tr("Confirmer le nombre d'invités"), day: 27 },
      { title: tr("Faire les courses"), day: 29 },
    ],
    milestones: [
      { title: tr("Invitations envoyées"), day: 7 },
      { title: tr("Jour de la fête"), day: 30 },
    ],
  },
  {
    id: "emploi",
    label: tr("Recherche d'emploi"),
    name: tr("Recherche d'emploi"),
    icon: "personne",
    color: "#2d6ff0",
    description: tr("CV, candidatures, relances et entretiens."),
    days: 60,
    tasks: [
      { title: tr("Mettre à jour le CV"), day: 0 },
      { title: tr("Rédiger une lettre de motivation type"), day: 3 },
      { title: tr("Mettre à jour son profil professionnel en ligne"), day: 5 },
      { title: tr("Lister les entreprises visées"), day: 7 },
      { title: tr("Créer des alertes sur les sites d'offres"), day: 7 },
      { title: tr("Prévenir son réseau"), day: 10 },
      { title: tr("Envoyer les premières candidatures"), day: 14 },
      { title: tr("Préparer les entretiens"), day: 21 },
      { title: tr("Faire le point sur les candidatures"), day: 30 },
      { title: tr("Relancer les candidatures sans réponse"), day: 45 },
    ],
    milestones: [{ title: tr("Premier entretien"), day: 30 }],
  },
  {
    id: "voiture",
    label: tr("Achat d'une voiture"),
    name: tr("Achat d'une voiture"),
    icon: "voiture",
    color: "#1f9a6e",
    description: tr("Budget, essais, papiers et assurance."),
    days: 45,
    tasks: [
      { title: tr("Fixer le budget et le financement"), day: 0 },
      { title: tr("Lister les besoins : places, coffre, énergie"), day: 2 },
      { title: tr("Comparer les modèles"), day: 7 },
      { title: tr("Faire des essais"), day: 14 },
      { title: tr("Vérifier l'historique et le contrôle technique (occasion)"), day: 20 },
      { title: tr("Négocier le prix"), day: 25 },
      { title: tr("Assurer le véhicule"), day: 30 },
      { title: tr("Faire la carte grise"), day: 35 },
      { title: tr("Vendre ou faire reprendre l'ancien véhicule"), day: 40 },
    ],
    milestones: [
      { title: tr("Modèle choisi"), day: 20 },
      { title: tr("Remise des clés"), day: 40 },
    ],
  },
  {
    id: "logement",
    label: tr("Achat d'un logement"),
    name: tr("Achat d'un logement"),
    icon: "cle",
    color: "#3d6fb8",
    description: tr("Financement, visites, compromis et notaire."),
    days: 180,
    tasks: [
      { title: tr("Calculer sa capacité d'emprunt"), day: 0 },
      { title: tr("Définir les critères : quartier, surface, budget"), day: 3 },
      { title: tr("Visiter les biens"), day: 30 },
      { title: tr("Faire une offre"), day: 60 },
      { title: tr("Signer le compromis de vente"), day: 75 },
      { title: tr("Comparer les offres de prêt"), day: 80 },
      { title: tr("Souscrire l'assurance emprunteur"), day: 100 },
      { title: tr("Obtenir l'accord de prêt"), day: 110 },
      { title: tr("Assurer le logement"), day: 170 },
      { title: tr("Signer l'acte chez le notaire"), day: 180 },
    ],
    milestones: [
      { title: tr("Compromis signé"), day: 75 },
      { title: tr("Prêt accordé"), day: 110 },
      { title: tr("Remise des clés"), day: 180 },
    ],
  },
  {
    id: "examen",
    label: tr("Préparer un examen"),
    name: tr("Révisions"),
    icon: "livre",
    color: "#7a4fd0",
    description: tr("Programme, planning, fiches et examen blanc."),
    days: 60,
    tasks: [
      { title: tr("Récupérer le programme et les annales"), day: 0 },
      { title: tr("Établir un planning de révision"), day: 1 },
      { title: tr("Faire des fiches par chapitre"), day: 14 },
      { title: tr("Revoir les points faibles"), day: 30 },
      { title: tr("Faire un examen blanc"), day: 45 },
      { title: tr("Préparer les documents et le trajet"), day: 55 },
      { title: tr("Se reposer la veille"), day: 59 },
    ],
    milestones: [
      { title: tr("Fiches terminées"), day: 30 },
      { title: tr("Jour de l'examen"), day: 60 },
    ],
  },
  {
    id: "animal",
    label: tr("Adopter un animal"),
    name: tr("Adoption"),
    icon: "animal",
    color: "#2fae4a",
    description: tr("Choix, matériel, vétérinaire et garde."),
    days: 30,
    tasks: [
      { title: tr("Choisir un animal adapté au logement"), day: 0 },
      { title: tr("Contacter un refuge ou un éleveur"), day: 3 },
      { title: tr("Préparer le coin de l'animal"), day: 10 },
      { title: tr("Acheter le matériel et la nourriture"), day: 12 },
      { title: tr("Choisir un vétérinaire"), day: 14 },
      { title: tr("Prévoir la garde pendant les absences"), day: 20 },
      { title: tr("Faire identifier et assurer l'animal"), day: 28 },
      { title: tr("Prendre rendez-vous pour les vaccins"), day: 30 },
    ],
    milestones: [{ title: tr("Arrivée de l'animal"), day: 21 }],
  },
  {
    id: "fetes-fin-annee",
    label: tr("Fêtes de fin d'année"),
    name: tr("Fêtes de fin d'année"),
    icon: "etoile",
    color: "#c23d5a",
    description: tr("Cadeaux, invités, menu et décoration."),
    days: 40,
    tasks: [
      { title: tr("Fixer le budget des cadeaux"), day: 0 },
      { title: tr("Faire la liste des cadeaux"), day: 3 },
      { title: tr("Organiser qui reçoit et qui vient"), day: 5 },
      { title: tr("Commander les cadeaux"), day: 15 },
      { title: tr("Décorer la maison"), day: 20 },
      { title: tr("Prévoir le menu"), day: 25 },
      { title: tr("Emballer les cadeaux"), day: 35 },
      { title: tr("Faire les courses du repas"), day: 38 },
    ],
    milestones: [
      { title: tr("Cadeaux achetés"), day: 30 },
      { title: tr("Réveillon"), day: 40 },
    ],
  },
  {
    id: "tri",
    label: tr("Grand tri et rangement"),
    name: tr("Grand tri"),
    icon: "panier",
    color: "#16a3a3",
    description: tr("Pièce par pièce : trier, donner, ranger."),
    days: 30,
    tasks: [
      { title: tr("Faire le tour des pièces"), day: 0 },
      { title: tr("Trier les vêtements"), day: 3 },
      { title: tr("Trier la cuisine et les placards"), day: 7 },
      { title: tr("Trier les papiers administratifs"), day: 10 },
      { title: tr("Donner ou vendre ce qui ne sert plus"), day: 14 },
      { title: tr("Déposer le reste à la déchetterie"), day: 18 },
      { title: tr("Ranger avec des boîtes étiquetées"), day: 24 },
      { title: tr("Faire un grand ménage"), day: 28 },
    ],
    milestones: [{ title: tr("Tout est trié"), day: 21 }],
  },
  {
    id: "activite",
    label: tr("Lancer son activité"),
    name: tr("Lancement de l'activité"),
    icon: "idee",
    color: "#e3a712",
    description: tr("Offre, statut, déclaration et premiers clients."),
    days: 90,
    tasks: [
      { title: tr("Définir l'offre et la clientèle"), day: 0 },
      { title: tr("Étudier la concurrence et les prix"), day: 7 },
      { title: tr("Choisir le statut juridique"), day: 14 },
      { title: tr("Déclarer l'activité"), day: 21 },
      { title: tr("Ouvrir un compte bancaire dédié"), day: 25 },
      { title: tr("Souscrire une assurance professionnelle"), day: 30 },
      { title: tr("Créer un logo et une présence en ligne"), day: 40 },
      { title: tr("Préparer des modèles de devis et de factures"), day: 45 },
      { title: tr("Trouver les premiers clients"), day: 60 },
      { title: tr("Mettre en place le suivi des comptes"), day: 75 },
    ],
    milestones: [
      { title: tr("Activité déclarée"), day: 21 },
      { title: tr("Premier client"), day: 60 },
    ],
  },
  {
    id: "potager",
    label: tr("Potager"),
    name: tr("Potager"),
    icon: "feuille",
    color: "#7f9a14",
    description: tr("Emplacement, plantations, entretien et récoltes."),
    days: 120,
    tasks: [
      { title: tr("Choisir l'emplacement"), day: 0 },
      { title: tr("Choisir les légumes de saison"), day: 3 },
      { title: tr("Préparer la terre"), day: 7 },
      { title: tr("Acheter les graines et les plants"), day: 10 },
      { title: tr("Semer et planter"), day: 14 },
      { title: tr("Installer l'arrosage"), day: 14 },
      { title: tr("Pailler"), day: 30 },
      { title: tr("Désherber et surveiller les maladies"), day: 45 },
      { title: tr("Récolter"), day: 90 },
    ],
    milestones: [
      { title: tr("Plantations faites"), day: 14 },
      { title: tr("Première récolte"), day: 90 },
    ],
  },
];

/** Projet, tâches et jalons d'un modèle, datés à partir de `start`. */
export function fromTemplate(
  template: ProjectTemplate,
  start: DayKey,
  spaceId: string | null,
): { project: ProjectInput; tasks: TaskInput[]; milestones: MilestoneInput[] } {
  return {
    project: {
      name: template.name,
      description: template.description,
      status: "en-cours",
      startDate: start,
      endDate: addDays(start, template.days),
      icon: template.icon,
      color: template.color,
      spaceId,
    },
    tasks: template.tasks.map((t) => ({
      title: t.title,
      notes: "",
      spaceId,
      dueDate: t.day === undefined ? null : addDays(start, t.day),
      dueTime: null,
      priority: 0,
      estimate: null,
      tags: [],
      subtasks: [],
      recurrence: null,
      color: null,
      reminder: null,
      inbox: false,
    })),
    milestones: template.milestones.map((m) => ({ title: m.title, dueDate: addDays(start, m.day) })),
  };
}
