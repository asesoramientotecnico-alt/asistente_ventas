import Link from "next/link";
import { MigasDePan } from "@/componentes/MigasDePan";
import { listarDominios } from "@/datos/taxonomia";
import { clienteServidor } from "@/datos/supabase-servidor";

export const metadata = { title: "El cliente pide un producto" };

export default async function Lineas() {
  const supabase = await clienteServidor();
  const dominios = await listarDominios(supabase);

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <MigasDePan pasos={[{ texto: "Inicio", href: "/" }, { texto: "Línea" }]} />
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        ¿De qué línea es el producto?
      </h1>
      <p className="mt-1 mb-6 text-texto-suave">Elegí la línea y después el producto puntual.</p>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {dominios.map((d) => (
          <li key={d.codigo}>
            <Link
              href={`/producto/${d.codigo}`}
              className="tarjeta tarjeta-clickeable flex h-full flex-col justify-between p-5"
            >
              <span className="font-semibold">{d.nombre}</span>
              <span className="mt-2 text-sm text-texto-tenue tabular">
                {d.tipos} {d.tipos === 1 ? "producto" : "productos"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
