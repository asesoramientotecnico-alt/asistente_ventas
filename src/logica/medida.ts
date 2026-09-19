/**
 * Normalizacion de la medida nominal en pulgadas. Logica pura, testeada.
 *
 * La clave del match dimensional son las PULGADAS, no los milimetros. En mm la linea
 * industrial y la sanitaria no coinciden nunca; en pulgadas convergen a la misma
 * designacion, que ademas es como se pide en el mostrador:
 *
 *   2"  ->  60,30 mm en NPS industrial  |  50,80 mm en sanitario
 *
 * Por eso esta designacion es ambigua ENTRE lineas: una brida industrial de 2" no monta
 * en un tubo sanitario de 2". El match siempre se hace dentro del mismo dominio; este
 * modulo solo normaliza el texto, no decide compatibilidad.
 *
 * La columna es `Diametrodinpulgadas` (R) del dossier. Medido sobre las 16.973 filas:
 * 7.636 tienen valor y vienen en seis formas distintas. Las proporciones estan en los
 * tests, que usan valores literales del archivo.
 */

/** Una medida ya normalizada: `2"`, `1 1/2"`, `3/4"`. */
export type Medida = string;

/**
 * DN -> pulgadas, para las 76 filas que traen DN sin su equivalente.
 *
 * Es la correspondencia nominal estandar (ASME B36.19 / ISO 6708). No es una conversion
 * aritmetica: DN50 son 2", que en NPS industrial son 60,30 mm de diametro exterior, no
 * 50 mm. El DN es un numero de referencia, no una medida.
 */
const DN_A_PULGADAS: Readonly<Record<string, string>> = {
  "6": '1/8"',
  "8": '1/4"',
  "10": '3/8"',
  "15": '1/2"',
  "20": '3/4"',
  "25": '1"',
  "32": '1 1/4"',
  "40": '1 1/2"',
  "50": '2"',
  "65": '2 1/2"',
  "80": '3"',
  "100": '4"',
  "125": '5"',
  "150": '6"',
  "200": '8"',
  "250": '10"',
  "300": '12"',
};

/** `1 1/2` -> 1.5, `3/4` -> 0.75, `2` -> 2. Devuelve null si no es una fraccion valida. */
export function valorNumerico(medida: string): number | null {
  const limpio = medida.replace(/["']/g, "").trim();
  if (limpio === "") return null;

  const m = /^(?:(\d+)\s+)?(\d+)\/(\d+)$|^(\d+)$/.exec(limpio);
  if (m === null) return null;

  if (m[4] !== undefined) return Number(m[4]);

  const entero = m[1] === undefined ? 0 : Number(m[1]);
  const num = Number(m[2]);
  const den = Number(m[3]);
  if (den === 0) return null;

  // En pulgadas la fraccion siempre es propia: se escribe 1 1/4", nunca 5/4". Un
  // numerador mayor o igual al denominador es un espacio que falta al cargar, no una
  // medida: `11/4"` en el catalogo es 1 1/4" (lo dice la descripcion del item), no
  // 2,75". No se corrige por adivinanza, pero tampoco se acepta: crearia una medida
  // fantasma que nadie va a buscar y donde el item quedaria escondido igual.
  if (num >= den) return null;

  return entero + num / den;
}

/** Normaliza un termino suelto a la forma canonica `N"`, o null si no se entiende. */
function normalizarTermino(bruto: string): Medida | null {
  // `4''` y `3/4""` son ruido de carga: las dos significan una sola comilla.
  const sinComillas = bruto.replace(/["']+/g, "").replace(/\s+/g, " ").trim();
  if (sinComillas === "") return null;

  // `DN100 - 4"` trae el equivalente al lado; `DN50` viene solo.
  const dn = /^DN\s*(\d+)(?:\s*-\s*(.+))?$/i.exec(sinComillas);
  if (dn !== null) {
    const resto = dn[2];
    if (resto !== undefined && resto.trim() !== "") return normalizarTermino(resto);
    const equivalente = DN_A_PULGADAS[dn[1] ?? ""];
    return equivalente ?? null;
  }

  if (valorNumerico(sinComillas) === null) return null;
  return `${sinComillas}"`;
}

/**
 * Todas las medidas que declara un item. Normalmente una; dos en las reducciones.
 *
 * Una reduccion `2" X 1 1/2"` pertenece a las dos lineas: sirve tanto a quien esta
 * armando en 2" como a quien esta armando en 1 1/2". Devolver una sola la escondaria de
 * la mitad de las busquedas, que es justo lo que el asesor no perdona.
 *
 * Los rangos (`1/2" A 3/4"`) y la basura (`DIC 100`, `'-`) devuelven lista vacia: no se
 * inventa una medida donde el dato no la tiene.
 */
export function medidasDeItem(bruto: string | null | undefined): Medida[] {
  if (bruto === null || bruto === undefined) return [];
  const texto = bruto.trim();
  if (texto === "") return [];

  // `A` separa un rango, no dos medidas concretas: no es lo mismo que `X`.
  if (/\s+A\s+/i.test(texto)) return [];

  const partes = texto.split(/\s*[xX]\s*/);
  const medidas: Medida[] = [];
  for (const parte of partes) {
    const m = normalizarTermino(parte);
    if (m !== null && !medidas.includes(m)) medidas.push(m);
  }
  return medidas;
}

/** Orden natural de mostrador: 1/8" antes que 1/2" antes que 2". */
export function ordenarMedidas(medidas: readonly Medida[]): Medida[] {
  return [...medidas].sort((a, b) => (valorNumerico(a) ?? 0) - (valorNumerico(b) ?? 0));
}

/** Un item sirve para la medida pedida si la declara entre las suyas. */
export function itemTieneMedida(medidasDelItem: readonly Medida[], pedida: Medida): boolean {
  return medidasDelItem.includes(pedida);
}
