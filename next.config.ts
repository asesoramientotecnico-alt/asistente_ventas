import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

/**
 * Sin las variables de Supabase la app no sirve para NADA: cada pantalla necesita la
 * sesion, y la sesion sale de ahi. Si faltan, el build igual pasa y despues cada request
 * devuelve un 500 con "Internal Server Error" y ninguna pista de la causa.
 *
 * Eso es lo peor de los dos mundos: un deploy en verde y una app rota. Mejor que el build
 * falle, fuerte y con el nombre de lo que falta.
 *
 * Solo se valida en el build de produccion. En dev conviene poder levantar el proyecto sin
 * el .env.local para mirar codigo, y `next start` ya corre sobre un build validado.
 */
function validarEntorno(): void {
  const faltantes: string[] = [];

  if ((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") === "") {
    faltantes.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  const clave =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if ((clave ?? "") === "") {
    faltantes.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }

  if (faltantes.length > 0) {
    throw new Error(
      [
        "",
        "No se puede compilar sin la configuracion de Supabase.",
        "",
        `Falta${faltantes.length > 1 ? "n" : ""}: ${faltantes.join(", ")}`,
        "",
        "Salen de Supabase > Project Settings > API.",
        "En Vercel se cargan en Settings > Environment Variables, para Production,",
        "Preview y Development. En local van en .env.local (ver .env.example).",
        "",
      ].join("\n"),
    );
  }
}

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) validarEntorno();

  return {
    reactStrictMode: true,
    // `next dev` escribe un bloque de notas para agentes al final de CLAUDE.md.
    // CLAUDE.md es el contexto de dominio del proyecto, no un archivo de herramienta.
    agentRules: false,
  };
}
