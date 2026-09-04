"use client";

import Link from "next/link";
import { EtiquetaPrioridad } from "./EtiquetaPrioridad";
import { useCarrito } from "@/carrito/estado";
import { ORDEN_PRIORIDAD } from "@/logica/sugerencias";

/**
 * Checklist de lo acumulado, agrupado por prioridad.
 *
 * El panel de links —`Abrir todos` y `Copiar lista`— es el bloque 8: necesita el
 * resolvedor, y el resolvedor necesita la configuración del ecommerce, que todavía no
 * está cargada.
 */
export function VistaCarrito() {
  const { items, listo, quitar, vaciar } = useCarrito();

  if (!listo) return <p className="text-slate-600">Cargando…</p>;

  if (items.length === 0) {
    return (
      <p className="text-slate-600">
        El carrito está vacío.{" "}
        <Link href="/producto" className="underline">
          Empezá por un producto
        </Link>
        .
      </p>
    );
  }

  const ordenados = [...items].sort(
    (a, b) =>
      ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] ||
      a.etiqueta.localeCompare(b.etiqueta, "es-AR"),
  );

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {ordenados.map((i) => (
          <li key={i.clave} className="flex items-start gap-3 p-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{i.etiqueta}</span>
                <EtiquetaPrioridad prioridad={i.prioridad} />
              </div>
              <p className="mt-1 text-sm text-slate-600">{i.motivo}</p>
              <p className="mt-1 text-xs text-slate-500">
                Desde {i.origen.nombreTipo}
                {i.origen.grado !== null && ` · grado ${i.origen.grado}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => quitar(i.clave)}
              className="text-sm text-slate-500 hover:text-slate-900 hover:underline"
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={vaciar} className="text-sm text-slate-600 hover:underline">
          Vaciar el carrito
        </button>
        <Link href="/producto" className="text-sm text-slate-600 hover:underline">
          Seguir agregando
        </Link>
      </div>

      <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700">
        El panel de links al ecommerce —<strong>Abrir todos</strong> y{" "}
        <strong>Copiar lista</strong>— es el bloque 8 de la Fase 1.
      </p>
    </div>
  );
}
