/**
 * Saisie de la clé de récupération : on la remet en forme pendant la frappe
 * (« k7pq2m » → « K7PQ-2M »), avec les mêmes tolérances que le cœur de l'application.
 */

export const RECOVERY_KEY_LENGTH = 24;
const ALPHABET = /[0-9A-HJKMNP-TV-Z]/;

/** Nettoie et regroupe par 4 ce que la personne tape ou colle. */
export function formatRecoveryInput(raw: string): string {
  const chars: string[] = [];
  for (const ch of raw.toUpperCase()) {
    const c = ch === "O" ? "0" : ch === "I" || ch === "L" ? "1" : ch;
    if (ALPHABET.test(c)) chars.push(c);
    if (chars.length === RECOVERY_KEY_LENGTH) break;
  }
  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += 4) groups.push(chars.slice(i, i + 4).join(""));
  return groups.join("-");
}

export function isCompleteRecoveryKey(formatted: string): boolean {
  return formatted.replace(/-/g, "").length === RECOVERY_KEY_LENGTH;
}

/** Les 6 groupes d'une clé affichée « XXXX-XXXX-… ». */
export function recoveryGroups(key: string): string[] {
  return key.split("-");
}

/** Nombre de caractères de clé dans un texte saisi. */
function keyChars(text: string): number {
  return formatRecoveryInput(text).replace(/-/g, "").length;
}

/**
 * Clé et place du curseur après une frappe : le curseur reste après le même caractère de clé
 * (sinon il saute à la fin dès qu'un tiret s'ajoute), et effacer un tiret efface le caractère
 * voisin, dans le sens de la touche.
 */
export function editRecoveryInput(
  previous: string,
  raw: string,
  caret: number,
  forward = false,
): { value: string; caret: number } {
  let before = keyChars(raw.slice(0, caret));
  let value = formatRecoveryInput(raw);
  if (value === previous && raw.length < previous.length) {
    const chars = previous.replace(/-/g, "");
    if (forward) value = formatRecoveryInput(chars.slice(0, before) + chars.slice(before + 1));
    else if (before > 0) {
      value = formatRecoveryInput(chars.slice(0, before - 1) + chars.slice(before));
      before -= 1;
    }
  }
  return { value, caret: before === 0 ? 0 : before + Math.floor((before - 1) / 4) };
}
