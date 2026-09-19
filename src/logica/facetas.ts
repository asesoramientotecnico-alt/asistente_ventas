/**
 * Que eje se le pregunta al asesor y cual no. Logica pura, testeada.
 *
 * El problema que resuelve: no hay un set universal de criterios. Cada familia se elige
 * por lo suyo — chapa por terminacion (21 valores), tapas por tipo de junta (30),
 * buloneria por rosca — y un formulario fijo no sirve para todas.
 *
 * Y hay una trampa: el Schedule del caño esta vacio en el 86 % de sus items. Ofrecerlo
 * como paso obligatorio esconderia casi todo el stock. De ahi la regla central:
 *
 *   Un eje se pregunta solo si esta poblado en la mayoria de lo que queda y si realmente
 *   parte el conjunto. Un eje mayormente vacio es refinamiento opcional, y elegirlo
 *   nunca descarta a los items que no declaran el valor.
 */

export type Eje = "tipo" | "medida" | "grado" | "terminacion" | "norma" | "schedule" | "forma" | "rosca";

export interface Seleccion {
  readonly tipo?: string | null;
  readonly medida?: string | null;
  readonly grado?: string | null;
  readonly terminacion?: string | null;
  readonly norma?: string | null;
}

export interface OpcionFaceta {
  readonly valor: string;
  readonly items: number;
}

export interface Faceta {
  readonly eje: Eje;
  /** Items del conjunto que no declaran valor en este eje. */
  readonly sinDato: number;
  readonly opciones: readonly OpcionFaceta[];
}

/** Como se le muestra cada eje al asesor. */
export const ETIQUETA_EJE: Record<Eje, string> = {
  tipo: "Qué tipo",
  medida: "Medida",
  grado: "Grado",
  terminacion: "Terminación",
  norma: "Norma",
  schedule: "Schedule",
  forma: "Forma",
  rosca: "Rosca",
};

/**
 * Orden en que se preguntan. `tipo` primero porque es el que mas parte el conjunto y es
 * como piensa el mostrador ("una curva de 90"), no "un accesorio para soldar".
 */
const ORDEN_EJES: readonly Eje[] = [
  "tipo",
  "medida",
  "grado",
  "terminacion",
  "schedule",
  "rosca",
  "forma",
  "norma",
];

/**
 * Cobertura minima para que un eje sea un PASO. Por debajo sigue estando disponible,
 * pero como refinamiento opcional.
 *
 * 60 % es un criterio propio, no medido: deja pasar la medida del caño (77 %) y deja
 * afuera su Schedule (14 %), que son los dos casos que motivaron la regla.
 */
export const COBERTURA_MINIMA = 0.6;

export function cobertura(f: Faceta): number {
  const conDato = f.opciones.reduce((a, o) => a + o.items, 0);
  const total = conDato + f.sinDato;
  return total === 0 ? 0 : conDato / total;
}

/** Un eje con una sola opcion no aporta nada: no se pregunta, se aplica y se muestra. */
export function parteElConjunto(f: Faceta): boolean {
  return f.opciones.length >= 2;
}

export interface EjesOrdenados {
  /** Se preguntan como paso, en orden. */
  readonly pasos: readonly Faceta[];
  /** Disponibles para afinar, escondidos detras de "más filtros". */
  readonly refinamientos: readonly Faceta[];
  /** Una sola opcion: ya quedan aplicados, se muestran como dato. */
  readonly implicitos: readonly Faceta[];
}

export function clasificarEjes(facetas: readonly Faceta[]): EjesOrdenados {
  const pasos: Faceta[] = [];
  const refinamientos: Faceta[] = [];
  const implicitos: Faceta[] = [];

  for (const f of facetas) {
    if (f.opciones.length === 0) continue;
    if (!parteElConjunto(f)) implicitos.push(f);
    else if (cobertura(f) >= COBERTURA_MINIMA) pasos.push(f);
    else refinamientos.push(f);
  }

  const porOrden = (a: Faceta, b: Faceta) => ORDEN_EJES.indexOf(a.eje) - ORDEN_EJES.indexOf(b.eje);
  return {
    pasos: pasos.sort(porOrden),
    refinamientos: refinamientos.sort(porOrden),
    implicitos: implicitos.sort(porOrden),
  };
}

/**
 * El proximo eje a preguntar: el primero de los pasos que el asesor todavia no eligio.
 *
 * Devuelve null cuando no queda nada que preguntar — ahi el material esta identificado
 * tan lejos como el catalogo permite.
 */
export function proximoPaso(
  ejes: EjesOrdenados,
  seleccion: Seleccion,
): Faceta | null {
  const elegido = (eje: Eje): boolean => {
    const v = (seleccion as Record<string, string | null | undefined>)[eje];
    return v !== undefined && v !== null && v !== "";
  };
  return ejes.pasos.find((f) => !elegido(f.eje)) ?? null;
}

/** Los ejes ya elegidos, para dibujar la ficha del material. */
export function chipsDeSeleccion(seleccion: Seleccion): Array<{ eje: Eje; valor: string }> {
  const chips: Array<{ eje: Eje; valor: string }> = [];
  for (const eje of ORDEN_EJES) {
    const v = (seleccion as Record<string, string | null | undefined>)[eje];
    if (v !== undefined && v !== null && v !== "") chips.push({ eje, valor: v });
  }
  return chips;
}
