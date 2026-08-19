import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  DOMAINES_PARTENAIRES,
  extraireDomaine,
  nomPartenairePourDomaine,
} from "@/lib/partenaires-domaines";

/**
 * Agent Service Partenaire : détection d'un email provenant d'une compagnie /
 * partenaire du CRM, en amont de toute classification IA prospect ou relation
 * client, puis routage direct dans « Direction Commerciale/Service Partenaire ».
 */

type Admin = SupabaseClient<Database>;

export interface AnnuairePartenaires {
  /** domaine → { id compagnie (si connue en base), nom } */
  parDomaine: Map<string, { id: string | null; nom: string }>;
}

/**
 * Annuaire des domaines partenaires : liste statique du cabinet enrichie des
 * adresses présentes sur les fiches `compagnies`, et rattachée à l'identifiant
 * de compagnie quand le nom correspond.
 */
export async function chargerAnnuairePartenaires(admin: Admin): Promise<AnnuairePartenaires> {
  const { data: compagnies } = await admin
    .from("compagnies")
    .select("id, nom, contact_email, site_web, email_reclamations");

  const parNom = new Map<string, string>();
  for (const c of compagnies ?? []) parNom.set(c.nom.toLowerCase().trim(), c.id);

  const parDomaine = new Map<string, { id: string | null; nom: string }>();
  for (const [domaine, nom] of Object.entries(DOMAINES_PARTENAIRES)) {
    parDomaine.set(domaine, { id: parNom.get(nom.toLowerCase()) ?? null, nom });
  }
  for (const c of compagnies ?? []) {
    for (const v of [c.contact_email, c.site_web, c.email_reclamations]) {
      const d = extraireDomaine(v);
      if (d) parDomaine.set(d, { id: c.id, nom: c.nom });
    }
  }
  return { parDomaine };
}

/** Compagnie correspondant à l'expéditeur, ou null. */
export function compagnieDeExpediteur(
  annuaire: AnnuairePartenaires,
  email: string | null | undefined,
): { id: string | null; nom: string } | null {
  const domaine = extraireDomaine(email);
  if (!domaine) return null;
  const candidats = [domaine];
  const parties = domaine.split(".");
  if (parties.length > 2) candidats.push(parties.slice(-2).join("."));
  for (const d of candidats) {
    const trouve = annuaire.parDomaine.get(d);
    if (trouve) return trouve;
  }
  const nom = nomPartenairePourDomaine(domaine);
  return nom ? { id: null, nom } : null;
}

/**
 * Routage d'un email partenaire : enregistrement en base (rattaché à la
 * compagnie, jamais à un prospect), étiquetage « Service Partenaire/A_Traiter »
 * puis « Archive » une fois enregistré. Les mauvaises étiquettes commerciales
 * ou relation client sont retirées si elles avaient été posées.
 */
export async function routerEmailPartenaire(
  admin: Admin,
  params: {
    gmail_message_id: string;
    gmail_thread_id?: string | null;
    recu_le?: string | null;
    sujet?: string | null;
    expediteur_email?: string | null;
    compagnie: { id: string | null; nom: string };
    userId: string;
    /** Message déjà mal étiqueté : retirer les labels commerciaux / client. */
    nettoyer?: boolean;
  },
): Promise<void> {
  const { poserLabelCabinet } = await import("@/lib/gmail.server");
  const { compagnie } = params;

  // Le rattachement client/dossier éventuel est conservé (un email partenaire
  // concerne souvent un dossier client) : seul le traitement change.
  const { data: existant } = await admin
    .from("crm_emails")
    .select("client_id, dossier_id, contrat_id")
    .eq("gmail_message_id", params.gmail_message_id)
    .maybeSingle();



  await admin.from("crm_emails").upsert(
    {
      gmail_message_id: params.gmail_message_id,
      gmail_thread_id: params.gmail_thread_id ?? null,
      direction: "entrant",
      recu_le: params.recu_le ?? null,
      compagnie_id: compagnie.id,
      client_id: existant?.client_id ?? null,
      dossier_id: existant?.dossier_id ?? null,
      contrat_id: existant?.contrat_id ?? null,

      notes: `Agent Service Partenaire — email ${compagnie.nom}`,
      triage_ia: JSON.parse(
        JSON.stringify({
          agent: "partenaire",
          compagnie: compagnie.nom,
          expediteur: params.expediteur_email ?? null,
          sujet: params.sujet ?? null,
          resume: `Email partenaire ${compagnie.nom} — routé vers Service Partenaire sans classification prospect/client.`,
        }),
      ),
      triage_le: new Date().toISOString(),
      created_by: params.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "gmail_message_id" },
  );

  const mauvais = params.nettoyer
    ? ([
        "gc_a_traiter",
        "gc_attente_validation",
        "gc_archive",
        "sc_a_traiter",
        "sc_attente_validation",
        "sc_archive",
      ] as const)
    : ([] as const);

  await poserLabelCabinet(params.gmail_message_id, "sp_a_traiter", { retirer: [...mauvais] });
  await poserLabelCabinet(params.gmail_message_id, "sp_archive", { retirer: ["sp_a_traiter"] });
}

/**
 * Correctif rétroactif : messages déjà étiquetés « Gestion Commerciale » ou
 * « Service Client » alors qu'ils viennent d'un domaine partenaire connu. Les
 * mauvaises étiquettes sont retirées, « Service Partenaire » appliquée, et les
 * brouillons de réponse client générés par erreur sont supprimés.
 */
export async function corrigerLabelsPartenaires(
  admin: Admin,
  userId: string,
): Promise<{
  examines: number;
  corriges: number;
  brouillons_supprimes: number;
  erreurs: number;
  details: { id: string; compagnie: string; expediteur: string | null; sujet: string | null }[];
}> {
  const { listerParLabel } = await import("@/lib/gmail.server");
  const { LABELS_CABINET } = await import("@/lib/gmail-labels");

  const aExaminer = [
    LABELS_CABINET.sc_attente_validation,
    LABELS_CABINET.sc_a_traiter,
    LABELS_CABINET.sc_archive,
    LABELS_CABINET.gc_archive,
    LABELS_CABINET.gc_a_traiter,
    LABELS_CABINET.gc_attente_validation,
  ];

  const annuaire = await chargerAnnuairePartenaires(admin);
  const parId = new Map<string, Awaited<ReturnType<typeof listerParLabel>>[number]>();
  for (const label of aExaminer) {
    const messages = await listerParLabel(label, 200).catch((e) => {
      console.error("[partenaires] lecture du label impossible", label, e);
      return [];
    });
    for (const m of messages) parId.set(m.id, m);
  }

  let corriges = 0;
  let brouillons = 0;
  let erreurs = 0;
  const details: { id: string; compagnie: string; expediteur: string | null; sujet: string | null }[] = [];

  for (const m of parId.values()) {
    const compagnie = compagnieDeExpediteur(annuaire, m.expediteur_email);
    if (!compagnie) continue;
    try {
      await routerEmailPartenaire(admin, {
        gmail_message_id: m.id,
        gmail_thread_id: m.thread_id ?? null,
        recu_le: m.date ?? null,
        sujet: m.sujet ?? null,
        expediteur_email: m.expediteur_email ?? null,
        compagnie,
        userId,
        nettoyer: true,
      });
      const { data: supprimes } = await admin
        .from("client_reponses_ia")
        .delete()
        .eq("gmail_message_id", m.id)
        .select("id");
      brouillons += (supprimes ?? []).length;
      corriges++;
      details.push({
        id: m.id,
        compagnie: compagnie.nom,
        expediteur: m.expediteur_email ?? null,
        sujet: m.sujet ?? null,
      });
    } catch (e) {
      erreurs++;
      console.error("[partenaires] correction rétroactive impossible", m.id, e);
    }
  }

  return { examines: parId.size, corriges, brouillons_supprimes: brouillons, erreurs, details };
}
