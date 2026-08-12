# Économies réellement réalisées (assurance emprunteur)

Remplacer la logique "simulateur prospect" par un suivi des économies **constatées à la signature** d'un contrat emprunteur, agrégées pour l'admin (tout le cabinet) et pour chaque mandataire (ses seuls contrats).

## Principe

Une économie est figée au moment où un contrat emprunteur passe au statut **Signé** :
- coût du contrat groupe bancaire = taux banque appliqué sur le capital initial (non dégressif),
- coût du contrat délégué = taux courtier appliqué sur le capital restant dû (dégressif),
- économie = coût groupe − coût délégué (jamais négative).

Le calcul réutilise `src/lib/insurance-rates.ts` (`coutTotalGroupe`, `coutTotalCourtier`, table de taux par tranche d'âge + surprime fumeur). L'âge et le statut fumeur proviennent de la fiche client (`date_naissance`, `fumeur`) ; le taux réellement négocié sur le contrat (`taux_assurance_annuel`) est utilisé en priorité pour le coût délégué quand il est renseigné, sinon on retombe sur la table de taux.

Le montant est **stocké** (photo à la signature), pas recalculé à l'affichage : il ne bouge plus si la table de taux évolue.

## Données (migration)

Nouvelles colonnes sur `contrats` :
- `economie_cout_groupe` numeric — coût total estimé du contrat bancaire
- `economie_cout_delegue` numeric — coût total du contrat courtier
- `economie_realisee` numeric — écart retenu
- `economie_taux_groupe` / `economie_taux_delegue` numeric — taux utilisés (traçabilité)
- `economie_base` jsonb — âge, fumeur, capital, durée, quotité au moment du calcul
- `economie_calculee_le` timestamptz

Fonction d'agrégation `public.economies_emprunteur(_mandataire_id uuid default null)` (SECURITY DEFINER, STABLE, `search_path = public`, EXECUTE réservé à `authenticated`) retournant `total_economies`, `nb_contrats`, `economie_moyenne`, `capital_total` :
- périmètre : `contrats.is_emprunteur`, `statut = 'signe'`, client de marque `ej_assurances` ;
- admin : tout le cabinet, ou filtré si `_mandataire_id` est fourni ;
- mandataire : forcé sur `auth.uid()` (le paramètre est ignoré) ;
- autres rôles : zéros.

Aucun nouveau droit d'accès direct aux contrats n'est ajouté ; les règles RLS existantes restent inchangées.

## Écriture du montant

Dans `src/routes/_authenticated/espace.contrats.$id.tsx` (enregistrement du contrat) :
- si `is_emprunteur` et que le statut devient `signe` et qu'aucune économie n'est encore figée → calcul et écriture des colonnes ci-dessus dans le même `update` ;
- si le statut repasse hors `signe` → remise à `null` (l'économie n'est plus "réalisée") ;
- bouton discret « Recalculer l'économie » (admin uniquement) pour rafraîchir un contrat déjà signé après correction des paramètres du prêt ;
- affichage d'un encart dans le bloc emprunteur : coût banque, coût délégué, économie retenue, date de calcul.

Un helper `src/lib/economie-emprunteur.ts` porte le calcul (entrées contrat + client → montants), pour éviter de dupliquer la logique.

## Affichage

- `src/routes/_authenticated/espace.index.tsx` : nouvelle carte KPI « Économies réalisées » (montant total, avec sous-titre « N contrats emprunteur signés · moyenne X € »), alimentée par la fonction d'agrégation. Libellé « — tout le cabinet » pour l'admin, « — mes contrats » pour un mandataire. Carte masquée pour le rôle client.
- `src/components/contrats-tab.tsx` (fiche client) : colonne « Économie » sur les contrats emprunteur signés.
- Aucun simulateur, aucune saisie prospect n'est réintroduit.

## Points à confirmer

1. Seuls les contrats de clients marqués **EJ Assurances** comptent (les contrats emprunteur rattachés à la marque Coparentalité sont exclus de l'indicateur) — hypothèse retenue.
2. Un contrat `résilié` après signature reste-t-il compté ? Hypothèse retenue : oui, l'économie a été réalisée jusqu'à la résiliation, mais l'indicateur peut afficher un second compteur « dont contrats résiliés » si vous préférez.
3. Économie calculée sur toute la durée du prêt (économie cumulée), pas annualisée — hypothèse retenue.
