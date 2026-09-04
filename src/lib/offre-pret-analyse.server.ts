/**
 * ANALYSE IA D'UNE OFFRE DE PRÊT (ou tableau d'amortissement) DÉPOSÉE À LA
 * CRÉATION D'UN DOSSIER EMPRUNTEUR.
 *
 * Objectif : relever, en une lecture, les caractéristiques du prêt ET l'identité
 * des emprunteurs, afin de pré-remplir le recueil des besoins et de rapprocher
 * (ou créer) les fiches clients correspondantes.
 *
 * Garde-fous :
 *  - aucune donnée inventée : absente ou illisible => null ;
 *  - aucune donnée de santé (loi Lemoine) : seul le statut fumeur est accepté,
 *    et uniquement s'il est écrit noir sur blanc ;
 *  - aucune écriture en base ici : ce module lit uniquement le document.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODELES = ["google/gemini-3.6-flash", "google/gemini-2.5-flash"];

export interface EmprunteurDetecte {
  prenom: string;
  nom: string;
  date_naissance: string;
  quotite_pct: number | null;
  csp: string;
  fumeur: boolean | null;
  email: string | null;
  telephone: string | null;
}

export interface AnalyseOffrePret {
  lisible: boolean;
  confidence: number;
  /** Champs du prêt, au format attendu par `prefillRecueilEmprunteur`. */
  pret: Record<string, unknown>;
  emprunteurs: EmprunteurDetecte[];
}

const CHAMPS_PRET = [
  ["banque", "nom de la banque prêteuse"],
  ["montant_capital", "capital emprunté en euros (nombre)"],
  ["taux_nominal", "taux nominal annuel du prêt en % (nombre)"],
  ["duree_mois", "durée totale du prêt en mois (nombre entier)"],
  ["mensualite", "mensualité hors assurance en euros (nombre)"],
  ["taux_assurance", "taux annuel de l'assurance emprunteur de la banque en % (nombre)"],
  ["cotisation_assurance_mensuelle", "cotisation mensuelle d'assurance emprunteur en euros (nombre)"],
  ["date_premiere_echeance", "date de la première échéance AAAA-MM-JJ"],
  ["objet_pret", "objet du financement tel qu'écrit (résidence principale, locatif…)"],
] as const;

const NOMBRES = new Set([
  "montant_capital",
  "taux_nominal",
  "duree_mois",
  "mensualite",
  "taux_assurance",
  "cotisation_assurance_mensuelle",
]);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function prompt(): string {
  return [
    "Tu es un moteur d'EXTRACTION documentaire. Le document est une offre de prêt immobilier",
    "ou un tableau d'amortissement.",
    "Ta seule mission : relever ce qui est RÉELLEMENT ÉCRIT dans le document.",
    "",
    "INTERDICTIONS ABSOLUES :",
    "- n'invente jamais une valeur absente ou illisible : mets null ;",
    "- ne calcule ni ne déduis aucune valeur non écrite ;",
    "- ne relève AUCUNE donnée de santé (antécédents, pathologies, traitements).",
    "",
    "Champs du prêt à relever :",
    ...CHAMPS_PRET.map(([nom, desc]) => `- ${nom} : ${desc}`),
    "",
    "Emprunteurs : pour chaque personne empruntrice nommée dans le document, relève",
    "prenom, nom, date_naissance (AAAA-MM-JJ), quotite_pct (quotité assurée en %, nombre),",
    "csp (profession écrite), fumeur (true/false seulement si écrit, sinon null),",
    "email, telephone. Toute valeur non écrite vaut null.",
    "",
    "Réponds STRICTEMENT en JSON, sans texte autour :",
    `{"pret":{${CHAMPS_PRET.map(([n]) => `"${n}":null`).join(",")}},"emprunteurs":[{"prenom":null,"nom":null,"date_naissance":null,"quotite_pct":null,"csp":null,"fumeur":null,"email":null,"telephone":null}],"confidence":0.00,"document_lisible":true}`,
    "",
    "Règles : confidence entre 0.00 et 1.00 ; document illisible => document_lisible false,",
    "pret à null et emprunteurs vide.",
  ].join("\n");
}

function extraireJson(texte: string): Record<string, unknown> {
  const nettoye = texte.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(nettoye) as Record<string, unknown>;
  } catch {
    const debut = nettoye.indexOf("{");
    const fin = nettoye.lastIndexOf("}");
    if (debut === -1 || fin <= debut) throw new Error("Réponse IA illisible (JSON attendu)");
    return JSON.parse(nettoye.slice(debut, fin + 1)) as Record<string, unknown>;
  }
}

function texteOuNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || /^(n\/?a|néant|non renseign)/i.test(s)) return null;
  return s;
}

function nombreOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n =
    typeof v === "number"
      ? v
      : Number(String(v).replace(/\s/g, "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normaliserEmprunteurs(brut: unknown): EmprunteurDetecte[] {
  if (!Array.isArray(brut)) return [];
  const out: EmprunteurDetecte[] = [];
  for (const item of brut) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const nom = texteOuNull(o["nom"]);
    if (!nom) continue; // sans nom écrit, aucune fiche n'est proposée
    const dn = texteOuNull(o["date_naissance"]);
    out.push({
      nom,
      prenom: texteOuNull(o["prenom"]) ?? "",
      date_naissance: dn && ISO.test(dn) && !Number.isNaN(Date.parse(dn)) ? dn : "",
      quotite_pct: nombreOuNull(o["quotite_pct"]),
      csp: texteOuNull(o["csp"]) ?? "",
      fumeur: typeof o["fumeur"] === "boolean" ? (o["fumeur"] as boolean) : null,
      email: texteOuNull(o["email"]),
      telephone: texteOuNull(o["telephone"]),
    });
  }
  return out;
}

/** Lit un document (PDF ou image, en base64) et en retourne prêt + emprunteurs. */
export async function analyserOffrePretFichier(fichier: {
  nom: string;
  mime: string;
  base64: string;
}): Promise<AnalyseOffrePret> {
  const cle = process.env["LOVABLE_API_KEY"];
  if (!cle) throw new Error("Analyse indisponible : clé IA absente du projet.");

  const dataUrl = `data:${fichier.mime || "application/pdf"};base64,${fichier.base64}`;
  const contenu = (fichier.mime || "").startsWith("image/")
    ? [
        { type: "text", text: prompt() },
        { type: "image_url", image_url: { url: dataUrl } },
      ]
    : [
        { type: "text", text: prompt() },
        { type: "file", file: { filename: fichier.nom, file_data: dataUrl } },
      ];

  let derniere = "";
  let brut: Record<string, unknown> | null = null;
  for (const model of MODELES) {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: contenu }] }),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const texte = json.choices?.[0]?.message?.content ?? "";
      if (!texte) throw new Error("Réponse IA vide");
      brut = extraireJson(texte);
      break;
    }
    derniere = `${res.status} ${await res.text()}`;
    if (res.status === 429) throw new Error("Analyse IA momentanément saturée, réessayez.");
    if (res.status !== 400 && res.status !== 404) break;
  }
  if (!brut) throw new Error(`Analyse IA impossible : ${derniere}`);

  const lisible = brut["document_lisible"] !== false;
  const conf = Number(brut["confidence"]);
  const source = (typeof brut["pret"] === "object" && brut["pret"] !== null ? brut["pret"] : {}) as Record<
    string,
    unknown
  >;

  const pret: Record<string, unknown> = {};
  if (lisible) {
    for (const [nom] of CHAMPS_PRET) {
      const v = source[nom];
      if (NOMBRES.has(nom)) {
        const n = nombreOuNull(v);
        if (n !== null) pret[nom] = n;
        continue;
      }
      const s = texteOuNull(v);
      if (!s) continue;
      if (nom === "date_premiere_echeance") {
        if (ISO.test(s) && !Number.isNaN(Date.parse(s))) pret[nom] = s;
        continue;
      }
      pret[nom] = s;
    }
  }

  return {
    lisible,
    confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0,
    pret,
    emprunteurs: lisible ? normaliserEmprunteurs(brut["emprunteurs"]) : [],
  };
}
