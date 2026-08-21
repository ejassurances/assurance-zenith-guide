import { createFileRoute } from "@tanstack/react-router";

/** Route temporaire de régularisation : complète le devoir de conseil brouillon avec les vraies données. */
export const Route = createFileRoute("/api/public/tmp-regen-dc")({
  server: {
    handlers: {
      GET: async () => {
        const dossierId = "81cfe711-1ad0-4d5d-972f-7a536e0762b5";
        const userId = "f6d18a82-4f54-46b0-8785-6db7d8c90313";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { envoyerDevoirConseil } = await import("@/lib/devoir-conseil.server");
        const { data: brouillon } = await supabaseAdmin
          .from("devoirs_conseil")
          .select("recommandation, motifs, mises_en_garde, contenu")
          .eq("id", "3fcae7df-728b-426c-9c1a-5c29ecece5cd")
          .maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b = brouillon as any;
        try {
          const res = await envoyerDevoirConseil(
            supabaseAdmin,
            dossierId,
            userId,
            {
              recommandation: b.recommandation,
              motifs: b.motifs,
              mises_en_garde: b.mises_en_garde ?? undefined,
              garanties: b.contenu?.conseil?.garanties,
              exigences_client: b.contenu?.conseil?.exigences_client,
              compagnie: "Kereis",
              produit: "Emprunteur Cardif Clé (Kereis)",
              assiette: "capital_restant_du",
              type_cotisation: "CRD",
              capital_assure: 226394,
              capital_restant_du: 226394,
              quotite: 75,
              duree_mois: 167,
              cotisation_mensuelle: 50.27,
              montant_total: 8394.32,
              frais_dossier: 35,
              frais_souscription: 75,
              frais_courtage: 82.52,
              economie_estimee: 3943.42,
              offres: [
                {
                  compagnie: "Kereis",
                  produit: "Emprunteur Cardif Clé (Kereis)",
                  formule: "CARDIF Libertés Emprunteur n° 2828/737 — cotisations variables",
                  cotisation_mensuelle: 50.27,
                  cout_total: 8394.32,
                  statut: "retenue",
                  commentaire:
                    "Coût total restant 8 394,32 € contre 12 337,74 € au contrat groupe bancaire, soit 3 943,42 € d'économie à garanties équivalentes (quotité 75 %, franchise 90 jours).",
                },
                {
                  compagnie: "Contrat groupe de l'établissement prêteur",
                  produit: "Assurance groupe du prêt (situation actuelle)",
                  cout_total: 12337.74,
                  statut: "ecartee",
                  commentaire:
                    "Tarification mutualisée pénalisant le profil fumeur : coût restant supérieur de 3 943,42 € sur les 167 mensualités restantes.",
                },
              ],
            },
            { sansEnvoi: true, valider: true },
          );
          return Response.json({ ok: true, res });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
