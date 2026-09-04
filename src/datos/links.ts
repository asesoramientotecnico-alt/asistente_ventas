import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConfigEcommerce, LinkCategoria } from "@/logica/links";

/**
 * Configuracion del ecommerce y URL propia de cada familia.
 *
 * Todo sale de la base (`config` y `link_categoria`). No hay ninguna URL en el codigo:
 * cuando se releve como esta armado famiq.com.ar, se carga aca y listo.
 */

export const CLAVE_BASE = "ecommerce_base_url";
export const CLAVE_PLANTILLA = "ecommerce_search_template";

export async function configEcommerce(supabase: SupabaseClient): Promise<ConfigEcommerce> {
  const { data, error } = await supabase
    .from("config")
    .select("clave, valor")
    .in("clave", [CLAVE_BASE, CLAVE_PLANTILLA]);

  if (error !== null) {
    throw new Error(`No se pudo leer la configuración del ecommerce: ${error.message}`);
  }

  const valores = new Map(
    ((data ?? []) as Array<{ clave: string; valor: string }>).map((f) => [f.clave, f.valor]),
  );

  return {
    baseUrl: valores.get(CLAVE_BASE) ?? "",
    plantillaBusqueda: valores.get(CLAVE_PLANTILLA) ?? "",
  };
}

/** URL propia y terminos de busqueda, por codigo de familia. */
export async function linksDeCategorias(
  supabase: SupabaseClient,
  codigos: readonly string[],
): Promise<Record<string, LinkCategoria>> {
  if (codigos.length === 0) return {};

  const { data, error } = await supabase
    .from("link_categoria")
    .select("url_fija, terminos_busqueda, categoria:categoria_id!inner ( codigo )")
    .in("categoria.codigo", codigos);

  if (error !== null) throw new Error(`No se pudieron leer los links: ${error.message}`);

  const links: Record<string, LinkCategoria> = {};
  for (const fila of (data ?? []) as unknown as Array<{
    url_fija: string | null;
    terminos_busqueda: string | null;
    categoria: { codigo: string };
  }>) {
    links[fila.categoria.codigo] = {
      urlFija: fila.url_fija,
      terminosBusqueda: fila.terminos_busqueda,
    };
  }
  return links;
}

/**
 * Todas las familias activas con su link. Son 69 filas: se traen de una y la resolucion
 * la hace el navegador contra lo que el asesor tenga en el carrito, que es estado del
 * navegador y el servidor no conoce.
 */
export async function todosLosLinks(
  supabase: SupabaseClient,
): Promise<Record<string, LinkCategoria>> {
  const { data, error } = await supabase
    .from("v_cobertura_links")
    .select("codigo, url_fija, terminos_busqueda");

  if (error !== null) throw new Error(`No se pudieron leer los links: ${error.message}`);

  const links: Record<string, LinkCategoria> = {};
  for (const fila of (data ?? []) as Array<{
    codigo: string;
    url_fija: string | null;
    terminos_busqueda: string | null;
  }>) {
    links[fila.codigo] = { urlFija: fila.url_fija, terminosBusqueda: fila.terminos_busqueda };
  }
  return links;
}

export interface CoberturaLinks {
  readonly codigo: string;
  readonly etiqueta: string;
  readonly resolucion: string;
  readonly url_fija: string | null;
  readonly terminos_busqueda: string | null;
}

/** Reporte de cobertura: que familias tienen URL propia y cuales caen en la busqueda. */
export async function coberturaLinks(supabase: SupabaseClient): Promise<CoberturaLinks[]> {
  const { data, error } = await supabase
    .from("v_cobertura_links")
    .select("codigo, etiqueta, resolucion, url_fija, terminos_busqueda")
    .order("etiqueta");

  if (error !== null) throw new Error(`No se pudo leer la cobertura: ${error.message}`);
  return (data ?? []) as CoberturaLinks[];
}
