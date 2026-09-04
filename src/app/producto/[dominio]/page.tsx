import Link from "next/link";
import { notFound } from "next/navigation";
import { MigasDePan } from "@/componentes/MigasDePan";
import { dominio as leerDominio } from "@/datos/taxonomia";
import { clienteServidor } from "@/datos/supabase-servidor";

export default async function Productos({
  params,
}: {
  params: Promise<{ dominio: string }>;
}) {
  const { dominio: codigo } = await params;
  const supabase = await clienteServidor();
  const linea = await leerDominio(supabase, codigo);

  if (linea === null) notFound();

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <MigasDePan
        pasos={[
          { texto: "Inicio", href: "/" },
          { texto: "Línea", href: "/producto" },
          { texto: linea.nombre },
        ]}
      />
      <h1 className="mt-3 mb-6 text-2xl font-semibold tracking-tight">{linea.nombre}</h1>

      <ul className="grid gap-3 sm:grid-cols-2">
        {linea.tipos.map((t) => (
          <li key={t.codigo}>
            <Link
              href={`/producto/${linea.codigo}/${t.codigo}`}
              className="tarjeta tarjeta-clickeable block p-5"
            >
              <span className="font-semibold">{t.nombre}</span>
              {t.pregunta_grado && (
                <span className="mt-1.5 block text-sm text-texto-tenue">Pregunta el grado</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
