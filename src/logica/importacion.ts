/**
 * Analisis de un archivo de catalogo antes de escribir nada en la base.
 *
 * Logica pura: recibe filas ya parseadas y devuelve que se importaria y que problemas
 * tiene el archivo. No conoce SheetJS ni Supabase.
 *
 * El orden es siempre el mismo: validar el layout, clasificar, detectar problemas que la
 * base rechazaria a mitad de camino, y recien despues ofrecer la importacion.
 */
import { CATEGORIA_OTRO, clasificar } from "./clasificador.ts";
import { normalizarGrado } from "./grado.ts";
import {
  HEADERS_ESPERADOS,
  type DiffLayout,
  celda,
  diffLayout,
  hashLayout,
  indicesPorHeader,
} from "./layout-excel.ts";

/** Una fila lista para insertar en `catalogo_item`. */
export interface ItemImportado {
  readonly material_id: string;
  readonly descripcion: string;
  readonly negocio: string;
  readonly familia: string;
  readonly tipo: string;
  readonly calidad: string;
  readonly norma: string;
  readonly acabado: string | null;
  readonly diametro: string | null;
  readonly espesor: string | null;
  readonly rosca: string | null;
  readonly schedule: string | null;
  readonly serie: string | null;
  readonly tipojunta: string | null;
  readonly categoria_codigo: string;
  readonly grado_norm: string | null;
}

export interface Analisis {
  readonly headers: readonly string[];
  readonly hash: string;
  readonly diff: DiffLayout;
  readonly items: readonly ItemImportado[];
  readonly conteo: Readonly<Record<string, number>>;
  readonly filas: number;
  readonly filasOtro: number;
  readonly filasVacias: number;
  /** material_id repetidos. El indice unico por batch abortaria el import a mitad. */
  readonly duplicados: readonly string[];
  /** Filas con datos pero sin Material_ID. No se pueden importar. */
  readonly sinMaterialId: number;
  /** Si esto es false, no hay nada que importar hasta arreglar el archivo. */
  readonly importable: boolean;
  readonly motivos: readonly string[];
}

const opcional = (v: string): string | null => (v === "" ? null : v);

/**
 * @param headers   fila de encabezados del archivo
 * @param filas     filas de datos, sin el encabezado
 * @param referencia headers del ultimo import exitoso. Sin batches previos se compara
 *                   contra la linea base del codigo.
 */
export async function analizar(
  headers: readonly string[],
  filas: ReadonlyArray<readonly unknown[]>,
  referencia: readonly string[] = HEADERS_ESPERADOS,
): Promise<Analisis> {
  const diff = diffLayout(headers, referencia);
  const hash = await hashLayout(headers);
  const indices = indicesPorHeader(headers);

  const items: ItemImportado[] = [];
  const conteo: Record<string, number> = {};
  const vistos = new Set<string>();
  const duplicados = new Set<string>();
  let filasVacias = 0;
  let sinMaterialId = 0;

  for (const fila of filas) {
    const material_id = celda(fila, indices, "Material_ID");
    const descripcion = celda(fila, indices, "Material Desc");

    if (material_id === "" && descripcion === "") {
      filasVacias += 1;
      continue;
    }
    if (material_id === "") {
      sinMaterialId += 1;
      continue;
    }
    if (vistos.has(material_id)) {
      duplicados.add(material_id);
      continue;
    }
    vistos.add(material_id);

    const negocio = celda(fila, indices, "Negocio");
    const familia = celda(fila, indices, "Familia");
    const tipo = celda(fila, indices, "Tipo");
    const calidad = celda(fila, indices, "Calidad");

    const categoria_codigo = clasificar({ negocio, familia, tipo, desc: descripcion });
    conteo[categoria_codigo] = (conteo[categoria_codigo] ?? 0) + 1;

    items.push({
      material_id,
      descripcion,
      negocio,
      familia,
      tipo,
      calidad,
      norma: celda(fila, indices, "Norma"),
      acabado: opcional(celda(fila, indices, "Acabado")),
      diametro: opcional(celda(fila, indices, "Diametro")),
      espesor: opcional(celda(fila, indices, "Espesor")),
      rosca: opcional(celda(fila, indices, "Rosca")),
      schedule: opcional(celda(fila, indices, "Schedule")),
      serie: opcional(celda(fila, indices, "Serie")),
      tipojunta: opcional(celda(fila, indices, "Tipojunta")),
      categoria_codigo,
      grado_norm: normalizarGrado(calidad, descripcion),
    });
  }

  const motivos: string[] = [];
  if (diff.hayCambios) {
    motivos.push("El layout del archivo no coincide con el del último import.");
  }
  if (duplicados.size > 0) {
    motivos.push(`Hay ${duplicados.size} Material_ID repetidos.`);
  }
  if (sinMaterialId > 0) {
    motivos.push(`Hay ${sinMaterialId} filas con datos pero sin Material_ID.`);
  }
  if (items.length === 0) {
    motivos.push("El archivo no tiene filas para importar.");
  }

  return {
    headers: [...headers],
    hash,
    diff,
    items,
    conteo,
    filas: items.length,
    filasOtro: conteo[CATEGORIA_OTRO] ?? 0,
    filasVacias,
    duplicados: [...duplicados],
    sinMaterialId,
    importable: motivos.length === 0,
    motivos,
  };
}

/**
 * Cuanto sube 'otro' en puntos porcentuales antes de avisar.
 *
 * Criterio propio, no del blueprint: el blueprint dice "si sube mucho respecto al import
 * anterior". Un punto sobre 17.000 filas son ~170 productos que dejaron de clasificarse,
 * suficiente para mirar el archivo antes de activarlo.
 */
export const UMBRAL_ALERTA_OTRO = 1;

export interface Comparacion {
  readonly porcentajeOtroAntes: number;
  readonly porcentajeOtroAhora: number;
  readonly deltaPuntos: number;
  readonly alerta: boolean;
  /** Categorias que aparecen ahora y no estaban en el import anterior. */
  readonly categoriasNuevas: readonly string[];
  /** Categorias que tenian items y ahora quedaron en cero: dejarian de sugerirse. */
  readonly categoriasVaciadas: readonly string[];
}

const porcentaje = (parte: number, total: number): number =>
  total === 0 ? 0 : (parte / total) * 100;

export function compararConAnterior(
  ahora: Readonly<Record<string, number>>,
  antes: Readonly<Record<string, number>> | null,
): Comparacion | null {
  if (antes === null) return null;

  const totalAhora = Object.values(ahora).reduce((a, b) => a + b, 0);
  const totalAntes = Object.values(antes).reduce((a, b) => a + b, 0);

  const porcentajeOtroAhora = porcentaje(ahora[CATEGORIA_OTRO] ?? 0, totalAhora);
  const porcentajeOtroAntes = porcentaje(antes[CATEGORIA_OTRO] ?? 0, totalAntes);
  const deltaPuntos = porcentajeOtroAhora - porcentajeOtroAntes;

  const categoriasNuevas = Object.keys(ahora)
    .filter((c) => c !== CATEGORIA_OTRO && (antes[c] ?? 0) === 0 && (ahora[c] ?? 0) > 0)
    .sort();
  const categoriasVaciadas = Object.keys(antes)
    .filter((c) => c !== CATEGORIA_OTRO && (antes[c] ?? 0) > 0 && (ahora[c] ?? 0) === 0)
    .sort();

  return {
    porcentajeOtroAntes,
    porcentajeOtroAhora,
    deltaPuntos,
    alerta: deltaPuntos > UMBRAL_ALERTA_OTRO || categoriasVaciadas.length > 0,
    categoriasNuevas,
    categoriasVaciadas,
  };
}
