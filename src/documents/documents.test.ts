import { describe, expect, it } from "vitest";
import { documentDetail, expiryOf, fileKind, guessFromName, parseDocumentReminderId, previewOf, scheduleForDocuments, sizeLabel, sortDocs, stemOf, type Document } from "./documents";

const doc = (partial: Partial<Document>): Document => ({
  id: "d1",
  name: "Carte d'identité.pdf",
  ext: "pdf",
  size: 1000,
  folderId: null,
  tags: [],
  expiresOn: null,
  remindDays: null,
  notes: "",
  spaceId: null,
  createdAt: 0,
  updatedAt: 0,
  docDate: null,
  issuer: "",
  docType: null,
  ...partial,
});

describe("documents", () => {
  it("reconnaît le genre de fichier et l'aperçu possible", () => {
    expect(fileKind("pdf")).toBe("pdf");
    expect(fileKind("jpeg")).toBe("image");
    expect(fileKind("xlsx")).toBe("tableur");
    expect(fileKind("exe")).toBe("autre");
    expect(previewOf("pdf")).toEqual({ mode: "pdf", type: "application/pdf" });
    expect(previewOf("jpg")).toEqual({ mode: "image", type: "image/jpeg" });
    expect(previewOf("md")?.mode).toBe("text");
    expect(previewOf("docx")).toBeNull();
    expect(previewOf("html")).toBeNull();
  });

  it("écrit les tailles à la française", () => {
    expect(sizeLabel(1)).toBe("1 octet");
    expect(sizeLabel(845)).toBe("845 octets");
    expect(sizeLabel(12_800)).toBe("13 ko");
    expect(sizeLabel(1_468_006)).toBe("1,4 Mo");
    expect(sizeLabel(25 * 1024 * 1024)).toBe("25 Mo");
    expect(documentDetail({ ext: "pdf", size: 1_468_006 })).toBe("PDF · 1,4 Mo");
    expect(stemOf({ name: "Bail.PDF", ext: "pdf" })).toBe("Bail");
    expect(stemOf({ name: "LISEZMOI", ext: "" })).toBe("LISEZMOI");
  });

  it("indique l'expiration", () => {
    const today = "2026-10-01";
    expect(expiryOf(doc({}), today)).toBeNull();
    expect(expiryOf(doc({ expiresOn: "2026-09-29" }), today)).toMatchObject({ state: "expire", label: "Expiré depuis le 29 septembre 2026" });
    expect(expiryOf(doc({ expiresOn: "2026-10-01" }), today)).toMatchObject({ state: "bientot", label: "Expire aujourd'hui" });
    expect(expiryOf(doc({ expiresOn: "2026-10-02" }), today)?.label).toBe("Expire demain");
    expect(expiryOf(doc({ expiresOn: "2026-10-21" }), today)).toMatchObject({ state: "bientot", label: "Expire dans 20 jours" });
    expect(expiryOf(doc({ expiresOn: "2026-11-25" }), today)).toMatchObject({ state: "valide", label: "Expire dans 55 jours" });
    expect(expiryOf(doc({ expiresOn: "2026-11-25", remindDays: 60 }), today)?.state).toBe("bientot");
    expect(expiryOf(doc({ expiresOn: "2031-03-01" }), today)).toMatchObject({ state: "valide", label: "Expire le 1er mars 2031" });
  });

  it("programme le rappel d'expiration à 9 h", () => {
    const now = new Date(2026, 9, 1, 10, 0);
    const list = scheduleForDocuments(
      [doc({ expiresOn: "2026-11-01", remindDays: 30 }), doc({ id: "d2", expiresOn: "2026-11-01", remindDays: null }), doc({ id: "d3", expiresOn: "2026-10-01", remindDays: 0 })],
      now,
    );
    expect(list).toEqual([{ at: new Date(2026, 9, 2, 9, 0).getTime() / 1000, taskId: "doc:d1", title: "Carte d'identité.pdf", when: "Expire le 1er novembre 2026" }]);
    expect(parseDocumentReminderId("doc:d1")).toBe("d1");
    expect(parseDocumentReminderId("evt:x")).toBeNull();
  });
});

describe("sorte, date et tri", () => {
  it("devine la sorte et la date d'après le nom du fichier", () => {
    expect(guessFromName("Facture électricité 2026-09-30.pdf")).toEqual({ docType: "facture", docDate: "2026-09-30" });
    expect(guessFromName("Bulletin_de_salaire_septembre_2026.pdf")).toEqual({ docType: "fiche-de-paie", docDate: "2026-09-01" });
    expect(guessFromName("releve-compte 12.08.2026.pdf")).toEqual({ docType: "releve", docDate: "2026-08-12" });
    expect(guessFromName("Avis d'imposition 2025.pdf")).toEqual({ docType: "impots" });
    expect(guessFromName("scan_20260115.jpg")).toEqual({ docDate: "2026-01-15" });
    expect(guessFromName("Carte d'identité.pdf")).toEqual({ docType: "identite" });
    expect(guessFromName("Photo vacances.jpg")).toEqual({});
    // Noms anglais.
    expect(guessFromName("Bill EDF 2026-09-30.pdf")).toEqual({ docType: "facture", docDate: "2026-09-30" });
    expect(guessFromName("Payslip September 2026.pdf")).toEqual({ docType: "fiche-de-paie", docDate: "2026-09-01" });
    expect(guessFromName("Tenancy agreement.pdf")).toEqual({ docType: "contrat" });
    expect(guessFromName("Passport scan.jpg")).toEqual({ docType: "identite" });
    // Une date impossible n'est pas retenue.
    expect(guessFromName("Contrat 2026-02-30.pdf")).toEqual({ docType: "contrat" });
  });

  it("trie par ajout, date du document, nom ou taille", () => {
    const list = [
      doc({ id: "a", name: "B.pdf", size: 10, createdAt: 1, docDate: "2026-01-01" }),
      doc({ id: "b", name: "a.pdf", size: 30, createdAt: 3, docDate: null }),
      doc({ id: "c", name: "C 10.pdf", size: 20, createdAt: 2, docDate: "2026-05-01" }),
    ];
    expect(sortDocs(list, "ajout").map((d) => d.id)).toEqual(["b", "c", "a"]);
    expect(sortDocs(list, "date").map((d) => d.id)).toEqual(["c", "a", "b"]);
    expect(sortDocs(list, "nom").map((d) => d.id)).toEqual(["b", "a", "c"]);
    expect(sortDocs(list, "taille").map((d) => d.id)).toEqual(["b", "c", "a"]);
  });
});
