import type { SupabaseClient } from "@supabase/supabase-js";
import { ordenarMedidas } from "@/logica/medida";
import type { Eje, Faceta, Seleccion } from "@/logica/facetas";

/**
 * Facetas y busqueda para identificar el material.
 *
 * Lo que decide que eje se ofrece esta en `src/logica/facetas.ts`, que es logica pura y
 * testeada. Aca solo se consulta.
 */

export interface ItemEncontrado {
  readonly materialId: string;
  readonly descripcion: string;
  readonly categoria: string;
  readonly etiqueta: string;
  readonly tipo: string | null;
  readonly grado: string | null;
  readonly medidas: readonly string[];
}

/** Los filtros ya elegidos, en la forma que esperan las funciones de la base. */
function parametros(categoria: string, s: Seleccion) {
  return {
    p_categoria: categoria,
    p_tipo: s.tipo ?? null,
    p_medida: s.medida ?? null,
    p_grado: s.grado ?? null,
    p_terminacion: s.terminacion ?? null,
    p_norma: s.norma ?? null,
  };
}

/**
 * Opciones de cada eje para lo que queda despues de los filtros ya elegidos.
 *
 * Devuelve tambien cuantos items del conjunto NO declaran valor en ese eje. Sin ese dato
 * no se puede distinguir un eje util de uno que esconderia la mayoria del stock: el
 * Schedule del caño esta vacio en el 86 % de sus items.
 */
export async function facetasDeCategoria(
  supabase: SupabaseClient,
  categoria: string,
  seleccion: Seleccion,
): Promise<Faceta[]> {
  const { data, error } = await supabase.rpc("facetas_de_categoria", parametros(categoria, seleccion));
  if (error !== null) throw new Error(`No se pudieron leer las facetas: ${error.message}`);

  const filas = (data ?? []) as Array<{
    eje: string;
    valor: string;
    items: number;
    sin_dato: number;
  }>;

  const porEje = new Map<Eje, Faceta>();
  for (const f of filas) {
    const eje = f.eje as Eje;
    const actual = porEje.get(eje) ?? { eje, sinDato: Number(f.sin_dato), opciones: [] };
    porEje.set(eje, {
      ...actual,
      opciones: [...actual.opciones, { valor: f.valor, items: Number(f.items) }],
    });
  }

  // La medida se ordena por tamaño real: en SQL `10"` va antes que `2"`.
  const medida = porEje.get("medida");
  if (medida !== undefined) {
    const orden = new Map(ordenarMedidas(medida.opciones.map((o) => o.valor)).map((m, i) => [m, i]));
    porEje.set("medida", {
      ...medida,
      opciones: [...medida.opciones].sort(
        (a, b) => (orden.get(a.valor) ?? 0) - (orden.get(b.valor) ?? 0),
      ),
    });
  }

  return [...porEje.values()];
}

export async function contarItems(
  supabase: SupabaseClient,
  categoria: string,
  seleccion: Seleccion,
): Promise<number> {
  const { data, error } = await supabase.rpc("contar_items_v2", parametros(categoria, seleccion));
  if (error !== null) throw new Error(`No se pudo contar el catálogo: ${error.message}`);
  return Number(data ?? 0);
}

/** Los items que quedan, ordenados por venta real y no por descripcion. */
export async function itemsDeCategoria(
  supabase: SupabaseClient,
  categoria: string,
  seleccion: Seleccion,
  limite = 25,
): Promise<ItemEncontrado[]> {
  const { data, error } = await supabase.rpc("items_de_categoria_v2", {
    ...parametros(categoria, seleccion),
    p_limite: limite,
  });
  if (error !== null) throw new Error(`No se pudieron leer los ítems: ${error.message}`);

  return ((data ?? []) as Array<{
    material_id: string;
    descripcion: string;
    tipo: string | null;
    grado_norm: string | null;
    medidas: string[] | null;
  }>).map((f) => ({
    materialId: f.material_id,
    descripcion: f.descripcion,
    categoria,
    etiqueta: "",
    tipo: f.tipo,
    grado: f.grado_norm,
    medidas: f.medidas ?? [],
  }));
}

/**
 * Buscador de arriba de la pantalla: cada palabra tiene que aparecer en el item.
 *
 * "curva 2 316" trae las curvas de 2" en 316 sin que el asesor acierte en que columna
 * esta cada cosa. El orden es por venta real.
 */
export async function buscarItems(
  supabase: SupabaseClient,
  texto: string,
  limite = 15,
): Promise<ItemEncontrado[]> {
  if (texto.trim() === "") return [];

  const { data, error } = await supabase.rpc("buscar_items", {
    p_texto: texto,
    p_limite: limite,
  });
  if (error !== null) throw new Error(`No se pudo buscar: ${error.message}`);

  return ((data ?? []) as Array<{
    material_id: string;
    descripcion: string;
    categoria_codigo: string;
    etiqueta: string;
    tipo: string | null;
    grado_norm: string | null;
    medidas: string[] | null;
  }>).map((f) => ({
    materialId: f.material_id,
    descripcion: f.descripcion,
    categoria: f.categoria_codigo,
    etiqueta: f.etiqueta,
    tipo: f.tipo,
    grado: f.grado_norm,
    medidas: f.medidas ?? [],
  }));
}
