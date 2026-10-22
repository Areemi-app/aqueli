/**
 * Fichier à importer découpé en sources : onglets d'un classeur, tableau d'un CSV, lignes d'un
 * fichier texte. Chaque source a un type (lu dans son nom, deviné d'après ses colonnes, ou
 * choisi dans l'aperçu) ; l'aperçu vérifie ensuite toutes les lignes.
 */
import { decodeText, parseCsv } from "./csv";
import { extensionOf } from "./extensions";
import { kindFromHeaders, kindFromWord, isTypeColumn, type ImportKind } from "./fields";
import { icsRecords, vcfRecords } from "./cards";
import { isTypedLine, lineRecords, noteRecord, type RawRecord, type TextLine, type TextMode } from "./lines";
import { buildRows, existingKeys, ignoredColumns, tableRecords, type ImportContext, type ImportRow } from "./records";
import { ImportFileError, readWorkbook, type Cells } from "./xlsx";
import { tr } from "../i18n/i18n";

export interface TableSource {
  type: "table";
  id: string;
  /** « Onglet « Tâches » », « tâches.csv ». */
  label: string;
  headers: string[];
  rows: Cells[];
  /** Type lu dans le nom, ou deviné d'après les colonnes ; « mixed » : colonne « Type ». */
  kind: ImportKind | "mixed";
  guessed: boolean;
  hasTypeColumn: boolean;
}

export interface TextSource {
  type: "text";
  id: string;
  label: string;
  lines: TextLine[];
  text: string;
  /** Au moins une ligne commence par son type (« TÂCHE | … »). */
  typed: boolean;
  mode: TextMode;
  /** Titre de la note si le fichier est lu comme une seule note. */
  fileTitle: string;
}

/** Onglet d'un type à venir (Dépenses, Contacts…), signalé puis ignoré. */
export interface LaterSource {
  type: "later";
  id: string;
  label: string;
  later: string;
}

/** Agenda (.ics) ou carnet de contacts (.vcf) : éléments déjà lus. */
export interface RecordsSource {
  type: "records";
  id: string;
  label: string;
  kind: ImportKind;
  records: RawRecord[];
}

export type Source = TableSource | TextSource | LaterSource | RecordsSource;

export interface ImportFileContent {
  sources: Source[];
  date1904: boolean;
}

const stem = (name: string) => name.replace(/\.[^.]+$/, "");

function table(id: string, label: string, name: string, rows: Cells[], fromFileName: boolean): TableSource | LaterSource | null {
  const [head, ...data] = rows;
  if (!head || data.length === 0) return null;
  const guess = kindFromWord(name, !fromFileName);
  if (guess && "later" in guess) return { type: "later", id, label, later: guess.later };
  const headers = head.cells.map((h) => h.trim());
  const hasTypeColumn = headers.some(isTypeColumn);
  const kind = guess && "kind" in guess ? guess.kind : hasTypeColumn ? "mixed" : kindFromHeaders(headers);
  return { type: "table", id, label, headers, rows: data, kind, guessed: !guess && !hasTypeColumn, hasTypeColumn };
}

/** Lit un fichier (.xlsx, .csv, .txt, .md, .ics, .vcf) ; `ImportFileError` s'il est illisible ou vide. */
export async function readImportFile(name: string, bytes: Uint8Array): Promise<ImportFileContent> {
  const extension = extensionOf(name);
  const sources: Source[] = [];
  let date1904 = false;
  if (extension === "xlsx") {
    const book = await readWorkbook(bytes);
    date1904 = book.date1904;
    book.sheets.forEach((sheet, i) => {
      const source = table(`onglet${i}`, tr("Onglet « {name} »", { name: sheet.name }), sheet.name, sheet.rows, false);
      if (source) sources.push(source);
    });
  } else if (extension === "csv") {
    const source = table("csv", name, stem(name), parseCsv(decodeText(bytes)), true);
    if (source) sources.push(source);
  } else if (extension === "txt" || extension === "md") {
    const text = decodeText(bytes);
    const lines = text.split(/\r\n|\n|\r/).map((t, i) => ({ line: i + 1, text: t }));
    if (lines.some((l) => l.text.trim())) {
      const typed = lines.some((l) => isTypedLine(l.text));
      const mode: TextMode = !typed && extension === "md" ? "note" : "tasks";
      sources.push({ type: "text", id: "texte", label: name, lines, text, typed, mode, fileTitle: stem(name) });
    }
  } else if (extension === "ics" || extension === "vcf") {
    const text = decodeText(bytes);
    const ics = extension === "ics";
    const records = ics ? icsRecords(text) : vcfRecords(text);
    if (records.length > 0) sources.push({ type: "records", id: extension, label: name, kind: ics ? "event" : "contact", records });
  } else {
    throw new ImportFileError(tr("Format non pris en charge. Formats acceptés : .xlsx, .csv, .txt, .md, .ics et .vcf."));
  }
  if (sources.length === 0) throw new ImportFileError(tr("Aucun élément à importer dans ce fichier."));
  return { sources, date1904 };
}

/** Type choisi dans l'aperçu : type des lignes d'un tableau, ou lecture d'un fichier texte. */
export type SourceChoice = ImportKind | "mixed" | TextMode;

export interface SourcePreview {
  source: Source;
  rows: ImportRow[];
  /** Colonnes ignorées d'un tableau. */
  ignored: string[];
}

/** Aperçu de toutes les sources, avec les types choisis ; doublons comptés sur tout le fichier. */
export function previewSources(sources: readonly Source[], choices: Readonly<Record<string, SourceChoice>>, ctx: ImportContext): SourcePreview[] {
  const known = existingKeys(ctx.existing);
  const seen = new Map<string, number>();
  return sources.map((source) => {
    if (source.type === "later") return { source, rows: [], ignored: [] };
    if (source.type === "records") return { source, rows: buildRows(source.id, source.records, ctx, known, seen), ignored: [] };
    if (source.type === "table") {
      const kind = (choices[source.id] as ImportKind | "mixed" | undefined) ?? source.kind;
      const records = tableRecords(source.headers, source.rows, kind);
      return { source, rows: buildRows(source.id, records, ctx, known, seen), ignored: ignoredColumns(source.headers, kind) };
    }
    const mode = (choices[source.id] as TextMode | undefined) ?? source.mode;
    const records = mode === "note" ? [noteRecord(source.text, source.fileTitle)] : lineRecords(source.lines, mode, ctx.today);
    return { source, rows: buildRows(source.id, records, ctx, known, seen), ignored: [] };
  });
}
