/**
 * Client HTTP du web service UGIP Assurances (Tarification Emprunteur).
 * Serveur uniquement : lit les secrets et n'expose jamais l'identifiant.
 */

import { readUgipCredentials, ugipUrl, UGIP_VERSION_API } from "./config";

export interface UgipMessageErreur {
  Code?: string | number;
  Message?: string;
  [k: string]: unknown;
}

export interface UgipReponse {
  Tarifications?: unknown[];
  Documents?: unknown[];
  MessagesErreur?: UgipMessageErreur[];
  MessagesRetour?: unknown[];
  [k: string]: unknown;
}

export interface UgipAppelResultat {
  ok: boolean;
  status: number;
  data: UgipReponse | string;
  /** Messages d'erreur métier remontés par UGIP (jamais l'identifiant). */
  erreurs: string[];
}

/** Retire toute trace de secret d'un texte avant journalisation ou affichage. */
export function masquerSecretsUgip(texte: string): string {
  const c = readUgipCredentials();
  let out = texte;
  for (const v of [c.identifiant, c.clePointVente, c.cleConseiller, c.cleSourceProjet]) {
    if (v && v.length >= 4) out = out.split(v).join("***");
  }
  return out;
}

function extraireErreurs(data: unknown): string[] {
  const o = (data ?? {}) as Record<string, unknown>;
  const liste = Array.isArray(o["MessagesErreur"]) ? (o["MessagesErreur"] as UgipMessageErreur[]) : [];
  return liste
    .map((m) => {
      const msg = typeof m?.Message === "string" ? m.Message : JSON.stringify(m);
      return masquerSecretsUgip(String(msg)).slice(0, 300);
    })
    .filter(Boolean);
}

/**
 * Appelle le WS de calcul UGIP. `donnees` correspond à l'objet « Donnees »
 * du flux d'entrée ; l'identification et la version d'API sont ajoutées ici.
 */
export async function ugipCalculer(params: {
  donnees: Record<string, unknown>;
  /** 1 = Tarification (défaut), 2 = Importation de projet. */
  idTypeOperation?: 1 | 2;
  /** 1/2/3 : regroupement de l'échéancier (2 = échéancier global annuel). */
  idTypeEcheancier?: 1 | 2 | 3;
  /** Type d'édition demandée (documents PDF en base64 dans la réponse). */
  idTypeEdition?: 1 | 2 | 3;
  timeoutMs?: number;
}): Promise<UgipAppelResultat> {
  const creds = readUgipCredentials();
  if (!creds.identifiant) {
    throw new Error(
      "Intégration UGIP non configurée : renseignez le secret UGIP_IDENTIFIANT (identifiant APPLI-KEY) avant de tarifer.",
    );
  }

  const body: Record<string, unknown> = {
    Identifiant: creds.identifiant,
    VersionAPI: UGIP_VERSION_API,
    IdTypeEcheancier: params.idTypeEcheancier ?? 2,
    Configuration: {
      IdTypeOperation: params.idTypeOperation ?? 1,
      ...(params.idTypeEdition ? { IdTypeEdition: params.idTypeEdition } : {}),
    },
    Donnees: params.donnees,
  };
  if (creds.clePointVente) body["ClePointVente"] = creds.clePointVente;
  if (creds.cleConseiller) body["CleConseiller"] = creds.cleConseiller;
  if (creds.cleSourceProjet) body["CleSourceProjet"] = creds.cleSourceProjet;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), params.timeoutMs ?? 30_000);
  try {
    const res = await fetch(ugipUrl(creds), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const brut = await res.text();
    let data: UgipReponse | string = brut;
    try {
      data = JSON.parse(brut) as UgipReponse;
    } catch {
      data = masquerSecretsUgip(brut).slice(0, 500);
    }
    const erreurs = typeof data === "string" ? [] : extraireErreurs(data);
    return { ok: res.ok && erreurs.length === 0, status: res.status, data, erreurs };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Appel UGIP impossible";
    throw new Error(masquerSecretsUgip(msg));
  } finally {
    clearTimeout(timer);
  }
}
