import Link from "next/link";
import type { Sesion } from "@/tipos/dominio";
import { rolAlcanza } from "@/logica/acceso";
import { ContadorCarrito } from "./ContadorCarrito";

const ETIQUETA_ROL = {
  asesor: "Asesor",
  oficina_tecnica: "Oficina Técnica",
  admin: "Administración",
} as const;

export function Encabezado({ sesion }: { sesion: Sesion }) {
  const { perfil } = sesion;

  return (
    <header className="sticky top-0 z-10 border-b border-borde bg-superficie/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Asistente de venta cruzada
        </Link>

        {rolAlcanza(perfil.rol, "oficina_tecnica") && (
          <Link href="/admin" className="text-sm text-texto-suave hover:text-texto">
            Panel
          </Link>
        )}

        <div className="ml-auto flex items-center gap-4 text-sm text-texto-suave">
          <ContadorCarrito />
          <span className="hidden sm:inline">
            {perfil.nombre}
            {perfil.sucursal !== null && ` · ${perfil.sucursal}`}
          </span>
          <span className="rounded bg-fondo px-2 py-0.5 text-xs text-texto-tenue">
            {ETIQUETA_ROL[perfil.rol]}
          </span>
          <form action="/auth/salir" method="post">
            <button type="submit" className="hover:text-texto hover:underline">
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
