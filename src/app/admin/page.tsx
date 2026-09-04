import Link from "next/link";

export default function Panel() {
  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold">Panel de Oficina Técnica</h1>
      <ul className="mt-4 space-y-2">
        <li>
          <Link href="/admin/import" className="text-slate-900 hover:underline">
            Importar catálogo
          </Link>
          <p className="text-sm text-slate-600">
            Subir el Excel, validar el layout, previsualizar y activar.
          </p>
        </li>
        <li>
          <Link href="/admin/links" className="text-slate-900 hover:underline">
            Cobertura de links
          </Link>
          <p className="text-sm text-slate-600">
            Qué familias resuelven con su propia URL y cuáles caen en la búsqueda.
          </p>
        </li>
      </ul>
    </main>
  );
}
