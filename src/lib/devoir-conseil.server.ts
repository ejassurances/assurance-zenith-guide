import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { SITE } from "@/lib/site";
import { appUrl } from "@/lib/app-url";
import {
  MENTION_OFFRE_UNIQUE,
  exigencesDepuisRecueil,
  modeleDevoirConseil,
  prefillDevoirConseil,
} from "@/lib/devoir-conseil-modeles";
import { grillePourFamille, synthetiserGaranties, type ValeursGrille } from "@/lib/garanties-grille";

export type DevoirConseilSaisie = {
  recommandation: string;
  motifs: string;
  mises_en_garde?: string;
  compagnie?: string;
  produit?: string;
  cotisation_mensuelle?: number | null;
  /** Emprunteur : CI (cotisation constante sur capital initial) ou CRD (dégressive). */
  type_cotisation?: "CI" | "CRD" | null;
  cotisation_min?: number | null;
  cotisation_max?: number | null;
  montant_total?: number | null;
  frais_dossier?: number | null;
  frais_souscription?: number | null;
  frais_courtage?: number | null;
  frais_adhesion?: number | null;
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
    .select("nom, produit_familles!produits_famille_id_fkey(code, nom)")
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
 * Comparatif garantie par garantie « contrat actuel du client » vs « offre
 * proposée ».
 *
 * SOURCE UNIQUE : les grilles de garanties déjà VALIDÉES par un humain dans le
 * CRM — `produit_garanties` pour nos produits partenaires, et
 * `bibliotheque_cg_clients` pour le contrat apporté par le client. Aucun appel
 * live à un outil externe (Notebook / NotebookLM / IA) n'est effectué ici : le
 * Notebook reste un outil d'analyse EN AMONT, jamais une source au moment de
 * produire un document client. Sans grille validée, on renvoie explicitement
 * « non disponible pour comparaison ».
 */
export async function comparatifContratActuel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  recueil: Record<string, unknown> | null | undefined,
  grille: { familleCode: string; version: number; garanties: { code: string; libelle: string }[] },
  valeursProduit: ValeursGrille,
) {
  const cg = (recueil ?? {})["contrat_actuel_cg"] as Record<string, unknown> | undefined;
  const entreeId = typeof cg?.["entree_id"] === "string" ? (cg["entree_id"] as string) : null;
  const compagnieDeclaree =
    typeof (recueil ?? {})["contrat_actuel_compagnie"] === "string"
      ? ((recueil ?? {})["contrat_actuel_compagnie"] as string)
      : null;
  const contexte = {
    compagnie_actuelle: compagnieDeclaree,
    edition_annee: null as string | null,
    cotisation_actuelle: (recueil ?? {})["contrat_actuel_cotisation"] ?? null,
    niveau_souhaite: (recueil ?? {})["contrat_actuel_niveau"] ?? null,
    lignes: [] as never[],
  };
  const indisponible = (motif: string) => ({ ...contexte, disponible: false as const, motif });

  if (!entreeId) {
    if ((recueil ?? {})["contrat_actuel_present"] !== true) return null;
    return indisponible(
      "Non disponible pour comparaison : les conditions générales du contrat actuel n'ont pas été remises au cabinet.",
    );
  }

  const { data } = await supabase
    .from("bibliotheque_cg_clients")
    .select("compagnie_nom, edition_annee, famille_code, grille_version, valeurs, valide")
    .eq("id", entreeId)
    .maybeSingle();
  const e = data as
    | {
        compagnie_nom: string;
        edition_annee: string | null;
        famille_code: string | null;
        grille_version: number | null;
        valeurs: ValeursGrille | null;
        valide: boolean;
      }
    | null;
  if (!e) return indisponible("Non disponible pour comparaison : document du contrat actuel introuvable.");
  contexte.compagnie_actuelle = e.compagnie_nom ?? compagnieDeclaree;
  contexte.edition_annee = e.edition_annee;

  if (!e.valide || !e.valeurs) {
    return indisponible(
      "Non disponible pour comparaison : la grille de garanties de ce contrat n'a pas encore été validée par un conseiller du cabinet.",
    );
  }
  if (e.famille_code !== grille.familleCode || e.grille_version !== grille.version) {
    return indisponible(
      "Non disponible pour comparaison : la grille validée pour ce contrat ne correspond pas à la trame de garanties en vigueur pour ce risque.",
    );
  }

  const lignes = grille.garanties.map((g) => {
    const actuel = e.valeurs?.[g.code];
    const propose = valeursProduit[g.code];
    const detail = (v: typeof actuel) =>
      [v?.plafond, v?.franchise ? `franchise ${v.franchise}` : null, v?.delai_carence ? `carence ${v.delai_carence}` : null]
        .filter(Boolean)
        .join(" · ") || null;
    return {
      code: g.code,
      libelle: g.libelle,
      actuel_couverture: actuel?.couverture ?? "inconnu",
      actuel_detail: detail(actuel),
      propose_couverture: propose?.couverture ?? "inconnu",
      propose_detail: detail(propose),
    };
  });

  return {
    disponible: true as const,
    motif: null,
    compagnie_actuelle: contexte.compagnie_actuelle,
    edition_annee: e.edition_annee,
    cotisation_actuelle: contexte.cotisation_actuelle,
    niveau_souhaite: contexte.niveau_souhaite,
    lignes,
  };
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
  options?: { sansEnvoi?: boolean; valider?: boolean },
) {
  const sansEnvoi = options?.sansEnvoi === true;
  const valider = options?.valider === true;

  const { data: dossier, error: dErr } = await supabase
    .from("dossiers")
    .select("*")
    .eq("id", dossierId)
    .maybeSingle();
  if (dErr || !dossier) throw new Error("Dossier introuvable ou accès refusé");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = dossier as any;
  if (!d.client_email) throw new Error("Le dossier n'a pas d'email client — renseignez-le d'abord.");

  // Délai de réflexion (16 h après signature de la lettre de mission) et
  // horaires d'ouverture : contrôlé côté serveur, uniquement pour un envoi réel.
  if (!sansEnvoi) {
    const { data: lm } = await supabase
      .from("lettres_mission")
      .select("signed_at, statut")
      .eq("dossier_id", dossierId)
      .eq("statut", "signee")
      .order("signed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { etatDelaiEnvoi } = await import("./devoir-conseil-delai");
    const etat = etatDelaiEnvoi((lm as { signed_at: string | null } | null)?.signed_at ?? null);
    if (!etat.autorise) throw new Error(etat.motif ?? "Envoi non autorisé pour le moment.");
  }



  const modele = modeleDevoirConseil(d.type_assurance);
  const garanties = await garantiesValideesProduit(supabase, d.produit_id ?? null);

  // Catalogue à un seul produit actif pour cette branche : la mention de
  // comparaison multi-offres est remplacée par la mention « offre unique ».
  const { catalogueOffreUnique } = await import("./catalogue-branche.server");
  const offreUniqueCatalogue = await catalogueOffreUnique(supabase, d.type_assurance ?? null);
  const mentionsLegales = offreUniqueCatalogue
    ? [
        ...modele.mentionsLegales.filter((t) => !t.startsWith("Trois offres au moins ont été comparées")),
        MENTION_OFFRE_UNIQUE,
      ]
    : modele.mentionsLegales;

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
    /** Comparatif contrat actuel du client vs offre proposée (grille validée uniquement). */
    comparatif_contrat_actuel: await comparatifContratActuel(
      supabase,
      d.recueil_besoins ?? {},
      garanties.grille,
      garanties.valeurs,
    ),
    /**
     * Emprunteur : un dossier = un prêt, plusieurs têtes assurées. Chaque
     * assuré est restitué avec son identité, sa quotité, ses exigences propres
     * et l'assurance qui le concerne (contrat en cours ou devis retenu).
     */
    assures: await assuresDevoirConseil(supabase, dossierId, d),

    modele: modele.branche,
    modele_libelle: modele.libelle,
    mentions_legales: mentionsLegales,
    offre_unique_catalogue: offreUniqueCatalogue,
    genere_le: new Date().toISOString(),
  };

  const hash = createHash("sha256").update(JSON.stringify(contenu)).digest("hex");

  const { data: existing } = await supabase
    .from("devoirs_conseil")
    .select("id, statut, notes_modification")
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
    statut: sansEnvoi ? (valider ? "valide" : "brouillon") : "envoye",
    email_destinataire: d.client_email,
    envoye_le: sansEnvoi ? null : new Date().toISOString(),
    valide_le: sansEnvoi ? (valider ? new Date().toISOString() : null) : new Date().toISOString(),
    valide_par: sansEnvoi && !valider ? null : userId,
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
      notesModification:
        (existing as { notes_modification?: string | null } | null)?.notes_modification ?? undefined,
    },
    brevoParams: {
      PRENOM: String(d.client_nom ?? "").split(" ")[0] || d.client_nom,
      LIEN_ACTION: appUrl("/espace/signer-devoir-conseil"),
      TYPE_ASSURANCE: modele.libelle,
      NOM_COMPAGNIE_RECOMMANDEE: saisie.compagnie ?? "",
    },
    replyTo: SITE.email,
    liens: { client_id: (d as { client_id?: string | null }).client_id ?? null, dossier_id: dossierId },

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
  // Catalogue à un seul produit actif pour cette branche : mention « offre unique ».
  const { catalogueOffreUnique } = await import("./catalogue-branche.server");
  const offreUnique = await catalogueOffreUnique(supabase, d.type_assurance ?? null);

  const pre = prefillDevoirConseil({
    branche: d.type_assurance,
    clientNom: d.client_nom,
    compagnie,
    produit,
    garanties: garantiesTexte || null,
    garanties_detail: garanties.synthese.detail,

    exigences: exigencesDepuisRecueil(d.type_assurance, recueil) ?? undefined,
    economie_estimee: typeof d.economie_estimee === "number" ? d.economie_estimee : null,
    offreUnique,
  });

  const emprunteur = d.type_assurance === "emprunteur";

  // L'assiette de cotisation est celle du devis retenu (CI = capital initial
  // fixe / CRD = capital restant dû dégressif) et non une valeur figée.
  let assiette: "capital_initial" | "capital_restant_du" = "capital_restant_du";
  if (emprunteur) {
    const { data: devis } = await supabase
      .from("dossier_devis")
      .select("type_cotisation, created_at")
      .eq("dossier_id", dossierId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const type = (devis as { type_cotisation: string | null } | null)?.type_cotisation ?? null;
    if (type === "CI") assiette = "capital_initial";
  }


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
      offres: [
        {
          compagnie,
          produit,
          statut: "retenue" as const,
          commentaire: offreUnique
            ? "Seul partenaire référencé au catalogue du cabinet pour cette garantie à la date de l'étude — garanties conformes aux besoins exprimés"
            : "Meilleur rapport garanties / coût",
        },
      ],
      ...(emprunteur
        ? {
            assiette,
            capital_assure: typeof d.capital === "number" ? d.capital : null,
            duree_mois: typeof d.duree_mois === "number" ? d.duree_mois : null,
          }
        : {}),
    },
    options,
  );

}

/**
 * Job planifié : envoie au client les devoirs de conseil VALIDÉS par le cabinet
 * dont le délai de réflexion (6 h après la signature de la lettre de mission)
 * est écoulé et qui tombent dans les horaires d'ouverture. Un devoir de conseil
 * jamais validé n'est jamais envoyé.
 */
export async function envoyerDevoirsConseilValidesDus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  limite = 30,
): Promise<{ envoyes: number; reportes: number; echecs: number }> {
  const { etatDelaiEnvoi } = await import("./devoir-conseil-delai");

  const { data, error } = await supabase
    .from("devoirs_conseil")
    .select(
      "id, dossier_id, type_assurance, email_destinataire, contenu, valide_le, valide_par, notes_modification",
    )
    .eq("statut", "valide")
    .is("envoye_le", null)
    .order("valide_le", { ascending: true })
    .limit(limite);
  if (error) throw new Error(error.message);

  let envoyes = 0;
  let reportes = 0;
  let echecs = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const dc of ((data ?? []) as any[])) {
    try {
      const { data: lm } = await supabase
        .from("lettres_mission")
        .select("signed_at")
        .eq("dossier_id", dc.dossier_id)
        .eq("statut", "signee")
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const etat = etatDelaiEnvoi((lm as { signed_at: string | null } | null)?.signed_at ?? null);
      if (!etat.autorise) {
        reportes += 1;
        continue;
      }

      const { data: dossier } = await supabase
        .from("dossiers")
        .select("reference, client_nom, client_email, type_assurance")
        .eq("id", dc.dossier_id)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (dossier as any) ?? {};
      const destinataire = (dc.email_destinataire as string | null) ?? d.client_email ?? null;
      if (!destinataire) {
        echecs += 1;
        continue;
      }

      const modele = modeleDevoirConseil(dc.type_assurance ?? d.type_assurance);
      const res = await sendTemplateEmail("devoir-conseil-envoi", destinataire, {
        templateData: {
          clientName: d.client_nom,
          cabinetName: SITE.shortName,
          reference: d.reference,
          link: appUrl("/espace/signer-devoir-conseil"),
          notesModification: dc.notes_modification ?? undefined,
        },
        brevoParams: {
          PRENOM: String(d.client_nom ?? "").split(" ")[0] || d.client_nom,
          LIEN_ACTION: appUrl("/espace/signer-devoir-conseil"),
          TYPE_ASSURANCE: modele.libelle,
        },
        replyTo: SITE.email,
        liens: { client_id: dc.client_id ?? null, dossier_id: dc.dossier_id },
        idempotencyKey: `devoir-conseil-${dc.id}`,
      });
      if (!res.sent) {
        echecs += 1;
        continue;
      }

      await supabase
        .from("devoirs_conseil")
        .update({ statut: "envoye", envoye_le: new Date().toISOString(), email_destinataire: destinataire })
        .eq("id", dc.id);
      await supabase.from("dossiers").update({ statut: "devoir_conseil_envoye" }).eq("id", dc.dossier_id);
      await supabase.from("dossier_etapes_historique").insert({
        dossier_id: dc.dossier_id,
        nouvelle_etape: "devoir_conseil_envoye",
        commentaire: "Devoir de conseil validé envoyé automatiquement au client (délai de réflexion écoulé)",
        par: dc.valide_par ?? null,
      });
      envoyes += 1;
    } catch (e) {
      echecs += 1;
      console.error("[devoir-conseil] envoi automatique échoué", dc.id, e);
    }
  }

  return { envoyes, reportes, echecs };
}
