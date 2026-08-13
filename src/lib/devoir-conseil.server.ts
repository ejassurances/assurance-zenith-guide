import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { SITE } from "@/lib/site";
import { appUrl } from "@/lib/app-url";
import { exigencesDepuisRecueil, modeleDevoirConseil, prefillDevoirConseil } from "@/lib/devoir-conseil-modeles";
import { grillePourFamille, synthetiserGaranties, type ValeursGrille } from "@/lib/garanties-grille";

export type DevoirConseilSaisie = {
  recommandation: string;
  motifs: string;
  mises_en_garde?: string;
  compagnie?: string;
  produit?: string;
  cotisation_mensuelle?: number | null;
  frais_dossier?: number | null;
  frais_souscription?: number | null;
  economie_estimee?: number | null;
  garanties?: string;
  exigences_client?: string;
  /** Offres comparées (3 minimum en emprunteur), appréciation qualitative. */
  offres?: {
    compagnie: string;
    produit: string;
    formule?: string | null;
    cotisation_mensuelle?: number | null;
    cout_total?: number | null;
    statut: "retenue" | "equivalente" | "ecartee";
    commentaire?: string | null;
  }[];
  /** Base de calcul du coût (bloc conditionnel emprunteur). */
  assiette?: "capital_initial" | "capital_restant_du";
  capital_assure?: number | null;
  capital_restant_du?: number | null;
  quotite?: number | null;
  duree_mois?: number | null;
  /** Accusé de remise des documents précontractuels. */
  ipid_remis?: boolean;
  cg_remis?: boolean;
  tarifs_remis?: boolean;
  der_remis?: boolean;
};


/**
 * Garanties réellement couvertes par le produit retenu, depuis la grille
 * VALIDÉE par un humain. Blocage strict : sans grille validée, aucun devoir de
 * conseil ne peut être généré (le trigger SQL applique la même règle en base).
 */
export async function garantiesValideesProduit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  produitId: string | null,
) {
  if (!produitId) {
    throw new Error(
      "Sélectionnez le produit retenu sur le dossier : le devoir de conseil ne peut citer que les garanties validées de ce produit.",
    );
  }
  const { data: produit } = await supabase
    .from("produits")
    .select("nom, produit_familles(code, nom)")
    .eq("id", produitId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const familleCode = (produit as any)?.produit_familles?.code ?? null;

  const { data: ligne } = await supabase
    .from("produit_garanties")
    .select("grille_version, valeurs, statut")
    .eq("produit_id", produitId)
    .maybeSingle();
  const g = ligne as { grille_version: number; valeurs: ValeursGrille; statut: string } | null;

  const grille = grillePourFamille(familleCode);
  if (!grille) {
    throw new Error(
      "Aucune grille de garanties n'est définie pour la typologie de ce produit : génération du devoir de conseil bloquée.",
    );
  }
  if (!g || g.statut !== "valide" || g.grille_version !== grille.version) {
    throw new Error(
      "Grille de garanties non validée pour ce produit : complétez et validez la grille (onglet Garanties de la fiche produit) avant de générer le devoir de conseil.",
    );
  }

  const synthese = synthetiserGaranties(grille, g.valeurs ?? {});
  return { grille, valeurs: g.valeurs ?? {}, synthese };
}

/**
 * Génère (ou met à jour) le devoir de conseil natif du dossier et l'envoie
 * au client pour acceptation ou refus.
 */
export async function envoyerDevoirConseil(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  dossierId: string,
  userId: string,
  saisie: DevoirConseilSaisie,
  options?: { sansEnvoi?: boolean },
) {
  const sansEnvoi = options?.sansEnvoi === true;

  const { data: dossier, error: dErr } = await supabase
    .from("dossiers")
    .select("*")
    .eq("id", dossierId)
    .maybeSingle();
  if (dErr || !dossier) throw new Error("Dossier introuvable ou accès refusé");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = dossier as any;
  if (!d.client_email) throw new Error("Le dossier n'a pas d'email client — renseignez-le d'abord.");

  const modele = modeleDevoirConseil(d.type_assurance);
  const garanties = await garantiesValideesProduit(supabase, d.produit_id ?? null);

  const contenu = {
    cabinet: {
      nom: SITE.name,
      shortName: SITE.shortName,
      siret: SITE.siret,
      orias: SITE.orias,
      adresse: SITE.address,
      telephone: SITE.phone,
      email: SITE.email,
    },
    client: {
      nom: d.client_nom,
      email: d.client_email,
      telephone: d.client_phone,
    },
    dossier: {
      reference: d.reference,
      type_assurance: d.type_assurance,
    },
    recueil_besoins: d.recueil_besoins ?? {},
    conseil: saisie,
    garanties_produit: {
      famille_code: garanties.grille.familleCode,
      grille_version: garanties.grille.version,
      valeurs: garanties.valeurs,
      couvertes: garanties.synthese.couvertes,
      optionnelles: garanties.synthese.optionnelles,
      non_couvertes: garanties.synthese.nonCouvertes,
      /** Tableau poste par poste (Poste / Couverture / Plafond / Délai de carence). */
      detail: garanties.synthese.detail,
    },

    modele: modele.branche,
    modele_libelle: modele.libelle,
    mentions_legales: modele.mentionsLegales,
    genere_le: new Date().toISOString(),
  };

  const hash = createHash("sha256").update(JSON.stringify(contenu)).digest("hex");

  const { data: existing } = await supabase
    .from("devoirs_conseil")
    .select("id, statut")
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const commun = {
    client_id: d.client_id,
    type_assurance: d.type_assurance,
    contenu,
    hash,
    recommandation: saisie.recommandation,
    motifs: saisie.motifs,
    mises_en_garde: saisie.mises_en_garde ?? null,
    statut: sansEnvoi ? "brouillon" : "envoye",
    email_destinataire: d.client_email,
    envoye_le: sansEnvoi ? null : new Date().toISOString(),
    refus_motif: null,
    refuse_le: null,
  };


  let devoirId: string;
  if (existing && existing.statut !== "signe") {
    const { error: upErr } = await supabase.from("devoirs_conseil").update(commun).eq("id", existing.id);
    if (upErr) throw new Error(upErr.message);
    devoirId = existing.id;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("devoirs_conseil")
      .insert({ ...commun, dossier_id: dossierId, created_by: userId })
      .select("id")
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Erreur création du devoir de conseil");
    devoirId = inserted.id;
  }

  // PDF de présentation (mise en page réglementaire) archivé dès l'envoi.
  try {
    const { archiverDevoirConseil } = await import("./devoir-conseil-archive.server");
    await archiverDevoirConseil(supabase, devoirId, userId);
  } catch {
    // l'archivage ne doit pas bloquer l'envoi au client
  }

  if (sansEnvoi) {
    // Brouillon : relecture staff obligatoire avant tout envoi au client.
    return { id: devoirId, hash, envoye: false };
  }

  const result = await sendTemplateEmail("devoir-conseil-envoi", d.client_email, {
    templateData: {
      clientName: d.client_nom,
      cabinetName: SITE.shortName,
      reference: d.reference,
      link: appUrl("/espace/signer-devoir-conseil"),
    },
    brevoParams: {
      PRENOM: String(d.client_nom ?? "").split(" ")[0] || d.client_nom,
      LIEN_ACTION: appUrl("/espace/signer-devoir-conseil"),
      TYPE_ASSURANCE: modele.libelle,
      NOM_COMPAGNIE_RECOMMANDEE: saisie.compagnie ?? "",
    },
    replyTo: SITE.email,
  });
  if (!result.sent) throw new Error("Adresse en liste de suppression — envoi refusé");

  await supabase.from("dossiers").update({ statut: "devoir_conseil_envoye" }).eq("id", dossierId);
  await supabase.from("dossier_etapes_historique").insert({
    dossier_id: dossierId,
    nouvelle_etape: "devoir_conseil_envoye",
    commentaire: "Devoir de conseil généré et envoyé au client",
    par: userId,
  });

  return { id: devoirId, hash, envoye: true };

}

/**
 * Génération automatique du devoir de conseil lors du passage à l'étape
 * « Devoir de conseil envoyé ». Le contenu est pré-rédigé à partir du modèle
 * de la typologie (défini dans le code, cf. devoir-conseil-modeles.ts) et
 * complété avec la compagnie / le produit retenus sur le dossier.
 */
export async function genererDevoirConseilAuto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  dossierId: string,
  userId: string,
  options?: { sansEnvoi?: boolean },
) {

  const { data: dossier, error } = await supabase
    .from("dossiers")
    .select(
      "id, type_assurance, client_nom, client_email, compagnie_id, produit_id, recueil_besoins, economie_estimee, capital, duree_mois",
    )
    .eq("id", dossierId)
    .maybeSingle();
  if (error || !dossier) throw new Error("Dossier introuvable ou accès refusé");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = dossier as any;
  if (!d.client_email) throw new Error("Le dossier n'a pas d'email client — renseignez-le d'abord.");

  let compagnie: string | null = null;
  let produit: string | null = null;
  if (d.compagnie_id) {
    const { data } = await supabase.from("compagnies").select("nom").eq("id", d.compagnie_id).maybeSingle();
    compagnie = (data as { nom: string } | null)?.nom ?? null;
  }
  if (d.produit_id) {
    const { data } = await supabase.from("produits").select("nom").eq("id", d.produit_id).maybeSingle();
    produit = (data as { nom: string } | null)?.nom ?? null;
  }
  if (!compagnie || !produit) {
    throw new Error(
      "Sélectionnez la compagnie et le produit retenus sur le dossier avant de générer le devoir de conseil.",
    );
  }

  const garanties = await garantiesValideesProduit(supabase, d.produit_id ?? null);
  const garantiesTexte = [
    garanties.synthese.couvertes.length ? garanties.synthese.couvertes.join(" ; ") : null,
    garanties.synthese.optionnelles.length
      ? `en option : ${garanties.synthese.optionnelles.join(" ; ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" — ");
  const exclusions = garanties.synthese.nonCouvertes;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recueil = (d.recueil_besoins ?? {}) as Record<string, any>;
  const pre = prefillDevoirConseil({
    branche: d.type_assurance,
    clientNom: d.client_nom,
    compagnie,
    produit,
    garanties: garantiesTexte || null,
    exigences: exigencesDepuisRecueil(d.type_assurance, recueil) ?? undefined,
    economie_estimee: typeof d.economie_estimee === "number" ? d.economie_estimee : null,
  });

  const emprunteur = d.type_assurance === "emprunteur";

  return envoyerDevoirConseil(
    supabase,
    dossierId,
    userId,
    {
      recommandation: pre.recommandation,
      motifs: pre.motifs,
      mises_en_garde:
        exclusions.length > 0
          ? `${pre.mises_en_garde}\n\nGaranties NON couvertes par le contrat proposé (à connaître avant souscription) : ${exclusions.join(" ; ")}.`
          : pre.mises_en_garde,
      garanties: garantiesTexte || undefined,
      exigences_client: pre.exigences_client,
      compagnie,
      produit,
      offres: [{ compagnie, produit, statut: "retenue", commentaire: "Meilleur rapport garanties / coût" }],
      ...(emprunteur
        ? {
            assiette: "capital_restant_du" as const,
            capital_assure: typeof d.capital === "number" ? d.capital : null,
            duree_mois: typeof d.duree_mois === "number" ? d.duree_mois : null,
          }
        : {}),
    },
    options,
  );

}
