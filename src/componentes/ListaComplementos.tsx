"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Boton } from "./Boton";
import { EtiquetaPrioridad } from "./EtiquetaPrioridad";
import { useCarrito, type ItemCarrito } from "@/carrito/estado";
import type { ItemsDeFamilia } from "@/datos/items";
import { clienteNavegador } from "@/datos/supabase-navegador";
import { registrarSugerencias, type SugerenciaMostrada } from "@/datos/trazabilidad";
import {
  claveSeleccion,
  seleccionInicial,
  type Aporte,
  type ComplementoSugerido,
} from "@/logica/sugerencias";

const numero = (n: number) => n.toLocaleString("es-AR");

export function ListaComplementos({
  tipo,
  nombreTipo,
  complementos,
  grados,
  grado,
  medidas,
  medida,
  itemsPorFamilia,
  aporte,
}: {
  tipo: string;
  nombreTipo: string;
  complementos: readonly ComplementoSugerido[];
  grados: ReadonlyArray<{ grado: string; items: number }>;
  grado: string | null;
  medidas: ReadonlyArray<{ medida: string; items: number }>;
  medida: string | null;
  /** Ítems del catálogo de cada familia, ya filtrados por el criterio de ese par. */
  itemsPorFamilia: Readonly<Record<string, ItemsDeFamilia>>;
  /** Aporte del grado elegido, o null si Oficina Técnica no lo definió para ese grado. */
  aporte: Aporte | null;
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

  // Grado y medida viajan en la URL: la pantalla queda compartible, y el servidor
  // reescribe el motivo del aporte y vuelve a filtrar los ítems de cada familia.
  function navegarCon(cambios: { grado?: string | null; medida?: string | null }) {
    const p = new URLSearchParams();
    const g = cambios.grado === undefined ? grado : cambios.grado;
    const m = cambios.medida === undefined ? medida : cambios.medida;
    if (g !== null && g !== "") p.set("grado", g);
    if (m !== null && m !== "") p.set("medida", m);
    const qs = p.toString();
    iniciarCambio(() => {
      router.replace(qs === "" ? ruta : `${ruta}?${qs}`, { scroll: false });
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
      {(grados.length > 0 || medidas.length > 0) && (
        <section className="tarjeta p-5">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            {medidas.length > 0 && (
              <div>
                <label htmlFor="medida" className="block text-sm font-medium">
                  Medida que pide el cliente
                </label>
                <select
                  id="medida"
                  value={medida ?? ""}
                  disabled={cambiandoGrado}
                  onChange={(e) => navegarCon({ medida: e.target.value })}
                  className="mt-1.5 rounded-md border border-borde-fuerte bg-superficie px-3 py-2.5 text-base"
                >
                  <option value="">Sin definir</option>
                  {medidas.map((m) => (
                    <option key={m.medida} value={m.medida}>
                      {m.medida} · {numero(m.items)} en catálogo
                    </option>
                  ))}
                </select>
              </div>
            )}
            {grados.length > 0 && (
              <div>
                <label htmlFor="grado" className="block text-sm font-medium">
                  Grado del material
                </label>
                <select
                  id="grado"
                  value={grado ?? ""}
                  disabled={cambiandoGrado}
                  onChange={(e) => navegarCon({ grado: e.target.value })}
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
            )}
            <p className="max-w-md text-sm text-texto-suave">
              La app no decide el grado: son los que hay en el catálogo. Elegilo con el cliente
              y, si el servicio es crítico, derivá la consulta a Oficina Técnica.
            </p>
          </div>

          {medida !== null && (
            <p className="mt-4 text-sm text-texto-suave">
              Con <strong>{medida}</strong> elegida, las familias que dependen de la medida
              muestran solo lo que coincide. El consumible de aporte no se filtra por medida:
              lo define el grado, no el diámetro de la línea.
            </p>
          )}

          {grado !== null && aporte === null && (
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
                    {/* El aporte va como dato, no metido en la frase del motivo. */}
                    {c.dependeDelGrado && aporte !== null && (
                      <span className="shrink-0 rounded bg-acento-50 px-2 py-0.5 text-xs font-semibold text-acento-700">
                        Aporte {aporte.aporte}
                      </span>
                    )}
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
                  const detalle = itemsPorFamilia[clave];
                  const filtrada = f.criterio !== "ninguno" && detalle?.sinCoincidencia === false;

                  return (
                    <li key={clave} className="border-b border-borde/60 last:border-b-0">
                      <label className="flex cursor-pointer items-center gap-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={marcadas.has(clave)}
                          onChange={() => alternar(clave)}
                          className="size-5 accent-acento-600"
                        />
                        <span className="font-medium">{f.etiqueta}</span>
                        {filtrada && (
                          <span className="rounded bg-acento-50 px-2 py-0.5 text-xs font-semibold text-acento-700">
                            {f.criterio === "medida" ? medida : (aporte?.aporte ?? grado)}
                          </span>
                        )}
                        <span className="ml-auto text-sm text-texto-tenue tabular">
                          {numero(detalle?.total ?? f.items)} ítems
                        </span>
                      </label>

                      {/* Invariante 2: la app enumera, el asesor elige. Ninguno viene
                          premarcado y no se afirma precio ni stock: eso lo resuelve el
                          ecommerce, que es lo que el catálogo importado no sabe. */}
                      {detalle !== undefined && detalle.items.length > 0 && (
                        <div className="pb-2.5 pl-8">
                          {detalle.sinCoincidencia && (
                            <p className="mb-1.5 text-xs text-aviso-900">
                              No hay {f.etiqueta.toLowerCase()} en {medida}. Estos son todos los
                              que hay; confirmá la medida con el cliente.
                            </p>
                          )}
                          <ul className="space-y-0.5">
                            {detalle.items.slice(0, 6).map((it) => (
                              <li
                                key={it.materialId}
                                className="flex gap-2 text-xs text-texto-suave"
                              >
                                <span className="shrink-0 tabular text-texto-tenue">
                                  {it.materialId}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{it.descripcion}</span>
                              </li>
                            ))}
                          </ul>
                          {detalle.total > 6 && (
                            <p className="mt-1 text-xs text-texto-tenue">
                              y {numero(detalle.total - 6)} más en el ecommerce
                            </p>
                          )}
                        </div>
                      )}
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
