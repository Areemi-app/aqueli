import { useId } from "react";
import { locale } from "../i18n/i18n";
import { avatarById } from "./avatars";

/** Première lettre du pseudo, en majuscule (une lettre accentuée ou un idéogramme compris). */
export const initialOf = (name: string) => ([...name.trim()][0] ?? "").toLocaleUpperCase(locale());

interface AvatarImageProps {
  /** Identifiant de la banque d'images ; inconnu ou vide : l'initiale du pseudo. */
  avatar: string;
  name: string;
  size: number;
  className?: string;
}

/**
 * Image de profil d'un compte : une bulle de verre (dégradé, dessin, reflet), ou à défaut une
 * bulle à l'initiale du pseudo, teintée par le thème. Décorative : le pseudo est écrit à côté.
 */
export function AvatarImage({ avatar, name, size, className }: AvatarImageProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const def = avatarById(avatar);
  const classes = ["profile-pic", className].filter(Boolean).join(" ");
  if (!def) {
    return (
      <span className={`${classes} profile-pic--initial`} style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
        {initialOf(name) || "A"}
      </span>
    );
  }
  return (
    <svg className={classes} viewBox="0 0 80 80" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${uid}-fond`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={def.bg[0]} />
          <stop offset="1" stopColor={def.bg[1]} />
        </linearGradient>
        <clipPath id={`${uid}-bulle`}>
          <circle cx="40" cy="40" r="40" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${uid}-bulle)`}>
        <rect width="80" height="80" fill={`url(#${uid}-fond)`} />
        {/* Dessin de la banque d'images (texte fixe d'Aqueli, jamais saisi par la personne). */}
        <g dangerouslySetInnerHTML={{ __html: def.body }} />
        <ellipse cx="40" cy="12" rx="28" ry="12" fill="#fff" opacity="0.25" />
      </g>
      <circle cx="40" cy="40" r="39" fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="2" />
    </svg>
  );
}
