/**
 * BESOIN DE RÉPONSE — module PUR (aucun réseau, aucune écriture).
 *
 * Règle du cabinet : l'agent ne répond pas à tout. Chaque email entrant est
 * classé en trois catégories :
 *
 *  - `reponse_attendue`   : question, demande d'action, pièce manquante, relance ;
 *  - `informationnel`     : confirmation, avis, notification, accusé de réception
 *                           (ex. notifications Ichange) — AUCUNE réponse automatique ;
 *  - `ambigu`             : classification non certaine — l'agent ne décide pas
 *                           seul : un brouillon est préparé pour validation humaine.
 *
 * Le doute ne donne jamais lieu à un envoi : il donne lieu à un brouillon.
 */
import { estAdresseAutomatique } from "./domaines-internes";

export type BesoinReponse = "reponse_attendue" | "informationnel" | "ambigu";

export interface DecisionBesoinReponse {
  categorie: BesoinReponse;
  motif: string;
}

export interface EntreeBesoinReponse {
  sujet?: string | null;
  texte?: string | null;
  expediteur_email?: string | null;
  /** Nombre de pièces jointes reçues (une pièce attendue appelle un accusé). */
  pieces_jointes?: number;
}

const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Marqueurs d'un message purement informationnel (ne demande rien). */
const INFORMATIONNEL: RegExp[] = [
  /ne pas repondre a cet (e-?mail|message)/,
  /message automatique/,
  /notification automatique/,
  /pour information/,
  /a titre (purement )?informatif/,
  /nous vous confirmons/,
  /votre demande a (bien )?ete (enregistree|prise en compte|transmise)/,
  /accuse de reception/,
  /bien recu votre (message|demande|mail)/,
  /(avis|confirmation) (d'|de )(echeance|operation|reception|virement|paiement)/,
  /votre (dossier|demande) (a ete|est) (mis a jour|traite|valide|clos)/,
  /(newsletter|se desabonner|desinscription|preferences d'abonnement)/,
  /suivi de (votre|la) (demande|substitution)/,
  /statut (du|de la) (dossier|demande) *: /,
  /aucune action (n'est|nest) (requise|necessaire) de votre part/,
];

/** Marqueurs d'une demande explicite adressée au cabinet. */
const DEMANDE: RegExp[] = [
  /pouvez[- ]vous/,
  /pourriez[- ]vous/,
  /merci de (bien vouloir |nous )?(transmettre|envoyer|confirmer|retourner|preciser|completer|verifier|repondre)/,
  /veuillez (nous )?(transmettre|envoyer|confirmer|retourner|fournir|completer)/,
  /nous (attendons|restons dans l'attente|sommes en attente)/,
  /(il|le dossier) (nous )?manque/,
  /piece(s)? manquante(s)?/,
  /document(s)? manquant(s)?/,
  /en attente (de|du|des) (votre|vos|piece|document|retour|reponse)/,
  /(relance|premiere relance|deuxieme relance|sans reponse de votre part)/,
  /dans l'attente de votre (retour|reponse)/,
  /j'aimerais|je souhaite|je voudrais|serait[- ]il possible/,
  /avez[- ]vous/,
  /quand (est-ce que|pourrai|puis)/,
  /pouvons[- ]nous convenir|prendre rendez[- ]vous|disponibilit/,
];

/**
 * Classe le besoin de réponse. Aucun envoi n'est autorisé si la catégorie
 * n'est pas strictement `reponse_attendue`.
 */
export function classerBesoinReponse(e: EntreeBesoinReponse): DecisionBesoinReponse {
  const sujet = norm(e.sujet ?? "");
  const texte = norm(e.texte ?? "");
  const contenu = `${sujet}\n${texte}`.trim();

  if (!contenu) {
    return { categorie: "ambigu", motif: "Message vide ou illisible : classification impossible" };
  }

  const automate = estAdresseAutomatique(e.expediteur_email);
  const infos = INFORMATIONNEL.filter((r) => r.test(contenu));
  const demandes = DEMANDE.filter((r) => r.test(contenu));
  const question = /\?/.test(e.texte ?? "") || /\?/.test(e.sujet ?? "");

  // Expéditeur automate sans aucune demande explicite : informationnel.
  if (automate && demandes.length === 0) {
    return {
      categorie: "informationnel",
      motif: "Notification automatique sans demande explicite : aucune réponse attendue",
    };
  }

  // Marqueur informationnel clair et aucune demande, aucune question.
  if (infos.length > 0 && demandes.length === 0 && !question) {
    return {
      categorie: "informationnel",
      motif: "Message de confirmation / d'information : aucune réponse attendue",
    };
  }

  // Signaux contradictoires : ni envoi, ni classement définitif.
  if (infos.length > 0 && (demandes.length > 0 || question)) {
    return {
      categorie: "ambigu",
      motif: "Message à la fois informationnel et porteur d'une demande : validation humaine",
    };
  }

  if (demandes.length > 0) {
    return { categorie: "reponse_attendue", motif: "Demande explicite identifiée dans le message" };
  }

  if ((e.pieces_jointes ?? 0) > 0) {
    return {
      categorie: "reponse_attendue",
      motif: "Pièces reçues : un accusé de réception est attendu",
    };
  }

  if (question) {
    return { categorie: "reponse_attendue", motif: "Question posée au cabinet" };
  }

  return {
    categorie: "ambigu",
    motif: "Ni demande ni marqueur d'information clair : validation humaine avant envoi",
  };
}
