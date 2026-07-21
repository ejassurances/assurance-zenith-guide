import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { NAV_LINKS, SITE } from "@/lib/site";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-background/80 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between">
        <Link to="/" className="font-serif text-xl font-medium tracking-tight text-ink">
          {SITE.name}
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
              activeProps={{ className: "text-ink" }}
            >
              {link.label}
            </Link>
          ))}
          <Link
            to="/contact"
            className="inline-flex h-9 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-primary-foreground transition-transform active:scale-95"
          >
            Prendre RDV
          </Link>
        </nav>
        <button
          type="button"
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          className="inline-flex size-10 items-center justify-center rounded-full bg-ink text-primary-foreground md:hidden"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="space-y-1">
            <span className="block h-0.5 w-5 bg-current" />
            <span className="block h-0.5 w-5 bg-current" />
          </span>
        </button>
      </div>
      {open && (
        <div className="border-t border-line bg-background md:hidden">
          <nav className="container-page flex flex-col gap-1 py-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-ink-soft hover:bg-surface"
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/contact"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-primary-foreground"
            >
              Prendre RDV
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
