/**
 * CRÉATION D'UN DOSSIER EMPRUNTEUR À PARTIR D'UNE OFFRE DE PRÊT.
 *
 * 1. `analyserOffrePretCreation` — lecture seule : l'IA lit l'offre de prêt (ou
 *    le tableau d'amortissement), renseigne tout ce qu'elle trouve du prêt et
 *    des emprunteurs, et rapproche chaque emprunteur d'une fiche client
 *    existante (dédoublonnage email puis nom + prénom).
 * 2. `creerFichesEmprunteurs` — écriture : crée les fiches clients manquantes
 *    (statut prospect) pour les emprunteurs identifiés.
 *
 * Garde-fous : aucune valeur saisie n'est écrasée, aucune donnée n'est déduite,
 * aucune donnée de santé n'est collectée, aucune étape réglementaire n'est
 * franchie (lettre de mission et devoir de conseil restent au circuit existant).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const fichierSchema = z.object({
  nom: z.string().min(1).max(200),
  mime: z.string().max(120).optional(),
  contenu_base64: z.string().min(16),
});

const emprunteurSchema = z.object({
  prenom: z.string().max(120).default(""),
  nom: z.string().min(1).max(160),
  date_naissance: z.string().max(20).default(""),
  quotite_pct: z.number().nullable().default(null),
  csp: z.string().max(60).default(""),
  fumeur: z.boolean().nullable().default(null),
  email: z.string().max(200).nullable().default(null),
  telephone: z.string().max(40).nullable().default(null),
  client_id: z.string().uuid().nullable().default(null),
});

export type EmprunteurPropose = z.infer<typeof emprunteurSchema> & {
  /** Rapprochement effectué : "email", "nom_prenom", "nom" ou null. */
  rapproche_via?: string | null;
  client_reference?: string | null;
};

export const analyserOffrePretCreation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fichiers: z.array(fichierSchema).min(1).max(10) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { analyserOffrePretFichier } = await import("@/lib/offre-pret-analyse.server");
    const { prefillRecueilEmprunteur } = await import("@/lib/pret-prefill");
    const { trouverClientExistant, normaliserIdentite } = await import("@/lib/client-dedoublonnage.server");

    const pret: Record<string, unknown> = {};
    const emprunteurs: EmprunteurPropose[] = [];
    const erreurs: string[] = [];
    let lisible = false;

    // Chaque document est isolé : un échec n'interrompt pas les suivants.
    for (const f of data.fichiers) {
      try {
        const res = await analyserOffrePretFichier({
          nom: f.nom,
          mime: f.mime ?? "application/pdf",
          base64: f.contenu_base64,
        });
        if (res.lisible) lisible = true;
        for (const [cle, valeur] of Object.entries(res.pret)) {
          if (pret[cle] === undefined) pret[cle] = valeur;
        }
        for (const e of res.emprunteurs) {
          const cle = `${normaliserIdentite(e.nom)}|${normaliserIdentite(e.prenom)}`;
          if (emprunteurs.some((x) => `${normaliserIdentite(x.nom)}|${normaliserIdentite(x.prenom)}` === cle)) continue;
          emprunteurs.push({ ...e, client_id: null, rapproche_via: null, client_reference: null });
        }
      } catch (e) {
        erreurs.push(`${f.nom} : ${e instanceof Error ? e.message : "analyse impossible"}`);
      }
    }

    // Rapprochement avec les fiches clients déjà connues (aucune création ici).
    for (const e of emprunteurs) {
      const trouve = await trouverClientExistant(supabaseAdmin, {
        email: e.email,
        nom: e.nom,
        prenom: e.prenom,
      });
      if (!trouve) continue;
      const { data: fiche } = await supabaseAdmin
        .from("clients")
        .select("id, reference, email, mobile, telephone, fumeur")
        .eq("id", trouve.client_id)
        .maybeSingle();
      e.client_id = trouve.client_id;
      e.rapproche_via = trouve.via;
      e.client_reference = fiche?.reference ?? null;
      if (!e.email) e.email = fiche?.email ?? null;
      if (!e.telephone) e.telephone = fiche?.mobile ?? fiche?.telephone ?? null;
      if (e.fumeur === null && typeof fiche?.fumeur === "boolean") e.fumeur = fiche.fumeur;
    }

    const { recueil, ajouts, manquants } = prefillRecueilEmprunteur(null, pret, {
      dossier_cree_le: null,
      date_document: null, // aucune date d'édition inventée : seule la date lue sur le document sert de départ
    });

    // Détail par personne assurée : un dossier = un prêt, un assuré = une ligne.
    if (emprunteurs.length > 0) {
      recueil["assures"] = emprunteurs.map((e, i) => ({
        lien: i === 0 ? "principal" : "co_emprunteur",
        prenom: e.prenom,
        nom: e.nom,
        date_naissance: e.date_naissance,
        quotite_pct: e.quotite_pct,
        csp: e.csp,
        fumeur: e.fumeur === true,
        ...(e.client_id ? { client_id: e.client_id } : {}),
      }));
    }

    return {
      lisible,
      erreurs,
      ajouts,
      manquants: manquants.filter((m) => m !== "assures" || emprunteurs.length === 0),
      emprunteurs,
      recueil_json: JSON.stringify(recueil),
    };
  });

export const creerFichesEmprunteurs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ emprunteurs: z.array(emprunteurSchema).min(1).max(6) }).parse(d))
  .handler(async ({ data, context }) => {
    // Un utilisateur peut porter plusieurs rôles : l'autorisation est vérifiée
    // rôle par rôle (has_role), et non sur un rôle unique.
    let autorise = false;
    for (const r of ["admin", "mandataire", "prescripteur"] as const) {
      const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: r });
      if (ok === true) {
        autorise = true;
        break;
      }
    }
    if (!autorise) {
      throw new Error("Création de fiche client non autorisée.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { trouverClientExistant } = await import("@/lib/client-dedoublonnage.server");

    const resultats: { nom: string; prenom: string; client_id: string; cree: boolean }[] = [];

    for (const e of data.emprunteurs) {
      let clientId = e.client_id;
      if (!clientId) {
        const trouve = await trouverClientExistant(supabaseAdmin, {
          email: e.email,
          nom: e.nom,
          prenom: e.prenom,
        });
        clientId = trouve?.client_id ?? null;
      }
      if (clientId) {
        resultats.push({ nom: e.nom, prenom: e.prenom, client_id: clientId, cree: false });
        continue;
      }
      const { data: cree, error } = await context.supabase
        .from("clients")
        .insert({
          nom: e.nom,
          prenom: e.prenom || null,
          email: e.email,
          mobile: e.telephone,
          date_naissance: e.date_naissance || null,
          csp: e.csp || null,
          fumeur: e.fumeur,
          statut: "prospect",
          commercial_id: context.userId,
          remarque: "Fiche créée depuis l'offre de prêt déposée à la création du dossier.",
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      resultats.push({ nom: e.nom, prenom: e.prenom, client_id: cree.id, cree: true });
    }

    return {
      resultats,
      crees: resultats.filter((r) => r.cree).length,
      rapproches: resultats.filter((r) => !r.cree).length,
    };
  });
