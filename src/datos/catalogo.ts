import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Consultas sobre el catalogo activo.
 *
 * `v_familias_vacias` es la contracara del invariante 1: la app no muestra esas familias,
 * y este reporte es lo que le permite a Oficina Tecnica enterarse de que faltan.
 */

export interface FamiliaVacia {
  readonly codigo: string;
  readonly etiqueta: string;
  readonly usada_en_complementos: boolean;
  readonly usada_en_procesos: boolean;
}

export async function familiasVacias(supabase: SupabaseClient): Promise<FamiliaVacia[]> {
  const { data, error } = await supabase
    .from("v_familias_vacias")
    .select("codigo, etiqueta, usada_en_complementos, usada_en_procesos")
    .order("etiqueta");

  if (error !== null) throw new Error(`No se pudo leer las familias vacías: ${error.message}`);
  return (data ?? []) as FamiliaVacia[];
}
