import type { SupabaseClient } from "@supabase/supabase-js";
import type { Criterio } from "@/logica/sugerencias";

/**
 * Enumeracion de items del catalogo para una familia ya filtrada.
 *
 * Invariante 2: la app enumera, el asesor elige. Lo que sale de aca son los items que el
 * import dejo en el batch activo — nunca codigos inventados — y no se premarca ninguno
 * ni se afirma precio o stock, que son del ecommerce y no estan en el archivo.
 */

export interface ItemCatalogo {
  readonly materialId: string;
  readonly descripcion: string;
  readonly grado: string | null;
  readonly medidas: readonly string[];
}

export interface ItemsDeFamilia {
  readonly items: readonly ItemCatalogo[];
  /** Cuantos hay en total; `items` puede venir recortado por el limite. */
  readonly total: number;
  /**
   * True cuando el filtro no dio ninguna coincidencia y se muestra la familia entera.
   *
   * Dejar al asesor con una lista vacia es peor que mostrarle de mas: si no hay brida de
   * 2 1/2", lo util es ver que bridas hay y decidir, no una pantalla en blanco.
   */
  readonly sinCoincidencia: boolean;
}

/** Cuantos items tiene la familia con estos filtros. */
async function contar(
  supabase: SupabaseClient,
  categoria: string,
  medida: string | null,
  grado: string | null,
): Promise<number> {
  const { data, error } = await supabase.rpc("contar_items_de_categoria", {
    p_categoria: categoria,
    p_medida: medida,
    p_grado: grado,
    p_rosca: null,
  });
  if (error !== null) throw new Error(`No se pudo contar el catálogo: ${error.message}`);
  return Number(data ?? 0);
}

async function traer(
  supabase: SupabaseClient,
  categoria: string,
  medida: string | null,
  grado: string | null,
  limite: number,
): Promise<ItemCatalogo[]> {
  const { data, error } = await supabase.rpc("items_de_categoria", {
    p_categoria: categoria,
    p_medida: medida,
    p_grado: grado,
    p_rosca: null,
    p_limite: limite,
  });
  if (error !== null) throw new Error(`No se pudieron leer los ítems: ${error.message}`);

  return ((data ?? []) as Array<{
    material_id: string;
    descripcion: string;
    grado_norm: string | null;
    medidas: string[] | null;
  }>).map((f) => ({
    materialId: f.material_id,
    descripcion: f.descripcion,
    grado: f.grado_norm,
    medidas: f.medidas ?? [],
  }));
}

/**
 * Los filtros que aplican a un par, segun su criterio.
 *
 * El criterio vive en `complemento_categoria` y no en una variable global de la sesion:
 * la medida del cano no filtra el aporte, porque el diametro de una varilla TIG es el de
 * la varilla y no el de la linea.
 */
export function filtrosSegunCriterio(
  criterio: Criterio,
  medida: string | null,
  grado: string | null,
  aporte: string | null,
): { medida: string | null; grado: string | null } {
  switch (criterio) {
    case "medida":
      return { medida, grado: null };
    case "grado":
      return { medida: null, grado };
    case "aporte":
      return { medida: null, grado: aporte };
    case "rosca":
    case "ninguno":
      return { medida: null, grado: null };
  }
}

export async function itemsDeFamilia(
  supabase: SupabaseClient,
  categoria: string,
  filtros: { medida: string | null; grado: string | null },
  limite = 25,
): Promise<ItemsDeFamilia> {
  const hayFiltro = filtros.medida !== null || filtros.grado !== null;

  if (hayFiltro) {
    const total = await contar(supabase, categoria, filtros.medida, filtros.grado);
    if (total > 0) {
      const items = await traer(supabase, categoria, filtros.medida, filtros.grado, limite);
      return { items, total, sinCoincidencia: false };
    }
  }

  // Sin filtro, o con filtro que no dio nada: la familia entera.
  const total = await contar(supabase, categoria, null, null);
  const items = await traer(supabase, categoria, null, null, limite);
  return { items, total, sinCoincidencia: hayFiltro };
}
