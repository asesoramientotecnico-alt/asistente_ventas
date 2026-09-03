import { describe, expect, it } from "vitest";
import {
  HEADERS_ESPERADOS,
  HOJA_DATOS,
  celda,
  diffLayout,
  hashLayout,
  indicesPorHeader,
  normalizarNombreHoja,
} from "./layout-excel.ts";

describe("hoja de datos", () => {
  it("encuentra la hoja aunque venga con espacio al final", () => {
    expect(normalizarNombreHoja("Doc Dossier caracteristicas de ")).toBe(HOJA_DATOS);
  });
});

describe("hashLayout", () => {
  it("es estable para el mismo layout", async () => {
    expect(await hashLayout(HEADERS_ESPERADOS)).toBe(await hashLayout([...HEADERS_ESPERADOS]));
  });

  it("cambia si se reordenan dos columnas", async () => {
    const movido = [...HEADERS_ESPERADOS];
    const t = movido[11];
    movido[11] = movido[19] as string;
    movido[19] = t as string;
    expect(await hashLayout(movido)).not.toBe(await hashLayout(HEADERS_ESPERADOS));
  });

  it("cambia si se agrega o se renombra una columna", async () => {
    const base = await hashLayout(HEADERS_ESPERADOS);
    expect(await hashLayout([...HEADERS_ESPERADOS, "Nueva"])).not.toBe(base);
    expect(await hashLayout(HEADERS_ESPERADOS.map((h) => (h === "Calidad" ? "Grado" : h)))).not.toBe(base);
  });

  it("no cambia por mayusculas ni espacios de mas", async () => {
    expect(await hashLayout(HEADERS_ESPERADOS.map((h) => ` ${h.toLowerCase()} `))).toBe(
      await hashLayout(HEADERS_ESPERADOS),
    );
  });
});

describe("diffLayout", () => {
  it("no reporta cambios contra el layout esperado", () => {
    expect(diffLayout(HEADERS_ESPERADOS).hayCambios).toBe(false);
  });

  it("detecta el reordenamiento, que es lo que corre los datos", () => {
    const movido = [...HEADERS_ESPERADOS];
    movido[11] = HEADERS_ESPERADOS[19] as string;
    movido[19] = HEADERS_ESPERADOS[11] as string;
    const d = diffLayout(movido);
    expect(d.hayCambios).toBe(true);
    expect(d.faltantes).toEqual([]);
    expect(d.sobrantes).toEqual([]);
    expect(d.movidos.map((m) => m.header)).toEqual(["CALIDAD", "FAMILIA"]);
  });

  it("marca aparte los headers requeridos que faltan", () => {
    const d = diffLayout(HEADERS_ESPERADOS.filter((h) => h !== "Negocio"));
    expect(d.faltantes).toEqual(["NEGOCIO"]);
    expect(d.requeridosFaltantes).toEqual(["NEGOCIO"]);
  });

  it("una columna agregada al final no toca a los requeridos", () => {
    const d = diffLayout([...HEADERS_ESPERADOS, "Comentario"]);
    expect(d.hayCambios).toBe(true);
    expect(d.sobrantes).toEqual(["COMENTARIO"]);
    expect(d.requeridosFaltantes).toEqual([]);
  });
});

describe("lectura por nombre de header", () => {
  const headers = ["Material_ID", "Material Desc", "Calidad"];
  const indices = indicesPorHeader(headers);
  const fila = ["303798", "CA CD 100,0x100,0 2,00 304", " 304 "];

  it("lee la celda correcta", () => {
    expect(celda(fila, indices, "Material_ID")).toBe("303798");
    expect(celda(fila, indices, "calidad")).toBe("304");
  });

  it("sigue leyendo bien si las columnas se reordenan", () => {
    const otros = indicesPorHeader(["Calidad", "Material_ID", "Material Desc"]);
    const otraFila = [" 304 ", "303798", "CA CD 100,0x100,0 2,00 304"];
    expect(celda(otraFila, otros, "Material_ID")).toBe("303798");
    expect(celda(otraFila, otros, "Calidad")).toBe("304");
  });

  it("devuelve vacio si la columna no existe", () => {
    expect(celda(fila, indices, "Negocio")).toBe("");
  });
});
