import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { classerPiece, piecesRequisesPour } from "@/lib/pieces-requises";
import { executerRechercheLCB } from "@/lib/lcb-ft.server";

/**
 * Automatisation complète du traitement d'un lead :
 * dossier + checklist des pièces + classement automatique des fichiers reçus
 * + contrôle LCB-FT + création de l'espace client (mot de passe provisoire).
 */

type Admin = SupabaseClient<Database>;

export interface PieceJointeEntrante {
  nom: string;
  type?: string | null;
  taille?: number | null;
  contenu_base64?: string | null;
}

export interface AutomationInput {
  client_id: string;
  nom: string;
  prenom?: string | null;
  email?: string | null;
  telephone?: string | null;
  type_assurance: string;
  notes?: string | null;
  capital?: number | null;
  duree_mois?: number | null;
  age?: number | null;
  fumeur?: boolean | null;
  economie_estimee?: number | null;
  pieces_jointes?: PieceJointeEntrante[];
  admin_id?: string | null;
  origin: string;
}

export function genererMotDePasseProvisoire(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out}!7`;
}

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Crée le dossier et sa checklist de pièces requises. */
export async function creerDossierAutomatique(admin: Admin, input: AutomationInput) {
  const { data: dossier, error } = await admin
    .from("dossiers")
    .insert({
      client_nom: `${input.prenom ?? ""} ${input.nom}`.trim(),
      client_email: input.email ?? null,
      client_phone: input.telephone ?? null,
      type_assurance: input.type_assurance,
      statut: "nouveau",
      capital: input.capital ?? null,
      duree_mois: input.duree_mois ?? null,
      age: input.age ?? null,
      fumeur: input.fumeur ?? null,
      economie_estimee: input.economie_estimee ?? null,
      notes: input.notes ?? null,
      cree_automatiquement: true,
      created_by: input.admin_id ?? null,
    })
    .select("id, reference")
    .single();
  if (error || !dossier) throw new Error(error?.message ?? "Création du dossier impossible");

  const attendues = piecesRequisesPour(input.type_assurance);
  await admin.from("dossier_pieces_requises").insert(
    attendues.map((p) => ({
      dossier_id: dossier.id,
      client_id: input.client_id,
      code: p.code,
      libelle: p.libelle,
      categorie: p.categorie,
      obligatoire: p.obligatoire,
      statut: "manquante",
    })),
  );

  return dossier;
}

/**
 * Classe automatiquement les fichiers reçus : les pièces KYC vont dans le
 * dossier de conformité du client, les autres dans les documents du dossier.
 * Les fichiers non identifiables sont enregistrés en catégorie « à qualifier ».
 */
export async function classerPiecesJointes(
  admin: Admin,
  params: {
    client_id: string;
    dossier_id: string;
    type_assurance: string;
    admin_id?: string | null;
    pieces: PieceJointeEntrante[];
  },
) {
  const resultats: { nom: string; code: string | null; categorie: string }[] = [];

  for (const piece of params.pieces) {
    const classement = classerPiece(piece.nom, params.type_assurance);
    const safeName = piece.nom.replace(/[^\w.\-]+/g, "_").slice(0, 120);
    const path = `${params.client_id}/${Date.now()}-${safeName}`;

    let uploaded = false;
    if (piece.contenu_base64) {
      const bucket = classement.categorie === "kyc" ? "conformite-documents" : "dossier-documents";
      const { error: upErr } = await admin.storage
        .from(bucket)
        .upload(path, decodeBase64(piece.contenu_base64), {
          contentType: piece.type || "application/octet-stream",
          upsert: true,
        });
      uploaded = !upErr;
    }

    if (classement.categorie === "kyc" && classement.kyc_type && uploaded) {
      const { data: kyc } = await admin
        .from("client_kyc_documents")
        .insert({
          client_id: params.client_id,
          type: classement.kyc_type,
          nom: piece.nom,
          storage_path: path,
          statut: "a_valider",
          uploaded_by: params.admin_id ?? null,
          notes: "Classé automatiquement depuis le formulaire web",
        })
        .select("id")
        .single();
      if (kyc) {
        await admin
          .from("dossier_pieces_requises")
          .update({ statut: "recue", recue_le: new Date().toISOString(), kyc_document_id: kyc.id })
          .eq("dossier_id", params.dossier_id)
          .eq("code", classement.code!);
      }
    } else if (params.admin_id && uploaded) {
      const { data: doc } = await admin
        .from("documents")
        .insert({
          dossier_id: params.dossier_id,
          client_id: params.client_id,
          uploader_id: params.admin_id,
          storage_path: path,
          file_name: piece.nom,
          file_size: piece.taille ?? null,
          mime_type: piece.type ?? null,
          categorie: classement.categorie,
        })
        .select("id")
        .single();

      if (doc && classement.code) {
        await admin
          .from("dossier_pieces_requises")
          .update({ statut: "recue", recue_le: new Date().toISOString(), document_id: doc.id })
          .eq("dossier_id", params.dossier_id)
          .eq("code", classement.code);
      } else if (doc) {
        // Fichier non identifiable : on crée une ligne « à qualifier »
        await admin.from("dossier_pieces_requises").insert({
          dossier_id: params.dossier_id,
          client_id: params.client_id,
          code: `a_qualifier_${doc.id.slice(0, 8)}`,
          libelle: piece.nom,
          categorie: "a_qualifier",
          obligatoire: false,
          statut: "recue",
          recue_le: new Date().toISOString(),
          document_id: doc.id,
        });
      }
    }

    resultats.push({ nom: piece.nom, code: classement.code, categorie: classement.categorie });
  }

  return resultats;
}

/** Contrôle LCB-FT automatique (sanctions + PPE). */
export async function lancerLcbAutomatique(
  admin: Admin,
  params: { client_id: string; nom: string; prenom?: string | null; date_naissance?: string | null },
) {
  try {
    return await executerRechercheLCB(admin, {
      client_id: params.client_id,
      nom: params.nom,
      prenom: params.prenom ?? null,
      date_naissance: params.date_naissance ?? null,
      verifie_par: null,
    });
  } catch {
    return null;
  }
}

/**
 * Crée l'espace client avec un mot de passe provisoire et envoie l'e-mail
 * d'accès. Le changement de mot de passe est ensuite obligatoire.
 */
export async function creerEspaceClient(
  admin: Admin,
  params: { client_id: string; email: string; nom: string; prenom?: string | null; origin: string },
) {
  const { data: existing } = await admin.from("profiles").select("id").eq("email", params.email).maybeSingle();

  if (existing) {
    await admin.from("clients").update({ user_id: existing.id }).eq("id", params.client_id).is("user_id", null);
    return { created: false, email_sent: false, user_id: existing.id };
  }

  const password = genererMotDePasseProvisoire();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: params.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `${params.prenom ?? ""} ${params.nom}`.trim() },
  });
  if (error || !created.user) return { created: false, email_sent: false, user_id: null };

  await admin.from("profiles").update({ must_change_password: true }).eq("id", created.user.id);
  await admin.from("clients").update({ user_id: created.user.id }).eq("id", params.client_id).is("user_id", null);

  let emailSent = false;
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const res = await sendTemplateEmail("compte-client-cree", params.email, {
      templateData: {
        clientName: `${params.prenom ?? ""} ${params.nom}`.trim(),
        email: params.email,
        motDePasseProvisoire: password,
        link: `${params.origin}/auth`,
      },
      idempotencyKey: `compte-client-${created.user.id}`,
    });
    emailSent = res.sent;
  } catch {
    emailSent = false;
  }

  return { created: true, email_sent: emailSent, user_id: created.user.id };
}
