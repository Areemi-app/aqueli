/** Documents chiffrés et dossiers (src-tauri/src/data/documents.rs). */
import { invoke } from "@tauri-apps/api/core";
import { asDataError } from "../lib/dataError";
import { demo } from "../lib/demo";
import { inTauri } from "../lib/windowControls";
import { addDays, dayKey } from "../tasks/day";
import type { Document, DocumentMeta, Folder, FolderInput } from "./documents";

/** Fichier qui n'a pas pu être ajouté. */
export interface RefusedFile {
  name: string;
  reason: "tooLarge" | "tooMany" | "unreadable";
}

export interface AddedDocuments {
  added: Document[];
  refused: RefusedFile[];
}

export interface DocumentsApi {
  list(): Promise<Document[]>;
  folders(): Promise<Folder[]>;
  createFolder(folder: FolderInput): Promise<Folder>;
  updateFolder(id: string, folder: FolderInput): Promise<Folder>;
  removeFolder(id: string): Promise<void>;
  /** Nouvel ordre (glisser-déposer). */
  reorderFolders(ids: string[]): Promise<void>;
  /** Fenêtre « Ouvrir » de Windows : chemins choisis (vide si annulée). */
  pick(): Promise<string[]>;
  /** Copie dans la base chiffrée des fichiers choisis ou glissés. */
  add(paths: string[], folderId: string | null, spaceId: string | null): Promise<AddedDocuments>;
  read(id: string): Promise<Uint8Array>;
  /** Copie en clair là où la personne le choisit ; `null` si elle a annulé. */
  exportTo(id: string): Promise<string | null>;
  /** Plusieurs documents vers un dossier choisi : leur nombre, ou nul si la personne annule. */
  exportMany(ids: string[]): Promise<number | null>;
  update(id: string, meta: DocumentMeta): Promise<Document>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<Document>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: DocumentsApi = {
  list: () => call("documents_list"),
  folders: () => call("folders_list"),
  createFolder: (folder) => call("folders_create", { folder }),
  updateFolder: (id, folder) => call("folders_update", { id, folder }),
  removeFolder: (id) => call("folders_delete", { id }),
  reorderFolders: (ids) => call("order_save", { kind: "dossiers-documents", ids }),
  pick: () => call("documents_pick"),
  add: (paths, folderId, spaceId) => call("documents_add", { paths, folderId, spaceId }),
  read: async (id) => new Uint8Array(await call<ArrayBuffer>("documents_read", { id })),
  exportTo: (id) => call("documents_export", { id }),
  exportMany: (ids) => call("documents_export_many", { ids }),
  update: (id, document) => call("documents_update", { id, document }),
  remove: (id) => call("documents_delete", { id }),
  restore: (id) => call("documents_restore", { id }),
};

const SAMPLE_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 420 260]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 58>>stream
BT /F1 22 Tf 40 140 Td (${demo("Exemple de document", "Sample document")}) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF`;

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd0ff"/><stop offset="1" stop-color="#e8f7ff"/></linearGradient></defs><rect width="640" height="420" fill="url(#c)"/><circle cx="500" cy="110" r="54" fill="#ffe27a"/><path d="M0 330 Q160 250 320 320 T640 300 V420 H0z" fill="#5cc46a"/></svg>`;

/** Documents d'exemple pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): DocumentsApi {
  const now = () => Math.floor(Date.now() / 1000);
  const today = dayKey(new Date());
  const encode = (text: string) => new TextEncoder().encode(text);
  let seq = 0;
  let folders: Folder[] = [
    { id: "apercu-dos1", name: demo("Papiers d'identité", "ID documents"), icon: "carte", color: "#2d6ff0", position: 0 },
    { id: "apercu-dos2", name: demo("Logement", "Home"), icon: "maison", color: "#e0671f", position: 1 },
  ];
  const content = new Map<string, Uint8Array>();
  const make = (name: string, data: Uint8Array, extra: Partial<Document> = {}): Document => {
    seq += 1;
    const id = `apercu-doc${seq}`;
    content.set(id, data);
    const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    return {
      id,
      name,
      ext,
      size: data.length,
      folderId: null,
      tags: [],
      expiresOn: null,
      remindDays: null,
      notes: "",
      spaceId: "perso",
      createdAt: now() - 5000 + seq,
      updatedAt: now(),
      docDate: null,
      issuer: "",
      docType: null,
      ...extra,
    };
  };
  let documents: Document[] = [
    make(demo("Carte d'identité.pdf", "Driving licence.pdf"), encode(SAMPLE_PDF), { folderId: "apercu-dos1", expiresOn: addDays(today, 24), remindDays: 30, tags: [demo("identité", "ID")] }),
    make(demo("Passeport.pdf", "Passport.pdf"), encode(SAMPLE_PDF), { folderId: "apercu-dos1", expiresOn: addDays(today, 800), remindDays: 90 }),
    make(demo("Bail de location.pdf", "Tenancy agreement.pdf"), encode(SAMPLE_PDF), { folderId: "apercu-dos2", docType: "contrat", issuer: demo("Agence du Parc", "Parkside Lettings"), docDate: "2024-07-01" }),
    make(demo("Facture électricité 2026-09-30.pdf", "Electricity bill 2026-09-30.pdf"), encode(SAMPLE_PDF), { folderId: "apercu-dos2", docType: "facture", issuer: demo("EDF", "Brightwater Energy"), docDate: "2026-09-30" }),
    make(demo("Plan de l'appartement.svg", "Flat floor plan.svg"), encode(SAMPLE_SVG), { folderId: "apercu-dos2" }),
    make(demo("Codes du portail.txt", "Gate codes.txt"), encode(demo("Portail : 4589\nBoîte aux lettres : n° 12\n", "Gate: 4589\nLetterbox: No. 12\n"))),
  ];
  const deleted = new Map<string, Document>();
  const find = (id: string) => {
    const d = documents.find((x) => x.id === id);
    if (!d) throw asDataError({ code: "notFound" });
    return d;
  };
  return {
    list: async () => documents,
    folders: async () => folders,
    createFolder: async (input) => {
      seq += 1;
      const f = { ...input, id: `apercu-dos${seq}`, position: folders.length };
      folders = [...folders, f];
      return f;
    },
    updateFolder: async (id, input) => {
      const f = { ...folders.find((x) => x.id === id)!, ...input };
      folders = folders.map((x) => (x.id === id ? f : x));
      return f;
    },
    reorderFolders: async (ids) => {
      folders = folders.map((x) => (ids.includes(x.id) ? { ...x, position: ids.indexOf(x.id) } : x)).sort((a, b) => a.position - b.position);
    },
    removeFolder: async (id) => {
      folders = folders.filter((f) => f.id !== id);
      documents = documents.map((d) => (d.folderId === id ? { ...d, folderId: null } : d));
    },
    pick: async () => [demo("C:\\Users\\…\\Documents\\Facture électricité.pdf", "C:\\Users\\…\\Documents\\Electricity bill.pdf")],
    add: async (paths, folderId, spaceId) => {
      const added = paths.map((p) => make(p.split("\\").pop() ?? p, encode(SAMPLE_PDF), { folderId, spaceId }));
      documents = [...documents, ...added];
      return { added, refused: [] };
    },
    read: async (id) => {
      find(id);
      return content.get(id) ?? new Uint8Array();
    },
    exportTo: async (id) => `C:\\Users\\…\\Bureau\\${find(id).name}`,
    exportMany: async (ids) => ids.length,
    update: async (id, meta) => {
      const current = find(id);
      const name = current.ext && !meta.name.toLowerCase().endsWith(`.${current.ext}`) ? `${meta.name}.${current.ext}` : meta.name;
      const d = { ...current, ...meta, name, remindDays: meta.expiresOn ? meta.remindDays : null, updatedAt: now() };
      documents = documents.map((x) => (x.id === id ? d : x));
      return d;
    },
    remove: async (id) => {
      deleted.set(id, find(id));
      documents = documents.filter((d) => d.id !== id);
    },
    restore: async (id) => {
      const d = deleted.get(id);
      if (!d) throw asDataError({ code: "notFound" });
      documents = [...documents, d];
      return d;
    },
  };
}

export const documentsApi: DocumentsApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
