/**
 * REMONTÉE DU RECUEIL VERS LES FICHES CLIENTS.
 *
 * Un dossier emprunteur = un prêt, avec un détail par personne assurée.
 * Chaque assuré doit disposer de sa propre fiche client (utile au passage en
 * contrat : un contrat par assuré), reliée au dossier par l'identifiant stocké
 * dans le recueil.
 *
 * Règles non négociables :
 *  - un champ déjà renseigné par un humain n'est JAMAIS écrasé ;
 *  - aucune donnée n'est inventée : un assuré sans nom n'ouvre pas de fiche ;
 *  - la remontée ne vaut pas validation du recueil (DDA humaine).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Assure = Record<string, unknown>;

const vide = (v: unknown) => v === null || v === undefined || v === "";

/** Découpe « Prénom Nom » sans jamais inventer de patronyme. */
function decouperNom(complet: string): { prenom: string | null; nom: string } {
  const parts = complet.trim().split(/\s+/);
  if (parts.length < 2) return { prenom: null, nom: complet.trim() };
  return { prenom: parts.slice(0, -1).join(" "), nom: parts[parts.length - 1]! };
}

export const synchroniserAssuresClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dossier_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { trouverClientExistant, normaliserIdentite } = await import("@/lib/client-dedoublonnage.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: dossier, error: errD } = await sb
      .from("dossiers")
      .select("id, client_id, recueil_besoins, created_by")
      .eq("id", data.dossier_id)
      .maybeSingle();
    if (errD) throw new Error(errD.message);
    if (!dossier) throw new Error("Dossier introuvable ou non accessible.");

    const recueil = (dossier.recueil_besoins ?? {}) as Record<string, unknown>;
    const assures = Array.isArray(recueil["assures"]) ? ([...recueil["assures"]] as Assure[]) : [];
    if (assures.length === 0) {
      return { mis_a_jour: 0, crees: 0, incomplets: 0, message: "Aucun assuré renseigné dans le recueil." };
    }

    /** Ne complète que les champs vides de la fiche. */
    const completer = async (clientId: string, a: Assure) => {
      const { data: fiche } = await sb
        .from("clients")
        .select("id, date_naissance, csp, fumeur")
        .eq("id", clientId)
        .maybeSingle();
      if (!fiche) return false;
      const patch: Record<string, unknown> = {};
      if (vide(fiche.date_naissance) && !vide(a["date_naissance"])) patch["date_naissance"] = a["date_naissance"];
      if (vide(fiche.csp) && !vide(a["csp"])) patch["csp"] = a["csp"];
      if (fiche.fumeur === null && typeof a["fumeur"] === "boolean") patch["fumeur"] = a["fumeur"];
      if (Object.keys(patch).length === 0) return false;
      const { error } = await sb.from("clients").update(patch as never).eq("id", clientId);
      if (error) throw new Error(error.message);
      return true;
    };

    let misAJour = 0;
    let crees = 0;
    let incomplets = 0;
    let recueilModifie = false;

    for (let i = 0; i < assures.length; i++) {
      const a = { ...assures[i] } as Assure;
      const lien = String(a["lien"] ?? "");

      // 1. Assuré principal : la fiche du dossier.
      if (lien === "principal" && dossier.client_id) {
        a["client_id"] = dossier.client_id;
        if (assures[i]?.["client_id"] !== dossier.client_id) recueilModifie = true;
        if (await completer(dossier.client_id, a)) misAJour++;
        assures[i] = a;
        continue;
      }

      // 2. Assuré déjà relié à une fiche.
      const dejaLie = typeof a["client_id"] === "string" ? (a["client_id"] as string) : null;
      if (dejaLie) {
        if (await completer(dejaLie, a)) misAJour++;
        continue;
      }

      // 3. Création d'une fiche pour le co-emprunteur, si son nom est connu.
      const nomComplet = String(a["nom"] ?? "").trim();
      if (!nomComplet) {
        incomplets++;
        continue;
      }
      const { prenom, nom } = decouperNom(nomComplet);

      // DÉDOUBLONNAGE OBLIGATOIRE : on rattache la fiche déjà connue (email, ou
      // nom + prénom, ou nom + date de naissance) au lieu d'ouvrir un doublon.
      const email = typeof a["email"] === "string" ? (a["email"] as string) : null;
      let existant =
        (await trouverClientExistant(supabaseAdmin, { email, nom, prenom: prenom ?? undefined }))?.client_id ?? null;

      if (!existant && !vide(a["date_naissance"])) {
        // Homonyme sans prénom identique : la date de naissance tranche.
        const { data: candidats } = await supabaseAdmin
          .from("clients")
          .select("id, nom, date_naissance")
          .eq("date_naissance", a["date_naissance"] as string)
          .limit(20);
        const cible = normaliserIdentite(nom);
        existant = (candidats ?? []).find((c) => normaliserIdentite(c.nom) === cible)?.id ?? null;
      }

      if (existant) {
        a["client_id"] = existant;
        assures[i] = a;
        recueilModifie = true;
        if (await completer(existant, a)) misAJour++;
        continue;
      }

      const { data: cree, error: errC } = await sb
        .from("clients")
        .insert({
          nom,
          prenom,
          statut: "prospect",
          date_naissance: vide(a["date_naissance"]) ? null : (a["date_naissance"] as string),
          csp: vide(a["csp"]) ? null : (a["csp"] as string),
          fumeur: typeof a["fumeur"] === "boolean" ? (a["fumeur"] as boolean) : null,
          commercial_id: dossier.created_by ?? context.userId ?? null,
          remarque: "Fiche créée depuis le recueil des besoins (co-emprunteur du prêt).",
        } as never)
        .select("id")
        .single();
      if (errC) throw new Error(errC.message);
      a["client_id"] = cree.id;
      assures[i] = a;
      crees++;
      recueilModifie = true;
    }

    if (recueilModifie) {
      const { error } = await sb
        .from("dossiers")
        .update({ recueil_besoins: { ...recueil, assures } as never })
        .eq("id", dossier.id);
      if (error) throw new Error(error.message);
    }

    return {
      mis_a_jour: misAJour,
      crees,
      incomplets,
      message:
        [
          crees > 0 ? `${crees} fiche(s) client créée(s)` : null,
          misAJour > 0 ? `${misAJour} fiche(s) complétée(s)` : null,
          incomplets > 0 ? `${incomplets} assuré(s) sans nom : fiche non créée` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Fiches clients déjà à jour.",
    };
  });
