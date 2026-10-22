/**
 * Banque d'images de profil (dans l'esprit des images de MSN) : des illustrations vectorielles
 * de la vie de tous les jours, rangées par thème. Chaque image est une bulle de verre : fond en
 * dégradé, sujet dessiné au centre (cadre 80 × 80), reflet commun ajouté par `AvatarImage`.
 *
 * Les couleurs des dessins leur appartiennent (comme les bannières des thèmes) : elles ne suivent
 * pas le thème. L'identifiant est enregistré dans les préférences du compte (`avatar`).
 */
import { tr } from "../i18n/i18n";

export type AvatarCategory = "nature" | "animaux" | "mer" | "ciel" | "saisons" | "cuisine" | "sport" | "loisirs" | "voyage" | "maison";

export interface AvatarDef {
  id: string;
  category: AvatarCategory;
  label: string;
  /** Dégradé du fond : haut, bas. */
  bg: readonly [string, string];
  /** Éléments SVG du sujet, dessinés dans un cadre de 80 × 80. */
  body: string;
}

export const AVATAR_CATEGORIES: readonly { id: AvatarCategory; label: string }[] = [
  { id: "nature", label: tr("Nature") },
  { id: "animaux", label: tr("Animaux") },
  { id: "mer", label: tr("Mer") },
  { id: "ciel", label: tr("Ciel et espace") },
  { id: "saisons", label: tr("Saisons") },
  { id: "cuisine", label: tr("Cuisine") },
  { id: "sport", label: tr("Sport") },
  { id: "loisirs", label: tr("Loisirs") },
  { id: "voyage", label: tr("Voyage") },
  { id: "maison", label: tr("Maison") },
];

// Petits morceaux réutilisés.
const eyes = (y: number, dx = 7, r = 2.6) => `<circle cx="${40 - dx}" cy="${y}" r="${r}" fill="#24323f"/><circle cx="${40 + dx}" cy="${y}" r="${r}" fill="#24323f"/><circle cx="${40 - dx + 0.9}" cy="${y - 0.9}" r="0.9" fill="#fff"/><circle cx="${40 + dx + 0.9}" cy="${y - 0.9}" r="0.9" fill="#fff"/>`;
const shine = (cx: number, cy: number, rx: number, ry: number, o = 0.45) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" opacity="${o}"/>`;
const petals = (n: number, r: number, rx: number, ry: number, fill: string, cx = 40, cy = 40) =>
  Array.from({ length: n }, (_, i) => `<ellipse cx="${cx}" cy="${cy - r}" rx="${rx}" ry="${ry}" fill="${fill}" transform="rotate(${(360 / n) * i} ${cx} ${cy})"/>`).join("");
const star = (cx: number, cy: number, r: number, fill: string) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return `<polygon points="${pts}" fill="${fill}"/>`;
};

export const AVATARS: readonly AvatarDef[] = [
  // ——— Nature ———
  {
    id: "fleur", category: "nature", label: tr("Fleur"), bg: ["#bfe9ff", "#7cc8f0"],
    body: `<path d="M40 46 Q38 60 41 70" stroke="#3f9b4a" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M40 60 Q30 54 26 58 Q32 64 40 62Z" fill="#5cbf5a"/>${petals(5, 11, 8, 10, "#ff7aa8", 40, 34)}<circle cx="40" cy="34" r="7" fill="#ffd34d"/>${shine(37, 31, 3, 2)}`,
  },
  {
    id: "tournesol", category: "nature", label: tr("Tournesol"), bg: ["#9fd8ff", "#4aa6e8"],
    body: `${petals(14, 15, 4.5, 9, "#ffc928")}${petals(14, 13, 3.5, 7, "#ffdf5e")}<circle cx="40" cy="40" r="11" fill="#7a4a24"/><circle cx="40" cy="40" r="7" fill="#5c3518"/>${shine(36, 36, 3, 2, 0.3)}`,
  },
  {
    id: "arbre", category: "nature", label: tr("Arbre"), bg: ["#c9f2ff", "#86d3ef"],
    body: `<rect x="36" y="44" width="8" height="22" rx="3" fill="#8a5a33"/><circle cx="40" cy="32" r="16" fill="#47b14d"/><circle cx="28" cy="40" r="10" fill="#3c9e43"/><circle cx="52" cy="40" r="10" fill="#3c9e43"/><circle cx="40" cy="42" r="10" fill="#52bd58"/>${shine(34, 25, 6, 4)}<circle cx="47" cy="30" r="2.2" fill="#ff5d5d"/><circle cx="31" cy="37" r="2.2" fill="#ff5d5d"/><circle cx="50" cy="43" r="2.2" fill="#ff5d5d"/>`,
  },
  {
    id: "cactus", category: "nature", label: tr("Cactus"), bg: ["#ffe7b8", "#ffbe72"],
    body: `<path d="M33 62 V26 a7 7 0 0 1 14 0 V62Z" fill="#3fae5d"/><path d="M33 46 H26 a4 4 0 0 1-4-4 V34 a3.5 3.5 0 0 1 7 0 V40 H33Z" fill="#3fae5d"/><path d="M47 40 H53 V30 a3.5 3.5 0 0 1 7 0 V40 a6 6 0 0 1-6 6 H47Z" fill="#3fae5d"/><path d="M37 28 V58 M43 28 V58" stroke="#2d8d47" stroke-width="1.2"/><path d="M26 60 H54 L51 72 H29Z" fill="#e0703a"/><rect x="24" y="58" width="32" height="5" rx="2" fill="#f08a50"/><circle cx="40" cy="20" r="3.5" fill="#ff6fa0"/>${shine(37, 30, 2, 6, 0.35)}`,
  },
  {
    id: "feuille", category: "nature", label: tr("Feuille"), bg: ["#d8ffd0", "#8ee08a"],
    body: `<path d="M22 60 C20 34 38 18 62 18 C62 44 46 62 22 60Z" fill="#2fa84f"/><path d="M22 60 C34 48 44 36 58 22" stroke="#d8ffd8" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M34 47 L32 36 M42 39 L41 28 M38 44 L48 46 M46 35 L55 36" stroke="#d8ffd8" stroke-width="1.4" stroke-linecap="round"/>${shine(44, 28, 7, 3, 0.3)}`,
  },
  {
    id: "champignon", category: "nature", label: tr("Champignon"), bg: ["#d6f5d0", "#93d68a"],
    body: `<path d="M33 44 H47 L49 64 a3 3 0 0 1-3 3 H34 a3 3 0 0 1-3-3Z" fill="#fff4e2"/><path d="M16 44 C16 26 28 16 40 16 C52 16 64 26 64 44Z" fill="#e8413c"/><circle cx="30" cy="32" r="4" fill="#fff"/><circle cx="46" cy="25" r="3.2" fill="#fff"/><circle cx="52" cy="37" r="3.6" fill="#fff"/><circle cx="38" cy="38" r="2.4" fill="#fff"/>${shine(30, 24, 7, 3, 0.35)}`,
  },
  {
    id: "tulipe", category: "nature", label: tr("Tulipe"), bg: ["#ffe1f0", "#ffa8cf"],
    body: `<path d="M40 44 V70" stroke="#3f9b4a" stroke-width="3.5" stroke-linecap="round"/><path d="M40 62 C30 60 26 50 27 46 C34 48 39 54 40 62Z" fill="#5cbf5a"/><path d="M28 24 L34 32 L40 20 L46 32 L52 24 C54 38 50 46 40 46 C30 46 26 38 28 24Z" fill="#e8336d"/><path d="M40 20 L46 32 L52 24 C54 38 50 46 40 46Z" fill="#c9245a"/>${shine(34, 32, 3, 6, 0.35)}`,
  },
  {
    id: "trefle", category: "nature", label: tr("Trèfle"), bg: ["#e2ffd8", "#a6e892"],
    body: `${[0, 90, 180, 270].map((a) => `<path d="M40 40 C33 32 28 22 34 18 C38 15 40 20 40 22 C40 20 42 15 46 18 C52 22 47 32 40 40Z" fill="#2fa84f" transform="rotate(${a} 40 40)"/>`).join("")}<path d="M40 40 Q46 54 52 66" stroke="#2c8a3f" stroke-width="3" fill="none" stroke-linecap="round"/>${shine(34, 26, 3, 2, 0.4)}`,
  },

  // ——— Animaux ———
  {
    id: "chat", category: "animaux", label: tr("Chat"), bg: ["#ffe3c2", "#ffb878"],
    body: `<path d="M20 30 L24 12 L36 24Z M60 30 L56 12 L44 24Z" fill="#f29a3e"/><path d="M23 27 L25 17 L32 24Z M57 27 L55 17 L48 24Z" fill="#ffc6c6"/><ellipse cx="40" cy="42" rx="22" ry="20" fill="#f6a84c"/><path d="M40 24 V32 M33 25 L35 32 M47 25 L45 32" stroke="#d47a24" stroke-width="2" stroke-linecap="round"/>${eyes(40, 8, 3)}<path d="M37 47 L43 47 L40 50Z" fill="#f06c8c"/><path d="M40 50 Q36 54 33 52 M40 50 Q44 54 47 52" stroke="#24323f" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M16 46 L28 47 M16 51 L28 50 M64 46 L52 47 M64 51 L52 50" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>`,
  },
  {
    id: "chien", category: "animaux", label: tr("Chien"), bg: ["#d9f0ff", "#9ccff5"],
    body: `<ellipse cx="22" cy="36" rx="8" ry="15" fill="#8a5a33" transform="rotate(20 22 36)"/><ellipse cx="58" cy="36" rx="8" ry="15" fill="#8a5a33" transform="rotate(-20 58 36)"/><ellipse cx="40" cy="40" rx="19" ry="20" fill="#d9a066"/><ellipse cx="40" cy="51" rx="11" ry="8" fill="#f4dcc0"/>${eyes(37, 7, 2.8)}<ellipse cx="40" cy="47" rx="4.5" ry="3.2" fill="#24323f"/><path d="M40 50 V53 M36 54 Q40 57 44 54" stroke="#24323f" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M40 56 Q41 61 44 59 Q44 56 42 55" fill="#f06c8c"/>`,
  },
  {
    id: "lapin", category: "animaux", label: tr("Lapin"), bg: ["#ffe6f2", "#ffb3d4"],
    body: `<ellipse cx="32" cy="20" rx="6" ry="15" fill="#fff"/><ellipse cx="48" cy="20" rx="6" ry="15" fill="#fff"/><ellipse cx="32" cy="21" rx="3" ry="11" fill="#ffc0d6"/><ellipse cx="48" cy="21" rx="3" ry="11" fill="#ffc0d6"/><circle cx="40" cy="46" r="18" fill="#fff"/>${eyes(43, 7, 2.6)}<circle cx="29" cy="50" r="3" fill="#ffc0d6"/><circle cx="51" cy="50" r="3" fill="#ffc0d6"/><path d="M38 49 L42 49 L40 51.5Z" fill="#f06c8c"/><path d="M40 52 Q37 55 35 54 M40 52 Q43 55 45 54" stroke="#24323f" stroke-width="1.3" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: "renard", category: "animaux", label: tr("Renard"), bg: ["#fff1cf", "#ffd27a"],
    body: `<path d="M16 22 L30 30 L22 44Z M64 22 L50 30 L58 44Z" fill="#e8642c"/><path d="M19 27 L27 31 L23 39Z M61 27 L53 31 L57 39Z" fill="#3a2a22"/><path d="M18 34 C18 26 30 24 40 24 C50 24 62 26 62 34 C62 46 50 62 40 64 C30 62 18 46 18 34Z" fill="#f07a36"/><path d="M18 36 C26 42 34 44 40 46 C46 44 54 42 62 36 C60 48 50 62 40 64 C30 62 20 48 18 36Z" fill="#fff"/>${eyes(38, 9, 2.6)}<ellipse cx="40" cy="58" rx="3.6" ry="2.6" fill="#24323f"/>`,
  },
  {
    id: "panda", category: "animaux", label: tr("Panda"), bg: ["#d8f5dc", "#8fd69c"],
    body: `<circle cx="23" cy="24" r="8" fill="#2a2a2e"/><circle cx="57" cy="24" r="8" fill="#2a2a2e"/><circle cx="40" cy="42" r="21" fill="#fff"/><ellipse cx="31" cy="40" rx="6" ry="8" fill="#2a2a2e" transform="rotate(25 31 40)"/><ellipse cx="49" cy="40" rx="6" ry="8" fill="#2a2a2e" transform="rotate(-25 49 40)"/><circle cx="32" cy="40" r="2.4" fill="#fff"/><circle cx="48" cy="40" r="2.4" fill="#fff"/><ellipse cx="40" cy="50" rx="3.6" ry="2.6" fill="#2a2a2e"/><path d="M40 52 Q37 56 34 54 M40 52 Q43 56 46 54" stroke="#2a2a2e" stroke-width="1.4" fill="none" stroke-linecap="round"/>`,
  },
  {
    id: "hibou", category: "animaux", label: tr("Hibou"), bg: ["#3d4f8f", "#1f2a5c"],
    body: `<path d="M22 22 L30 30 L22 34Z M58 22 L50 30 L58 34Z" fill="#9a6b44"/><ellipse cx="40" cy="44" rx="19" ry="22" fill="#b07a4c"/><ellipse cx="40" cy="52" rx="12" ry="12" fill="#e9cfa8"/><circle cx="32" cy="36" r="8" fill="#fff"/><circle cx="48" cy="36" r="8" fill="#fff"/><circle cx="32" cy="36" r="4.4" fill="#ffb21c"/><circle cx="48" cy="36" r="4.4" fill="#ffb21c"/><circle cx="32" cy="36" r="2.4" fill="#24323f"/><circle cx="48" cy="36" r="2.4" fill="#24323f"/><path d="M37 44 L43 44 L40 49Z" fill="#ffb21c"/><path d="M34 52 Q36 54 38 52 M42 56 Q44 58 46 56 M36 58 Q38 60 40 58" stroke="#c9a77c" stroke-width="1.3" fill="none"/><circle cx="62" cy="16" r="1.4" fill="#fff8c8"/><circle cx="16" cy="22" r="1" fill="#fff8c8"/>`,
  },
  {
    id: "pingouin", category: "animaux", label: tr("Pingouin"), bg: ["#e2f6ff", "#a6dcf6"],
    body: `<ellipse cx="40" cy="44" rx="18" ry="24" fill="#26303f"/><ellipse cx="40" cy="48" rx="12" ry="18" fill="#fff"/><ellipse cx="24" cy="48" rx="4" ry="11" fill="#26303f" transform="rotate(15 24 48)"/><ellipse cx="56" cy="48" rx="4" ry="11" fill="#26303f" transform="rotate(-15 56 48)"/><circle cx="34" cy="32" r="2.4" fill="#fff"/><circle cx="46" cy="32" r="2.4" fill="#fff"/><circle cx="34.4" cy="32" r="1.3" fill="#26303f"/><circle cx="46.4" cy="32" r="1.3" fill="#26303f"/><path d="M36 37 L44 37 L40 42Z" fill="#ffa21c"/><ellipse cx="34" cy="68" rx="5" ry="2.4" fill="#ffa21c"/><ellipse cx="46" cy="68" rx="5" ry="2.4" fill="#ffa21c"/>`,
  },
  {
    id: "canard", category: "animaux", label: tr("Canard"), bg: ["#bfeaff", "#5fbde9"],
    body: `<path d="M14 60 Q40 72 66 60" stroke="#e6f7ff" stroke-width="3" fill="none" opacity="0.8"/><path d="M18 46 C18 58 30 64 42 64 C56 64 64 56 62 46 C60 40 54 42 50 44 C46 38 30 36 18 46Z" fill="#ffd23c"/><circle cx="46" cy="30" r="13" fill="#ffd23c"/><path d="M56 30 C62 28 68 30 66 34 C64 37 58 36 55 35Z" fill="#ff8a1c"/><circle cx="49" cy="27" r="2.4" fill="#24323f"/><circle cx="49.8" cy="26.2" r="0.8" fill="#fff"/><path d="M26 50 Q34 56 42 50" stroke="#f5b818" stroke-width="2.2" fill="none" stroke-linecap="round"/>${shine(40, 24, 4, 2.4, 0.5)}`,
  },
  {
    id: "tortue", category: "animaux", label: tr("Tortue"), bg: ["#d4f7ef", "#86dccb"],
    body: `<ellipse cx="62" cy="46" rx="8" ry="7" fill="#7bc86c"/><circle cx="64" cy="44" r="1.6" fill="#24323f"/><ellipse cx="26" cy="58" rx="5" ry="4" fill="#7bc86c"/><ellipse cx="50" cy="58" rx="5" ry="4" fill="#7bc86c"/><path d="M14 54 C14 34 28 26 38 26 C50 26 60 36 60 54Z" fill="#3e8e4f"/><path d="M26 54 L30 40 L38 34 L46 40 L50 54 M30 40 H46 M20 48 L30 40 M56 48 L46 40" stroke="#a6dc8e" stroke-width="2" fill="none" stroke-linejoin="round"/><rect x="12" y="52" width="50" height="5" rx="2.5" fill="#2f7340"/>${shine(30, 32, 6, 3, 0.35)}`,
  },
  {
    id: "abeille", category: "animaux", label: tr("Abeille"), bg: ["#fff6c8", "#ffd95a"],
    body: `<ellipse cx="30" cy="28" rx="10" ry="13" fill="#e8f6ff" opacity="0.9" transform="rotate(-25 30 28)"/><ellipse cx="50" cy="28" rx="10" ry="13" fill="#e8f6ff" opacity="0.9" transform="rotate(25 50 28)"/><ellipse cx="40" cy="46" rx="18" ry="15" fill="#ffc21c"/><path d="M30 34 Q28 46 30 58 M40 31 V61 M50 34 Q52 46 50 58" stroke="#2a2a2e" stroke-width="5" fill="none"/><circle cx="22" cy="44" r="8" fill="#2a2a2e"/><circle cx="20" cy="42" r="2" fill="#fff"/><path d="M18 36 Q14 28 10 30 M22 36 Q22 28 18 26" stroke="#2a2a2e" stroke-width="1.6" fill="none"/><path d="M58 46 L64 46" stroke="#2a2a2e" stroke-width="3" stroke-linecap="round"/>`,
  },
  {
    id: "coccinelle", category: "animaux", label: tr("Coccinelle"), bg: ["#dcffd2", "#94e07c"],
    body: `<circle cx="40" cy="24" r="9" fill="#2a2a2e"/><path d="M36 17 Q32 10 28 12 M44 17 Q48 10 52 12" stroke="#2a2a2e" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="40" cy="46" r="21" fill="#e8302c"/><path d="M40 25 V67" stroke="#2a2a2e" stroke-width="2.5"/><circle cx="30" cy="38" r="4" fill="#2a2a2e"/><circle cx="50" cy="38" r="4" fill="#2a2a2e"/><circle cx="28" cy="52" r="3.6" fill="#2a2a2e"/><circle cx="52" cy="52" r="3.6" fill="#2a2a2e"/><circle cx="36" cy="60" r="2.6" fill="#2a2a2e"/><circle cx="44" cy="60" r="2.6" fill="#2a2a2e"/>${shine(30, 32, 5, 3)}`,
  },
  {
    id: "papillon", category: "animaux", label: tr("Papillon"), bg: ["#e6e2ff", "#b3a8ff"],
    body: `<path d="M40 38 C30 18 12 18 14 32 C16 44 30 44 40 40Z" fill="#ff7ab8"/><path d="M40 38 C50 18 68 18 66 32 C64 44 50 44 40 40Z" fill="#ff7ab8"/><path d="M40 42 C30 46 20 54 24 62 C28 68 38 56 40 46Z" fill="#ffb03c"/><path d="M40 42 C50 46 60 54 56 62 C52 68 42 56 40 46Z" fill="#ffb03c"/><circle cx="26" cy="30" r="4" fill="#fff" opacity="0.7"/><circle cx="54" cy="30" r="4" fill="#fff" opacity="0.7"/><rect x="38" y="30" width="4" height="30" rx="2" fill="#3b2e4a"/><path d="M39 31 Q34 22 32 20 M41 31 Q46 22 48 20" stroke="#3b2e4a" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,
  },

  // ——— Mer ———
  {
    id: "poisson", category: "mer", label: tr("Poisson"), bg: ["#7fd6ff", "#1f8fd6"],
    body: `<path d="M56 40 L70 28 V52Z" fill="#ff8a3c"/><ellipse cx="38" cy="40" rx="22" ry="15" fill="#ffa23c"/><path d="M30 26 Q36 18 46 26" fill="#ff8a3c"/><path d="M34 26 Q32 40 34 54 M44 27 Q42 40 44 53" stroke="#fff" stroke-width="4" fill="none" opacity="0.85"/><circle cx="24" cy="37" r="3.4" fill="#24323f"/><circle cx="25" cy="36" r="1.1" fill="#fff"/><circle cx="16" cy="22" r="3" fill="none" stroke="#e6f7ff" stroke-width="1.4"/><circle cx="12" cy="14" r="2" fill="none" stroke="#e6f7ff" stroke-width="1.2"/>`,
  },
  {
    id: "baleine", category: "mer", label: tr("Baleine"), bg: ["#a8e6ff", "#3aa4e0"],
    body: `<path d="M40 22 Q36 12 30 14 M40 22 Q44 12 50 14 M40 22 V14" stroke="#e6f7ff" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M12 46 C12 30 26 24 38 24 C52 24 58 34 60 42 L70 34 L68 50 L58 50 C52 60 40 62 30 60 C18 58 12 54 12 46Z" fill="#3d7fd6"/><path d="M16 50 C22 58 36 60 46 56 C40 54 22 54 16 50Z" fill="#cfe9ff"/><circle cx="24" cy="42" r="2.6" fill="#24323f"/><path d="M18 48 Q24 50 28 47" stroke="#24323f" stroke-width="1.4" fill="none"/>${shine(30, 31, 8, 3, 0.35)}`,
  },
  {
    id: "pieuvre", category: "mer", label: tr("Pieuvre"), bg: ["#9fe4ff", "#4bb3e6"],
    body: `${[-15, -7, 0, 7, 15].map((d, i) => `<path d="M${40 + d} 44 Q${40 + d * 1.7} 58 ${40 + d * 1.3 + (i % 2 ? 5 : -5)} 68" stroke="#b35ad6" stroke-width="6" fill="none" stroke-linecap="round"/>`).join("")}<ellipse cx="40" cy="34" rx="19" ry="18" fill="#c46ee6"/>${eyes(36, 7, 3)}<path d="M35 44 Q40 48 45 44" stroke="#24323f" stroke-width="1.6" fill="none" stroke-linecap="round"/>${shine(32, 24, 6, 3, 0.4)}`,
  },
  {
    id: "coquillage", category: "mer", label: tr("Coquillage"), bg: ["#ffeedd", "#ffc9a0"],
    body: `<path d="M40 66 L20 34 C22 20 58 20 60 34Z" fill="#ff9a8a"/><path d="M40 66 L26 28 M40 66 L33 23 M40 66 V22 M40 66 L47 23 M40 66 L54 28" stroke="#e8705e" stroke-width="2" fill="none"/><rect x="33" y="62" width="14" height="7" rx="3" fill="#f07c6a"/>${shine(32, 30, 5, 3, 0.45)}`,
  },
  {
    id: "voilier", category: "mer", label: tr("Voilier"), bg: ["#bfe9ff", "#4fb0ea"],
    body: `<path d="M8 62 Q20 58 32 62 T56 62 T80 62 V80 H0Z" fill="#2f86d0" opacity="0.6"/><path d="M40 14 V52" stroke="#6b4a2c" stroke-width="2.5"/><path d="M42 16 L62 50 H42Z" fill="#fff"/><path d="M38 22 L22 50 H38Z" fill="#ffd34d"/><path d="M18 54 H62 L56 64 H24Z" fill="#e8513c"/><path d="M40 14 L50 18 L40 22Z" fill="#e8513c"/>`,
  },
  {
    id: "phare", category: "mer", label: tr("Phare"), bg: ["#2f4f9a", "#152a5e"],
    body: `<path d="M44 26 L74 14 V38Z" fill="#fff6a8" opacity="0.5"/><path d="M33 30 H47 L50 66 H30Z" fill="#fff"/><path d="M32 42 H48 L48.7 50 H31.3Z M30.8 58 H49.2 L49.6 64 H30.4Z" fill="#e8413c"/><rect x="34" y="22" width="12" height="9" rx="2" fill="#ffd34d"/><path d="M32 22 L40 14 L48 22Z" fill="#e8413c"/><path d="M10 68 Q24 62 40 66 T72 66 V80 H8Z" fill="#3d7fd6"/><circle cx="16" cy="16" r="1.2" fill="#fff"/><circle cx="24" cy="26" r="0.9" fill="#fff"/>`,
  },

  // ——— Ciel et espace ———
  {
    id: "soleil", category: "ciel", label: tr("Soleil"), bg: ["#9fdcff", "#3ea2e8"],
    body: `${Array.from({ length: 12 }, (_, i) => `<rect x="38.5" y="8" width="3" height="10" rx="1.5" fill="#ffc21c" transform="rotate(${i * 30} 40 40)"/>`).join("")}<circle cx="40" cy="40" r="17" fill="#ffd23c"/>${eyes(37, 6, 2.2)}<path d="M33 45 Q40 51 47 45" stroke="#e88a1c" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="29" cy="44" r="2.6" fill="#ffa8a0" opacity="0.8"/><circle cx="51" cy="44" r="2.6" fill="#ffa8a0" opacity="0.8"/>`,
  },
  {
    id: "lune", category: "ciel", label: tr("Lune et étoiles"), bg: ["#3b3f8f", "#1b1d52"],
    body: `<path d="M48 16 A24 24 0 1 0 64 52 A19 19 0 1 1 48 16Z" fill="#fff1a8"/><circle cx="34" cy="44" r="3" fill="#f2dc80"/><circle cx="42" cy="56" r="2" fill="#f2dc80"/>${star(58, 24, 5, "#fff6c8")}${star(20, 18, 3.4, "#fff6c8")}${star(64, 62, 3, "#fff6c8")}`,
  },
  {
    id: "planete", category: "ciel", label: tr("Planète"), bg: ["#5a3f9f", "#241a5c"],
    body: `<circle cx="40" cy="40" r="16" fill="#ffae5c"/><path d="M26 34 Q40 30 54 34 M25 42 Q40 38 55 42" stroke="#ff8a3c" stroke-width="3" fill="none"/><ellipse cx="40" cy="42" rx="30" ry="8" fill="none" stroke="#ffe08a" stroke-width="3.5" transform="rotate(-15 40 42)"/><path d="M24 34 A16 16 0 0 1 56 34" fill="none"/>${shine(34, 32, 5, 3, 0.45)}${star(14, 16, 2.6, "#fff")}${star(66, 66, 2.2, "#fff")}<circle cx="64" cy="18" r="1.2" fill="#fff"/>`,
  },
  {
    id: "fusee", category: "ciel", label: tr("Fusée"), bg: ["#2b3a8a", "#141c4f"],
    body: `<path d="M34 58 Q40 76 46 58Z" fill="#ffb21c"/><path d="M36 58 Q40 70 44 58Z" fill="#fff06a"/><path d="M40 10 C52 20 52 44 48 58 H32 C28 44 28 20 40 10Z" fill="#f2f6fb"/><path d="M40 10 C46 15 49 22 50 28 H30 C31 22 34 15 40 10Z" fill="#e8413c"/><circle cx="40" cy="38" r="6" fill="#4fb0ea" stroke="#9aa9bd" stroke-width="2"/><path d="M32 46 L22 60 L32 56Z M48 46 L58 60 L48 56Z" fill="#e8413c"/>${star(16, 20, 2.4, "#fff")}${star(64, 30, 2, "#fff")}<circle cx="60" cy="62" r="1.2" fill="#fff"/>`,
  },
  {
    id: "arc-en-ciel", category: "ciel", label: tr("Arc-en-ciel"), bg: ["#c8efff", "#7ccbf2"],
    body: `${["#ff5a5a", "#ffa23c", "#ffd23c", "#5cc85a", "#3d9be0", "#8a5ad6"].map((c, i) => `<path d="M${10 + i * 4} 56 A${30 - i * 4} ${30 - i * 4} 0 0 1 ${70 - i * 4} 56" stroke="${c}" stroke-width="4.2" fill="none"/>`).join("")}<circle cx="16" cy="58" r="7" fill="#fff"/><circle cx="24" cy="60" r="6" fill="#fff"/><circle cx="62" cy="58" r="7" fill="#fff"/><circle cx="56" cy="60" r="6" fill="#fff"/>`,
  },
  {
    id: "montgolfiere", category: "ciel", label: tr("Montgolfière"), bg: ["#ffe2c4", "#8fd0f5"],
    body: `<path d="M40 10 C24 10 18 22 20 32 C22 42 32 50 36 54 H44 C48 50 58 42 60 32 C62 22 56 10 40 10Z" fill="#ff6a5a"/><path d="M40 10 C34 12 30 24 32 34 C33 42 36 50 38 54 H42 C44 50 47 42 48 34 C50 24 46 12 40 10Z" fill="#ffd23c"/><path d="M20 30 Q40 36 60 30" stroke="#fff" stroke-width="2" fill="none" opacity="0.6"/><path d="M36 54 L35 62 M44 54 L45 62" stroke="#7a5a3c" stroke-width="1.3"/><rect x="33" y="61" width="14" height="10" rx="2" fill="#a0703c"/><circle cx="12" cy="56" r="4" fill="#fff"/><circle cx="17" cy="57" r="5" fill="#fff"/><circle cx="66" cy="20" r="3.5" fill="#fff"/><circle cx="70" cy="22" r="4" fill="#fff"/>${shine(30, 20, 4, 6, 0.35)}`,
  },

  // ——— Saisons ———
  {
    id: "flocon", category: "saisons", label: tr("Flocon"), bg: ["#d9f1ff", "#8ac8f2"],
    body: `${[0, 60, 120].map((a) => `<g transform="rotate(${a} 40 40)"><path d="M40 14 V66" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><path d="M34 20 L40 26 L46 20 M34 60 L40 54 L46 60" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`).join("")}<circle cx="40" cy="40" r="4" fill="#fff"/>`,
  },
  {
    id: "bonhomme-de-neige", category: "saisons", label: tr("Bonhomme de neige"), bg: ["#bfe3ff", "#6fb3ec"],
    body: `<circle cx="40" cy="54" r="15" fill="#fff"/><circle cx="40" cy="30" r="11" fill="#fff"/><rect x="31" y="12" width="18" height="10" rx="2" fill="#2a2a2e"/><rect x="27" y="20" width="26" height="4" rx="2" fill="#2a2a2e"/><circle cx="36" cy="29" r="1.6" fill="#24323f"/><circle cx="44" cy="29" r="1.6" fill="#24323f"/><path d="M40 32 L50 34 L40 35Z" fill="#ff8a1c"/><path d="M28 39 Q40 44 52 39 L50 44 Q40 48 30 44Z" fill="#e8413c"/><circle cx="40" cy="50" r="1.6" fill="#24323f"/><circle cx="40" cy="57" r="1.6" fill="#24323f"/><circle cx="14" cy="16" r="1.5" fill="#fff"/><circle cx="66" cy="24" r="1.5" fill="#fff"/><circle cx="62" cy="62" r="1.2" fill="#fff"/>`,
  },
  {
    id: "citrouille", category: "saisons", label: tr("Citrouille"), bg: ["#ffe0b8", "#ffa85c"],
    body: `<path d="M40 22 Q40 14 46 12" stroke="#5a8a2c" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="28" cy="44" rx="12" ry="18" fill="#f07c1c"/><ellipse cx="52" cy="44" rx="12" ry="18" fill="#f07c1c"/><ellipse cx="40" cy="44" rx="12" ry="20" fill="#ff8f2a"/><path d="M48 18 Q56 16 58 22 Q52 24 48 18Z" fill="#6aac3c"/>${shine(36, 32, 3, 6, 0.35)}`,
  },
  {
    id: "sapin", category: "saisons", label: tr("Sapin"), bg: ["#dff3ff", "#9ccff0"],
    body: `<rect x="36" y="58" width="8" height="10" rx="2" fill="#8a5a33"/><path d="M40 12 L56 34 H48 L60 50 H50 L62 60 H18 L30 50 H20 L32 34 H24Z" fill="#2f9e4f"/>${star(40, 13, 6, "#ffd23c")}<circle cx="34" cy="40" r="2.4" fill="#e8413c"/><circle cx="47" cy="46" r="2.4" fill="#3d9be0"/><circle cx="38" cy="54" r="2.4" fill="#ffd23c"/><circle cx="52" cy="56" r="2.2" fill="#e8413c"/><circle cx="28" cy="56" r="2.2" fill="#ff8ad0"/>`,
  },
  {
    id: "parapluie", category: "saisons", label: tr("Parapluie"), bg: ["#cfe3f5", "#8aa9c9"],
    body: `<path d="M40 34 V60 Q40 66 46 66 Q50 66 50 62" stroke="#4a4a52" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M12 36 C14 18 28 12 40 12 C52 12 66 18 68 36 Q63 31 58 36 Q54 31 49 36 Q44 31 40 36 Q36 31 31 36 Q26 31 21 36 Q17 31 12 36Z" fill="#ff5a8a"/><path d="M40 12 C34 18 31 28 31 36 M40 12 C46 18 49 28 49 36" stroke="#e83a6e" stroke-width="1.6" fill="none"/>${[[16, 50], [26, 60], [60, 52], [66, 64], [20, 70]].map(([x, y]) => `<path d="M${x} ${y} q-2 4 0 5 q2 -1 0 -5z" fill="#fff"/>`).join("")}`,
  },
  {
    id: "lunettes-de-soleil", category: "saisons", label: tr("Lunettes de soleil"), bg: ["#fff3b0", "#ffc94d"],
    body: `<path d="M12 34 H68" stroke="#2a2a2e" stroke-width="3" stroke-linecap="round"/><path d="M14 34 H36 V40 C36 50 30 54 24 54 C18 54 14 48 14 40Z" fill="#26303f"/><path d="M44 34 H66 V40 C66 50 62 54 56 54 C50 54 44 50 44 40Z" fill="#26303f"/><path d="M36 36 Q40 33 44 36" stroke="#2a2a2e" stroke-width="3" fill="none"/><path d="M18 38 L26 46 M48 38 L56 46" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.6"/>`,
  },

  // ——— Cuisine ———
  {
    id: "pomme", category: "cuisine", label: tr("Pomme"), bg: ["#e0ffd6", "#a3e48e"],
    body: `<path d="M40 24 Q40 16 44 12" stroke="#6b4a2c" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M42 20 Q52 12 58 18 Q50 24 42 20Z" fill="#4caf50"/><path d="M40 26 C30 18 16 24 16 40 C16 56 28 68 34 68 C37 68 38 66 40 66 C42 66 43 68 46 68 C52 68 64 56 64 40 C64 24 50 18 40 26Z" fill="#e8302c"/>${shine(28, 34, 4, 8, 0.45)}`,
  },
  {
    id: "fraise", category: "cuisine", label: tr("Fraise"), bg: ["#ffe2ea", "#ffa7bd"],
    body: `<path d="M18 30 C18 22 62 22 62 30 C62 46 50 66 40 68 C30 66 18 46 18 30Z" fill="#e8304c"/><path d="M20 26 L28 18 L34 24 L40 14 L46 24 L52 18 L60 26 C52 30 28 30 20 26Z" fill="#3fae5d"/>${[[28, 36], [40, 34], [52, 36], [34, 46], [46, 46], [40, 56], [30, 54], [50, 54]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.3" ry="2" fill="#ffe88a"/>`).join("")}${shine(26, 34, 3, 5, 0.35)}`,
  },
  {
    id: "citron", category: "cuisine", label: tr("Citron"), bg: ["#fff8cc", "#ffe270"],
    body: `<ellipse cx="40" cy="42" rx="24" ry="18" fill="#ffd21c" transform="rotate(-20 40 42)"/><path d="M60 30 Q66 26 64 22 Q60 24 58 28Z M20 54 Q14 58 16 62 Q20 60 22 56Z" fill="#ffc21c"/><path d="M50 22 Q56 12 64 14 Q58 22 50 22Z" fill="#4caf50"/>${shine(32, 36, 8, 4, 0.45)}`,
  },
  {
    id: "pasteque", category: "cuisine", label: tr("Pastèque"), bg: ["#e2ffdc", "#9fe08c"],
    body: `<path d="M10 30 A30 30 0 0 0 70 30Z" fill="#2f9e4f"/><path d="M14 30 A26 26 0 0 0 66 30Z" fill="#c8f2a8"/><path d="M17 30 A23 23 0 0 0 63 30Z" fill="#ff4a5a"/>${[[28, 38], [40, 44], [52, 38], [34, 50], [46, 50], [40, 36]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.4" ry="2.4" fill="#2a2a2e"/>`).join("")}`,
  },
  {
    id: "cerises", category: "cuisine", label: tr("Cerises"), bg: ["#fff0f0", "#ffbcbc"],
    body: `<path d="M28 50 Q34 30 46 14 Q48 34 54 48" stroke="#4a7a2c" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M46 14 Q56 10 62 16 Q54 20 46 14Z" fill="#4caf50"/><circle cx="28" cy="54" r="11" fill="#d01c3c"/><circle cx="54" cy="52" r="11" fill="#e8243f"/>${shine(24, 50, 3, 2.4, 0.5)}${shine(50, 48, 3, 2.4, 0.5)}`,
  },
  {
    id: "pizza", category: "cuisine", label: tr("Pizza"), bg: ["#fff1d6", "#ffcf8a"],
    body: `<path d="M14 20 Q40 8 66 20 L40 70Z" fill="#ffcf5c"/><path d="M14 20 Q40 8 66 20 L63 26 Q40 15 17 26Z" fill="#d68a3c"/><circle cx="34" cy="30" r="5" fill="#e8413c"/><circle cx="48" cy="32" r="5" fill="#e8413c"/><circle cx="40" cy="46" r="4.4" fill="#e8413c"/><path d="M30 40 Q32 38 34 40 M46 52 Q48 50 50 52" stroke="#3fae5d" stroke-width="2" fill="none"/>`,
  },
  {
    id: "cupcake", category: "cuisine", label: tr("Cupcake"), bg: ["#f1e2ff", "#d1aaff"],
    body: `<path d="M22 44 H58 L52 68 H28Z" fill="#ff8ab8"/><path d="M28 44 L31 68 M36 44 L37 68 M44 44 L43 68 M52 44 L49 68" stroke="#e8669a" stroke-width="1.6"/><path d="M18 44 C16 36 22 30 28 30 C28 22 36 18 40 20 C44 18 52 22 52 30 C58 30 64 36 62 44Z" fill="#fff4e6"/><circle cx="40" cy="16" r="5" fill="#e8243f"/><path d="M40 11 Q42 6 46 6" stroke="#4a7a2c" stroke-width="1.6" fill="none"/>${[[28, 38, "#3d9be0"], [36, 32, "#ffd23c"], [46, 36, "#5cc85a"], [52, 40, "#ff6a5a"], [32, 41, "#ff8ad0"]].map(([x, y, c]) => `<rect x="${x}" y="${y}" width="4" height="1.6" rx="0.8" fill="${c}" transform="rotate(30 ${x} ${y})"/>`).join("")}`,
  },
  {
    id: "donut", category: "cuisine", label: tr("Beignet"), bg: ["#d8f3ff", "#93d3f5"],
    body: `<circle cx="40" cy="42" r="23" fill="#e0a05c"/><path d="M18 40 C18 24 62 24 62 40 C62 46 58 44 56 48 C52 52 50 46 46 50 C42 54 38 48 34 52 C30 54 28 48 24 50 C20 50 18 46 18 40Z" fill="#ff7ab8"/><circle cx="40" cy="40" r="7" fill="#93d3f5"/>${[[28, 32, "#fff"], [50, 32, "#ffd23c"], [32, 44, "#3d9be0"], [52, 42, "#fff"], [42, 28, "#5cc85a"]].map(([x, y, c]) => `<rect x="${x}" y="${y}" width="5" height="1.8" rx="0.9" fill="${c}" transform="rotate(-30 ${x} ${y})"/>`).join("")}`,
  },
  {
    id: "cafe", category: "cuisine", label: tr("Tasse de café"), bg: ["#f5e4d2", "#d6ae88"],
    body: `<path d="M32 16 Q28 22 32 26 Q36 30 32 34 M42 14 Q38 20 42 24 Q46 28 42 32" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.8"/><path d="M54 44 H60 a7 7 0 0 1 0 14 H52" stroke="#fff" stroke-width="4" fill="none"/><path d="M18 38 H58 V52 C58 62 50 68 38 68 C26 68 18 62 18 52Z" fill="#fff"/><ellipse cx="38" cy="38" rx="20" ry="4" fill="#7a4a24"/><ellipse cx="38" cy="70" rx="26" ry="4" fill="#e9d6c2"/><path d="M30 52 C30 48 36 47 38 50 C40 47 46 48 46 52 C46 56 38 60 38 60 C38 60 30 56 30 52Z" fill="#ff8ab0"/>`,
  },
  {
    id: "croissant", category: "cuisine", label: tr("Croissant"), bg: ["#fff4d6", "#ffd98a"],
    body: `<ellipse cx="18" cy="52" rx="5.5" ry="8" fill="#c97f2c" transform="rotate(-55 18 52)"/><ellipse cx="62" cy="52" rx="5.5" ry="8" fill="#c97f2c" transform="rotate(55 62 52)"/><ellipse cx="27" cy="44" rx="8.5" ry="12" fill="#dc9640" transform="rotate(-35 27 44)"/><ellipse cx="53" cy="44" rx="8.5" ry="12" fill="#dc9640" transform="rotate(35 53 44)"/><ellipse cx="40" cy="40" rx="11" ry="15" fill="#eeac55"/><path d="M34 32 Q40 36 46 32 M33 41 Q40 45 47 41" stroke="#c97f2c" stroke-width="1.6" fill="none" stroke-linecap="round"/>${shine(37, 31, 4, 3, 0.45)}`,
  },

  // ——— Sport ———
  {
    id: "ballon-de-foot", category: "sport", label: tr("Ballon de football"), bg: ["#c9f5c4", "#6fcf66"],
    body: `<circle cx="40" cy="40" r="23" fill="#fff"/><path d="M40 30 L49 36 L46 47 H34 L31 36Z" fill="#2a2a2e"/><path d="M40 30 V18 M49 36 L60 32 M46 47 L53 57 M34 47 L27 57 M31 36 L20 32" stroke="#2a2a2e" stroke-width="2"/><path d="M33 18 L40 17 L47 18 L44 23 H36Z M60 30 L63 38 L61 45 L56 40 L58 33Z M20 30 L17 38 L19 45 L24 40 L22 33Z" fill="#2a2a2e"/><path d="M48 58 L54 58 L52 63 L46 62Z M26 58 L32 58 L34 62 L28 63Z" fill="#2a2a2e"/>${shine(32, 28, 6, 3, 0.4)}`,
  },
  {
    id: "basket", category: "sport", label: tr("Ballon de basket"), bg: ["#ffe7cc", "#ffb069"],
    body: `<circle cx="40" cy="40" r="23" fill="#f07c1c"/><path d="M17 40 H63 M40 17 V63" stroke="#4a2a12" stroke-width="2"/><path d="M24 22 C32 30 32 50 24 58 M56 22 C48 30 48 50 56 58" stroke="#4a2a12" stroke-width="2" fill="none"/>${shine(32, 28, 6, 3, 0.35)}`,
  },
  {
    id: "tennis", category: "sport", label: tr("Tennis"), bg: ["#d9f6ff", "#7ccdf0"],
    body: `<ellipse cx="32" cy="32" rx="16" ry="19" fill="none" stroke="#3d64d6" stroke-width="4" transform="rotate(-35 32 32)"/><path d="M22 24 L42 40 M26 18 L46 34 M18 30 L38 46 M24 42 L40 22 M18 36 L34 16 M30 46 L46 28" stroke="#9fb4f0" stroke-width="1.2"/><path d="M42 44 L58 64" stroke="#2a2a2e" stroke-width="5" stroke-linecap="round"/><circle cx="58" cy="26" r="9" fill="#d6f23c"/><path d="M51 21 Q58 26 51 31 M65 21 Q58 26 65 31" stroke="#fff" stroke-width="1.8" fill="none"/>`,
  },
  {
    id: "velo", category: "sport", label: tr("Vélo"), bg: ["#e6f7ff", "#9cd8f7"],
    body: `<circle cx="22" cy="50" r="12" fill="none" stroke="#2a2a2e" stroke-width="3"/><circle cx="58" cy="50" r="12" fill="none" stroke="#2a2a2e" stroke-width="3"/><path d="M22 50 L34 32 H54 L58 50 M34 32 L40 50 L54 32 M40 50 H22" stroke="#e8413c" stroke-width="3" fill="none" stroke-linejoin="round"/><path d="M30 28 H38 M52 26 L56 24 L56 30" stroke="#2a2a2e" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="40" cy="50" r="2.4" fill="#2a2a2e"/>`,
  },
  {
    id: "halteres", category: "sport", label: tr("Haltères"), bg: ["#ece2ff", "#b9a0f2"],
    body: `<rect x="24" y="37" width="32" height="6" rx="3" fill="#9aa9bd"/><rect x="14" y="26" width="8" height="28" rx="3" fill="#3d64d6"/><rect x="22" y="30" width="6" height="20" rx="2.5" fill="#5a82ec"/><rect x="58" y="26" width="8" height="28" rx="3" fill="#3d64d6"/><rect x="52" y="30" width="6" height="20" rx="2.5" fill="#5a82ec"/>${shine(18, 32, 1.6, 4, 0.5)}${shine(62, 32, 1.6, 4, 0.5)}`,
  },
  {
    id: "surf", category: "sport", label: tr("Planche de surf"), bg: ["#a8ecff", "#2fb3e0"],
    body: `<path d="M0 58 Q14 48 28 58 T56 58 T84 58 V80 H0Z" fill="#fff" opacity="0.45"/><path d="M40 8 C54 22 54 54 40 72 C26 54 26 22 40 8Z" fill="#ffd23c" transform="rotate(25 40 40)"/><path d="M40 12 V68" stroke="#e8513c" stroke-width="4" transform="rotate(25 40 40)"/><path d="M38 64 L40 70 L42 64Z" fill="#3a3a3e" transform="rotate(25 40 40)"/>`,
  },

  // ——— Loisirs ———
  {
    id: "guitare", category: "loisirs", label: tr("Guitare"), bg: ["#ffe7d1", "#ffb67c"],
    body: `<g transform="rotate(35 40 40)"><rect x="37" y="4" width="6" height="34" rx="2" fill="#6b4a2c"/><rect x="34" y="2" width="12" height="8" rx="2" fill="#4a3220"/><path d="M40 34 C30 34 26 40 28 46 C24 50 24 62 32 66 C36 68 44 68 48 66 C56 62 56 50 52 46 C54 40 50 34 40 34Z" fill="#d6782c"/><circle cx="40" cy="50" r="5" fill="#4a3220"/><rect x="34" y="58" width="12" height="3" rx="1.5" fill="#4a3220"/><path d="M38.5 6 V58 M41.5 6 V58" stroke="#f2e6d2" stroke-width="0.8"/></g>`,
  },
  {
    id: "note-de-musique", category: "loisirs", label: tr("Note de musique"), bg: ["#e2e6ff", "#a3adff"],
    body: `<path d="M30 54 V20 L60 14 V48" stroke="#3b3f8f" stroke-width="4" fill="none" stroke-linejoin="round"/><path d="M30 20 L60 14 V22 L30 28Z" fill="#3b3f8f"/><ellipse cx="24" cy="56" rx="8" ry="6" fill="#3b3f8f" transform="rotate(-20 24 56)"/><ellipse cx="54" cy="50" rx="8" ry="6" fill="#3b3f8f" transform="rotate(-20 54 50)"/>${shine(22, 54, 2.4, 1.4, 0.5)}${shine(52, 48, 2.4, 1.4, 0.5)}`,
  },
  {
    id: "casque-audio", category: "loisirs", label: tr("Casque audio"), bg: ["#d6fff2", "#7ee0c2"],
    body: `<path d="M16 46 V40 C16 26 26 16 40 16 C54 16 64 26 64 40 V46" stroke="#2a3a4a" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="12" y="40" width="14" height="22" rx="6" fill="#ff5a8a"/><rect x="54" y="40" width="14" height="22" rx="6" fill="#ff5a8a"/>${shine(17, 46, 2, 4, 0.5)}${shine(59, 46, 2, 4, 0.5)}`,
  },
  {
    id: "manette", category: "loisirs", label: tr("Manette de jeu"), bg: ["#e8e0ff", "#b19cf5"],
    body: `<path d="M22 28 H58 C66 28 72 38 70 52 C69 60 62 62 58 56 L52 48 H28 L22 56 C18 62 11 60 10 52 C8 38 14 28 22 28Z" fill="#3a3f55"/><path d="M24 36 V46 M19 41 H29" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="54" cy="36" r="3" fill="#ffd23c"/><circle cx="60" cy="42" r="3" fill="#ff5a5a"/><circle cx="48" cy="42" r="3" fill="#3d9be0"/><circle cx="54" cy="48" r="3" fill="#5cc85a"/>${shine(30, 31, 8, 1.8, 0.3)}`,
  },
  {
    id: "palette", category: "loisirs", label: tr("Palette de peinture"), bg: ["#fff4d8", "#ffd88f"],
    body: `<path d="M40 14 C22 14 12 28 14 42 C16 58 30 66 42 66 C50 66 50 58 46 54 C42 50 46 44 52 46 C60 48 68 44 68 34 C68 22 56 14 40 14Z" fill="#e9c08f"/><circle cx="28" cy="32" r="5" fill="#ff5a5a"/><circle cx="40" cy="24" r="5" fill="#ffd23c"/><circle cx="54" cy="28" r="5" fill="#3d9be0"/><circle cx="26" cy="47" r="5" fill="#5cc85a"/><circle cx="36" cy="56" r="4" fill="#8a5ad6"/><path d="M58 58 L74 74" stroke="#7a4a24" stroke-width="3" stroke-linecap="round"/><path d="M54 54 L60 56 L58 60Z" fill="#ff8ad0"/>`,
  },
  {
    id: "appareil-photo", category: "loisirs", label: tr("Appareil photo"), bg: ["#dde8f5", "#9fb4d0"],
    body: `<rect x="12" y="26" width="56" height="36" rx="7" fill="#3a3f55"/><path d="M28 26 L32 18 H48 L52 26Z" fill="#3a3f55"/><circle cx="40" cy="44" r="13" fill="#9aa9bd"/><circle cx="40" cy="44" r="9" fill="#26303f"/><circle cx="37" cy="41" r="3" fill="#fff" opacity="0.7"/><rect x="56" y="30" width="7" height="4" rx="1.5" fill="#ffd23c"/><circle cx="20" cy="31" r="2.4" fill="#ff5a5a"/>`,
  },
  {
    id: "livre", category: "loisirs", label: tr("Livre"), bg: ["#ffe5e5", "#ffaaaa"],
    body: `<path d="M40 22 C32 16 20 16 12 20 V62 C20 58 32 58 40 64Z" fill="#fff"/><path d="M40 22 C48 16 60 16 68 20 V62 C60 58 48 58 40 64Z" fill="#f2f6fb"/><path d="M40 22 V64" stroke="#c9d4e2" stroke-width="1.6"/><path d="M18 28 H34 M18 34 H34 M18 40 H32 M46 28 H62 M46 34 H62 M46 40 H60 M46 46 H62" stroke="#c9d4e2" stroke-width="1.6" stroke-linecap="round"/><path d="M12 62 C20 58 32 58 40 64 C48 58 60 58 68 62 V66 C60 62 48 62 40 68 C32 62 20 62 12 66Z" fill="#3d64d6"/><path d="M54 16 V30 L57 27 L60 30 V16" fill="#e8413c"/>`,
  },
  {
    id: "de", category: "loisirs", label: tr("Dé"), bg: ["#d9ffe8", "#86e0ad"],
    body: `<rect x="16" y="16" width="48" height="48" rx="10" fill="#fff" transform="rotate(12 40 40)"/>${[[29, 29], [51, 29], [40, 40], [29, 51], [51, 51]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#e8413c" transform="rotate(12 40 40)"/>`).join("")}${shine(28, 22, 7, 2.4, 0.5)}`,
  },

  // ——— Voyage ———
  {
    id: "avion", category: "voyage", label: tr("Avion"), bg: ["#c7ecff", "#5db8ef"],
    body: `<path d="M10 52 Q30 50 44 42" stroke="#fff" stroke-width="2.4" stroke-dasharray="4 4" fill="none" opacity="0.8"/><g transform="rotate(-30 44 38)"><path d="M18 38 C18 34 24 33 32 33 H62 C68 33 72 36 72 38 C72 40 68 43 62 43 H32 C24 43 18 42 18 38Z" fill="#fff"/><path d="M40 34 L30 18 H36 L52 34Z M40 42 L30 58 H36 L52 42Z" fill="#3d9be0"/><path d="M22 36 L18 26 H23 L30 34Z" fill="#3d9be0"/><circle cx="58" cy="37" r="1.6" fill="#3d9be0"/><circle cx="52" cy="37" r="1.6" fill="#3d9be0"/><circle cx="46" cy="37" r="1.6" fill="#3d9be0"/></g>`,
  },
  {
    id: "montagne", category: "voyage", label: tr("Montagne"), bg: ["#cdeeff", "#79c4ef"],
    body: `<path d="M4 66 L28 30 L40 46 L52 24 L76 66Z" fill="#5a7a9a"/><path d="M52 24 L60 38 L56 36 L52 40 L48 36 L44 38Z" fill="#fff"/><path d="M28 30 L34 40 L30 38 L26 41 L22 39Z" fill="#fff"/><path d="M0 66 Q20 58 40 64 T80 62 V80 H0Z" fill="#5cc85a"/><circle cx="18" cy="18" r="7" fill="#ffd23c"/>`,
  },
  {
    id: "palmier", category: "voyage", label: tr("Palmier"), bg: ["#a8e9ff", "#38b4e6"],
    body: `<path d="M0 62 Q20 56 40 62 T80 60 V80 H0Z" fill="#2f86d0" opacity="0.6"/><ellipse cx="40" cy="66" rx="24" ry="6" fill="#ffe08a"/><path d="M42 64 C44 50 46 38 42 26" stroke="#9a6b44" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M42 26 C34 16 20 18 16 26 C26 22 34 24 42 26Z M42 26 C50 16 64 18 68 26 C58 22 50 24 42 26Z M42 26 C32 26 24 34 24 42 C30 34 36 30 42 26Z M42 26 C52 26 60 34 60 42 C54 34 48 30 42 26Z" fill="#3fae5d"/><circle cx="40" cy="29" r="3" fill="#8a5a33"/><circle cx="45" cy="30" r="3" fill="#8a5a33"/>`,
  },
  {
    id: "valise", category: "voyage", label: tr("Valise"), bg: ["#ffe6d6", "#ffb08a"],
    body: `<path d="M32 26 V18 H48 V26" stroke="#5a3a22" stroke-width="3.5" fill="none" stroke-linejoin="round"/><rect x="16" y="26" width="48" height="38" rx="6" fill="#e8513c"/><path d="M28 26 V64 M52 26 V64" stroke="#c43a28" stroke-width="3"/><circle cx="24" cy="66" r="3" fill="#3a3a3e"/><circle cx="56" cy="66" r="3" fill="#3a3a3e"/><rect x="33" y="38" width="14" height="10" rx="2" fill="#fff" transform="rotate(-10 40 43)"/><circle cx="37" cy="43" r="1.6" fill="#3d9be0" transform="rotate(-10 40 43)"/>${shine(22, 32, 3, 1.6, 0.4)}`,
  },
  {
    id: "boussole", category: "voyage", label: tr("Boussole"), bg: ["#e6f4ff", "#a8cdeb"],
    body: `<circle cx="40" cy="40" r="25" fill="#c99a4c"/><circle cx="40" cy="40" r="20" fill="#fffaf0"/>${[0, 90, 180, 270].map((a) => `<rect x="39" y="22" width="2" height="5" rx="1" fill="#7a5a3c" transform="rotate(${a} 40 40)"/>`).join("")}<path d="M40 24 L45 40 L40 56 L35 40Z" fill="#9aa9bd"/><path d="M40 24 L45 40 H35Z" fill="#e8413c"/><circle cx="40" cy="40" r="2.6" fill="#3a3a3e"/>${shine(32, 30, 6, 3, 0.45)}`,
  },
  {
    id: "tente", category: "voyage", label: tr("Tente"), bg: ["#1f3a6e", "#0f1f44"],
    body: `${star(16, 16, 2.6, "#fff6c8")}${star(62, 14, 2.2, "#fff6c8")}<circle cx="64" cy="28" r="1.2" fill="#fff"/><path d="M0 62 H80 V80 H0Z" fill="#2e5a3a"/><path d="M40 16 L68 62 H12Z" fill="#ff8a3c"/><path d="M40 16 L52 62 H28Z" fill="#e8642c"/><path d="M40 36 L48 62 H32Z" fill="#ffd56a"/><path d="M36 12 L44 20" stroke="#5a3a22" stroke-width="2.4" stroke-linecap="round"/>`,
  },

  // ——— Maison ———
  {
    id: "maison", category: "maison", label: tr("Maison"), bg: ["#d6f0ff", "#8ccbf2"],
    body: `<rect x="50" y="18" width="7" height="14" fill="#a0503c"/><path d="M12 38 L40 14 L68 38Z" fill="#e8513c"/><rect x="18" y="36" width="44" height="30" fill="#fff4e2"/><rect x="34" y="46" width="12" height="20" rx="2" fill="#8a5a33"/><circle cx="43" cy="56" r="1.2" fill="#ffd23c"/><rect x="22" y="42" width="9" height="9" rx="1.5" fill="#7cc8f0"/><rect x="49" y="42" width="9" height="9" rx="1.5" fill="#7cc8f0"/><path d="M0 66 H80 V80 H0Z" fill="#5cc85a"/>`,
  },
  {
    id: "ampoule", category: "maison", label: tr("Ampoule"), bg: ["#fff8cf", "#ffe06a"],
    body: `${[-60, -30, 0, 30, 60].map((a) => `<rect x="39" y="4" width="2.4" height="7" rx="1.2" fill="#ffb21c" transform="rotate(${a} 40 34)"/>`).join("")}<path d="M40 14 C28 14 22 24 22 32 C22 40 30 44 32 52 H48 C50 44 58 40 58 32 C58 24 52 14 40 14Z" fill="#fff3a8"/><path d="M36 52 V40 L40 44 L44 40 V52" stroke="#e8a21c" stroke-width="1.6" fill="none"/><rect x="32" y="52" width="16" height="10" rx="2" fill="#9aa9bd"/><path d="M32 56 H48 M32 59 H48" stroke="#7a8aa0" stroke-width="1.2"/><path d="M36 62 H44 L42 66 H38Z" fill="#5a6a80"/>${shine(32, 26, 4, 6, 0.6)}`,
  },
  {
    id: "plante", category: "maison", label: tr("Plante en pot"), bg: ["#e4ffe0", "#a8e8a0"],
    body: `<path d="M40 48 C40 36 30 26 18 26 C18 38 28 46 40 48Z" fill="#3fae5d"/><path d="M40 48 C40 34 48 20 62 18 C64 32 54 44 40 48Z" fill="#52bd58"/><path d="M40 48 C38 40 40 30 42 22" stroke="#2c8a3f" stroke-width="2" fill="none"/><path d="M24 48 H56 L52 70 H28Z" fill="#3d9be0"/><rect x="22" y="46" width="36" height="6" rx="2" fill="#5ab0ee"/>${shine(30, 56, 2, 6, 0.4)}`,
  },
  {
    id: "bougie", category: "maison", label: tr("Bougie"), bg: ["#3a2f6e", "#1d1740"],
    body: `<circle cx="40" cy="24" r="14" fill="#ffd23c" opacity="0.25"/><path d="M40 10 C46 18 46 26 40 30 C34 26 34 18 40 10Z" fill="#ffb21c"/><path d="M40 16 C43 21 43 25 40 28 C37 25 37 21 40 16Z" fill="#fff3a8"/><path d="M40 30 V34" stroke="#3a3a3e" stroke-width="1.6"/><rect x="30" y="34" width="20" height="30" rx="3" fill="#fff4e6"/><path d="M30 38 C34 42 36 36 40 40 C44 44 46 38 50 40" stroke="#f2e0c8" stroke-width="3" fill="none"/><ellipse cx="40" cy="66" rx="16" ry="4" fill="#c99a4c"/>`,
  },
  {
    id: "cle", category: "maison", label: tr("Clé"), bg: ["#fff1cc", "#ffd27a"],
    body: `<g transform="rotate(-40 40 40)"><circle cx="22" cy="40" r="12" fill="none" stroke="#e8a21c" stroke-width="6"/><rect x="32" y="37" width="34" height="6" rx="3" fill="#e8a21c"/><rect x="54" y="43" width="5" height="9" rx="1.5" fill="#e8a21c"/><rect x="62" y="43" width="5" height="6" rx="1.5" fill="#e8a21c"/></g>${shine(26, 46, 3, 1.6, 0.6)}`,
  },
  {
    id: "reveil", category: "maison", label: tr("Réveil"), bg: ["#ffe2e2", "#ffaaaa"],
    body: `<circle cx="22" cy="20" r="8" fill="#e8413c"/><circle cx="58" cy="20" r="8" fill="#e8413c"/><path d="M26 64 L22 70 M54 64 L58 70" stroke="#3a3a3e" stroke-width="3.5" stroke-linecap="round"/><circle cx="40" cy="44" r="22" fill="#e8413c"/><circle cx="40" cy="44" r="17" fill="#fff"/>${[0, 90, 180, 270].map((a) => `<rect x="39" y="29" width="2" height="4" rx="1" fill="#3a3a3e" transform="rotate(${a} 40 44)"/>`).join("")}<path d="M40 44 V34 M40 44 L48 48" stroke="#3a3a3e" stroke-width="2.6" stroke-linecap="round"/><circle cx="40" cy="44" r="2" fill="#3a3a3e"/>`,
  },
];

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]));

export function avatarById(id: string | null | undefined): AvatarDef | null {
  return (id && BY_ID.get(id)) || null;
}

/** Image proposée par défaut à un nouveau compte : une des images, tirée au hasard. */
export function randomAvatarId(random: () => number = Math.random): string {
  return AVATARS[Math.floor(random() * AVATARS.length) % AVATARS.length]!.id;
}
