"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Boton } from "./Boton";
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
        <section className="tarjeta p-5">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <div>
              <label htmlFor="grado" className="block text-sm font-medium">
                Grado del material
              </label>
              <select
                id="grado"
                value={grado ?? ""}
                disabled={cambiandoGrado}
                onChange={(e) => elegirGrado(e.target.value)}
                className="mt-1.5 rounded-md border border-borde-fuerte bg-superficie px-3 py-2.5 text-base"
              >
                <option value="">Sin definir</option>
                {grados.map((g) => (
                  <option key={g.grado} value={g.grado}>
                    {g.grado} · {numero(g.items)} en catálogo
                  </option>
                ))}
              </select>
            </div>
            <p className="max-w-md text-sm text-texto-suave">
              La app no decide el grado: son los que hay en el catálogo. Elegilo con el cliente
              y, si el servicio es crítico, derivá la consulta a Oficina Técnica.
            </p>
          </div>

          {gradoSinAporte && (
            <p className="mt-4 rounded-md border border-aviso-200 bg-aviso-50 p-3 text-sm text-aviso-900">
              Para <strong>{grado}</strong> no hay aporte definido por Oficina Técnica. El
              consumible se sugiere igual, pero sin justificación de grado: confirmalo antes de
              cerrar la venta.
            </p>
          )}
        </section>
      )}

      <section className="space-y-3">
        {complementos.map((c) => {
          const marcadasDelGrupo = c.familias.filter((f) =>
            marcadas.has(claveSeleccion(c.id, f.codigo)),
          ).length;

          return (
            <details
              key={c.id}
              className={`tarjeta group overflow-hidden [&_summary::-webkit-details-marker]:hidden ${
                c.prioridad === "oblig" ? "border-l-4 border-l-acento-600" : ""
              }`}
            >
              <summary className="flex cursor-pointer items-start gap-3 p-5 hover:bg-fondo">
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  className="mt-1.5 size-3.5 shrink-0 fill-texto-tenue transition-transform group-open:rotate-90"
                >
                  <path d="M7 4l7 6-7 6z" />
                </svg>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-lg font-semibold">{c.nombre}</span>
                    <EtiquetaPrioridad prioridad={c.prioridad} />
                    <span className="text-sm text-texto-tenue tabular">
                      {marcadasDelGrupo} de {c.familias.length}
                    </span>
                  </span>
                  {/* El motivo no es decorativo: es lo que el asesor le repite al cliente. */}
                  {c.motivo !== "" && (
                    <span className="mt-1.5 block text-texto-suave">{c.motivo}</span>
                  )}
                </span>
              </summary>

              <ul className="border-t border-borde bg-fondo/60 px-5 py-2">
                {c.familias.map((f) => {
                  const clave = claveSeleccion(c.id, f.codigo);
                  return (
                    <li key={clave}>
                      <label className="flex cursor-pointer items-center gap-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={marcadas.has(clave)}
                          onChange={() => alternar(clave)}
                          className="size-5 accent-acento-600"
                        />
                        <span className="font-medium">{f.etiqueta}</span>
                        <span className="ml-auto text-sm text-texto-tenue tabular">
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

      <section className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-4 border-t border-borde bg-superficie px-5 py-4 shadow-[0_-8px_16px_-12px_rgba(0,0,0,0.18)]">
        <Boton onClick={() => void sumarAlCarrito()} disabled={marcadas.size === 0}>
          Sumar {marcadas.size} al carrito
        </Boton>
        {sumadas > 0 && (
          <span role="status" className="text-sm">
            {sumadas} {sumadas === 1 ? "familia" : "familias"} en el carrito.{" "}
            <Link href="/carrito" className="font-medium text-acento-700 underline">
              Ver el carrito
            </Link>
          </span>
        )}
      </section>
    </div>
  );
}
