import type { SupabaseClient } from "@supabase/supabase-js";
import type { Analisis, ItemImportado } from "@/logica/importacion";

/**
 * Escritura del import contra Supabase.
 *
 * El parseo y la clasificacion corren en el navegador con el mismo modulo que usan los
 * tests (src/logica), y desde aca solo se escribe. Asi 17.000 filas no tienen que pasar
 * por una funcion serverless, que pelea con el limite de tamaño de body y el de duracion.
 *
 * Todo va con la clave publica del usuario: las politicas de 0008 son las que autorizan.
 */

const TAMANO_LOTE = 1000;
const BUCKET = "catalogo";

export interface BatchResumen {
  readonly id: string;
  readonly archivo: string;
  readonly estado: "pendiente" | "validado" | "activo" | "descartado";
  readonly filas: number;
  readonly filas_otro: number;
  readonly layout_hash: string;
  readonly headers: string[];
  readonly subido_at: string;
  readonly activado_at: string | null;
}

const CAMPOS_BATCH =
  "id, archivo, estado, filas, filas_otro, layout_hash, headers, subido_at, activado_at";

export async function listarBatches(supabase: SupabaseClient): Promise<BatchResumen[]> {
  const { data, error } = await supabase
    .from("import_batch")
    .select(CAMPOS_BATCH)
    .order("subido_at", { ascending: false })
    .limit(20);

  if (error !== null) throw new Error(`No se pudieron leer los imports: ${error.message}`);
  return (data ?? []) as BatchResumen[];
}

export async function batchActivo(supabase: SupabaseClient): Promise<BatchResumen | null> {
  const { data, error } = await supabase
    .from("import_batch")
    .select(CAMPOS_BATCH)
    .eq("estado", "activo")
    .maybeSingle();

  if (error !== null) throw new Error(`No se pudo leer el batch activo: ${error.message}`);
  return (data as BatchResumen | null) ?? null;
}

/** Conteo por categoria de un batch, para comparar un import nuevo contra el anterior. */
export async function conteoDeBatch(
  supabase: SupabaseClient,
  batchId: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("conteo_por_categoria", { p_batch: batchId });
  if (error !== null) throw new Error(`No se pudo leer el conteo del batch: ${error.message}`);

  const conteo: Record<string, number> = {};
  for (const fila of (data ?? []) as Array<{ categoria_codigo: string; items: number }>) {
    conteo[fila.categoria_codigo] = Number(fila.items);
  }
  return conteo;
}

export interface ProgresoImport {
  readonly insertadas: number;
  readonly total: number;
}

/**
 * Crea el batch, sube el archivo original y escribe las filas en lotes.
 *
 * El batch queda en `validado`: activarlo es un paso aparte y explicito. Si algo falla
 * a mitad, se borra el batch y con el las filas ya insertadas (cascade), asi no queda
 * un import a medias.
 */
export async function importar(
  supabase: SupabaseClient,
  archivo: File,
  analisis: Analisis,
  alAvanzar?: (p: ProgresoImport) => void,
): Promise<string> {
  if (!analisis.importable) {
    throw new Error("El análisis marcó el archivo como no importable.");
  }

  const { data: creado, error: errorBatch } = await supabase
    .from("import_batch")
    .insert({
      archivo: archivo.name,
      layout_hash: analisis.hash,
      headers: analisis.headers,
      filas: analisis.filas,
      filas_otro: analisis.filasOtro,
      estado: "pendiente",
    })
    .select("id")
    .single<{ id: string }>();

  if (errorBatch !== null || creado === null) {
    throw new Error(`No se pudo crear el import: ${errorBatch?.message ?? "sin detalle"}`);
  }

  const batchId = creado.id;

  try {
    const ruta = `${batchId}/${archivo.name}`;
    const { error: errorStorage } = await supabase.storage.from(BUCKET).upload(ruta, archivo, {
      contentType: archivo.type,
      upsert: true,
    });
    if (errorStorage !== null) {
      throw new Error(`No se pudo guardar el archivo original: ${errorStorage.message}`);
    }

    await supabase.from("import_batch").update({ archivo_storage: ruta }).eq("id", batchId);

    let insertadas = 0;
    for (let i = 0; i < analisis.items.length; i += TAMANO_LOTE) {
      const lote = analisis.items.slice(i, i + TAMANO_LOTE).map((item: ItemImportado) => ({
        ...item,
        import_batch_id: batchId,
      }));

      const { error } = await supabase.from("catalogo_item").insert(lote);
      if (error !== null) {
        throw new Error(`Falló la inserción en la fila ${i + 1}: ${error.message}`);
      }

      insertadas += lote.length;
      alAvanzar?.({ insertadas, total: analisis.items.length });
    }

    const { error: errorEstado } = await supabase
      .from("import_batch")
      .update({ estado: "validado" })
      .eq("id", batchId);
    if (errorEstado !== null) {
      throw new Error(`No se pudo cerrar el import: ${errorEstado.message}`);
    }

    return batchId;
  } catch (e) {
    // Sin esto quedaria un batch a medio importar que alguien podria activar.
    await supabase.from("import_batch").delete().eq("id", batchId);
    throw e;
  }
}

/** Activa un batch y descarta el anterior. Volver atras es llamarla con el batch previo. */
export async function activar(supabase: SupabaseClient, batchId: string): Promise<void> {
  const { error } = await supabase.rpc("activar_batch", { p_batch: batchId });
  if (error !== null) throw new Error(`No se pudo activar el import: ${error.message}`);
}
