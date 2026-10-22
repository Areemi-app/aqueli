/**
 * Fichiers texte à importer : décodage (UTF-8, UTF-16, ou l'encodage Windows des CSV d'Excel)
 * et lecture des CSV (séparateur deviné, guillemets, retours à la ligne dans les cellules).
 * Fonctions pures.
 */
import { MAX_ROWS, ImportFileError, type Cells } from "./xlsx";
import { tr } from "../i18n/i18n";

/** Texte d'un fichier : UTF-8 si possible, sinon l'encodage Windows d'Europe de l'Ouest. */
export function decodeText(bytes: Uint8Array): string {
  let text: string;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) text = new TextDecoder("utf-8").decode(bytes.subarray(3));
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder("utf-16le").decode(bytes.subarray(2));
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder("utf-16be").decode(bytes.subarray(2));
  else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder("windows-1252").decode(bytes);
    }
  }
  // Un fichier binaire (image, archive) renommé en .txt.
  if (text.includes("\u0000")) throw new ImportFileError(tr("Fichier illisible."));
  return text;
}

const DELIMITERS = [";", "\t", ","] as const;
export type Delimiter = (typeof DELIMITERS)[number];

/** Séparateur le plus fréquent de la première ligne (hors guillemets) ; « ; » à égalité. */
export function detectDelimiter(text: string): Delimiter {
  const line = text.split(/\r\n|\n|\r/).find((l) => l.trim() !== "") ?? "";
  const counts = new Map<Delimiter, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && counts.has(c as Delimiter)) counts.set(c as Delimiter, counts.get(c as Delimiter)! + 1);
  }
  let best: Delimiter = ";";
  for (const d of DELIMITERS) if (counts.get(d)! > counts.get(best)!) best = d;
  return best;
}

/** Lignes non vides d'un CSV, avec leur numéro dans le fichier. */
export function parseCsv(input: string): Cells[] {
  let text = input;
  let delimiter: Delimiter;
  let line = 1;
  // « sep=; » en première ligne (Excel) : séparateur imposé.
  const sep = /^sep=(.)\r?\n/i.exec(text);
  if (sep) {
    delimiter = (DELIMITERS as readonly string[]).includes(sep[1]!) ? (sep[1] as Delimiter) : ";";
    text = text.slice(sep[0].length);
    line = 2;
  } else delimiter = detectDelimiter(text);

  const rows: Cells[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let start = line;
  const endRow = () => {
    cells.push(cell);
    while (cells.length > 0 && cells[cells.length - 1]!.trim() === "") cells.pop();
    if (cells.length > 0) rows.push({ line: start, cells });
    if (rows.length > MAX_ROWS) throw new ImportFileError(tr("Fichier trop long (20 000 lignes au plus)."));
    cells = [];
    cell = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (c === "\n") line++;
        cell += c;
      }
    } else if (c === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (c === delimiter) {
      cells.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
      start = line;
    } else cell += c;
  }
  if (cell !== "" || cells.length > 0) endRow();
  return rows.map((r) => ({ line: r.line, cells: r.cells.map((c) => c.replace(/\r\n/g, "\n")) }));
}
