import { tr } from "../i18n/i18n";
/**
 * Indicateur de solidité du mot de passe. Il conseille sans bloquer : seule la
 * longueur minimale (8 caractères) est obligatoire, comme le prévoit le cahier des charges.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const ADVISED_PASSWORD_LENGTH = 12;

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface Strength {
  score: StrengthScore;
  /** « Trop court », « Faible », « Moyen », « Fort », « Très fort » ; vide si rien n'est tapé. */
  label: string;
  /** Conseil bref, ou vide quand le mot de passe est fort. */
  hint: string;
  /** Vrai dès que la longueur minimale est atteinte. */
  acceptable: boolean;
}

/** Mots de passe trop connus, essayés en premier par les pirates. */
const COMMON = [
  "motdepasse",
  "password",
  "azerty",
  "qwerty",
  "123456",
  "abcdef",
  "aqueli",
  "bonjour",
  "soleil",
  "loulou",
  "doudou",
  "chouchou",
  "iloveyou",
  "admin",
];

function simplify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s._-]/g, "");
}

function characterKinds(password: string): number {
  let kinds = 0;
  if (/\p{Ll}/u.test(password)) kinds++;
  if (/\p{Lu}/u.test(password)) kinds++;
  if (/\p{N}/u.test(password)) kinds++;
  if (/[^\p{L}\p{N}]/u.test(password)) kinds++;
  return kinds;
}

/** « aaaaaaaa » ou « 12121212 » : un motif répété. */
function isRepetitive(password: string): boolean {
  return /^(.{1,3})\1+$/u.test(password);
}

export function passwordLength(password: string): number {
  return [...password].length;
}

export function passwordStrength(password: string): Strength {
  const length = passwordLength(password);
  if (length === 0) {
    return { score: 0, label: "", hint: tr("8 caractères minimum, 12 recommandés."), acceptable: false };
  }
  if (length < MIN_PASSWORD_LENGTH) {
    const missing = MIN_PASSWORD_LENGTH - length;
    return {
      score: 0,
      label: tr("Trop court"),
      hint: tr("8 caractères minimum (encore {missing}).", { missing }),
      acceptable: false,
    };
  }

  const simple = simplify(password);
  const common = COMMON.some((word) => simple.includes(word)) || isRepetitive(password);
  const kinds = characterKinds(password);

  let points = 1;
  if (length >= ADVISED_PASSWORD_LENGTH) points++;
  if (length >= 16) points++;
  if (length >= 20) points++;
  if (kinds >= 3) points++;
  if (common) points -= 2;
  const score = Math.min(4, Math.max(1, points)) as StrengthScore;

  const labels = ["", tr("Faible"), tr("Moyen"), tr("Fort"), tr("Très fort")];
  let hint = "";
  if (common) hint = tr("Mot de passe trop courant ou répétitif.");
  else if (length < ADVISED_PASSWORD_LENGTH) hint = tr("12 caractères ou plus recommandés.");
  else if (score < 3) hint = tr("Ajoutez des chiffres ou des symboles.");

  return { score, label: labels[score] ?? "", hint, acceptable: true };
}
