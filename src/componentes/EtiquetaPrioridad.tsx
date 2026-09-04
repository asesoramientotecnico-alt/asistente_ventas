import { ETIQUETA_PRIORIDAD } from "@/logica/sugerencias";
import type { Prioridad } from "@/tipos/dominio";

const COLOR: Record<Prioridad, string> = {
  oblig: "bg-slate-900 text-white",
  reco: "bg-slate-200 text-slate-800",
  opc: "bg-slate-100 text-slate-600",
};

export function EtiquetaPrioridad({ prioridad }: { prioridad: Prioridad }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${COLOR[prioridad]}`}>
      {ETIQUETA_PRIORIDAD[prioridad]}
    </span>
  );
}
