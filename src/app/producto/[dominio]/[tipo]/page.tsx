import { notFound } from "next/navigation";
import { ListaComplementos } from "@/componentes/ListaComplementos";
import { MigasDePan } from "@/componentes/MigasDePan";
import {
  aporteParaGrado,
  gradosDisponibles,
  medidasDisponibles,
  tipoConComplementos,
} from "@/datos/taxonomia";
import { filtrosSegunCriterio, itemsDeFamilia, type ItemsDeFamilia } from "@/datos/items";
import { clienteServidor } from "@/datos/supabase-servidor";
import { claveSeleccion, prepararSugerencias } from "@/logica/sugerencias";

export default async function Complementos({
  params,
  searchParams,
}: {
  params: Promise<{ dominio: string; tipo: string }>;
  searchParams: Promise<{ grado?: string; medida?: string }>;
}) {
  const { dominio, tipo: codigoTipo } = await params;
  const { grado: gradoCrudo, medida: medidaCruda } = await searchParams;
  const grado = gradoCrudo === undefined || gradoCrudo === "" ? null : gradoCrudo;
  const medida = medidaCruda === undefined || medidaCruda === "" ? null : medidaCruda;

  const supabase = await clienteServidor();
  const tipo = await tipoConComplementos(supabase, codigoTipo);

  if (tipo === null || tipo.dominio.codigo !== dominio) notFound();

  // Cada selector solo se muestra donde el catálogo tiene con qué llenarlo.
  const [grados, medidas, aporte] = await Promise.all([
    tipo.preguntaGrado ? gradosDisponibles(supabase, tipo.codigo) : Promise.resolve([]),
    tipo.preguntaMedida ? medidasDisponibles(supabase, tipo.codigo) : Promise.resolve([]),
    aporteParaGrado(supabase, grado),
  ]);

  const complementos = prepararSugerencias(tipo.complementos, aporte);
  const sinCatalogo = tipo.complementos.length > 0 && complementos.length === 0;

  /**
   * Los ítems de cada familia, ya filtrados por el criterio de ESE par.
   *
   * Se resuelve en el servidor y se pasa armado: el navegador no consulta el catálogo
   * familia por familia mientras el asesor tiene al cliente enfrente.
   */
  const itemsPorFamilia: Record<string, ItemsDeFamilia> = {};
  await Promise.all(
    complementos.flatMap((c) =>
      c.familias.map(async (f) => {
        const filtros = filtrosSegunCriterio(f.criterio, medida, grado, aporte?.aporte ?? null);
        itemsPorFamilia[claveSeleccion(c.id, f.codigo)] = await itemsDeFamilia(
          supabase,
          f.codigo,
          filtros,
        );
      }),
    ),
  );

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <MigasDePan
        pasos={[
          { texto: "Inicio", href: "/" },
          { texto: "Línea", href: "/producto" },
          { texto: tipo.dominio.nombre, href: `/producto/${dominio}` },
          { texto: tipo.nombre },
        ]}
      />
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{tipo.nombre}</h1>
      <p className="mt-1 mb-6 text-texto-suave">
        Lo que suele ir junto. Los obligatorios vienen marcados; desmarcá lo que no va.
      </p>

      {sinCatalogo ? (
        <p className="rounded-lg border border-aviso-200 bg-aviso-50 p-4 text-sm text-aviso-900">
          Las familias que complementan este producto no tienen ítems en el catálogo vigente.
          Avisale a Oficina Técnica antes de seguir.
        </p>
      ) : (
        <ListaComplementos
          tipo={tipo.codigo}
          nombreTipo={tipo.nombre}
          complementos={complementos}
          grados={grados}
          grado={grado}
          medidas={medidas}
          medida={medida}
          itemsPorFamilia={itemsPorFamilia}
          aporte={aporte}
        />
      )}

      {tipo.notas.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-texto-tenue">
            Notas técnicas de la línea
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-texto-suave">
            {tipo.notas.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
