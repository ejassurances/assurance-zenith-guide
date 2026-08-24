import { PDFDocument, StandardFonts } from "pdf-lib";
import { supabaseAdmin as admin } from "@/integrations/supabase/client.server";
import { classifierDocument } from "@/lib/classification-documentaire.server";
import { extraireDocument } from "@/lib/extraction-documentaire.server";

async function pdf(lignes: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  let y = 790;
  for (const l of lignes) {
    page.drawText(l.slice(0, 95), { x: 40, y, size: 11, font });
    y -= 18;
  }
  return doc.save();
}

const CAS: { nom: string; lignes: string[] }[] = [
  {
    nom: "T1-offre-pret.pdf",
    lignes: [
      "BANQUE POPULAIRE VAL DE FRANCE",
      "OFFRE DE PRET IMMOBILIER - Reference PRET-2026-88231",
      "Date d'edition : 14/03/2026",
      "Montant du capital emprunte : 250 000,00 EUR",
      "Taux nominal annuel fixe : 3,45 %",
      "TAEG : 3,92 %",
      "Duree totale : 240 mois",
      "Mensualite hors assurance : 1 434,52 EUR",
      "Premiere echeance : 05/05/2026",
    ],
  },
  {
    nom: "T2-tableau-amortissement.pdf",
    lignes: [
      "TABLEAU D'AMORTISSEMENT - CREDIT AGRICOLE",
      "Capital emprunte : 180 000,00 EUR - Taux : 3,10 %",
      "Duree : 180 mois - Mensualite : 1 251,00 EUR",
      "Echeance 1 : 01/06/2026 capital 786,00 interets 465,00",
      "Echeance 2 : 01/07/2026 capital 788,00 interets 463,00",
      "Echeance 3 : 01/08/2026 capital 790,00 interets 461,00",
      "Nombre total d'echeances : 180",
    ],
  },
  {
    nom: "T3-kbis.pdf",
    lignes: [
      "EXTRAIT KBIS - GREFFE DU TRIBUNAL DE COMMERCE DE PONTOISE",
      "Denomination sociale : EJ PARTNERS ASSURANCES",
      "Forme juridique : Societe par actions simplifiee",
      "SIREN : 500 256 904",
      "SIRET du siege : 500 256 904 00018",
      "Representant legal : DUPONT Jean",
      "Adresse du siege : 71 rue du Docteur Roux, 95600 Eaubonne",
      "Activite principale : courtage d'assurances",
      "Date d'immatriculation : 12/01/2008",
    ],
  },
  {
    nom: "T4-cni.pdf",
    lignes: [
      "REPUBLIQUE FRANCAISE - CARTE NATIONALE D'IDENTITE",
      "Nom : MARTIN",
      "Prenom : Claire",
      "Nee le : 07/02/1988 a LYON",
      "Numero du document : 880207512345",
      "Date d'expiration : 30/09/2031",
      "Nationalite : Francaise",
    ],
  },
  {
    nom: "T5-rib.pdf",
    lignes: [
      "RELEVE D'IDENTITE BANCAIRE",
      "Titulaire du compte : Mme Claire MARTIN",
      "Banque : SOCIETE GENERALE - Agence Eaubonne",
      "IBAN : FR76 3000 3033 2000 0512 6540 189",
      "BIC : SOGEFRPP",
    ],
  },
  { nom: "T6-illisible.pdf", lignes: ["", "   ", "?????", "###"] },
  {
    nom: "T7-inconnu.pdf",
    lignes: [
      "MENU DE LA CANTINE - SEMAINE 12",
      "Lundi : carottes rapees, poisson pane",
      "Mardi : soupe, gratin de courgettes",
    ],
  },
  {
    nom: "T10-medical.pdf",
    lignes: [
      "QUESTIONNAIRE DE SANTE - ASSURANCE EMPRUNTEUR",
      "Avez-vous ete hospitalise au cours des 5 dernieres annees ? OUI",
      "Traitement en cours : antihypertenseur depuis 2021",
      "Poids : 82 kg - Taille : 178 cm - Fumeur : non",
    ],
  },
];

const BUCKET = "dossier-documents";
const resultats: string[] = [];
const crees: { id: string; chemin: string }[] = [];

async function deposer(nom: string, octets: Uint8Array): Promise<string> {
  const chemin = `recette-2c/${Date.now()}-${nom}`;
  const { error } = await admin.storage.from(BUCKET).upload(chemin, octets, { contentType: "application/pdf" });
  if (error) throw new Error(`upload ${nom} : ${error.message}`);
  return chemin;
}

let uploader = "";
let clientId = "";

async function creerDocument(nom: string, chemin: string, taille: number): Promise<string> {
  const { data, error } = await admin
    .from("documents")
    .insert({ file_name: nom, storage_path: chemin, mime_type: "application/pdf", file_size: taille, categorie: "a_classer", type_document: "piece_client_email", uploader_id: uploader, client_id: clientId } as never)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`insert ${nom} : ${error.message}`);
  return (data as { id: string }).id;
}

async function main() {
  const { data: u } = await admin.from("profiles").select("id").limit(1).maybeSingle();
  uploader = (u as { id: string }).id;
  const { data: cl } = await admin.from("clients").select("id").limit(1).maybeSingle();
  clientId = (cl as { id: string }).id;
  const parNom = new Map<string, string>();
  for (const cas of CAS) {
    const octets = await pdf(cas.lignes);
    const chemin = await deposer(cas.nom, octets);
    const id = await creerDocument(cas.nom, chemin, octets.byteLength);
    crees.push({ id, chemin });
    parNom.set(cas.nom, id);

    const cl = await classifierDocument(admin as never, id);
    const x = await extraireDocument(admin as never, id);
    const { data: row } = await admin
      .from("doc_extractions")
      .select("type_document, extracted_data, confidence_score, statut, erreur, model")
      .eq("document_id", id)
      .maybeSingle();
    resultats.push(
      `\n### ${cas.nom}\nclassification: ${JSON.stringify(cl.statut === "classe" ? { t: cl.classification.type_document, c: cl.classification.confidence } : cl)}\nextraction: ${JSON.stringify(x)}\ndoc_extractions: ${JSON.stringify(row)}`,
    );
  }

  // TEST 9 — idempotence sur l'offre de prêt
  const idT1 = parNom.get("T1-offre-pret.pdf")!;
  const rejoue = await extraireDocument(admin as never, idT1);
  resultats.push(`\n### TEST9 idempotence\n${JSON.stringify({ statut: rejoue.statut })}`);

  // TEST 8 — Gemini indisponible (clé retirée le temps de l'appel)
  const cle = process.env["LOVABLE_API_KEY"];
  delete process.env["LOVABLE_API_KEY"];
  const idT5 = parNom.get("T5-rib.pdf")!;
  const panne = await extraireDocument(admin as never, idT5, { forcer: true });
  process.env["LOVABLE_API_KEY"] = cle!;
  const { data: apresPanne } = await admin
    .from("doc_extractions")
    .select("statut, erreur, extracted_data")
    .eq("document_id", idT5)
    .maybeSingle();
  const { data: docApres } = await admin.from("documents").select("id, storage_path").eq("id", idT5).maybeSingle();
  resultats.push(
    `\n### TEST8 panne IA\n${JSON.stringify({ panne, apresPanne, documentConserve: Boolean(docApres) })}`,
  );

  console.log(resultats.join("\n"));

  // Nettoyage : suppression complète des documents de recette.
  for (const c of crees) {
    await admin.from("doc_extractions").delete().eq("document_id", c.id);
    await admin.from("documents").delete().eq("id", c.id);
    await admin.storage.from(BUCKET).remove([c.chemin]);
  }
  console.log("\nNETTOYAGE OK");
}

main().catch((e) => {
  console.error("RECETTE KO", e);
  process.exit(1);
});
