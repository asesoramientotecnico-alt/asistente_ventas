/**
 * Reglas de presentacion de las sugerencias. Logica pura, testeada.
 *
 * Lo que NO esta aca: que familia complementa a que producto. Eso vive en la base
 * (`complemento` / `complemento_categoria`) y Oficina Tecnica lo edita sin redeploy.
 * Aca solo esta lo que hace la pantalla con esas reglas una vez leidas.
 */
import type { Prioridad } from "@/tipos/dominio";

export interface FamiliaSugerida {
  readonly codigo: string;
  readonly etiqueta: string;
  /** Items en el batch activo. Una familia en cero no se muestra. */
  readonly items: number;
}

export interface ComplementoSugerido {
  readonly id: string;
  readonly nombre: string;
  readonly prioridad: Prioridad;
  readonly motivo: string;
  readonly dependeDelGrado: boolean;
  readonly familias: readonly FamiliaSugerida[];
}

export interface Aporte {
  readonly aporte: string;
  readonly motivo: string;
}

export const ORDEN_PRIORIDAD: Record<Prioridad, number> = { oblig: 0, reco: 1, opc: 2 };

export const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = {
  oblig: "Va sí o sí",
  reco: "Recomendado",
  opc: "Opcional",
};

/**
 * Invariante 1: nunca se sugiere una familia que no este en el catalogo con items > 0.
 * Un complemento que queda sin ninguna familia disponible desaparece entero: mostrar el
 * titulo de una sugerencia vacia solo confunde al asesor.
 */
export function filtrarPorCatalogo(
  complementos: readonly ComplementoSugerido[],
): ComplementoSugerido[] {
  return complementos
    .map((c) => ({ ...c, familias: c.familias.filter((f) => f.items > 0) }))
    .filter((c) => c.familias.length > 0);
}

export function ordenarPorPrioridad<T extends { prioridad: Prioridad }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad]);
}

/**
 * Reescribe el motivo del complemento de aporte con la justificacion del grado elegido.
 * Misma composicion que el original en Python.
 *
 * Si el grado no tiene aporte definido, el motivo queda como esta: no se inventa una
 * justificacion tecnica para un grado sobre el que Oficina Tecnica no se pronuncio.
 */
export function motivoConAporte(motivo: string, aporte: Aporte | null): string {
  if (aporte === null) return motivo;
  return `Aporte ${aporte.aporte}: ${aporte.motivo} ${motivo}`.trim();
}

export function aplicarAporte(
  complementos: readonly ComplementoSugerido[],
  aporte: Aporte | null,
): ComplementoSugerido[] {
  return complementos.map((c) =>
    c.dependeDelGrado ? { ...c, motivo: motivoConAporte(c.motivo, aporte) } : c,
  );
}

/** Clave estable de una familia dentro del carrito. */
export function claveSeleccion(complementoId: string, categoriaCodigo: string): string {
  return `${complementoId}:${categoriaCodigo}`;
}

/** Los `oblig` vienen premarcados; el asesor desmarca. */
export function seleccionInicial(complementos: readonly ComplementoSugerido[]): string[] {
  return complementos
    .filter((c) => c.prioridad === "oblig")
    .flatMap((c) => c.familias.map((f) => claveSeleccion(c.id, f.codigo)));
}

/**
 * Prepara los complementos para la pantalla en un solo lugar: filtra por catalogo,
 * aplica el aporte del grado elegido y ordena por prioridad.
 */
export function prepararSugerencias(
  complementos: readonly ComplementoSugerido[],
  aporte: Aporte | null,
): ComplementoSugerido[] {
  return ordenarPorPrioridad(aplicarAporte(filtrarPorCatalogo(complementos), aporte));
}
