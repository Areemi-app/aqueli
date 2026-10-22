/**
 * Attributs d'une journée marquée (`DayMark`), communs à toutes les grilles de dates :
 * `data-holiday` (jour férié : bulle pleine), `data-feast` (fête : bulle cerclée),
 * `data-period` (période seule : teinte), `data-in-period` (la journée est dans une période),
 * et les couleurs `--hol-color` et `--period-color` (règles de src/styles/calendar.css).
 */
import type { CSSProperties } from "react";
import { inkOn } from "../lib/colorInk";
import type { DayMark } from "./specialDays";

export interface DayMarkAttributes {
  "data-holiday"?: true;
  "data-feast"?: true;
  "data-period"?: true;
  "data-in-period"?: true;
  "data-ink"?: "light" | "dark";
  style?: CSSProperties;
}

export function dayMarkAttributes(mark: DayMark | undefined): DayMarkAttributes {
  if (!mark) return {};
  const period = mark.periods[0];
  return {
    "data-holiday": mark.level === "ferie" || undefined,
    "data-feast": mark.level === "fete" || undefined,
    "data-period": mark.level === "periode" || undefined,
    "data-in-period": period ? true : undefined,
    "data-ink": mark.level === "ferie" ? inkOn(mark.color) : undefined,
    style: { "--hol-color": mark.color, ...(period ? { "--period-color": period.color } : {}) } as CSSProperties,
  };
}
