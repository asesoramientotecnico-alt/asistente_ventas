/**
 * Validacion de layout del Excel de catalogo.
 *
 * Dos defensas independientes contra el escenario "entran datos corridos":
 *  1. Hash sobre la LISTA ORDENADA de headers normalizados. Un hash sobre un conjunto
 *     no ordenado no detecta reordenamiento de columnas, que es justo lo que corre los datos.
 *  2. Lectura de cada celda POR NOMBRE de header, nunca por indice (ver `indicesPorHeader`).
 *     Asi, si algun dia se aprueba un reorden, el import sigue siendo correcto.
 *
 * Las letras de columna (A, B, L, T, AC, AD, AP) quedan como documentacion, no como
 * forma de acceso.
 */

/** Nombre de la hoja de datos, ya normalizado. En el archivo viene con un espacio al final. */
export const HOJA_DATOS = "DOC DOSSIER CARACTERISTICAS DE";

/** Metadata del export de Mozart. Se ignora. */
export const HOJA_METADATA = "MOZART REPORTS";

/** Los 43 headers del ultimo import validado, en orden. */
export const HEADERS_ESPERADOS: readonly string[] = [
  "Material_ID",
  "Material Desc",
  "ABC Material",
  "Acabado",
  "Ancho",
  "Ancho Real",
  "Atributo1",
  "Atributo2",
  "Atributo3",
  "Atributo4",
  "Cabeza",
  "Calidad",
  "Categoria",
  "Cuelloh",
  "Diametro",
  "Diametro1",
  "Diametro2",
  "Diametrodinpulgadas",
  "Espesor",
  "Familia",
  "Forma",
  "Junta",
  "Lado1",
  "Lado2",
  "Largo",
  "Largobulon",
  "Marca",
  "Modelo",
  "Negocio",
  "Norma",
  "Nroantmaterial",
  "Pack1",
  "Pack2",
  "Polventa",
  "Proteccion",
  "Ranura",
  "Rayado",
  "Rosca",
  "Schedule",
  "Serie",
  "Terminación",
  "Tipo",
  "Tipojunta",
];

/** Headers que el clasificador y el modelo de datos necesitan si o si. */
export const HEADERS_REQUERIDOS: readonly string[] = [
  "Material_ID",
  "Material Desc",
  "Calidad",
  "Familia",
  "Negocio",
  "Norma",
  "Tipo",
];

export function normalizarHeader(h: string): string {
  return h.replace(/\s+/g, " ").trim().toUpperCase();
}

export function normalizarNombreHoja(nombre: string): string {
  return normalizarHeader(nombre);
}

/** Hash del layout: SHA-256 sobre los headers normalizados, en orden. */
export async function hashLayout(headers: readonly string[]): Promise<string> {
  // Separador imposible en un header: sin el, ["AB","C"] y ["A","BC"] hashean igual.
  const canonico = headers.map(normalizarHeader).join("\u0001");
  const bytes = new TextEncoder().encode(canonico);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface DiffLayout {
  readonly faltantes: readonly string[];
  readonly sobrantes: readonly string[];
  readonly movidos: ReadonlyArray<{ header: string; esperado: number; actual: number }>;
  readonly requeridosFaltantes: readonly string[];
  readonly hayCambios: boolean;
}

/** Compara el layout del archivo contra el esperado y describe la diferencia. */
export function diffLayout(
  actuales: readonly string[],
  esperados: readonly string[] = HEADERS_ESPERADOS,
): DiffLayout {
  const a = actuales.map(normalizarHeader);
  const e = esperados.map(normalizarHeader);
  const setA = new Set(a);
  const setE = new Set(e);

  const faltantes = e.filter((h) => !setA.has(h));
  const sobrantes = a.filter((h) => !setE.has(h));
  const movidos = e
    .map((h, i) => ({ header: h, esperado: i, actual: a.indexOf(h) }))
    .filter((m) => m.actual !== -1 && m.actual !== m.esperado);
  const requeridosFaltantes = HEADERS_REQUERIDOS.map(normalizarHeader).filter((h) => !setA.has(h));

  return {
    faltantes,
    sobrantes,
    movidos,
    requeridosFaltantes,
    hayCambios: faltantes.length > 0 || sobrantes.length > 0 || movidos.length > 0,
  };
}

/**
 * Indice de columna por header normalizado. Es lo que permite leer por nombre.
 * Si un header esta repetido gana el primero, igual que en una lectura secuencial.
 */
export function indicesPorHeader(headers: readonly string[]): ReadonlyMap<string, number> {
  const m = new Map<string, number>();
  headers.forEach((h, i) => {
    const k = normalizarHeader(h);
    if (!m.has(k)) m.set(k, i);
  });
  return m;
}

/** Lee una celda por nombre de header. Devuelve "" si la columna no existe o esta vacia. */
export function celda(
  fila: readonly unknown[],
  indices: ReadonlyMap<string, number>,
  header: string,
): string {
  const i = indices.get(normalizarHeader(header));
  if (i === undefined) return "";
  const v = fila[i];
  return v === null || v === undefined ? "" : String(v).trim();
}
