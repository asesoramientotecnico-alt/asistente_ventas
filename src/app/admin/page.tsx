import Link from "next/link";

export default function Panel() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Panel de Oficina Técnica</h1>
      <ul className="mt-4 space-y-2">
        <li>
          <Link href="/admin/import" className="font-medium text-acento-700 hover:underline">
            Importar catálogo
          </Link>
          <p className="text-sm text-texto-suave">
            Subir el Excel, validar el layout, previsualizar y activar.
          </p>
        </li>
        <li>
          <Link href="/admin/links" className="font-medium text-acento-700 hover:underline">
            Cobertura de links
          </Link>
          <p className="text-sm text-texto-suave">
            Qué familias resuelven con su propia URL y cuáles caen en la búsqueda.
          </p>
        </li>
      </ul>
    </main>
  );
}
