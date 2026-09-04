/**
 * Resolucion de links al ecommerce. Logica pura, testeada.
 *
 * Cero URLs en el codigo (invariante 5): la base y la plantilla salen de `config`, y la
 * URL propia de cada familia de `link_categoria`. Este modulo solo sabe COMO combinarlas.
 *
 * Orden de resolucion:
 *   1. `url_fija` de la familia, si existe.
 *   2. La plantilla de busqueda con `terminos_busqueda`.
 *   3. La plantilla de busqueda con la etiqueta de la familia.
 *
 * Si la configuracion no esta completa no se genera nada: un link roto en el mostrador es
 * peor que no tener link, porque el asesor lo abre delante del cliente.
 */

export interface ConfigEcommerce {
  readonly baseUrl: string;
  readonly plantillaBusqueda: string;
}

export interface LinkCategoria {
  readonly urlFija: string | null;
  readonly terminosBusqueda: string | null;
}

export type Resolucion = "url_fija" | "busqueda_con_terminos" | "busqueda_por_etiqueta";

export interface LinkResuelto {
  readonly url: string;
  readonly resolucion: Resolucion;
}

/** Marcadores que la plantilla puede usar. `{q}` es obligatorio. */
const MARCADOR_BASE = "{base}";
const MARCADOR_CONSULTA = "{q}";

export function configCompleta(config: ConfigEcommerce | null): boolean {
  if (config === null) return false;
  return config.baseUrl.trim() !== "" && config.plantillaBusqueda.includes(MARCADOR_CONSULTA);
}

/** Base sin barra final: la plantilla ya trae la barra que corresponda. */
function normalizarBase(base: string): string {
  return base.trim().replace(/\/+$/, "");
}

export function resolverLink(
  config: ConfigEcommerce | null,
  link: LinkCategoria | null,
  etiqueta: string,
): LinkResuelto | null {
  const urlFija = link?.urlFija?.trim() ?? "";
  // Una URL propia no depende de la configuracion: sirve incluso antes de cargarla.
  if (urlFija !== "") return { url: urlFija, resolucion: "url_fija" };

  if (!configCompleta(config) || config === null) return null;

  const terminos = link?.terminosBusqueda?.trim() ?? "";
  const consulta = terminos !== "" ? terminos : etiqueta.trim();
  if (consulta === "") return null;

  const url = config.plantillaBusqueda
    .replaceAll(MARCADOR_BASE, normalizarBase(config.baseUrl))
    .replaceAll(MARCADOR_CONSULTA, encodeURIComponent(consulta));

  return {
    url,
    resolucion: terminos !== "" ? "busqueda_con_terminos" : "busqueda_por_etiqueta",
  };
}

export interface FamiliaConLink<T> {
  readonly item: T;
  readonly link: LinkResuelto | null;
}

export function resolverLinks<T extends { categoria: string; etiqueta: string }>(
  items: readonly T[],
  config: ConfigEcommerce | null,
  links: Readonly<Record<string, LinkCategoria>>,
): Array<FamiliaConLink<T>> {
  return items.map((item) => ({
    item,
    link: resolverLink(config, links[item.categoria] ?? null, item.etiqueta),
  }));
}

/**
 * Cuantas pestañas conviene abrir de una sola vez.
 *
 * Criterio propio: mas de esto y se sugiere copiar la lista. No es un limite del
 * navegador, es lo que un asesor puede manejar sin perder de vista al cliente.
 */
export const MAXIMO_PESTANAS_COMODO = 6;

/** Texto para `Copiar lista`. Una familia por linea, con su URL. */
export function listaParaCopiar(
  familias: ReadonlyArray<FamiliaConLink<{ etiqueta: string }>>,
): string {
  return familias
    .filter((f): f is FamiliaConLink<{ etiqueta: string }> & { link: LinkResuelto } => f.link !== null)
    .map((f) => `${f.item.etiqueta} — ${f.link.url}`)
    .join("\n");
}
