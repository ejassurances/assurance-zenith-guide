/**
 * Ouverture d'un PDF dont l'URL est obtenue de façon asynchrone.
 *
 * Les navigateurs mobiles (Safari iOS, Chrome Android) bloquent window.open
 * appelé après un await : l'onglet n'est plus rattaché au geste utilisateur.
 * On ouvre donc l'onglet immédiatement au clic, puis on y place l'URL une fois
 * connue. Si l'ouverture est refusée, on navigue dans l'onglet courant.
 */
export async function ouvrirPdf(charger: () => Promise<string>): Promise<void> {
  const onglet = typeof window !== "undefined" ? window.open("", "_blank") : null;
  if (onglet) {
    onglet.document.write(
      "<!doctype html><meta charset='utf-8'><title>Ouverture du document…</title>" +
        "<body style=\"font-family:system-ui;padding:2rem;color:#333\">Préparation de votre document…</body>",
    );
    onglet.document.close();
  }
  try {
    const url = await charger();
    if (onglet && !onglet.closed) onglet.location.href = url;
    else window.location.href = url;
  } catch (e) {
    if (onglet && !onglet.closed) onglet.close();
    throw e;
  }
}
