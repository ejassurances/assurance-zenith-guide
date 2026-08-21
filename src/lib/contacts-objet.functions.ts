import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Contacts rattachés à un objet du CRM (fiche client, dossier, contrat,
 * sinistre, réclamation) pour l'envoi rapide d'un email multi-destinataires.
 */

export type RoleContactObjet = "client" | "compagnie" | "prescripteur" | "gestionnaire";

export interface ContactObjet {
  role: RoleContactObjet;
  libelle: string;
  nom: string;
  email: string;
}

export interface ContactsObjet {
  reference: string | null;
  intitule: string;
  contacts: ContactObjet[];
}

const schema = z.object({
  type: z.enum(["client", "dossier", "contrat", "sinistre", "reclamation"]),
  id: z.string().uuid(),
});

type RolesClient = {
  from: (table: "user_roles") => {
    select: (cols: string) => { eq: (col: string, val: string) => PromiseLike<{ data: { role: string }[] | null }> };
  };
};

async function exigerStaff(supabase: unknown, userId: string) {
  const { data } = await (supabase as RolesClient).from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("mandataire")) throw new Error("Accès réservé au cabinet.");
}

export const contactsObjet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }): Promise<ContactsObjet> => {
    await exigerStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const contacts: ContactObjet[] = [];
    const ajouter = (c: ContactObjet | null) => {
      if (!c?.email) return;
      if (contacts.some((x) => x.email.toLowerCase() === c.email.toLowerCase())) return;
      contacts.push(c);
    };

    let clientId: string | null = null;
    let compagnieId: string | null = null;
    let prescripteurId: string | null = null;
    let mandataireId: string | null = null;
    let reference: string | null = null;
    let intitule = "";

    if (data.type === "client") {
      clientId = data.id;
    } else if (data.type === "dossier") {
      const { data: d } = await supabaseAdmin
        .from("dossiers")
        .select("reference, client_id, compagnie_id")
        .eq("id", data.id)
        .maybeSingle();
      reference = d?.reference ?? null;
      clientId = d?.client_id ?? null;
      compagnieId = d?.compagnie_id ?? null;
      intitule = "Projet";
    } else if (data.type === "contrat") {
      const { data: c } = await supabaseAdmin
        .from("contrats")
        .select("numero, client_id, compagnie_id, prescripteur_id, mandataire_id")
        .eq("id", data.id)
        .maybeSingle();
      reference = c?.numero ?? null;
      clientId = c?.client_id ?? null;
      compagnieId = c?.compagnie_id ?? null;
      prescripteurId = c?.prescripteur_id ?? null;
      mandataireId = c?.mandataire_id ?? null;
      intitule = "Contrat";
    } else if (data.type === "sinistre" || data.type === "reclamation") {
      const table = data.type === "sinistre" ? "sinistres" : "reclamations";
      const { data: s } = await supabaseAdmin
        .from(table)
        .select("reference, client_id, contrat_id")
        .eq("id", data.id)
        .maybeSingle();
      reference = s?.reference ?? null;
      clientId = s?.client_id ?? null;
      intitule = data.type === "sinistre" ? "Sinistre" : "Réclamation";
      if (s?.contrat_id) {
        const { data: c } = await supabaseAdmin
          .from("contrats")
          .select("compagnie_id, prescripteur_id, mandataire_id")
          .eq("id", s.contrat_id)
          .maybeSingle();
        compagnieId = c?.compagnie_id ?? null;
        prescripteurId = c?.prescripteur_id ?? null;
        mandataireId = c?.mandataire_id ?? null;
      }
    }

    if (clientId) {
      const { data: cl } = await supabaseAdmin
        .from("clients")
        .select("reference, nom, prenom, email, commercial_id, apporteur_id")
        .eq("id", clientId)
        .maybeSingle();
      if (cl) {
        const nomClient = [cl.prenom, cl.nom].filter(Boolean).join(" ").trim() || cl.nom;
        if (data.type === "client") {
          reference = cl.reference ?? null;
          intitule = `Fiche client ${nomClient}`;
        } else {
          intitule = `${intitule} — ${nomClient}`;
        }
        ajouter(cl.email ? { role: "client", libelle: "Client", nom: nomClient, email: cl.email } : null);
        mandataireId = mandataireId ?? cl.commercial_id ?? null;
        prescripteurId = prescripteurId ?? cl.apporteur_id ?? null;
      }
    }

    if (compagnieId) {
      const { data: co } = await supabaseAdmin
        .from("compagnies")
        .select("nom, contact_nom, contact_email")
        .eq("id", compagnieId)
        .maybeSingle();
      ajouter(
        co?.contact_email
          ? {
              role: "compagnie",
              libelle: `Compagnie · ${co.nom}`,
              nom: co.contact_nom ?? co.nom,
              email: co.contact_email,
            }
          : null,
      );
    }

    if (prescripteurId) {
      const { data: p } = await supabaseAdmin
        .from("prescripteurs")
        .select("nom, prenom, email")
        .eq("id", prescripteurId)
        .maybeSingle();
      ajouter(
        p?.email
          ? {
              role: "prescripteur",
              libelle: "Prescripteur",
              nom: [p.prenom, p.nom].filter(Boolean).join(" ").trim() || p.nom,
              email: p.email,
            }
          : null,
      );
    }

    if (mandataireId) {
      const { data: pr } = await supabaseAdmin
        .from("profiles")
        .select("full_name, email")
        .eq("id", mandataireId)
        .maybeSingle();
      ajouter(
        pr?.email
          ? {
              role: "gestionnaire",
              libelle: "Gestionnaire du cabinet",
              nom: pr.full_name ?? pr.email,
              email: pr.email,
            }
          : null,
      );
    }

    return { reference, intitule: intitule || "Objet CRM", contacts };
  });
