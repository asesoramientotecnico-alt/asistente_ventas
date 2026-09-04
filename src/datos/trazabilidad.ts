import type { SupabaseClient } from "@supabase/supabase-js";
import type { Prioridad } from "@/tipos/dominio";

/**
 * Registro de lo que se le mostro al asesor y de que hizo con eso.
 *
 * Se registra en el momento en que el asesor decide —cuando suma al carrito—, no en cada
 * render. Es una desviacion deliberada del blueprint, que dice "cada sugerencia mostrada":
 * asi cada fila lleva el dato que importa, si la acepto o no, en vez de acumular filas de
 * pantallas por las que solo paso. Lo que se busca medir en F3 es la tasa de aceptacion
 * por regla, y eso sale de aca.
 *
 * NADA de esto puede romper la atencion en el mostrador. Si el registro falla, la
 * pantalla sigue funcionando: se avisa por consola y listo.
 */

export type Puerta = "producto" | "proceso" | "material";

export interface SugerenciaMostrada {
  /** `complementoId:categoriaCodigo`, la misma clave que usa el carrito. */
  readonly clave: string;
  readonly complemento_id: string | null;
  readonly categoria: string;
  readonly prioridad: Prioridad;
  readonly aceptada: boolean;
}

/**
 * Registra una consulta con todas sus sugerencias.
 * Devuelve, por clave, el id de la fila de traza, para poder marcar despues cuales
 * llegaron a generar un link.
 */
export async function registrarSugerencias(
  supabase: SupabaseClient,
  datos: {
    puerta: Puerta;
    tipo: string;
    grado: string | null;
    sugerencias: readonly SugerenciaMostrada[];
  },
): Promise<Record<string, string>> {
  if (datos.sugerencias.length === 0) return {};

  const { data, error } = await supabase.rpc("registrar_sugerencias", {
    p_puerta: datos.puerta,
    p_tipo: datos.tipo,
    p_grado: datos.grado ?? "",
    p_sugerencias: datos.sugerencias,
  });

  if (error !== null) {
    console.warn("No se pudo registrar la traza de sugerencias:", error.message);
    return {};
  }

  const ids: Record<string, string> = {};
  for (const fila of (data ?? []) as Array<{ clave: string; sugerencia_id: string }>) {
    ids[fila.clave] = fila.sugerencia_id;
  }
  return ids;
}

/** Marca las sugerencias que llegaron a tener un link resuelto. */
export async function marcarLinksGenerados(
  supabase: SupabaseClient,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supabase
    .from("sesion_sugerencia")
    .update({ generado_link: true })
    .in("id", [...ids]);

  if (error !== null) console.warn("No se pudo marcar los links generados:", error.message);
}
