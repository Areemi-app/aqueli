/**
 * Liste de tous les raccourcis, groupés par endroit : Paramètres › Clavier (où ceux d'Aqueli se
 * modifient) et l'aide (Ctrl+/, en lecture seule).
 */
import { COMMANDS, comboKeys, type CommandId, type ShortcutMap } from "../app/shortcuts";
import { tr } from "../i18n/i18n";

export function Keys({ keys, custom }: { keys: readonly string[]; custom?: boolean }) {
  return (
    <span className="shortcut-keys" data-custom={custom || undefined}>
      {keys.map((k, i) => (
        <span key={`${k}${i}`}>
          {i > 0 && <span className="shortcut-plus">+</span>}
          <kbd className="kbd">{k}</kbd>
        </span>
      ))}
    </span>
  );
}

export type Shortcut = { keys: string[]; label: string } | { command: CommandId; label?: string };

export const SHORTCUT_GROUPS: readonly { title: string; shortcuts: readonly Shortcut[] }[] = [
  {
    title: tr("Partout"),
    shortcuts: [
      { command: "palette" },
      { command: "search" },
      { keys: ["Ctrl", "Z"], label: tr("Annuler la dernière action : suppression, modification, déplacement, tâche terminée… (de nouveau pour la précédente)") },
      { command: "newItem" },
      { keys: ["Ctrl", tr("1 à 9")], label: tr("Ouvrir un module, dans l'ordre de la barre latérale") },
      { command: "back" },
      { command: "forward" },
      { command: "spaces" },
      { command: "lock", label: tr("Verrouiller Aqueli") },
      { command: "backup", label: tr("Sauvegarder maintenant (bouton à côté des espaces)") },
      { command: "settings" },
      { command: "help", label: tr("Aide : la rubrique de l'écran affiché") },
      { command: "shortcuts" },
      { keys: ["Ctrl", "P"], label: tr("Imprimer la vue affichée : liste de tâches, semaine, liste, note, obligations, rapport du mois") },
      { keys: [tr("Échap")], label: tr("Fermer une fenêtre ou un menu") },
    ],
  },
  {
    title: tr("Élément d'une liste"),
    shortcuts: [
      { keys: [tr("Entrée")], label: tr("Ouvrir") },
      { keys: [tr("Suppr")], label: tr("Supprimer, avec « Annuler » pendant quelques secondes") },
      { keys: ["F2"], label: tr("Renommer ou modifier (carnet, catégorie, espace)") },
      { command: "duplicate" },
      { keys: [tr("Menu")], label: tr("Menu de l'élément, comme le clic droit (aussi Maj+F10)") },
      { keys: ["↑ ↓"], label: tr("Élément voisin (tâches, notes)") },
    ],
  },
  {
    title: tr("Plusieurs éléments"),
    shortcuts: [
      { keys: ["Ctrl", tr("clic")], label: tr("Ajouter un élément à la sélection, ou l'en retirer") },
      { keys: [tr("Maj"), tr("clic")], label: tr("Sélectionner tous les éléments entre le dernier choisi et celui-ci") },
      { keys: ["Ctrl", "A"], label: tr("Sélectionner toute la liste (tâches, notes, documents, contacts, obligations, listes, opérations du budget, corbeille)") },
      { keys: [tr("Suppr")], label: tr("Supprimer les éléments sélectionnés, avec « Annuler »") },
      { keys: [tr("Échap")], label: tr("Tout désélectionner") },
    ],
  },
  {
    title: tr("Tâches"),
    shortcuts: [
      { keys: [tr("Glisser")], label: tr("Kanban : changer une tâche de colonne (avancement, priorité ou espace)") },
      { keys: [tr("Glisser")], label: tr("Matrice : changer une tâche de quadrant (priorité et échéance ajustées)") },
    ],
  },
  {
    title: tr("Calendrier et planification"),
    shortcuts: [
      { keys: ["← →"], label: tr("Déplacer d'un jour") },
      { keys: ["↑ ↓"], label: tr("Déplacer d'un quart d'heure") },
      { keys: [tr("Maj"), "↑ ↓"], label: tr("Raccourcir ou allonger d'un quart d'heure") },
    ],
  },
  {
    title: tr("Habitudes et Focus"),
    shortcuts: [
      { keys: [tr("Espace|touche")], label: tr("Cocher ou décocher l'habitude du jour") },
      { keys: [tr("Échap")], label: tr("Quitter l'aquarium") },
    ],
  },
  {
    title: tr("Projets et documents"),
    shortcuts: [
      { keys: [tr("Glisser")], label: tr("Changer une tâche de colonne dans le tableau d'un projet (aussi par le clic droit)") },
      { keys: [tr("Glisser")], label: tr("Fichiers sur la fenêtre, écran Documents affiché : ajout aux documents") },
    ],
  },
  {
    title: tr("Listes, budget et objectifs"),
    shortcuts: [
      { keys: ["Ctrl", "N"], label: tr("Listes : ajouter un élément à la liste ouverte ; Budget : nouvelle dépense ; Objectifs : nouvel objectif") },
      { keys: ["Ctrl", "F"], label: tr("Rechercher dans la liste ouverte") },
      { keys: [tr("Entrée")], label: tr("Liste ou Objectifs : ajouter l'élément, l'étape ou la saisie") },
    ],
  },
  {
    title: tr("Notes et journal"),
    shortcuts: [
      { keys: ["Ctrl", "F"], label: tr("Rechercher dans l'écran : notes, journal, contacts, documents") },
      { keys: ["Ctrl", "B"], label: tr("Gras") },
      { keys: ["Ctrl", "I"], label: tr("Italique") },
      { keys: ["Ctrl", "U"], label: tr("Souligné") },
      { keys: ["Ctrl", tr("Maj"), "S"], label: tr("Barré") },
      { keys: ["Ctrl", tr("Maj"), "H"], label: tr("Surlignage") },
      { keys: ["Ctrl", tr("Maj"), "8"], label: tr("Liste à puces") },
      { keys: ["Ctrl", tr("Maj"), "7"], label: tr("Liste numérotée") },
      { keys: ["Ctrl", tr("Maj"), "9"], label: tr("Cases à cocher") },
      { keys: ["Ctrl", "Z"], label: tr("Annuler la saisie") },
      { keys: ["Ctrl", "Y"], label: tr("Rétablir la saisie") },
      { keys: ["[["], label: tr("Lien vers une autre note") },
      { keys: ["#"], label: tr("En début de ligne, puis Espace : titre (« ## » : titre 2, « ### » : titre 3)") },
      { keys: ["-"], label: tr("En début de ligne, puis Espace : liste à puces (« 1. » : liste numérotée)") },
      { keys: ["[ ]"], label: tr("En début de ligne, puis Espace : case à cocher") },
      { keys: [">"], label: tr("En début de ligne, puis Espace : citation") },
    ],
  },
];

export const commandLabel = (id: CommandId) => COMMANDS.find((c) => c.id === id)!.label;

/** Toute la liste, en lecture seule, avec les raccourcis en vigueur. */
export function ShortcutList({ keys, capture }: { keys: ShortcutMap; capture: readonly string[] | null }) {
  return (
    <div className="help-shortcuts">
      {capture && (
        <dl className="shortcut-list help-shortcut-list">
          <div className="shortcut-row">
            <dt>
              <Keys keys={capture} />
            </dt>
            <dd className="shortcut-label">{tr("Capture rapide, depuis n'importe quelle application")}</dd>
          </div>
        </dl>
      )}
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h3 className="help-heading">{group.title}</h3>
          <dl className="shortcut-list help-shortcut-list">
            {group.shortcuts.map((s, i) => (
              <div key={`${i}-${"command" in s ? s.command : s.label}`} className="shortcut-row">
                <dt>
                  <Keys keys={"command" in s ? comboKeys(keys[s.command]) : s.keys} />
                </dt>
                <dd className="shortcut-label">{"command" in s ? (s.label ?? commandLabel(s.command)) : s.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
