/**
 * Reglas de acceso por ruta. Logica pura: no conoce Next ni Supabase, y por eso se puede
 * probar. El proxy y los layouts la consultan, no la reimplementan.
 *
 * Los roles son acumulativos, igual que en las politicas de RLS de 0008:
 * un admin puede todo lo de oficina_tecnica, y oficina_tecnica todo lo de asesor.
 */

export const ROLES = ["asesor", "oficina_tecnica", "admin"] as const;
export type Rol = (typeof ROLES)[number];

const NIVEL: Record<Rol, number> = { asesor: 0, oficina_tecnica: 1, admin: 2 };

/** Rutas accesibles sin sesion iniciada. */
const PREFIJOS_PUBLICOS = ["/login", "/auth"] as const;

/** Rutas que exigen un rol minimo. El prefijo mas especifico gana. */
const RUTAS_CON_ROL: ReadonlyArray<{ prefijo: string; rol: Rol }> = [
  { prefijo: "/admin/usuarios", rol: "admin" },
  { prefijo: "/admin", rol: "oficina_tecnica" },
];

function normalizar(ruta: string): string {
  if (ruta.length > 1 && ruta.endsWith("/")) return ruta.slice(0, -1);
  return ruta;
}

function coincide(ruta: string, prefijo: string): boolean {
  const r = normalizar(ruta);
  return r === prefijo || r.startsWith(`${prefijo}/`);
}

export function esRutaPublica(ruta: string): boolean {
  return PREFIJOS_PUBLICOS.some((p) => coincide(ruta, p));
}

/** Rol minimo que exige la ruta, o null si alcanza con estar autenticado. */
export function rolRequerido(ruta: string): Rol | null {
  const match = RUTAS_CON_ROL.filter((r) => coincide(ruta, r.prefijo)).sort(
    (a, b) => b.prefijo.length - a.prefijo.length,
  )[0];
  return match?.rol ?? null;
}

export function rolAlcanza(rol: Rol | null | undefined, minimo: Rol): boolean {
  if (rol === null || rol === undefined) return false;
  return NIVEL[rol] >= NIVEL[minimo];
}

export function puedeVer(ruta: string, rol: Rol | null | undefined): boolean {
  if (esRutaPublica(ruta)) return true;
  if (rol === null || rol === undefined) return false;
  const minimo = rolRequerido(ruta);
  return minimo === null || rolAlcanza(rol, minimo);
}
