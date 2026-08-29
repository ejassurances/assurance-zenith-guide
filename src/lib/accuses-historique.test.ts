import { describe, expect, it } from "vitest";
import { accuseAutorise, FENETRE_HEURES, TITRE_ACCUSE } from "@/lib/accuses-historique.server";

type Ligne = { contenu: string | null; created_at: string };

/** Faux client Supabase minimal : renvoie les activités fournies. */
function admin(lignes: Ligne[], erreur?: string) {
  return {
    from() {
      const chaine: Record<string, unknown> = {};
      const self = () => chaine as never;
      Object.assign(chaine, {
        select: self,
        eq: self,
        order: self,
        limit: async () => (erreur ? { data: null, error: { message: erreur } } : { data: lignes, error: null }),
      });
      return chaine;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const maintenant = () => new Date().toISOString();
const vieux = () => new Date(Date.now() - (FENETRE_HEURES + 5) * 3600 * 1000).toISOString();

describe("accuseAutorise", () => {
  it("autorise le premier accusé", async () => {
    const d = await accuseAutorise(admin([]), { client_id: "c1", genre: "message", gmail_message_id: "m1" });
    expect(d.autorise).toBe(true);
  });

  it("refuse un second accusé pour le même message", async () => {
    const d = await accuseAutorise(admin([{ contenu: "Message Gmail : m1", created_at: vieux() }]), {
      client_id: "c1",
      genre: "message",
      gmail_message_id: "m1",
    });
    expect(d.autorise).toBe(false);
  });

  it("refuse un accusé pour un autre message du même fil", async () => {
    const d = await accuseAutorise(admin([{ contenu: "Fil Gmail : t1", created_at: vieux() }]), {
      client_id: "c1",
      genre: "message",
      gmail_message_id: "m2",
      gmail_thread_id: "t1",
    });
    expect(d.autorise).toBe(false);
  });

  it("refuse un accusé dans la fenêtre glissante même sur un autre fil", async () => {
    const d = await accuseAutorise(admin([{ contenu: "Fil Gmail : t9", created_at: maintenant() }]), {
      client_id: "c1",
      genre: "message",
      gmail_message_id: "m3",
      gmail_thread_id: "t3",
    });
    expect(d.autorise).toBe(false);
  });

  it("autorise à nouveau hors fenêtre et hors fil", async () => {
    const d = await accuseAutorise(admin([{ contenu: "Fil Gmail : t9", created_at: vieux() }]), {
      client_id: "c1",
      genre: "pieces",
      gmail_message_id: "m4",
      gmail_thread_id: "t4",
    });
    expect(d.autorise).toBe(true);
  });

  it("n'envoie rien si l'historique est illisible", async () => {
    const d = await accuseAutorise(admin([], "panne"), { client_id: "c1", genre: "message" });
    expect(d.autorise).toBe(false);
  });

  it("expose un titre par genre", () => {
    expect(TITRE_ACCUSE.message).not.toEqual(TITRE_ACCUSE.pieces);
  });
});
