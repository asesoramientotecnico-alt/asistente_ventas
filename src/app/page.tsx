import Link from "next/link";
import { sesionActual } from "@/datos/perfil";

export default async function Inicio() {
  const sesion = await sesionActual();

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Hola, {sesion?.perfil.nombre}</h1>
      <p className="mt-1 mb-8 text-texto-suave">¿Con qué viene el cliente?</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/producto" className="tarjeta tarjeta-clickeable block p-6">
          <span className="block text-lg font-semibold">Pide un producto</span>
          <span className="mt-1.5 block text-texto-suave">
            Sabe qué necesita: un caño, una brida, una válvula.
          </span>
          <span className="mt-4 block text-sm font-medium text-acento-700">Empezar →</span>
        </Link>

        <div className="rounded-lg border border-dashed border-borde-fuerte p-6">
          <span className="block text-lg font-semibold text-texto-tenue">
            Describe un proceso o un material
          </span>
          <span className="mt-1.5 block text-texto-tenue">
            Cervecería, farma, O&amp;G. Se implementa en la Fase&nbsp;2.
          </span>
        </div>
      </div>
    </main>
  );
}
