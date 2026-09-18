import { describe, expect, it } from "vitest";
import { numero, parsearFecha } from "./cargar-pedidos.ts";

/**
 * Los strings de estos tests son literales de los dos archivos del historico, no casos
 * inventados. Cada uno corresponde a un bug que estuvo en produccion del script:
 * las fechas de 2025 leidas con el orden de 2026, y las cantidades de mas de mil
 * unidades convertidas en cero.
 */

describe("parsearFecha", () => {
  it("lee 2025 como M/D/AA", () => {
    // "1/3/25" en el archivo de 2025 es el 3 de ENERO. Leido como D/M daba 1 de marzo:
    // ese corrimiento silencioso es el bug que este test cuida.
    const f = parsearFecha("1/3/25", "MDA")!;
    expect(f.getFullYear()).toBe(2025);
    expect(f.getMonth()).toBe(0);
    expect(f.getDate()).toBe(3);

    // El caso que delata el formato: dia 31 en el segundo campo.
    const fin = parsearFecha("12/31/25", "MDA")!;
    expect(fin.getFullYear()).toBe(2025);
    expect(fin.getMonth()).toBe(11);
    expect(fin.getDate()).toBe(31);
  });

  it("lee 2026 como D/M/AAAA", () => {
    // "13/1/2026" solo puede ser dia 13 de enero: no existe el mes 13.
    const f = parsearFecha("13/1/2026", "DMA")!;
    expect(f.getFullYear()).toBe(2026);
    expect(f.getMonth()).toBe(0);
    expect(f.getDate()).toBe(13);
  });

  it("rechaza la fecha de 2025 leida con el orden de 2026", () => {
    // Es exactamente el bug: "12/31/25" con orden D/M pide el mes 31.
    expect(parsearFecha("12/31/25", "DMA")).toBeNull();
  });

  it("rechaza fechas que no existen en el calendario", () => {
    // Date() rebota el 30 de febrero al 2 de marzo; no debe pasar como valida.
    expect(parsearFecha("2/30/25", "MDA")).toBeNull();
    expect(parsearFecha("31/4/2026", "DMA")).toBeNull();
  });

  it("rechaza basura en vez de devolver una fecha cualquiera", () => {
    expect(parsearFecha("", "DMA")).toBeNull();
    expect(parsearFecha("1/1", "DMA")).toBeNull();
    expect(parsearFecha("x/y/z", "DMA")).toBeNull();
  });
});

describe("numero", () => {
  it("trata la coma como separador de miles, no como decimal", () => {
    // 8.932 lineas del historico vienen asi y son las de mayor volumen.
    expect(numero("4,000.000")).toBe(4000);
    expect(numero("10,000.000")).toBe(10000);
    expect(numero("140,280.000")).toBe(140280);
  });

  it("lee las cantidades comunes, con el punto como decimal", () => {
    expect(numero("1.000")).toBe(1);
    expect(numero("24.000")).toBe(24);
    expect(numero("0.010")).toBe(0.01);
    expect(numero("0.000")).toBe(0);
  });

  it("devuelve null en vez de cero cuando no puede leer", () => {
    // Devolver 0 escondia el problema: una venta ilegible no es una venta de cero.
    expect(numero("")).toBeNull();
    expect(numero("   ")).toBeNull();
    expect(numero("s/d")).toBeNull();
  });
});
