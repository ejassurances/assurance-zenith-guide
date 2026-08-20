import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Espace client : le client met à jour ses coordonnées et télécharge ses
 * propres documents. Les écritures passent par le serveur (liste blanche de
 * champs) car la RLS de la table clients réserve l'écriture au cabinet.
 */

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

const coordonneesSchema = z.object({
  civilite: optionalText(20),
  prenom: optionalText(100),
  nom: z.string().trim().min(1).max(100),
  email2: optionalText(255),
  mobile: optionalText(30),
  telephone: optionalText(30),
  adresse: optionalText(255),
  complement_adresse: optionalText(255),
  code_postal: optionalText(10),
  ville: optionalText(120),
  pays: optionalText(80),
  preference_contact: optionalText(30),
});

const norm = (v?: string | null) => {
  const t = (v ?? "").trim();
  return t.length === 0 ? null : t;
};

export const majMesCoordonnees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => coordonneesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!client) throw new Error("Aucune fiche client rattachée à votre compte.");

    const patch = {
      civilite: norm(data.civilite),
      prenom: norm(data.prenom),
      nom: data.nom.trim(),
      email2: norm(data.email2),
      mobile: norm(data.mobile),
      telephone: norm(data.telephone),
      adresse: norm(data.adresse),
      complement_adresse: norm(data.complement_adresse),
      code_postal: norm(data.code_postal),
      ville: norm(data.ville),
      pays: norm(data.pays),
      preference_contact: norm(data.preference_contact),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin.from("clients").update(patch).eq("id", client.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("activites").insert({
      client_id: client.id,
      type: "systeme",
      titre: "Coordonnées modifiées par le client",
      contenu: "Mise à jour effectuée depuis l'espace client.",
      created_by: context.userId,
    });

    return { ok: true };
  });

const BUCKETS = ["conformite-documents", "dossier-documents"] as const;

/** URL signée d'un document du client (pièce KYC ou document de dossier). */
export const monFichierUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        source: z.enum(["kyc", "document"]),
        id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();

    const table = data.source === "kyc" ? "client_kyc_documents" : "documents";
    const { data: row } = await supabaseAdmin
      .from(table)
      .select("storage_path, client_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Document introuvable");

    // Accès autorisé au client propriétaire, sinon on retombe sur la RLS staff.
    const proprietaire = client && (row as { client_id: string | null }).client_id === client.id;
    if (!proprietaire) {
      const { data: visible } = await context.supabase.from(table).select("id").eq("id", data.id).maybeSingle();
      if (!visible) throw new Error("Accès refusé");
    }

    const path = (row as { storage_path: string }).storage_path;
    for (const bucket of BUCKETS) {
      const { data: signed } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 300);
      if (signed?.signedUrl) return { url: signed.signedUrl };
    }
    throw new Error("Fichier indisponible");
  });

/* ------------------------------------------------------------------ *
 * Espace client — compléments : contrats, documents, textes légaux,
 * conseiller référent et messagerie interne.
 * ------------------------------------------------------------------ */

/** Fiche client du compte connecté (via le service, la RLS clients étant staff). */
async function maFicheClient(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("clients")
    .select("id, nom, prenom, email")
    .eq("user_id", userId)
    .maybeSingle();
  return { supabaseAdmin, client: data as { id: string; nom: string; prenom: string | null; email: string | null } | null };
}

/**
 * Toutes les données complémentaires de l'espace client en une seule requête :
 * contrats, documents rattachés (dossier / contrat / client), documents légaux
 * (DER signé, CGU, politique de confidentialité), conseiller référent et fil de
 * messages du dernier dossier.
 */
export const monEspaceComplement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, client } = await maFicheClient(context.userId);
    if (!client) {
      return {
        contrats: [],
        documents: [],
        der: [],
        consentements: [],
        conseiller: null,
        messages: [],
        dossier_id: null as string | null,
      };
    }

    const [{ data: contrats }, { data: dossiers }, { data: docs }, { data: der }, { data: consentements }] =
      await Promise.all([
        supabaseAdmin
          .from("contrats")
          .select(
            "id, numero, statut, date_effet, date_echeance, prime_annuelle, fractionnement, assureur, produit, compagnies(nom), produits(nom)",
          )
          .eq("client_id", client.id)
          .order("date_effet", { ascending: false }),
        supabaseAdmin
          .from("dossiers")
          .select("id, reference, apporteur_id, created_at")
          .eq("client_id", client.id)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("documents")
          .select("id, file_name, categorie, type_document, created_at, dossier_id, contrat_id, client_id")
          .eq("client_id", client.id)
          .order("created_at", { ascending: false })
          .limit(200),
        supabaseAdmin
          .from("client_der_envois")
          .select("id, envoye_le, signed_at, statut, der_modele_id, der_modele(version, nom)")
          .eq("client_id", client.id)
          .order("envoye_le", { ascending: false }),
        supabaseAdmin
          .from("consentements_plateforme")
          .select("id, type, accepte_le, version_texte")
          .eq("client_id", client.id)
          .order("accepte_le", { ascending: false }),
      ]);

    const listeDossiers = (dossiers ?? []) as { id: string; reference: string; apporteur_id: string | null }[];
    const dossierIds = listeDossiers.map((d) => d.id);

    // Documents rattachés à un dossier du client (et non directement à sa fiche).
    let docsDossier: Record<string, unknown>[] = [];
    if (dossierIds.length > 0) {
      const { data } = await supabaseAdmin
        .from("documents")
        .select("id, file_name, categorie, type_document, created_at, dossier_id, contrat_id, client_id")
        .in("dossier_id", dossierIds)
        .order("created_at", { ascending: false })
        .limit(200);
      docsDossier = (data ?? []) as Record<string, unknown>[];
    }

    const parId = new Map<string, Record<string, unknown>>();
    for (const d of [...((docs ?? []) as Record<string, unknown>[]), ...docsDossier]) {
      parId.set(String(d["id"]), d);
    }
    const refParDossier = new Map(listeDossiers.map((d) => [d.id, d.reference] as const));

    // Conseiller référent : apporteur du dossier le plus récent, sinon admin.
    let conseillerId = listeDossiers.find((d) => d.apporteur_id)?.apporteur_id ?? null;
    if (!conseillerId) {
      const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin").limit(1);
      conseillerId = admins?.[0]?.user_id ?? null;
    }
    let conseiller: { nom: string | null; email: string | null; telephone: string | null } | null = null;
    if (conseillerId) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("full_name, email, phone")
        .eq("id", conseillerId)
        .maybeSingle();
      const prof = p as { full_name: string | null; email: string | null; phone: string | null } | null;
      if (prof) conseiller = { nom: prof.full_name, email: prof.email, telephone: prof.phone };
    }

    const dossierCourant = listeDossiers[0]?.id ?? null;
    let messages: { id: string; contenu: string; created_at: string; de_moi: boolean }[] = [];
    if (dossierCourant) {
      const { data: msgs } = await supabaseAdmin
        .from("messages")
        .select("id, contenu, created_at, auteur_id")
        .eq("dossier_id", dossierCourant)
        .order("created_at", { ascending: true })
        .limit(100);
      messages = ((msgs ?? []) as { id: string; contenu: string; created_at: string; auteur_id: string | null }[]).map(
        (m) => ({ id: m.id, contenu: m.contenu, created_at: m.created_at, de_moi: m.auteur_id === context.userId }),
      );
    }

    return {
      contrats: (contrats ?? []).map((c) => {
        const r = c as Record<string, unknown>;
        const comp = r["compagnies"] as { nom: string } | null;
        const prod = r["produits"] as { nom: string } | null;
        return {
          id: String(r["id"]),
          numero: (r["numero"] as string | null) ?? null,
          statut: (r["statut"] as string | null) ?? null,
          date_effet: (r["date_effet"] as string | null) ?? null,
          date_echeance: (r["date_echeance"] as string | null) ?? null,
          prime_annuelle: (r["prime_annuelle"] as number | null) ?? null,
          fractionnement: (r["fractionnement"] as string | null) ?? null,
          compagnie: comp?.nom ?? (r["assureur"] as string | null) ?? null,
          produit: prod?.nom ?? (r["produit"] as string | null) ?? null,
        };
      }),
      documents: [...parId.values()].map((d) => ({
        id: String(d["id"]),
        file_name: String(d["file_name"] ?? "Document"),
        categorie: (d["categorie"] as string | null) ?? null,
        type_document: (d["type_document"] as string | null) ?? null,
        created_at: String(d["created_at"]),
        dossier_reference: d["dossier_id"] ? (refParDossier.get(String(d["dossier_id"])) ?? null) : null,
      })),
      der: ((der ?? []) as Record<string, unknown>[]).map((d) => {
        const m = d["der_modele"] as { version: string | null; nom: string | null } | null;
        return {
          id: String(d["id"]),
          envoye_le: (d["envoye_le"] as string | null) ?? null,
          signed_at: (d["signed_at"] as string | null) ?? null,
          statut: (d["statut"] as string | null) ?? null,
          version: m?.version ?? null,
          telechargeable: Boolean(d["der_modele_id"]),
        };
      }),
      consentements: ((consentements ?? []) as Record<string, unknown>[]).map((c) => ({
        id: String(c["id"]),
        type: String(c["type"]),
        accepte_le: String(c["accepte_le"]),
        version_texte: (c["version_texte"] as string | null) ?? null,
      })),
      conseiller,
      messages,
      dossier_id: dossierCourant,
    };
  });

/**
 * Message du client à son conseiller : conservé dans le fil du dossier et
 * notifié au service client par e-mail (aucune validation intermédiaire).
 */
export const envoyerMonMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ contenu: z.string().trim().min(2).max(4000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, client } = await maFicheClient(context.userId);
    if (!client) throw new Error("Aucune fiche client rattachée à votre compte.");

    const { data: dossier } = await supabaseAdmin
      .from("dossiers")
      .select("id, reference")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const d = dossier as { id: string; reference: string } | null;

    if (d) {
      const { error } = await supabaseAdmin
        .from("messages")
        .insert({ dossier_id: d.id, auteur_id: context.userId, contenu: data.contenu });
      if (error) throw new Error(error.message);
    }

    const nom = `${client.prenom ?? ""} ${client.nom}`.trim();
    await supabaseAdmin.from("activites").insert({
      client_id: client.id,
      dossier_id: d?.id ?? null,
      type: "note",
      titre: "Message reçu depuis l'espace client",
      contenu: data.contenu,
      created_by: context.userId,
    } as never);

    const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin").limit(1);
    await supabaseAdmin.from("taches").insert({
      client_id: client.id,
      titre: `Répondre à ${nom} (message espace client)`,
      description: data.contenu,
      echeance: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
      priorite: "haute",
      statut: "a_faire",
      assignee_id: admins?.[0]?.user_id ?? null,
    });

    try {
      const { envoyerMessage } = await import("@/lib/gmail.server");
      await envoyerMessage({
        to: "service.client@ej-assurances.fr",
        cc: client.email,
        sujet: `Message espace client — ${nom}${d ? ` (dossier ${d.reference})` : ""}`,
        html:
          `<p>Nouveau message déposé dans l'espace client par <strong>${nom}</strong>` +
          `${d ? ` (dossier ${d.reference})` : ""} :</p><p>${data.contenu.replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>`,
      });
    } catch (e) {
      console.error("[espace-client] notification message impossible", e);
    }

    return { ok: true as const };
  });

/** Demande d'une nouvelle étude : ouvre un dossier et alerte le conseiller. */
export const demanderNouvelleEtude = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        type_assurance: z.string().trim().min(2).max(60),
        message: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, client } = await maFicheClient(context.userId);
    if (!client) throw new Error("Aucune fiche client rattachée à votre compte.");

    const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin").limit(1);
    const adminId = admins?.[0]?.user_id ?? null;

    const { creerDossierAutomatique } = await import("@/lib/dossier-automation.server");
    const dossier = await creerDossierAutomatique(supabaseAdmin, {
      client_id: client.id,
      nom: client.nom,
      prenom: client.prenom,
      email: client.email,
      telephone: null,
      type_assurance: data.type_assurance,
      notes: data.message ?? "Demande d'étude déposée depuis l'espace client.",
      capital: null,
      duree_mois: null,
      age: null,
      fumeur: null,
      economie_estimee: null,
      admin_id: adminId,
      origin: "espace-client",
    });

    await supabaseAdmin.from("taches").insert({
      client_id: client.id,
      titre: `Nouvelle demande d'étude — ${`${client.prenom ?? ""} ${client.nom}`.trim()}`,
      description: `Branche : ${data.type_assurance}\nDossier : ${dossier.reference}\n${data.message ?? ""}`.trim(),
      echeance: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
      priorite: "haute",
      statut: "a_faire",
      assignee_id: adminId,
    });

    return { ok: true as const, reference: dossier.reference };
  });

/** URL signée du DER remis au client (modèle archivé de l'envoi concerné). */
export const monDerUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ envoi_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, client } = await maFicheClient(context.userId);
    if (!client) throw new Error("Aucune fiche client rattachée à votre compte.");

    const { data: envoi } = await supabaseAdmin
      .from("client_der_envois")
      .select("id, client_id, der_modele(storage_path)")
      .eq("id", data.envoi_id)
      .maybeSingle();
    const e = envoi as { client_id: string; der_modele: { storage_path: string | null } | null } | null;
    if (!e || e.client_id !== client.id) throw new Error("Accès refusé");
    const path = e.der_modele?.storage_path;
    if (!path) throw new Error("Document indisponible");

    const { data: signed } = await supabaseAdmin.storage.from("conformite-documents").createSignedUrl(path, 300);
    if (!signed?.signedUrl) throw new Error("Document indisponible");
    return { url: signed.signedUrl };
  });

/**
 * Documents DDA du client (lettre de mission et devoir de conseil), qu'ils
 * soient signés ou en attente, avec leur disponibilité en PDF imprimable.
 */
export const mesDocumentsDda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin, client } = await maFicheClient(context.userId);
    if (!client) return { lettres: [], devoirs: [] };

    const [{ data: lettres }, { data: devoirs }] = await Promise.all([
      supabaseAdmin
        .from("lettres_mission")
        .select("id, type_assurance, signed_at, created_at, contenu, dossier_id")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("devoirs_conseil")
        .select("id, type_assurance, statut, signed_at, created_at, contenu, dossier_id")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false }),
    ]);

    const ref = (row: Record<string, unknown>) => {
      const c = row["contenu"] as { dossier?: { reference?: string } } | null;
      return c?.dossier?.reference ?? null;
    };

    return {
      lettres: ((lettres ?? []) as Record<string, unknown>[]).map((l) => ({
        id: String(l["id"]),
        type_assurance: String(l["type_assurance"] ?? ""),
        signed_at: (l["signed_at"] as string | null) ?? null,
        created_at: String(l["created_at"]),
        reference: ref(l),
      })),
      devoirs: ((devoirs ?? []) as Record<string, unknown>[]).map((d) => ({
        id: String(d["id"]),
        type_assurance: String(d["type_assurance"] ?? ""),
        statut: String(d["statut"] ?? ""),
        signed_at: (d["signed_at"] as string | null) ?? null,
        created_at: String(d["created_at"]),
        reference: ref(d),
      })),
    };
  });

/** URL signée du PDF de la lettre de mission du client (généré si absent). */
export const maLettreMissionUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ lettre_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, client } = await maFicheClient(context.userId);
    if (!client) throw new Error("Aucune fiche client rattachée à votre compte.");

    const { data: lettre } = await supabaseAdmin
      .from("lettres_mission")
      .select("id, client_id")
      .eq("id", data.lettre_id)
      .maybeSingle();
    const l = lettre as { client_id: string | null } | null;
    if (!l || l.client_id !== client.id) throw new Error("Accès refusé");

    const { urlPdfLettreMission } = await import("@/lib/espace-client-pdf.server");
    const res = await urlPdfLettreMission(supabaseAdmin, data.lettre_id);
    if (!res) throw new Error("Document indisponible");
    return res;
  });

/** URL signée du PDF du devoir de conseil du client (généré si absent). */
export const monDevoirConseilUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ devoir_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, client } = await maFicheClient(context.userId);
    if (!client) throw new Error("Aucune fiche client rattachée à votre compte.");

    const { data: devoir } = await supabaseAdmin
      .from("devoirs_conseil")
      .select("id, client_id")
      .eq("id", data.devoir_id)
      .maybeSingle();
    const d = devoir as { client_id: string | null } | null;
    if (!d || d.client_id !== client.id) throw new Error("Accès refusé");

    const { urlPdfDevoirConseil } = await import("@/lib/devoir-conseil-archive.server");
    const url = await urlPdfDevoirConseil(supabaseAdmin, data.devoir_id, context.userId);
    if (!url) throw new Error("Document indisponible");
    return { url };
  });

