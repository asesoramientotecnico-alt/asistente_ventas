import { describe, expect, it } from "vitest";
import { EQUIVALENCIAS_GRADO_SEMILLA, familiaDeGrado, normalizarGrado } from "./grado.ts";
import fixtures from "../../tests/fixtures/filas-reales.json" with { type: "json" };

const equivalencias = new Map(EQUIVALENCIAS_GRADO_SEMILLA.map((e) => [e.grado, e.familia]));

describe("normalizarGrado", () => {
  it("mapea los aportes de soldadura a su grado", () => {
    expect(normalizarGrado("E308")).toBe("308L");
    expect(normalizarGrado("E316")).toBe("316L");
    expect(normalizarGrado("E310")).toBe("310");
    expect(normalizarGrado("E312")).toBe("312");
    expect(normalizarGrado("310L")).toBe("310");
    expect(normalizarGrado("312L")).toBe("312");
  });

  it("devuelve la calidad tal cual cuando no es un aporte", () => {
    expect(normalizarGrado("316L")).toBe("316L");
    expect(normalizarGrado(" 304 ")).toBe("304");
    expect(normalizarGrado("epdm")).toBe("EPDM");
  });

  it("extrae el grado de la descripcion cuando Calidad viene vacia", () => {
    // Material 342176: PAÑO VELLON, sin Calidad y sin grado en la descripcion.
    expect(normalizarGrado("", "PAÑO VELLON MANUAL 154X224 CORINDON A100")).toBeNull();
    // Material 336057 es tungsteno sin Calidad; el 304 de una descripcion si se detecta.
    expect(normalizarGrado("", "ALLEN CC  1/2'' x 38,10-1 1/2'' 304")).toBe("304");
    expect(normalizarGrado("NONE", 'CAÑO REDONDO 2" 316L')).toBe("316L");
  });

  it("prioriza 316L sobre 316 al leer la descripcion", () => {
    expect(normalizarGrado("", "TUBO SANITARIO 316L")).toBe("316L");
  });

  it("coincide con el grado_norm de cada fixture real", () => {
    for (const f of fixtures.filas) {
      expect(normalizarGrado(f.calidad, f.descripcion) ?? "").toBe(f.grado_norm);
    }
  });
});

describe("familiaDeGrado", () => {
  it("colapsa las variantes a la familia con la que se busca el aporte", () => {
    expect(familiaDeGrado("316L", equivalencias)).toBe("316");
    expect(familiaDeGrado("304L", equivalencias)).toBe("304");
    expect(familiaDeGrado("310S", equivalencias)).toBe("310");
    expect(familiaDeGrado("316", equivalencias)).toBe("316");
  });

  it("no inventa aporte para un grado sin equivalencia declarada", () => {
    expect(familiaDeGrado("321", equivalencias)).toBeNull();
    expect(familiaDeGrado("430", equivalencias)).toBeNull();
    expect(familiaDeGrado("EPDM", equivalencias)).toBeNull();
    expect(familiaDeGrado(null, equivalencias)).toBeNull();
  });

  it("es el caso que el original resolvia mal: un 316L es la calidad tipica del catalogo", () => {
    // Sin este colapso, aporte_por_grado (indexada 304/316/310) no matchea y el asesor
    // ve el motivo generico en vez de la justificacion del aporte.
    const gradosDelCatalogo = fixtures.filas.map((f) => f.grado_norm).filter((g) => g !== "");
    expect(gradosDelCatalogo).toContain("316L");
    expect(familiaDeGrado("316L", equivalencias)).toBe("316");
  });
});
