import Link from "next/link";
import { sesionActual } from "@/datos/perfil";

export default async function Inicio() {
  const sesion = await sesionActual();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold">Hola, {sesion?.perfil.nombre}</h1>
      <p className="mt-1 mb-6 text-slate-600">¿Con qué viene el cliente?</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/producto"
          className="rounded-lg border border-slate-300 bg-white p-6 hover:border-slate-500"
        >
          <span className="block text-lg font-medium">Pide un producto</span>
          <span className="mt-1 block text-sm text-slate-600">
            Sabe qué necesita: un caño, una brida, una válvula.
          </span>
        </Link>

        <div className="rounded-lg border border-dashed border-slate-300 p-6">
          <span className="block text-lg font-medium text-slate-500">
            Describe un proceso o un material
          </span>
          <span className="mt-1 block text-sm text-slate-500">
            Cervecería, farma, O&amp;G. Se implementa en la Fase 2.
          </span>
        </div>
      </div>
    </main>
  );
}
