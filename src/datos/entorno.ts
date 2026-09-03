/**
 * Lectura de la configuracion de Supabase.
 *
 * La clave publica cambio de nombre entre generaciones de proyectos ("anon key" antes,
 * "publishable key" ahora). Se aceptan las dos para no atar el codigo a una de ellas.
 */

function requerida(nombre: string, valor: string | undefined): string {
  if (valor === undefined || valor === "") {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copiala de .env.example y completala con los datos del proyecto de Supabase.`,
    );
  }
  return valor;
}

export function urlSupabase(): string {
  return requerida("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function clavePublicaSupabase(): string {
  const valor =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return requerida("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY", valor);
}
