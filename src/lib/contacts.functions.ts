import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Carnet d'adresses du CRM : clients, partenaires (compagnies) et mandataires/prescripteurs. */

type RolesClient = {
  from: (table: "user_roles") => {
    select: (cols: string) => { eq: (col: string, val: string) => PromiseLike<{ data: { role: string }[] | null }> };
  };
};

async function exigerStaff(supabase: unknown, userId: string) {
  const { data } = await (supabase as RolesClient).from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("mandataire")) throw new Error("Accès réservé au cabinet.");
  return roles.includes("admin") ? "admin" : "mandataire";
}

export type CategorieContact = "client" | "partenaire" | "mandataire" | "prescripteur";

export interface ContactCrm {
  id: string;
  categorie: CategorieContact;
  nom: string;
  email: string;
  detail: string | null;
  client_id: string | null;
  compagnie_id: string | null;
}

export const carnetContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ recherche: z.string().trim().max(120).optional().nullable() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ contacts: ContactCrm[] }> => {
    await exigerStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [clients, compagnies, roles] = await Promise.all([
      supabaseAdmin
        .from("clients")
        .select("id, nom, prenom, email, statut, reference")
        .not("email", "is", null)
        .order("nom", { ascending: true })
        .limit(1000),
      supabaseAdmin
        .from("compagnies")
        .select("id, nom, contact_nom, contact_email")
        .not("contact_email", "is", null)
        .order("nom", { ascending: true }),
      supabaseAdmin.from("user_roles").select("user_id, role").in("role", ["mandataire", "prescripteur"]),
    ]);

    const staffIds = (roles.data ?? []).map((r) => r.user_id);
    const { data: profils } = staffIds.length
      ? await supabaseAdmin.from("profiles").select("id, email, full_name, company").in("id", staffIds)
      : { data: [] as { id: string; email: string | null; full_name: string | null; company: string | null }[] };

    const contacts: ContactCrm[] = [];

    for (const c of clients.data ?? []) {
      contacts.push({
        id: `client:${c.id}`,
        categorie: "client",
        nom: [c.prenom, c.nom].filter(Boolean).join(" ").trim() || c.nom,
        email: c.email!,
        detail: [c.reference, c.statut].filter(Boolean).join(" · ") || null,
        client_id: c.id,
        compagnie_id: null,
      });
    }

    for (const c of compagnies.data ?? []) {
      contacts.push({
        id: `compagnie:${c.id}`,
        categorie: "partenaire",
        nom: c.nom,
        email: c.contact_email!,
        detail: c.contact_nom ?? null,
        client_id: null,
        compagnie_id: c.id,
      });
    }

    for (const p of profils ?? []) {
      if (!p.email) continue;
      const role = (roles.data ?? []).find((r) => r.user_id === p.id)?.role;
      contacts.push({
        id: `user:${p.id}`,
        categorie: role === "prescripteur" ? "prescripteur" : "mandataire",
        nom: p.full_name || p.email,
        email: p.email,
        detail: p.company ?? null,
        client_id: null,
        compagnie_id: null,
      });
    }

    const q = data.recherche?.toLowerCase();
    const filtres = q
      ? contacts.filter((c) => `${c.nom} ${c.email} ${c.detail ?? ""}`.toLowerCase().includes(q))
      : contacts;

    return { contacts: filtres };
  });
