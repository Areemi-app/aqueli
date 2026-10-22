import { tr } from "../i18n/i18n";
/**
 * Lecture d'un classeur Excel (.xlsx) sans bibliothèque : l'archive ZIP est parcourue à la main,
 * ses parties décompressées par le navigateur (DecompressionStream), le XML lu par DOMParser.
 * Seules les valeurs enregistrées sont lues : formules et macros ne sont jamais exécutées.
 */

/** Fichier illisible, avec l'explication montrée à la place de l'aperçu. */
export class ImportFileError extends Error {}

export interface Cells {
  /** Numéro de la ligne dans le fichier (1 pour la première). */
  line: number;
  cells: string[];
}

export interface Sheet {
  name: string;
  rows: Cells[];
}

export interface Workbook {
  sheets: Sheet[];
  /** Dates comptées depuis 1904 (classeurs Mac anciens). */
  date1904: boolean;
}

interface ZipEntry {
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
}

/** Partie décompressée : 50 Mo au plus ; lignes non vides : 20 000 au plus ; 100 colonnes. */
const MAX_PART_BYTES = 50 * 1024 * 1024;
export const MAX_ROWS = 20_000;
const MAX_COLUMNS = 100;

const UNREADABLE = tr("Classeur illisible.");

function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ImportFileError(UNREADABLE);
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const names = new TextDecoder("utf-8");
  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new ImportFileError(UNREADABLE);
    const flags = view.getUint16(p + 8, true);
    if (flags & 1) throw new ImportFileError(tr("Classeur protégé par un mot de passe."));
    const nameLength = view.getUint16(p + 28, true);
    const skip = nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    entries.set(names.decode(bytes.subarray(p + 46, p + 46 + nameLength)), {
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      size: view.getUint32(p + 24, true),
      offset: view.getUint32(p + 42, true),
    });
    p += 46 + skip;
  }
  return entries;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const reader = source.pipeThrough(new DecompressionStream("deflate-raw") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    // Protection contre les archives piégées (un petit fichier qui se décompresse en gigaoctets).
    if (total > MAX_PART_BYTES) {
      await reader.cancel();
      throw new ImportFileError(tr("Classeur trop volumineux."));
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

async function readPart(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p = entry.offset;
  if (p + 30 > bytes.length || view.getUint32(p, true) !== 0x04034b50) throw new ImportFileError(UNREADABLE);
  const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  let raw: Uint8Array;
  if (entry.method === 0) raw = data;
  else if (entry.method === 8) {
    if (entry.size > MAX_PART_BYTES) throw new ImportFileError(tr("Classeur trop volumineux."));
    try {
      raw = await inflate(data);
    } catch (e) {
      if (e instanceof ImportFileError) throw e;
      throw new ImportFileError(UNREADABLE);
    }
  } else throw new ImportFileError(UNREADABLE);
  return new TextDecoder("utf-8").decode(raw);
}

/** XML d'une partie ; les déclarations DOCTYPE (entités) sont refusées. */
function parseXml(text: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new ImportFileError(UNREADABLE);
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new ImportFileError(UNREADABLE);
  return doc;
}

/** Éléments par nom local, quel que soit le préfixe (« row » ou « x:row »). */
const all = (node: Document | Element, name: string) => [...node.getElementsByTagNameNS("*", name)];
const first = (node: Document | Element, name: string) => node.getElementsByTagNameNS("*", name)[0] ?? null;

/** Attribut par nom local (« r:id » ou « id »). */
function attr(element: Element, name: string): string | null {
  for (const a of element.attributes) if (a.localName === name) return a.value;
  return null;
}

/** Texte d'une chaîne riche, sans les indications phonétiques (« rPh »). */
function richText(element: Element): string {
  return all(element, "t")
    .filter((t) => {
      for (let p = t.parentElement; p && p !== element; p = p.parentElement) if (p.localName === "rPh") return false;
      return true;
    })
    .map((t) => t.textContent ?? "")
    .join("");
}

/** « xl/worksheets/sheet1.xml » à partir de la cible d'une relation. */
function resolve(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const piece of target.split("/")) {
    if (piece === "..") parts.pop();
    else if (piece !== ".") parts.push(piece);
  }
  return parts.join("/");
}

function relations(doc: Document | null): Map<string, { type: string; target: string }> {
  const map = new Map<string, { type: string; target: string }>();
  if (!doc) return map;
  for (const r of all(doc, "Relationship")) {
    const id = attr(r, "Id");
    const target = attr(r, "Target");
    if (id && target) map.set(id, { type: attr(r, "Type") ?? "", target });
  }
  return map;
}

/** « B3 » → 1 (colonne B). */
function columnIndex(ref: string | null): number | null {
  const m = ref ? /^([A-Z]+)\d*$/i.exec(ref) : null;
  if (!m) return null;
  let n = 0;
  for (const c of m[1]!.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function cellValue(c: Element, shared: readonly string[]): string {
  const type = attr(c, "t");
  if (type === "inlineStr") {
    const is = first(c, "is");
    return is ? richText(is) : "";
  }
  const v = first(c, "v")?.textContent ?? "";
  if (type === "s") return shared[Number(v)] ?? "";
  if (type === "b") return v === "1" ? "oui" : "non";
  // Cellule en erreur (#N/A, #REF!…) : vide.
  if (type === "e") return "";
  return v;
}

function readSheet(doc: Document, shared: readonly string[]): Cells[] {
  const rows: Cells[] = [];
  let line = 0;
  for (const row of all(doc, "row")) {
    const r = Number(attr(row, "r"));
    line = Number.isInteger(r) && r > line ? r : line + 1;
    const cells: string[] = [];
    let column = 0;
    for (const c of all(row, "c")) {
      column = columnIndex(attr(c, "r")) ?? column;
      if (column < MAX_COLUMNS) cells[column] = cellValue(c, shared);
      column += 1;
    }
    const filled = Array.from(cells, (v) => v ?? "");
    while (filled.length > 0 && filled[filled.length - 1]!.trim() === "") filled.pop();
    if (filled.length === 0) continue;
    rows.push({ line, cells: filled });
    if (rows.length > MAX_ROWS) throw new ImportFileError(tr("Classeur trop long (20 000 lignes au plus)."));
  }
  return rows;
}

/** Onglets visibles d'un classeur, dans l'ordre, avec leurs lignes non vides. */
export async function readWorkbook(bytes: Uint8Array): Promise<Workbook> {
  // Ancien format .xls, ou classeur chiffré par un mot de passe (conteneur OLE).
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new ImportFileError(tr("Classeur protégé par un mot de passe, ou au format .xls. Enregistrez-le au format .xlsx, sans mot de passe."));
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new ImportFileError(UNREADABLE);
  const entries = zipEntries(bytes);
  const part = async (name: string) => {
    const entry = entries.get(name);
    return entry ? parseXml(await readPart(bytes, entry)) : null;
  };

  const root = relations(await part("_rels/.rels"));
  const office = [...root.values()].find((r) => r.type.endsWith("/officeDocument"));
  const workbookPath = office ? resolve("", office.target) : "xl/workbook.xml";
  const workbook = await part(workbookPath);
  if (!workbook) throw new ImportFileError(UNREADABLE);
  const relsPath = resolve(workbookPath, `_rels/${workbookPath.split("/").pop()}.rels`);
  const rels = relations(await part(relsPath));

  const props = first(workbook, "workbookPr");
  const date1904 = props !== null && ["1", "true"].includes(attr(props, "date1904") ?? "");

  const sharedRel = [...rels.values()].find((r) => r.type.endsWith("/sharedStrings"));
  const sharedDoc = await part(sharedRel ? resolve(workbookPath, sharedRel.target) : "xl/sharedStrings.xml");
  const shared = sharedDoc ? all(sharedDoc, "si").map(richText) : [];

  const sheets: Sheet[] = [];
  for (const s of all(workbook, "sheet")) {
    const state = attr(s, "state");
    if (state === "hidden" || state === "veryHidden") continue;
    const rel = rels.get(attr(s, "id") ?? "");
    if (!rel) continue;
    const doc = await part(resolve(workbookPath, rel.target));
    if (!doc) continue;
    sheets.push({ name: attr(s, "name") ?? "", rows: readSheet(doc, shared) });
  }
  return { sheets, date1904 };
}
