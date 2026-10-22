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
