import { Link } from "@tanstack/react-router";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-background">
      <div className="container-page grid gap-12 py-16 md:grid-cols-2">
        <div>
          <Link to="/" className="font-serif text-xl font-medium tracking-tight">
            {SITE.name}
          </Link>
          <p className="mt-4 max-w-[36ch] text-sm text-ink-muted">
            Courtier indépendant en assurances. Conseil en gestion de patrimoine pour les emprunteurs et les familles en coparentalité (parents biologiques et parents sociaux).
          </p>
          <div className="mt-8 inline-flex flex-col rounded-md border border-line bg-surface-elevated px-3 py-2">
            <span className="text-[10px] font-bold uppercase leading-none text-ink-muted">Agrément</span>
            <span className="mt-1 text-xs font-semibold text-ink">{SITE.orias}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-8">
          <div className="space-y-3">
            <p className="text-sm font-semibold">Cabinet</p>
            <ul className="space-y-2 text-sm text-ink-muted">
              <li><Link to="/a-propos" className="hover:text-ink">À propos</Link></li>
              <li><Link to="/assurance-emprunteur" className="hover:text-ink">Assurance emprunteur</Link></li>
              <li><Link to="/coparentalite" className="hover:text-ink">Coparentalité</Link></li>
              <li><Link to="/blog" className="hover:text-ink">Blog</Link></li>
              <li><Link to="/contact" className="hover:text-ink">Contact</Link></li>
            </ul>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold">Contact</p>
            <ul className="space-y-2 text-sm text-ink-muted">
              <li>{SITE.email}</li>
              <li>{SITE.phone}</li>
              <li>{SITE.address}</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col justify-between gap-4 py-6 text-xs text-ink-muted sm:flex-row">
          <p>
            © {new Date().getFullYear()} {SITE.name} — Tous droits réservés. Société de courtage en assurances régie par le Code des Assurances, sous le contrôle de l'ACPR (4 Place de Budapest, 75009 Paris).
          </p>
          <Link to="/politique-de-confidentialite" className="shrink-0 hover:text-ink">
            Politique de confidentialité
          </Link>
        </div>
      </div>
    </footer>
  );
}
