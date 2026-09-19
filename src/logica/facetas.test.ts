import { describe, expect, it } from "vitest";
import {
  COBERTURA_MINIMA,
  chipsDeSeleccion,
  clasificarEjes,
  cobertura,
  parteElConjunto,
  proximoPaso,
  type Faceta,
} from "./facetas.ts";

/**
 * Los numeros de estos casos son los reales del catalogo, medidos sobre las 16.973 filas.
 * Los dos que importan:
 *
 *   cano / medida    -> 77 % de cobertura, es un paso valido
 *   cano / schedule  -> 14 %, esconderia el 86 % del stock si fuera paso
 */

const faceta = (eje: Faceta["eje"], opciones: Array<[string, number]>, sinDato: number): Faceta => ({
  eje,
  sinDato,
  opciones: opciones.map(([valor, items]) => ({ valor, items })),
});

// acc_soldar_ind: 23 tipos, el caso que motivo todo el rediseño.
const TIPO_ACC = faceta(
  "tipo",
  [
    ["REDUCCIÓN CONCÉNTRICA", 252],
    ["CURVA 90°", 158],
    ["Tee", 133],
    ["BUJE DE REDUCCIÓN", 15],
  ],
  0,
);

// cano: 1213 items, 935 con medida y 278 sin -> 77 %. El bucket "resto" son las otras
// ~30 medidas del caño; sin el, la cobertura del fixture no seria la real.
const MEDIDA_CANO = faceta(
  "medida",
  [['2"', 102], ['3"', 95], ['1 1/2"', 94], ["resto", 644]],
  278,
);

// cano: el Schedule esta en 6 de 43 items -> 14 %
const SCHEDULE_CANO = faceta("schedule", [["SCH 5S", 1], ["SCH10S", 1], ["SCH40S", 1]], 37);

describe("cobertura", () => {
  it("mide la proporcion de items que declaran el eje", () => {
    expect(cobertura(MEDIDA_CANO)).toBeCloseTo(935 / 1213, 2);
    expect(cobertura(TIPO_ACC)).toBe(1);
    expect(cobertura(faceta("norma", [], 100))).toBe(0);
  });
});

describe("parteElConjunto", () => {
  it("un eje con una sola opcion no aporta", () => {
    expect(parteElConjunto(faceta("grado", [["316L", 43]], 0))).toBe(false);
    expect(parteElConjunto(faceta("grado", [["316L", 43], ["304L", 55]], 0))).toBe(true);
  });
});

describe("clasificarEjes", () => {
  it("el Schedule del caño NO es un paso: esconderia el 86 % del stock", () => {
    const { pasos, refinamientos } = clasificarEjes([SCHEDULE_CANO]);
    expect(pasos).toHaveLength(0);
    expect(refinamientos.map((f) => f.eje)).toEqual(["schedule"]);
    expect(cobertura(SCHEDULE_CANO)).toBeLessThan(COBERTURA_MINIMA);
  });

  it("la medida del caño SI es un paso, con 77 %", () => {
    const { pasos } = clasificarEjes([MEDIDA_CANO]);
    expect(pasos.map((f) => f.eje)).toEqual(["medida"]);
  });

  it("un eje de una sola opcion queda implicito, no se pregunta", () => {
    const unico = faceta("grado", [["316L", 43]], 0);
    const { pasos, implicitos } = clasificarEjes([unico]);
    expect(pasos).toHaveLength(0);
    expect(implicitos.map((f) => f.eje)).toEqual(["grado"]);
  });

  it("descarta el eje sin ninguna opcion", () => {
    const { pasos, refinamientos, implicitos } = clasificarEjes([faceta("norma", [], 500)]);
    expect([...pasos, ...refinamientos, ...implicitos]).toHaveLength(0);
  });

  it("pregunta el tipo antes que la medida", () => {
    // "una curva de 90" es como piensa el mostrador; "un accesorio para soldar" no.
    const { pasos } = clasificarEjes([MEDIDA_CANO, TIPO_ACC]);
    expect(pasos.map((f) => f.eje)).toEqual(["tipo", "medida"]);
  });
});

describe("proximoPaso", () => {
  it("avanza al siguiente eje sin elegir", () => {
    const ejes = clasificarEjes([TIPO_ACC, MEDIDA_CANO]);
    expect(proximoPaso(ejes, {})?.eje).toBe("tipo");
    expect(proximoPaso(ejes, { tipo: "CURVA 90°" })?.eje).toBe("medida");
    expect(proximoPaso(ejes, { tipo: "CURVA 90°", medida: '2"' })).toBeNull();
  });

  it("trata el string vacio como no elegido", () => {
    const ejes = clasificarEjes([TIPO_ACC]);
    expect(proximoPaso(ejes, { tipo: "" })?.eje).toBe("tipo");
  });
});

describe("chipsDeSeleccion", () => {
  it("arma la ficha del material en el orden en que se pregunta", () => {
    expect(chipsDeSeleccion({ medida: '2"', tipo: "CURVA 90°", grado: "316L" })).toEqual([
      { eje: "tipo", valor: "CURVA 90°" },
      { eje: "medida", valor: '2"' },
      { eje: "grado", valor: "316L" },
    ]);
  });

  it("ignora lo no elegido", () => {
    expect(chipsDeSeleccion({ tipo: "Tee", medida: null, grado: "" })).toEqual([
      { eje: "tipo", valor: "Tee" },
    ]);
  });
});
