import { ETIQUETA_PRIORIDAD } from "@/logica/sugerencias";
import type { Prioridad } from "@/tipos/dominio";

/**
 * La prioridad se lee de un vistazo, sin depender solo del color: cada una tiene su
 * propio peso y su propio texto. El `oblig` es el unico solido, porque es el que el
 * asesor no puede pasar por alto.
 */
const ESTILO: Record<Prioridad, string> = {
  oblig: "bg-acento-600 text-white",
  reco: "border border-acento-600 text-acento-700",
  opc: "border border-borde-fuerte text-texto-tenue",
};

export function EtiquetaPrioridad({ prioridad }: { prioridad: Prioridad }) {
  return (
    <span
      className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${ESTILO[prioridad]}`}
    >
      {ETIQUETA_PRIORIDAD[prioridad]}
    </span>
  );
}
