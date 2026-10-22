/** Durées lisibles, dans la langue de l'interface : « 45 min », « 2 h », « 2 h 30 ». */
import { tr } from "../i18n/i18n";

export function durationLabel(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return tr("{n} min", { n: m });
  return m === 0 ? tr("{n} h", { n: h }) : tr("{h} h {m}", { h, m: String(m).padStart(2, "0") });
}
