"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { EtiquetaPrioridad } from "./EtiquetaPrioridad";
import { useCarrito, type ItemCarrito } from "@/carrito/estado";
import { clienteNavegador } from "@/datos/supabase-navegador";
import { registrarSugerencias, type SugerenciaMostrada } from "@/datos/trazabilidad";
import { claveSeleccion, seleccionInicial, type ComplementoSugerido } from "@/logica/sugerencias";

const numero = (n: number) => n.toLocaleString("es-AR");

export function ListaComplementos({
  tipo,
  nombreTipo,
  complementos,
  grados,
  grado,
  gradoSinAporte,
}: {
  tipo: string;
  nombreTipo: string;
  complementos: readonly ComplementoSugerido[];
  grados: ReadonlyArray<{ grado: string; items: number }>;
  grado: string | null;
  /** El grado elegido no tiene aporte declarado por Oficina Técnica. */
  gradoSinAporte: boolean;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const [cambiandoGrado, iniciarCambio] = useTransition();
  const { agregar } = useCarrito();

  // Los `oblig` vienen premarcados; el asesor desmarca.
  const [marcadas, setMarcadas] = useState<Set<string>>(
    () => new Set(seleccionInicial(complementos)),
  );
  const [sumadas, setSumadas] = useState(0);

  function alternar(clave: string) {
    setMarcadas((antes) => {
      const despues = new Set(antes);
      if (despues.has(clave)) despues.delete(clave);
      else despues.add(clave);
      return despues;
    });
    setSumadas(0);
  }

  // El grado viaja en la URL: la pantalla queda compartible y el motivo del aporte lo
  // reescribe el servidor con la justificación que corresponde.
  function elegirGrado(nuevo: string) {
    iniciarCambio(() => {
      router.replace(nuevo === "" ? ruta : `${ruta}?grado=${encodeURIComponent(nuevo)}`, {
        scroll: false,
      });
    });
  }

  async function sumarAlCarrito() {
    // Se registran TODAS las que se mostraron, marcando cuales acepto: las que desmarco
    // son justamente las que dicen que regla no sirve.
    const mostradas: SugerenciaMostrada[] = [];
    const items: Array<Omit<ItemCarrito, "trazaId">> = [];

    for (const c of complementos) {
      for (const f of c.familias) {
        const clave = claveSeleccion(c.id, f.codigo);
        const aceptada = marcadas.has(clave);

        mostradas.push({
          clave,
          complemento_id: c.id,
          categoria: f.codigo,
          prioridad: c.prioridad,
          aceptada,
        });

        if (aceptada) {
          items.push({
            clave,
            categoria: f.codigo,
            etiqueta: f.etiqueta,
            prioridad: c.prioridad,
            motivo: c.motivo,
            origen: { tipo, nombreTipo, grado },
            complementoId: c.id,
          });
        }
      }
    }

    // El carrito se llena primero: la traza no puede demorar lo que el asesor ve.
    agregar(items.map((i) => ({ ...i, trazaId: null })));
    setSumadas(items.length);

    const ids = await registrarSugerencias(clienteNavegador(), {
      puerta: "producto",
      tipo,
      grado,
      sugerencias: mostradas,
    });
    if (Object.keys(ids).length > 0) {
      agregar(items.map((i) => ({ ...i, trazaId: ids[i.clave] ?? null })));
    }
  }

  return (
    <div className="space-y-6">
      {grados.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <label htmlFor="grado" className="block text-sm font-medium text-slate-700">
            Grado del material
          </label>
          <select
            id="grado"
            value={grado ?? ""}
            disabled={cambiandoGrado}
            onChange={(e) => elegirGrado(e.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-base"
          >
            <option value="">Sin definir</option>
            {grados.map((g) => (
              <option key={g.grado} value={g.grado}>
                {g.grado} · {numero(g.items)} ítems en catálogo
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm text-slate-600">
            La app no decide el grado: son los que hay en el catálogo. Elegilo con el cliente
            y, si el servicio es crítico, derivá la consulta a Oficina Técnica.
          </p>
          {gradoSinAporte && (
            <p className="mt-2 text-sm text-amber-800">
              Para {grado} no hay aporte definido por Oficina Técnica. El consumible se sugiere
              igual, pero sin justificación de grado: confirmalo antes de cerrar la venta.
            </p>
          )}
        </section>
      )}

      <section className="space-y-2">
        {complementos.map((c) => {
          const marcadasDelGrupo = c.familias.filter((f) =>
            marcadas.has(claveSeleccion(c.id, f.codigo)),
          ).length;

          return (
            <details
              key={c.id}
              className="group rounded-lg border border-slate-200 bg-white [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-start gap-3 p-4">
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  className="mt-1 size-4 shrink-0 fill-slate-400 transition-transform group-open:rotate-90"
                >
                  <path d="M7 4l7 6-7 6z" />
                </svg>
                <span className="flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.nombre}</span>
                    <EtiquetaPrioridad prioridad={c.prioridad} />
                    <span className="text-sm text-slate-500">
                      {marcadasDelGrupo} de {c.familias.length}
                    </span>
                  </span>
                  {/* El motivo no es decorativo: es lo que el asesor le repite al cliente. */}
                  {c.motivo !== "" && (
                    <span className="mt-1 block text-sm text-slate-600">{c.motivo}</span>
                  )}
                </span>
              </summary>

              <ul className="border-t border-slate-100 px-4 py-2">
                {c.familias.map((f) => {
                  const clave = claveSeleccion(c.id, f.codigo);
                  return (
                    <li key={clave} className="py-1">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={marcadas.has(clave)}
                          onChange={() => alternar(clave)}
                          className="size-4"
                        />
                        <span>{f.etiqueta}</span>
                        <span className="text-sm text-slate-500">
                          {numero(f.items)} ítems
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void sumarAlCarrito()}
          disabled={marcadas.size === 0}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Sumar {marcadas.size} al carrito
        </button>
        {sumadas > 0 && (
          <span className="text-sm text-slate-700" role="status">
            {sumadas} {sumadas === 1 ? "familia" : "familias"} en el carrito.{" "}
            <Link href="/carrito" className="underline">
              Ver el carrito
            </Link>
          </span>
        )}
      </section>
    </div>
  );
}
