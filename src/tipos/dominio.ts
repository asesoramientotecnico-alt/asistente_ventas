/**
 * Tipos del dominio. Los nombres son los del negocio, en español, igual que las tablas.
 *
 * `src/tipos/base-de-datos.ts` se genera con `supabase gen types typescript` cuando exista
 * el proyecto; hasta entonces la app tipea a mano lo que consume, que es poco.
 */
import type { Rol } from "@/logica/acceso";

export type { Rol };

export type Prioridad = "oblig" | "reco" | "opc";

export interface Perfil {
  readonly user_id: string;
  readonly nombre: string;
  readonly sucursal: string | null;
  readonly rol: Rol;
}

export interface Sesion {
  readonly usuario: { readonly id: string; readonly email: string | null };
  readonly perfil: Perfil;
}
