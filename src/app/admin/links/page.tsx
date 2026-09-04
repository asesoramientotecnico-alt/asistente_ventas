import Link from "next/link";
import { MigasDePan } from "@/componentes/MigasDePan";
import { coberturaLinks, configEcommerce } from "@/datos/links";
import { familiasVacias } from "@/datos/catalogo";
import { clienteServidor } from "@/datos/supabase-servidor";
import { configCompleta } from "@/logica/links";

export const metadata = { title: "Cobertura de links — Panel" };

const ETIQUETA = {
  url_fija: "URL propia",
  busqueda_con_terminos: "Búsqueda con términos",
  busqueda_por_etiqueta: "Búsqueda por nombre",
} as const;

export default async function Links() {
  const supabase = await clienteServidor();
  const [config, cobertura, vacias] = await Promise.all([
    configEcommerce(supabase),
    coberturaLinks(supabase),
    familiasVacias(supabase),
  ]);

  const porResolucion = {
    url_fija: cobertura.filter((c) => c.resolucion === "url_fija"),
    busqueda_con_terminos: cobertura.filter((c) => c.resolucion === "busqueda_con_terminos"),
    busqueda_por_etiqueta: cobertura.filter((c) => c.resolucion === "busqueda_por_etiqueta"),
  };

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <MigasDePan pasos={[{ texto: "Panel", href: "/admin" }, { texto: "Cobertura de links" }]} />
      <h1 className="mt-2 mb-1 text-2xl font-semibold tracking-tight">Cobertura de links</h1>
      <p className="mb-6 text-texto-suave">
        Qué familias resuelven con su propia URL y cuáles caen en la búsqueda. En F1 esto se
        edita por SQL; el panel de edición es F2.
      </p>

      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-texto-tenue">
          Configuración del ecommerce
        </h2>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-texto-tenue">Base:</dt>
            <dd className="font-mono">{config.baseUrl === "" ? "— sin cargar —" : config.baseUrl}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-texto-tenue">Plantilla:</dt>
            <dd className="font-mono">
              {config.plantillaBusqueda === "" ? "— sin cargar —" : config.plantillaBusqueda}
            </dd>
          </div>
        </dl>
        {!configCompleta(config) && (
          <p role="alert" className="mt-3 rounded-md border border-aviso-200 bg-aviso-50 p-3 text-sm text-aviso-900">
            Sin la base y una plantilla que incluya <code>{"{q}"}</code>, la app solo genera
            los links de las familias con URL propia. No arma links a mano.
          </p>
        )}
      </section>

      {vacias.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-texto-tenue">
            Familias que alguna regla sugiere y quedaron sin ítems ({vacias.length})
          </h2>
          <p className="mt-2 text-sm text-texto-suave">
            No se le muestran al asesor: sugerir algo que no está en el catálogo rompe la
            confianza en la herramienta. Revisar el último import o la regla.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {vacias.map((v) => (
              <li key={v.codigo} className="rounded bg-aviso-50 px-2 py-1 text-aviso-900">
                {v.etiqueta}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-texto-tenue">
          Resolución por familia
        </h2>
        <dl className="mt-2 grid grid-cols-3 gap-3 text-sm">
          {(["url_fija", "busqueda_con_terminos", "busqueda_por_etiqueta"] as const).map((k) => (
            <div key={k} className="tarjeta p-4">
              <dt className="text-texto-tenue">{ETIQUETA[k]}</dt>
              <dd className="text-lg font-medium tabular-nums">{porResolucion[k].length}</dd>
            </div>
          ))}
        </dl>

        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-texto-tenue">
            <tr>
              <th className="py-1 pr-4 font-medium">Familia</th>
              <th className="py-1 pr-4 font-medium">Resuelve por</th>
              <th className="py-1 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {cobertura.map((c) => (
              <tr key={c.codigo} className="border-t border-borde">
                <td className="py-1.5 pr-4">{c.etiqueta}</td>
                <td className="py-1.5 pr-4 whitespace-nowrap text-texto-suave">
                  {ETIQUETA[c.resolucion as keyof typeof ETIQUETA] ?? c.resolucion}
                </td>
                <td className="py-1.5 truncate font-mono text-xs text-texto-tenue">
                  {c.url_fija ?? c.terminos_busqueda ?? c.etiqueta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="mt-8 text-sm">
        <Link href="/admin" className="text-texto-suave hover:underline">
          ← Panel
        </Link>
      </p>
    </main>
  );
}
