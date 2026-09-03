import Link from "next/link";
import type { Sesion } from "@/tipos/dominio";
import { rolAlcanza } from "@/logica/acceso";

const ETIQUETA_ROL = {
  asesor: "Asesor",
  oficina_tecnica: "Oficina Técnica",
  admin: "Administración",
} as const;

export function Encabezado({ sesion }: { sesion: Sesion }) {
  const { perfil } = sesion;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
        <Link href="/" className="font-semibold">
          Asistente de venta cruzada
        </Link>

        {rolAlcanza(perfil.rol, "oficina_tecnica") && (
          <Link href="/admin" className="text-sm text-slate-600 hover:text-slate-900">
            Panel
          </Link>
        )}

        <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
          <span>
            {perfil.nombre}
            {perfil.sucursal !== null && ` · ${perfil.sucursal}`}
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              {ETIQUETA_ROL[perfil.rol]}
            </span>
          </span>
          <form action="/auth/salir" method="post">
            <button type="submit" className="hover:text-slate-900 hover:underline">
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
