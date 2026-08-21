import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ouvrirDossierDriveClient } from "@/lib/drive.functions";
import { ouvrirPdf } from "@/lib/ouvrir-pdf";

/**
 * Ouvre (en le créant au besoin) le dossier Google Drive du client :
 * 01_CLIENTS/CLI-[Année]-[ID]_[NOM]_[Prénom] et ses 6 sous-dossiers.
 */
export function DriveDossierButton({ clientId }: { clientId: string }) {
  const ouvrir = useServerFn(ouvrirDossierDriveClient);
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void ouvrirPdf(async () => {
          const res = await ouvrir({ data: { client_id: clientId } });
          return res.folder_url;
        })
          .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Dossier Drive indisponible"))
          .finally(() => setBusy(false));
      }}
      className="rounded-full border border-[#D4AF37]/50 bg-[#D4AF37]/15 px-3 py-1.5 text-xs font-semibold text-[#F4E3AE] transition hover:bg-[#D4AF37]/25 disabled:opacity-50"
    >
      {busy ? "Ouverture…" : "Dossier Drive"}
    </button>
  );
}
