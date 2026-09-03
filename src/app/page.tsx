import { sesionActual } from "@/datos/perfil";

export default async function Inicio() {
  const sesion = await sesionActual();

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Hola, {sesion?.perfil.nombre}</h1>
      <p className="mt-2 text-slate-600">
        La selección de puerta se implementa en el bloque 7 de la Fase 1.
      </p>
    </main>
  );
}
