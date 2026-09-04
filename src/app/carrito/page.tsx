import { MigasDePan } from "@/componentes/MigasDePan";
import { VistaCarrito } from "@/componentes/VistaCarrito";

export const metadata = { title: "Carrito" };

export default function Carrito() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <MigasDePan pasos={[{ texto: "Inicio", href: "/" }, { texto: "Carrito" }]} />
      <h1 className="mt-2 mb-1 text-xl font-semibold">Carrito</h1>
      <p className="mb-6 text-slate-600">Desmarcá lo que no va y después generá los links.</p>
      <VistaCarrito />
    </main>
  );
}
