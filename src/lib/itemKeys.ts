/**
 * Raccourcis des éléments de liste (tâche, événement, obligation, note, carnet…), les mêmes
 * dans tous les modules : Entrée ouvre, Suppr supprime, F2 renomme, Ctrl+D duplique. Les menus
 * du clic droit affichent ces libellés à côté des mêmes actions. Dupliquer et Nouvel élément
 * suivent les raccourcis choisis dans Paramètres › Clavier.
 */
import type { KeyboardEvent } from "react";
import { activeShortcuts, matches, shortcutText } from "../app/shortcuts";
import type { MenuAction, MenuEntry } from "../components/ContextMenu";
import { tr } from "../i18n/i18n";

export const KEYS = {
  open: tr("Entrée"),
  remove: tr("Suppr"),
  rename: "F2",
  get duplicate(): string {
    return shortcutText("duplicate");
  },
  get create(): string {
    return shortcutText("newItem");
  },
  find: "Ctrl+F",
  print: "Ctrl+P",
};

export interface ItemActions {
  open?: () => void;
  remove?: () => void;
  rename?: () => void;
  duplicate?: () => void;
}

/** Vrai pendant la saisie d'un texte : les touches servent au texte. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

/** L'action d'une touche, s'il y en a une (fonction pure, testée). */
export function itemAction(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"> & { code?: string },
  actions: ItemActions,
  onButton: boolean,
): (() => void) | undefined {
  const ctrl = e.ctrlKey || e.metaKey;
  const plain = !ctrl && !e.altKey && !e.shiftKey;
  // Entrée sur un bouton : le clic du bouton ouvre déjà l'élément.
  if (e.key === "Enter" && plain && !onButton) return actions.open;
  if (e.key === "Delete" && plain) return actions.remove;
  if (e.key === "F2" && plain) return actions.rename;
  if (matches({ key: e.key, code: e.code ?? "", ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey }, activeShortcuts().duplicate)) {
    return actions.duplicate;
  }
  return undefined;
}

/** Gestionnaire \`onKeyDown\` d'un élément de liste (ou de son conteneur). */
export function onItemKeys(actions: ItemActions): (e: KeyboardEvent) => void {
  return (e) => {
    if (e.defaultPrevented || isTyping(e.target)) return;
    const onButton = e.target instanceof HTMLElement && (e.target.tagName === "BUTTON" || e.target.tagName === "A");
    const run = itemAction(e, actions, onButton);
    if (!run) return;
    e.preventDefault();
    e.stopPropagation();
    run();
  };
}

/** Actions d'un menu du clic droit qui portent un raccourci (Entrée, Suppr, F2, Ctrl+D). */
export function menuKeys(entries: readonly MenuEntry[]): ItemActions {
  // Les raccourcis valent aussi pour les choix rangés dans un sous-menu.
  const flat = (list: readonly MenuEntry[]): MenuAction[] =>
    list.flatMap((e) => (e === "separator" ? [] : e.submenu ? [e, ...flat(e.submenu)] : [e]));
  const all = flat(entries);
  const find = (label: string) => all.find((e) => e.shortcut === label && !e.disabled && !e.submenu)?.run;
  return { open: find(KEYS.open), remove: find(KEYS.remove), rename: find(KEYS.rename), duplicate: find(KEYS.duplicate) };
}
