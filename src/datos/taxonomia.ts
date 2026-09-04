import type { SupabaseClient } from "@supabase/supabase-js";
import type { Aporte, ComplementoSugerido } from "@/logica/sugerencias";
import type { Prioridad } from "@/tipos/dominio";

/**
 * Lectura de la taxonomia y de las reglas de venta cruzada.
 *
 * Las reglas viven en la base: aca no hay ningun `if categoria === ...`. Lo unico que
 * hace este modulo es traerlas y pegarles el conteo de items del batch activo.
 */

export interface DominioResumen {
  readonly codigo: string;
  readonly nombre: string;
  readonly tipos: number;
}

export interface TipoResumen {
  readonly codigo: string;
  readonly nombre: string;
  readonly pregunta_grado: boolean;
}

export interface TipoDetalle {
  readonly codigo: string;
  readonly nombre: string;
  readonly preguntaGrado: boolean;
  readonly dominio: { readonly codigo: string; readonly nombre: string };
  readonly complementos: readonly ComplementoSugerido[];
  readonly notas: readonly string[];
}

export async function listarDominios(supabase: SupabaseClient): Promise<DominioResumen[]> {
  const { data, error } = await supabase
    .from("dominio")
    .select("codigo, nombre, tipo_producto(count)")
    .order("orden");

  if (error !== null) throw new Error(`No se pudieron leer las líneas: ${error.message}`);

  return (data ?? []).map((d) => {
    const fila = d as { codigo: string; nombre: string; tipo_producto: Array<{ count: number }> };
    return { codigo: fila.codigo, nombre: fila.nombre, tipos: fila.tipo_producto[0]?.count ?? 0 };
  });
}

export async function dominio(
  supabase: SupabaseClient,
  codigo: string,
): Promise<{ codigo: string; nombre: string; tipos: TipoResumen[] } | null> {
  const { data, error } = await supabase
    .from("dominio")
    .select("codigo, nombre, tipo_producto(codigo, nombre, pregunta_grado, orden)")
    .eq("codigo", codigo)
    .maybeSingle();

  if (error !== null) throw new Error(`No se pudo leer la línea: ${error.message}`);
  if (data === null) return null;

  const fila = data as {
    codigo: string;
    nombre: string;
    tipo_producto: Array<TipoResumen & { orden: number }>;
  };

  return {
    codigo: fila.codigo,
    nombre: fila.nombre,
    tipos: [...fila.tipo_producto].sort((a, b) => a.orden - b.orden),
  };
}

interface FilaCategoria {
  orden: number;
  categoria: { codigo: string; etiqueta: string; activo: boolean } | null;
}

interface FilaComplemento {
  id: string;
  nombre: string;
  prioridad: Prioridad;
  motivo: string;
  depende_del_grado: boolean;
  orden: number;
  complemento_categoria: FilaCategoria[];
}

/**
 * Un tipo con sus complementos, cada familia con su conteo de items del batch activo,
 * y las notas tecnicas de su linea.
 *
 * El conteo se trae de `v_conteo_categoria` y se pega en memoria: nunca se persiste en la
 * taxonomia, porque envejeceria con el primer import.
 */
export async function tipoConComplementos(
  supabase: SupabaseClient,
  codigo: string,
): Promise<TipoDetalle | null> {
  const { data, error } = await supabase
    .from("tipo_producto")
    .select(
      `codigo, nombre, pregunta_grado,
       dominio:dominio_id ( id, codigo, nombre ),
       complemento (
         id, nombre, prioridad, motivo, depende_del_grado, orden,
         complemento_categoria ( orden, categoria:categoria_id ( codigo, etiqueta, activo ) )
       )`,
    )
    .eq("codigo", codigo)
    .maybeSingle();

  if (error !== null) throw new Error(`No se pudo leer el producto: ${error.message}`);
  if (data === null) return null;

  const fila = data as unknown as {
    codigo: string;
    nombre: string;
    pregunta_grado: boolean;
    dominio: { id: string; codigo: string; nombre: string };
    complemento: FilaComplemento[];
  };

  const [conteo, notas] = await Promise.all([
    conteoPorCategoria(supabase),
    notasDeDominio(supabase, fila.dominio.id),
  ]);

  const complementos = [...fila.complemento]
    .sort((a, b) => a.orden - b.orden)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      prioridad: c.prioridad,
      motivo: c.motivo,
      dependeDelGrado: c.depende_del_grado,
      familias: [...c.complemento_categoria]
        .sort((a, b) => a.orden - b.orden)
        .flatMap((cc) =>
          cc.categoria === null || !cc.categoria.activo
            ? []
            : [
                {
                  codigo: cc.categoria.codigo,
                  etiqueta: cc.categoria.etiqueta,
                  items: conteo[cc.categoria.codigo] ?? 0,
                },
              ],
        ),
    }));

  return {
    codigo: fila.codigo,
    nombre: fila.nombre,
    preguntaGrado: fila.pregunta_grado,
    dominio: { codigo: fila.dominio.codigo, nombre: fila.dominio.nombre },
    complementos,
    notas,
  };
}

export async function conteoPorCategoria(
  supabase: SupabaseClient,
): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("v_conteo_categoria").select("codigo, items");
  if (error !== null) throw new Error(`No se pudo leer el conteo del catálogo: ${error.message}`);

  const conteo: Record<string, number> = {};
  for (const fila of (data ?? []) as Array<{ codigo: string; items: number }>) {
    conteo[fila.codigo] = Number(fila.items);
  }
  return conteo;
}

async function notasDeDominio(supabase: SupabaseClient, dominioId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("nota_tecnica")
    .select("texto, orden")
    .eq("ambito", "dominio")
    .eq("ambito_id", dominioId)
    .order("orden");

  if (error !== null) throw new Error(`No se pudieron leer las notas técnicas: ${error.message}`);
  return (data ?? []).map((n) => (n as { texto: string }).texto);
}

/** Grados con items en el batch activo para una familia. Alimenta el selector de grado. */
export async function gradosDisponibles(
  supabase: SupabaseClient,
  categoria: string,
): Promise<Array<{ grado: string; items: number }>> {
  const { data, error } = await supabase.rpc("grados_de_categoria", { p_categoria: categoria });
  if (error !== null) throw new Error(`No se pudieron leer los grados: ${error.message}`);

  return ((data ?? []) as Array<{ grado: string; items: number }>).map((g) => ({
    grado: g.grado,
    items: Number(g.items),
  }));
}

/**
 * Aporte de soldadura para un grado del catalogo.
 *
 * Resuelve primero la equivalencia: la columna Calidad trae 304L / 316L / 310S y la tabla
 * de aportes esta indexada por familia de grado. Si el grado no tiene equivalencia
 * declarada, devuelve null y el motivo del complemento queda como esta.
 */
export async function aporteParaGrado(
  supabase: SupabaseClient,
  grado: string | null,
): Promise<Aporte | null> {
  if (grado === null || grado === "") return null;

  const { data: equivalencia, error: errorEquivalencia } = await supabase
    .from("grado_equivalencia")
    .select("familia")
    .eq("grado", grado.toUpperCase())
    .maybeSingle();

  if (errorEquivalencia !== null) {
    throw new Error(`No se pudo resolver el grado: ${errorEquivalencia.message}`);
  }
  if (equivalencia === null) return null;

  const { data, error } = await supabase
    .from("aporte_por_grado")
    .select("aporte, motivo")
    .eq("grado", (equivalencia as { familia: string }).familia)
    .maybeSingle();

  if (error !== null) throw new Error(`No se pudo leer el aporte: ${error.message}`);
  return (data as Aporte | null) ?? null;
}
