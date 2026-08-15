/**
 * Tarification emprunteur UGIP Assurances à partir du recueil des besoins CRM.
 *
 * Flux : recueil « emprunteur » du dossier → un appel de calcul par produit
 * UGIP → devis comparés (`dossier_devis`, source « api »).
 */

import type { PersonneEmprunteur } from "@/lib/recueil-besoins-schemas";
import { lireRecueilEmprunteur, type RecueilEmprunteurUgip } from "./eligibilite";
import { ugipCalculer, masquerSecretsUgip } from "./api.server";
import {
  UGIP_ANCIENNETE_PRET,
  UGIP_CIVILITE,
  UGIP_DEFAUTS_RISQUE,
  UGIP_FAMILLE_GARANTIE,
  UGIP_MODE_INITIALISATION,
  UGIP_OBJET_FINANCEMENT,
  UGIP_PERIODICITE,
  UGIP_SEXE,
  UGIP_STATUT_PROFESSIONNEL,
  UGIP_TYPE_ASSURE,
  UGIP_TYPE_FRANCHISE,
  UGIP_TYPE_PRET,
  UGIP_VALEUR_FRANCHISE,
  ugipProduitsStandards,
  type UgipProduit,
} from "./referentiels";

/** Date ISO (AAAA-MM-JJ) → format UGIP (JJ/MM/AAAA). */
function dateFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function premierDuMoisSuivant(): string {
  const d = new Date();
  const y = d.getUTCMonth() === 11 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  const m = d.getUTCMonth() === 11 ? 1 : d.getUTCMonth() + 2;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** Garanties standard demandées pour chaque assuré (socle Décès/PTIA/IPT/ITT). */
function garantiesAssure(quotite: number) {
  const q = String(quotite);
  return [
    { CleReferencePret: "1", IdFamille: UGIP_FAMILLE_GARANTIE.DECES, Quotite: q },
    { CleReferencePret: "1", IdFamille: UGIP_FAMILLE_GARANTIE.PTIA, Quotite: q },
    { CleReferencePret: "1", IdFamille: UGIP_FAMILLE_GARANTIE.IPT, Quotite: q },
    {
      CleReferencePret: "1",
      IdFamille: UGIP_FAMILLE_GARANTIE.ITT,
      Quotite: q,
      IdTypeFranchise: UGIP_TYPE_FRANCHISE.ABSOLUS,
      IdValeurFranchise: UGIP_VALEUR_FRANCHISE.J90,
    },
  ];
}

function assureUgip(p: PersonneEmprunteur, index: number) {
  return {
    CleReference: String(index + 1),
    IdTypeAssure: UGIP_TYPE_ASSURE.EMPRUNTEUR,
    // Le sexe et la civilité ne sont pas collectés dans le recueil : valeur
    // neutre par défaut, corrigée à la souscription.
    IdSexe: UGIP_SEXE.MASCULIN,
    Civilite: UGIP_CIVILITE.MONSIEUR,
    DateNaissance: dateFr(p.date_naissance),
    Fumeur: p.fumeur === true,
    IdStatutProfessionnel: UGIP_STATUT_PROFESSIONNEL[p.csp] ?? "10",
    IdProfession: "0",
    ProfessionSaisie: p.csp ? p.csp.replace(/_/g, " ") : "Non précisée",
    IdProfessionRisque: UGIP_DEFAUTS_RISQUE.professionRisque,
    IdTravailManutention: UGIP_DEFAUTS_RISQUE.travailManutention,
    IdTravailHauteur: UGIP_DEFAUTS_RISQUE.travailHauteur,
    IdDeplacementPro: UGIP_DEFAUTS_RISQUE.deplacementPro,
    IdPaysResidenceFiscal: UGIP_DEFAUTS_RISQUE.paysResidenceFiscal,
    Garanties: garantiesAssure(p.quotite_pct ?? 100),
  };
}

function donneesPourProduit(
  produit: UgipProduit,
  r: RecueilEmprunteurUgip,
  dateEffetIso: string,
): Record<string, unknown> {
  return {
    DateEffet: dateFr(dateEffetIso),
    IdProduit: produit.id,
    Periodicite: UGIP_PERIODICITE.MENSUEL,
    IdObjetFinancement: UGIP_OBJET_FINANCEMENT[r.objetPret] ?? "1",
    IdProjetModeInitialisation: r.substitution
      ? UGIP_MODE_INITIALISATION.LEMOINE_GROUPE
      : UGIP_MODE_INITIALISATION.NOUVEAU,
    IdTypeAnciennetePret: r.substitution
      ? UGIP_ANCIENNETE_PRET.PLUS_5_ANS
      : UGIP_ANCIENNETE_PRET.MOINS_5_ANS,
    Prets: [
      {
        CleReference: "1",
        IdTypePret: UGIP_TYPE_PRET.AMORTISSABLE,
        PretProfessionnel: r.objetPret === "professionnel",
        Montant: r.capital,
        Duree: r.dureeMois,
        DureeDiffere: 0,
        ...(r.taux ? { Taux: r.taux } : {}),
        IdPeriodiciteAmortissement: UGIP_PERIODICITE.MENSUEL,
      },
    ],
    Assures: r.assures.map((p, i) => assureUgip(p, i)),
  };
}

interface TotauxUgip {
  Montant_HT?: number;
  Montant_TTC?: number;
  Montant_Frais?: number;
  Montant_Total?: number;
  Prime_HT_12_Premiers_Mois?: number;
}

interface AssureTarife {
  CleReference?: string;
  EstEligible?: boolean;
  Totaux?: TotauxUgip;
  TauxMoyenAssurance_AvecFrais?: number;
}

/** Agrège les totaux des assurés d'une tarification UGIP. */
function agregerTarification(data: unknown): {
  montantTotal: number;
  tauxMoyen: number | null;
  eligible: boolean;
  nomProduit: string;
} | null {
  const o = (data ?? {}) as Record<string, unknown>;
  const tarifs = Array.isArray(o["Tarifications"]) ? (o["Tarifications"] as Record<string, unknown>[]) : [];
  const t = tarifs[0];
  if (!t) return null;
  const assures = Array.isArray(t["Assures"]) ? (t["Assures"] as AssureTarife[]) : [];
  if (assures.length === 0) return null;

  let montantTotal = 0;
  let tauxCumul = 0;
  let nbTaux = 0;
  let eligible = true;
  for (const a of assures) {
    if (a.EstEligible === false) eligible = false;
    const m = Number(a.Totaux?.Montant_Total);
    if (Number.isFinite(m)) montantTotal += m;
    const tx = Number(a.TauxMoyenAssurance_AvecFrais);
    if (Number.isFinite(tx) && tx > 0) {
      tauxCumul += tx;
      nbTaux += 1;
    }
  }
  const dossier = (t["Dossier"] ?? {}) as Record<string, unknown>;
  const produit = (dossier["Produit"] ?? {}) as Record<string, unknown>;
  return {
    montantTotal,
    tauxMoyen: nbTaux > 0 ? tauxCumul / nbTaux : null,
    eligible,
    nomProduit: String(produit["NomProduit"] ?? ""),
  };
}

export interface TariferDossierUgipInput {
  dossierId: string;
  /** Date d'effet AAAA-MM-JJ ; par défaut le 1er du mois suivant. */
  dateEffet?: string | undefined;
  /** Restreindre l'appel à certains identifiants de produits UGIP. */
  produitIds?: string[] | undefined;
}

/**
 * Tarifie un dossier emprunteur auprès d'UGIP sur l'ensemble des produits
 * commercialisés, puis enregistre les 5 offres les moins chères en devis.
 */
export async function tariferDossierUgip(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: TariferDossierUgipInput,
  userId: string,
) {
  const { data: dos, error: errDos } = await supabase
    .from("dossiers")
    .select("id, type_assurance, recueil_besoins")
    .eq("id", input.dossierId)
    .maybeSingle();
  if (errDos) throw new Error(errDos.message);
  if (!dos) throw new Error("Dossier introuvable.");
  if (String(dos.type_assurance ?? "") !== "emprunteur") {
    throw new Error("La tarification UGIP ne couvre que la branche assurance emprunteur.");
  }

  const lu = lireRecueilEmprunteur(dos.recueil_besoins);
  if (!lu.ok || !lu.valeurs) {
    throw new Error(`Recueil incomplet pour UGIP : complétez ${lu.manques.join(", ")}.`);
  }
  const r = lu.valeurs;

  const dateEffet = /^\d{4}-\d{2}-\d{2}$/.test(input.dateEffet ?? "")
    ? (input.dateEffet as string)
    : premierDuMoisSuivant();

  const produits = input.produitIds?.length
    ? ugipProduitsStandards().filter((p) => input.produitIds!.includes(p.id))
    : ugipProduitsStandards();
  if (produits.length === 0) throw new Error("Aucun produit UGIP à tarifer.");

  const offres: {
    produit: UgipProduit;
    montantTotal: number;
    cotisationMensuelle: number;
    tauxMoyen: number | null;
    nomProduit: string;
  }[] = [];
  const echecs: string[] = [];

  for (const produit of produits) {
    try {
      const res = await ugipCalculer({ donnees: donneesPourProduit(produit, r, dateEffet) });
      if (!res.ok) {
        echecs.push(`${produit.nom} : ${res.erreurs[0] ?? `refus UGIP (HTTP ${res.status})`}`);
        continue;
      }
      const agg = agregerTarification(res.data);
      if (!agg || !agg.eligible || agg.montantTotal <= 0) {
        echecs.push(`${produit.nom} : profil non éligible ou sans tarif.`);
        continue;
      }
      offres.push({
        produit,
        montantTotal: agg.montantTotal,
        cotisationMensuelle: Math.round((agg.montantTotal / r.dureeMois) * 100) / 100,
        tauxMoyen: agg.tauxMoyen,
        nomProduit: agg.nomProduit || produit.nom,
      });
    } catch (e) {
      echecs.push(`${produit.nom} : ${masquerSecretsUgip(e instanceof Error ? e.message : "erreur")}`);
    }
  }

  if (offres.length === 0) {
    throw new Error(
      `UGIP n'a retourné aucun tarif exploitable.\n${echecs.slice(0, 5).join("\n")}`.trim(),
    );
  }

  const retenues = offres.sort((a, b) => a.montantTotal - b.montantTotal).slice(0, 5);

  const { data: comp } = await supabase
    .from("compagnies")
    .select("id")
    .ilike("nom", "%ugip%")
    .limit(1)
    .maybeSingle();
  const compagnieId = (comp?.id as string | undefined) ?? null;

  const quotiteTotale = r.assures.reduce((s, p) => s + (p.quotite_pct ?? 0), 0);

  const { resoudreAssureursPorteurs } = await import("@/lib/devis-assureur-porteur.server");
  const porteurs = await resoudreAssureursPorteurs(
    supabase,
    compagnieId,
    retenues.map((o) => ({ libelleProduit: o.nomProduit })),
  );

  const lignes = retenues.map((o, i) => ({
    dossier_id: input.dossierId,
    compagnie_id: compagnieId,
    produit_id: null,
    formule_id: null,
    assureur_porteur: porteurs[i] ?? null,
    cotisation_mensuelle: o.cotisationMensuelle,
    quotite_pct: quotiteTotale > 0 && quotiteTotale <= 100 ? quotiteTotale : null,
    garanties_resume:
      `${o.nomProduit} (base ${o.produit.base}) — Décès, PTIA, IPT, ITT franchise 90 j. ` +
      `Coût total ${o.montantTotal.toLocaleString("fr-FR")} € sur ${r.dureeMois} mois` +
      (o.tauxMoyen ? ` — taux moyen ${(o.tauxMoyen * 100).toFixed(3)} %` : ""),
    source: "api",
    saisi_par: userId,
  }));

  const { error: errIns } = await supabase.from("dossier_devis").insert(lignes);
  if (errIns) throw new Error(errIns.message);

  return {
    dateEffet,
    nbAssures: r.assures.length,
    nbProduitsInterroges: produits.length,
    nbTarifs: offres.length,
    nbDevisCrees: lignes.length,
    compagnieTrouvee: !!compagnieId,
    echecs: echecs.slice(0, 5),
  };
}
