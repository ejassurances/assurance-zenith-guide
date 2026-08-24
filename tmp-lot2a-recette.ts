/** Recette Lot 2A — script temporaire (supprimé après exécution). */
import { readFileSync } from "node:fs";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifierDocument } from "@/lib/classification-documentaire.server";

const FIXTURES = [
  { fichier: "offre_pret.pdf", attendu: "offre_pret" },
  { fichier: "tableau_amortissement.pdf", attendu: "offre_pret" },
  { fichier: "rib.pdf", attendu: "rib" },
  { fichier: "cni.pdf", attendu: "cni" },
  { fichier: "illisible.pdf", attendu: "a_qualifier|autre" },
  { fichier: "inconnu.pdf", attendu: "autre" },
];

const { data: prof } = await supabaseAdmin.from("profiles").select("id").limit(1).maybeSingle();
const { data: cli } = await supabaseAdmin.from("clients").select("id").limit(1).maybeSingle();
const uploader = (prof as { id: string }).id;
const clientId = (cli as { id: string }).id;

const crees: { id: string; chemin: string }[] = [];

for (const f of FIXTURES) {
  const octets = readFileSync(`/tmp/lot2a/${f.fichier}`);
  const chemin = `${clientId}/TEST-LOT2A/${Date.now()}-${f.fichier}`;
  const up = await supabaseAdmin.storage
    .from("dossier-documents")
    .upload(chemin, octets, { contentType: "application/pdf" });
  if (up.error) throw new Error(`upload ${f.fichier} : ${up.error.message}`);

  const { data: doc, error } = await supabaseAdmin
    .from("documents")
    .insert({
      client_id: clientId,
      file_name: f.fichier,
      storage_path: chemin,
      mime_type: "application/pdf",
      file_size: octets.byteLength,
      categorie: "a_classer",
      type_document: "piece_client_email",
      uploader_id: uploader,
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const id = (doc as { id: string }).id;
  crees.push({ id, chemin });

  const res = await classifierDocument(supabaseAdmin, id);
  const c = res.statut === "classe" ? res.classification : null;
  console.log(
    `${f.fichier.padEnd(28)} attendu=${f.attendu.padEnd(16)} → statut=${res.statut}`,
    c ? `type=${c.type_document} conf=${c.confidence} lisible=${c.document_lisible} traitement=${c.traitement} anomalie=${c.anomalie} model=${c.model} | ${c.justification}` : JSON.stringify(res),
  );

  // TEST 7 — idempotence
  const rerun = await classifierDocument(supabaseAdmin, id);
  console.log(`   idempotence → ${rerun.statut}`);

  const { data: relu } = await supabaseAdmin
    .from("documents")
    .select("type_document, classification_ia, classification_le")
    .eq("id", id)
    .maybeSingle();
  console.log(`   persistance → ${JSON.stringify(relu)}`);
}

// TEST 8 — Gemini indisponible (clé retirée) : aucun document perdu, aucune classification inventée
const octets = readFileSync("/tmp/lot2a/rib.pdf");
const chemin = `${clientId}/TEST-LOT2A/${Date.now()}-panne.pdf`;
await supabaseAdmin.storage.from("dossier-documents").upload(chemin, octets, { contentType: "application/pdf" });
const { data: docPanne } = await supabaseAdmin
  .from("documents")
  .insert({
    client_id: clientId,
    file_name: "panne.pdf",
    storage_path: chemin,
    mime_type: "application/pdf",
    file_size: octets.byteLength,
    categorie: "a_classer",
    type_document: "piece_client_email",
    uploader_id: uploader,
  })
  .select("id")
  .maybeSingle();
const idPanne = (docPanne as { id: string }).id;
crees.push({ id: idPanne, chemin });
const cle = process.env["LOVABLE_API_KEY"];
delete process.env["LOVABLE_API_KEY"];
const panne = await classifierDocument(supabaseAdmin, idPanne);
process.env["LOVABLE_API_KEY"] = cle!;
const { data: apresPanne } = await supabaseAdmin
  .from("documents")
  .select("id, type_document, classification_ia, classification_le")
  .eq("id", idPanne)
  .maybeSingle();
console.log("TEST 8 panne IA →", JSON.stringify(panne), JSON.stringify(apresPanne));

// Nettoyage
for (const c of crees) {
  await supabaseAdmin.storage.from("dossier-documents").remove([c.chemin]);
  const { error } = await supabaseAdmin.from("documents").delete().eq("id", c.id);
  if (error) console.log(`nettoyage document ${c.id} : ${error.message}`);
}
console.log("nettoyage terminé");
