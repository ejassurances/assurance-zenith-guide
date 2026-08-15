/**
 * Transfert de dossier, suivi de devis, espaces clients et documents
 * précontractuels Simulassur — SERVEUR UNIQUEMENT.
 *
 * Les liens d'activation et les documents ne transitent jamais en clair dans le
 * journal technique : seuls des métadonnées et des états sont journalisés.
 */

import { callSimulassur, masquerSecretsSimulassur } from "./api.server";
import { categoriserStatut, exigeTacheConseiller, LIBELLE_DOCUMENT, type TypeDocumentSimulassur } from "./referentiels";
import { majSuivi } from "./tarification.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sb = any;

function texte(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

async function chargerSuivi(supabase: Sb, dossierId: string) {
  const { data } = await supabase
    .from("simulassur_dossiers")
    .select("*")
    .eq("dossier_id", dossierId)
    .maybeSingle();
  return data as Record<string, any> | null;
}

/* ------------------------------------------------------------------ */
/* 1. Transfert du devis retenu                                        */
/* ------------------------------------------------------------------ */

/**
 * Envoie le devis sélectionné à Simulassur pour lancer la souscription.
 * Idempotent : un transfert déjà validé n'est pas rejoué.
 */
export async function transfererDossier(
  supabase: Sb,
  params: { dossierId: string; devisId: string; produitCode: string },
  userId: string,
) {
  const suivi = await chargerSuivi(supabase, params.dossierId);
  if (suivi?.transfert_statut === "transfere") {
    throw new Error(
      "Ce dossier a déjà été transféré à Simulassur : créez une nouvelle demande si une modification est nécessaire.",
    );
  }

  const { data: devis } = await supabase
    .from("dossier_devis")
    .select("id, dossier_id, cotisation_mensuelle, garanties_resume, compagnie_id")
    .eq("id", params.devisId)
    .eq("dossier_id", params.dossierId)
    .maybeSingle();
  if (!devis) throw new Error("Devis introuvable sur ce dossier.");

  const quoteId = texte(suivi?.quote_id);
  if (!quoteId && !suivi?.simulation_id) {
    throw new Error(
      "Aucune référence de tarification Simulassur : relancez la tarification avant le transfert.",
    );
  }

  const res = await callSimulassur({
    method: "POST",
    path: "/api/create-transfer",
    body: {
      ...(quoteId ? { quoteId } : {}),
      ...(suivi?.simulation_id ? { simulationId: suivi.simulation_id } : {}),
      product: params.produitCode,
    },
    supabase,
    dossierId: params.dossierId,
  });

  if (!res.ok) {
    await majSuivi(supabase, params.dossierId, (suivi?.client_id as string) ?? null, userId, {
      transfert_statut: "echec",
      derniere_erreur: res.erreur?.message ?? `HTTP ${res.status}`,
    });
    throw new Error(res.erreur?.message ?? `Transfert refusé par Simulassur (HTTP ${res.status}).`);
  }

  const racine = (res.data ?? {}) as Record<string, unknown>;
  const bloc = (racine["DATA"] ?? racine["data"] ?? {}) as Record<string, unknown>;
  const ficheId = texte(bloc["ID"]) || texte(bloc["id"]);

  await majSuivi(supabase, params.dossierId, (suivi?.client_id as string) ?? null, userId, {
    transfert_statut: "transfere",
    transfert_le: new Date().toISOString(),
    transfert_reponse: { statut: texte(racine["STATUS"]) || "OK", fiche_id: ficheId },
    produit_code: params.produitCode,
    devis_id: params.devisId,
    derniere_erreur: null,
    // Le numéro de fiche sert de référence de devis tant que Simulassur n'en
    // fournit pas d'autre pour le suivi et l'espace client.
    ...(ficheId && !quoteId ? { quote_id: ficheId } : {}),
  });

  // Le dossier passe en « souscription envoyée » dans le pipeline CRM.
  await supabase
    .from("dossiers")
    .update({ statut: "souscription_envoyee", updated_at: new Date().toISOString() })
    .eq("id", params.dossierId);

  return { ficheId: ficheId || null, quoteId: quoteId || ficheId || null };
}

/* ------------------------------------------------------------------ */
/* 2. Suivi du devis                                                   */
/* ------------------------------------------------------------------ */

export interface StatutAssureSimulassur {
  customerRef: string | null;
  nom: string | null;
  folderStatus: string | null;
  folderStatusLibelle: string | null;
  cancellationStatus: string | null;
  contractRef: string | null;
  categorie: string;
}

/** Actualise les statuts de souscription et de résiliation par assuré. */
export async function suivreDevis(supabase: Sb, dossierId: string, userId: string) {
  const suivi = await chargerSuivi(supabase, dossierId);
  const quoteId = texte(suivi?.quote_id);
  if (!quoteId) throw new Error("Aucune référence de devis Simulassur à suivre pour ce dossier.");

  const res = await callSimulassur({
    method: "GET",
    path: `/api/v2/quote/follow/${encodeURIComponent(quoteId)}`,
    supabase,
    dossierId,
  });

  // 206 = succès partiel : les statuts disponibles sont conservés.
  const partiel = res.status === 206;
  if (!res.ok && !partiel) {
    await majSuivi(supabase, dossierId, (suivi?.client_id as string) ?? null, userId, {
      derniere_erreur: res.erreur?.message ?? `HTTP ${res.status}`,
    });
    throw new Error(res.erreur?.message ?? `Suivi indisponible (HTTP ${res.status}).`);
  }

  const racine = (res.data ?? {}) as Record<string, unknown>;
  const bloc = (racine["DATA"] ?? racine["data"] ?? racine) as Record<string, unknown>;
  const brut = (bloc["customerStatus"] ?? bloc["customersStatus"] ?? []) as unknown;
  const liste = Array.isArray(brut) ? (brut as Record<string, unknown>[]) : [];

  const statuts: StatutAssureSimulassur[] = liste.map((c) => {
    const libelle =
      texte(c["folderStatusLabel"]) || texte(c["folderStatusLibelle"]) || texte(c["folderStatus"]);
    return {
      customerRef: texte(c["partnerCustomerRef"]) || texte(c["customerRef"]) || null,
      nom: texte(c["lastname"]) || texte(c["name"]) || null,
      folderStatus: texte(c["folderStatus"]) || null,
      folderStatusLibelle: libelle || null,
      cancellationStatus:
        texte(c["cancellationStatusLabel"]) || texte(c["cancellationStatus"]) || null,
      contractRef: texte(c["contractRef"]) || null,
      categorie: categoriserStatut(libelle),
    };
  });

  const contractRef = statuts.find((s) => s.contractRef)?.contractRef ?? null;

  await majSuivi(supabase, dossierId, (suivi?.client_id as string) ?? null, userId, {
    suivi_statuts: statuts,
    suivi_le: new Date().toISOString(),
    suivi_partiel: partiel,
    ...(contractRef ? { contrat_ref: contractRef } : {}),
    derniere_erreur: partiel ? "Suivi partiel : un ou plusieurs assurés n'ont pas pu être suivis." : null,
  });

  // Une action conseiller attendue crée une tâche dans le CRM.
  const aQualifier = statuts.filter((s) => exigeTacheConseiller(s.categorie as never));
  if (aQualifier.length > 0) {
    try {
      const { creerTacheAdmin } = await import("@/lib/agent-taches.server");
      await creerTacheAdmin(supabase, {
        titre: "Simulassur — action du conseiller attendue",
        description: aQualifier
          .map((s) => `${s.nom ?? s.customerRef ?? "Assuré"} : ${s.folderStatusLibelle ?? "statut à traiter"}`)
          .join("\n"),
        client_id: (suivi?.client_id as string) ?? null,
        priorite: "haute",
      });
    } catch (e) {
      console.error("[simulassur] tâche de suivi non créée", e);
    }
  }

  return { statuts, partiel, contractRef, suiviLe: new Date().toISOString() };
}

/* ------------------------------------------------------------------ */
/* 3. Espaces clients                                                  */
/* ------------------------------------------------------------------ */

/**
 * Crée l'espace client Simulassur (deux clients maximum) et conserve les URL
 * d'activation. Les liens ne sont visibles que par le cabinet.
 */
export async function creerEspacesClients(
  supabase: Sb,
  params: { dossierId: string; comptes: { email: string; produitCode: string }[] },
  userId: string,
) {
  const suivi = await chargerSuivi(supabase, params.dossierId);
  const quoteId = texte(suivi?.quote_id);
  if (!quoteId) throw new Error("Aucune référence de devis Simulassur : transférez le dossier d'abord.");
  if (params.comptes.length === 0 || params.comptes.length > 2) {
    throw new Error("Simulassur accepte un à deux espaces clients par demande.");
  }

  const res = await callSimulassur({
    method: "POST",
    path: "/api/v2/customeraccounts/create",
    body: {
      quoteId,
      customerAccounts: params.comptes.map((c) => ({ email: c.email, product: c.produitCode })),
    },
    supabase,
    dossierId: params.dossierId,
  });

  if (!res.ok) {
    await majSuivi(supabase, params.dossierId, (suivi?.client_id as string) ?? null, userId, {
      derniere_erreur: res.erreur?.message ?? `HTTP ${res.status}`,
    });
    throw new Error(
      res.erreur?.message ?? `Création de l'espace client refusée (HTTP ${res.status}).`,
    );
  }

  const racine = (res.data ?? {}) as Record<string, unknown>;
  const bloc = (racine["DATA"] ?? racine["data"] ?? racine) as Record<string, unknown>;
  const brut = (bloc["customerAccounts"] ?? bloc["accounts"] ?? []) as unknown;
  const liste = Array.isArray(brut) ? (brut as Record<string, unknown>[]) : [];

  const espaces = liste.map((c, i) => ({
    email: texte(c["email"]) || (params.comptes[i]?.email ?? ""),
    produit_code: texte(c["product"]) || (params.comptes[i]?.produitCode ?? ""),
    activation_url: texte(c["activationUrl"]) || texte(c["activation_url"]) || null,
    transmis_le: new Date().toISOString(),
  }));

  const existants = Array.isArray(suivi?.espaces_clients) ? suivi.espaces_clients : [];
  await majSuivi(supabase, params.dossierId, (suivi?.client_id as string) ?? null, userId, {
    espaces_clients: [...existants, ...espaces],
    derniere_erreur: null,
  });

  return { espaces };
}

/* ------------------------------------------------------------------ */
/* 4. Documents précontractuels                                        */
/* ------------------------------------------------------------------ */

function decoderBase64(valeur: string): Uint8Array {
  const nettoye = valeur.includes(",") ? valeur.slice(valeur.indexOf(",") + 1) : valeur;
  const binaire = atob(nettoye.replace(/\s+/g, ""));
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return octets;
}

/**
 * Génère les documents demandés (fmc, fsi, cg, devis), les décode côté serveur
 * et les stocke dans le bucket privé du dossier. Le Base64 n'atteint jamais le
 * navigateur.
 */
export async function genererDocuments(
  supabase: Sb,
  params: { dossierId: string; produitCode: string; types: TypeDocumentSimulassur[] },
  userId: string,
) {
  const suivi = await chargerSuivi(supabase, params.dossierId);
  const quoteId = texte(suivi?.quote_id);
  if (!quoteId) throw new Error("Aucune référence de devis Simulassur pour générer les documents.");
  if (params.types.length === 0) throw new Error("Sélectionnez au moins un type de document.");

  const res = await callSimulassur({
    method: "POST",
    path: "/api/v2/documents/generate",
    body: { quoteId, product: params.produitCode, documentTypes: params.types },
    supabase,
    dossierId: params.dossierId,
  });

  if (!res.ok) {
    await majSuivi(supabase, params.dossierId, (suivi?.client_id as string) ?? null, userId, {
      derniere_erreur: res.erreur?.message ?? `HTTP ${res.status}`,
    });
    throw new Error(res.erreur?.message ?? `Génération refusée (HTTP ${res.status}).`);
  }

  const racine = (res.data ?? {}) as Record<string, unknown>;
  const bloc = (racine["DATA"] ?? racine["data"] ?? racine) as Record<string, unknown>;

  const enregistres: { type: string; libelle: string; chemin: string }[] = [];
  const echecs: string[] = [];

  for (const type of params.types) {
    const brut =
      bloc[type] ??
      bloc[type.toUpperCase()] ??
      (Array.isArray(bloc["documents"])
        ? ((bloc["documents"] as Record<string, unknown>[]).find(
            (d) => texte(d["type"]).toLowerCase() === type,
          )?.["content"] ?? null)
        : null);

    if (typeof brut !== "string" || brut.length < 100) {
      echecs.push(`${LIBELLE_DOCUMENT[type]} : non retourné par Simulassur.`);
      continue;
    }

    try {
      const chemin = `${params.dossierId}/simulassur/${type}-${Date.now()}.pdf`;
      const { error: errUp } = await supabase.storage
        .from("dossier-documents")
        .upload(chemin, decoderBase64(brut), { contentType: "application/pdf", upsert: false });
      if (errUp) throw new Error(errUp.message);

      await supabase.from("documents").insert({
        dossier_id: params.dossierId,
        client_id: (suivi?.client_id as string) ?? null,
        file_name: `Simulassur - ${LIBELLE_DOCUMENT[type]}.pdf`,
        categorie: "simulassur",
        mime_type: "application/pdf",
        storage_path: chemin,
        uploader_id: userId,
      });

      enregistres.push({ type, libelle: LIBELLE_DOCUMENT[type], chemin });
    } catch (e) {
      echecs.push(
        `${LIBELLE_DOCUMENT[type]} : ${masquerSecretsSimulassur(e instanceof Error ? e.message : "échec de stockage")}`,
      );
    }
  }

  if (enregistres.length === 0) {
    throw new Error(`Aucun document exploitable.\n${echecs.join("\n")}`.trim());
  }

  return { documents: enregistres, echecs };
}
