"use client";

import { useState } from "react";
import { Boton } from "./Boton";
import { clienteNavegador } from "@/datos/supabase-navegador";
import {
  activar,
  conteoDeBatch,
  importar,
  listarBatches,
  type BatchResumen,
} from "@/datos/importacion";
import { analizar, compararConAnterior, type Analisis, type Comparacion } from "@/logica/importacion";
import { HOJA_DATOS, normalizarNombreHoja } from "@/logica/layout-excel";

type Estado =
  | { paso: "inicial" }
  | { paso: "leyendo" }
  | { paso: "analizado"; analisis: Analisis; comparacion: Comparacion | null; archivo: File }
  | { paso: "importando"; insertadas: number; total: number }
  | { paso: "importado"; batchId: string; analisis: Analisis }
  | { paso: "error"; mensaje: string };

const numero = (n: number) => n.toLocaleString("es-AR");
const pct = (n: number) => `${n.toFixed(2).replace(".", ",")} %`;

export function ImportadorExcel({ batches: iniciales }: { batches: BatchResumen[] }) {
  const [batches, setBatches] = useState(iniciales);
  const [estado, setEstado] = useState<Estado>({ paso: "inicial" });
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const supabase = clienteNavegador();

  const activo = batches.find((b) => b.estado === "activo") ?? null;

  async function refrescar() {
    setBatches(await listarBatches(supabase));
  }

  async function elegirArchivo(archivo: File) {
    setNombreArchivo(archivo.name);
    setEstado({ paso: "leyendo" });
    try {
      // SheetJS pesa ~350 KB: se carga recien cuando se elige un archivo, y no entra en
      // el bundle inicial de ninguna pantalla.
      const XLSX = await import("xlsx");
      const libro = XLSX.read(await archivo.arrayBuffer());

      // La hoja se busca por nombre normalizado: en el archivo viene con un espacio al
      // final, y buscarla por indice traeria la metadata del export de Mozart.
      const nombreHoja = libro.SheetNames.find((n) => normalizarNombreHoja(n) === HOJA_DATOS);
      if (nombreHoja === undefined) {
        setEstado({
          paso: "error",
          mensaje: `El archivo no tiene la hoja de datos. Hojas encontradas: ${libro.SheetNames.join(", ")}.`,
        });
        return;
      }

      const hoja = libro.Sheets[nombreHoja];
      if (hoja === undefined) throw new Error(`No se pudo leer la hoja "${nombreHoja}".`);

      const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
        header: 1,
        raw: false,
        defval: "",
      });
      const headers = (filas[0] ?? []).map(String);

      // El layout se compara contra el del ultimo import exitoso; si no hay ninguno,
      // contra la linea base del codigo.
      const referencia = activo !== null && activo.headers.length > 0 ? activo.headers : undefined;
      const analisis = await analizar(headers, filas.slice(1), referencia);

      const conteoAnterior = activo === null ? null : await conteoDeBatch(supabase, activo.id);
      setEstado({
        paso: "analizado",
        analisis,
        comparacion: compararConAnterior(analisis.conteo, conteoAnterior),
        archivo,
      });
    } catch (e) {
      setEstado({ paso: "error", mensaje: e instanceof Error ? e.message : String(e) });
    }
  }

  async function confirmar(analisis: Analisis, archivo: File) {
    setEstado({ paso: "importando", insertadas: 0, total: analisis.filas });
    try {
      const batchId = await importar(supabase, archivo, analisis, (p) => {
        setEstado({ paso: "importando", insertadas: p.insertadas, total: p.total });
      });
      await refrescar();
      setEstado({ paso: "importado", batchId, analisis });
    } catch (e) {
      setEstado({ paso: "error", mensaje: e instanceof Error ? e.message : String(e) });
    }
  }

  async function activarBatch(id: string) {
    try {
      await activar(supabase, id);
      await refrescar();
      setEstado({ paso: "inicial" });
    } catch (e) {
      setEstado({ paso: "error", mensaje: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-texto-tenue">
          Catálogo vigente
        </h2>
        {activo === null ? (
          <p className="mt-2 text-texto-suave">
            Todavía no hay ningún catálogo activo. Hasta que lo haya, la app no tiene familias
            que sugerir.
          </p>
        ) : (
          <p className="mt-2">
            <span className="font-medium">{activo.archivo}</span> · {numero(activo.filas)} filas ·{" "}
            {numero(activo.filas_otro)} sin clasificar (
            {pct((activo.filas_otro / Math.max(activo.filas, 1)) * 100)})
          </p>
        )}
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-texto-tenue">
          Importar un archivo
        </h2>
        <div className="mt-2 flex items-center gap-3">
          <label className="cursor-pointer rounded-md bg-acento-600 px-4 py-2 text-sm font-medium text-white has-disabled:opacity-50">
            Elegir archivo
            <input
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              disabled={estado.paso === "leyendo" || estado.paso === "importando"}
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo !== undefined) void elegirArchivo(archivo);
              }}
            />
          </label>
          <span className="text-sm text-texto-suave">{nombreArchivo ?? "Ningún archivo elegido"}</span>
        </div>

        {estado.paso === "leyendo" && <p className="mt-3 text-texto-suave">Leyendo el archivo…</p>}

        {estado.paso === "error" && (
          <p role="alert" className="mt-3 rounded-md bg-aviso-50 p-3 text-sm text-aviso-900">
            {estado.mensaje}
          </p>
        )}

        {estado.paso === "importando" && (
          <p className="mt-3 text-texto-suave">
            Importando {numero(estado.insertadas)} de {numero(estado.total)} filas…
          </p>
        )}

        {estado.paso === "importado" && (
          <div className="mt-3 rounded-md border border-ok-200 bg-ok-50 p-4">
            <p className="font-medium text-ok-900">
              Importadas {numero(estado.analisis.filas)} filas. El catálogo vigente todavía no
              cambió.
            </p>
            <Boton className="mt-3" onClick={() => void activarBatch(estado.batchId)}>
              Activar este catálogo
            </Boton>
          </div>
        )}

        {estado.paso === "analizado" && (
          <Previsualizacion
            analisis={estado.analisis}
            comparacion={estado.comparacion}
            onConfirmar={() => void confirmar(estado.analisis, estado.archivo)}
            onCancelar={() => setEstado({ paso: "inicial" })}
          />
        )}
      </section>

      <Historial batches={batches} onActivar={(id) => void activarBatch(id)} />
    </div>
  );
}

function Previsualizacion({
  analisis,
  comparacion,
  onConfirmar,
  onCancelar,
}: {
  analisis: Analisis;
  comparacion: Comparacion | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const { diff } = analisis;

  return (
    <div className="tarjeta mt-4 space-y-4 p-5">
      {!analisis.importable && (
        <div role="alert" className="rounded-md bg-aviso-50 p-3 text-sm text-aviso-900">
          <p className="font-medium">No se puede importar este archivo.</p>
          <ul className="mt-1 list-disc pl-5">
            {analisis.motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {diff.hayCambios && (
        <div className="text-sm">
          <p className="font-medium">Diferencias de layout contra el último import</p>
          <ul className="mt-1 list-disc pl-5 text-texto">
            {diff.faltantes.map((h) => (
              <li key={`f-${h}`}>
                Falta la columna <code>{h}</code>
                {diff.requeridosFaltantes.includes(h) && " (la usa el clasificador)"}
              </li>
            ))}
            {diff.sobrantes.map((h) => (
              <li key={`s-${h}`}>
                Columna nueva: <code>{h}</code>
              </li>
            ))}
            {diff.movidos.map((m) => (
              <li key={`m-${m.header}`}>
                <code>{m.header}</code> se movió de la posición {m.esperado + 1} a la {m.actual + 1}
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Dato etiqueta="Filas" valor={numero(analisis.filas)} />
        <Dato
          etiqueta="Sin clasificar"
          valor={`${numero(analisis.filasOtro)} (${pct((analisis.filasOtro / Math.max(analisis.filas, 1)) * 100)})`}
        />
        <Dato etiqueta="Familias con ítems" valor={numero(Object.keys(analisis.conteo).length - 1)} />
        <Dato etiqueta="Filas vacías salteadas" valor={numero(analisis.filasVacias)} />
      </dl>

      {comparacion !== null && (
        <div
          className={`rounded-md p-3 text-sm ${
            comparacion.alerta ? "bg-aviso-50 text-aviso-900" : "bg-fondo text-texto"
          }`}
        >
          <p>
            Sin clasificar: {pct(comparacion.porcentajeOtroAntes)} antes →{" "}
            {pct(comparacion.porcentajeOtroAhora)} ahora (
            {comparacion.deltaPuntos >= 0 ? "+" : ""}
            {comparacion.deltaPuntos.toFixed(2).replace(".", ",")} puntos).
          </p>
          {comparacion.categoriasVaciadas.length > 0 && (
            <p className="mt-1">
              Familias que se quedaron sin ítems y dejarían de sugerirse:{" "}
              <strong>{comparacion.categoriasVaciadas.join(", ")}</strong>.
            </p>
          )}
          {comparacion.categoriasNuevas.length > 0 && (
            <p className="mt-1">Familias que aparecen por primera vez: {comparacion.categoriasNuevas.join(", ")}.</p>
          )}
          {comparacion.alerta && (
            <p className="mt-1 font-medium">
              Conviene revisar el archivo antes de activarlo: el catálogo cambió más de lo
              habitual.
            </p>
          )}
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-texto-suave">Ver el detalle por familia</summary>
        <ul className="mt-2 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
          {Object.entries(analisis.conteo)
            .sort(([, a], [, b]) => b - a)
            .map(([codigo, items]) => (
              <li key={codigo} className="flex justify-between border-b border-borde py-0.5">
                <span>{codigo}</span>
                <span className="tabular-nums text-texto-suave">{numero(items)}</span>
              </li>
            ))}
        </ul>
      </details>

      <div className="flex gap-3">
        <Boton disabled={!analisis.importable} onClick={onConfirmar}>
          Importar {numero(analisis.filas)} filas
        </Boton>
        <Boton variante="texto" className="text-sm" onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>
      <p className="text-xs text-texto-tenue">
        Importar no cambia el catálogo vigente: primero se guarda y después se activa.
      </p>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-texto-tenue">{etiqueta}</dt>
      <dd className="font-medium tabular-nums">{valor}</dd>
    </div>
  );
}

function Historial({
  batches,
  onActivar,
}: {
  batches: BatchResumen[];
  onActivar: (id: string) => void;
}) {
  if (batches.length === 0) return null;

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-texto-tenue">Historial</h2>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-texto-tenue">
          <tr>
            <th className="py-1 pr-4 font-medium">Archivo</th>
            <th className="py-1 pr-4 font-medium">Subido</th>
            <th className="py-1 pr-4 text-right font-medium">Filas</th>
            <th className="py-1 pr-4 text-right font-medium">Sin clasificar</th>
            <th className="py-1 pr-4 font-medium">Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id} className="border-t border-borde">
              <td className="py-1.5 pr-4">{b.archivo}</td>
              <td className="py-1.5 pr-4 whitespace-nowrap text-texto-suave">
                {new Date(b.subido_at).toLocaleDateString("es-AR")}
              </td>
              <td className="py-1.5 pr-4 text-right tabular-nums">{numero(b.filas)}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums">{numero(b.filas_otro)}</td>
              <td className="py-1.5 pr-4">{b.estado}</td>
              <td className="py-1.5 text-right">
                {b.estado !== "activo" && b.estado !== "pendiente" && (
                  <button
                    type="button"
                    onClick={() => onActivar(b.id)}
                    className="text-texto-suave hover:text-texto hover:underline"
                  >
                    Activar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-texto-tenue">
        Activar un import anterior es la forma de volver atrás: descarta el vigente y restaura
        ese, en una sola operación.
      </p>
    </section>
  );
}
