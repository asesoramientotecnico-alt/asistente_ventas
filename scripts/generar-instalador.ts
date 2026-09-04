/**
 * Genera supabase/instalar.sql: las migraciones en orden mas el seed, en un solo archivo.
 *
 * Existe para poder poner en marcha un proyecto de Supabase desde el editor SQL del panel,
 * sin instalar la CLI ni tener la cadena de conexion a mano. Es el mismo SQL que aplica
 * `supabase db push`, concatenado.
 *
 * Uso:
 *   pnpm instalador:generar     escribe supabase/instalar.sql
 *   pnpm instalador:verificar   falla si quedo desactualizado
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const DIR_MIGRACIONES = "supabase/migrations";
const RUTA_SEED = "supabase/seed.sql";
const RUTA_SALIDA = "supabase/instalar.sql";

const migraciones = readdirSync(DIR_MIGRACIONES)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const partes: string[] = [
  `-- ARCHIVO GENERADO. No editar a mano: se regenera con \`pnpm instalador:generar\`.
--
-- Puesta en marcha de un proyecto de Supabase desde cero, para pegar en el editor SQL
-- del panel. Contiene las ${migraciones.length} migraciones en orden mas el seed.
--
-- Es idempotente en el seed (on conflict do nothing) pero NO en las migraciones: si se
-- corre dos veces, la segunda falla en el primer \`create type\`. Eso es a proposito —
-- avisa que el esquema ya estaba aplicado en vez de dejarlo a medias.
--
-- Despues de correrlo, en orden:
--   1. Authentication > URL Configuration: Site URL y la Redirect URL /auth/callback.
--   2. Entrar a la app una vez con el correo de Famiq, para que se cree el usuario.
--   3. Volver aca y promoverse a admin:
--        update perfil set rol = 'admin'
--        where user_id = (select id from auth.users where email = 'tu@famiq.com.ar');
--   4. Importar el Excel del catalogo desde /admin/import.
`,
];

for (const archivo of migraciones) {
  partes.push(
    `\n-- ═══════════════════════════════════════════════════════════════════════════════\n` +
      `-- ${archivo}\n` +
      `-- ═══════════════════════════════════════════════════════════════════════════════\n`,
  );
  partes.push(readFileSync(`${DIR_MIGRACIONES}/${archivo}`, "utf8").trimEnd());
}

partes.push(
  `\n-- ═══════════════════════════════════════════════════════════════════════════════\n` +
    `-- seed.sql — taxonomia, reglas y procesos\n` +
    `-- ═══════════════════════════════════════════════════════════════════════════════\n`,
);
partes.push(readFileSync(RUTA_SEED, "utf8").trimEnd());
partes.push("");

const contenido = partes.join("\n");

if (process.argv.includes("--verificar")) {
  let actual = "";
  try {
    actual = readFileSync(RUTA_SALIDA, "utf8");
  } catch {
    console.error(`Falta ${RUTA_SALIDA}. Corre: pnpm instalador:generar`);
    process.exit(1);
  }
  if (actual !== contenido) {
    console.error(`${RUTA_SALIDA} quedo desactualizado. Corre: pnpm instalador:generar`);
    process.exit(1);
  }
  console.log(`OK  ${RUTA_SALIDA} esta al dia.`);
} else {
  writeFileSync(RUTA_SALIDA, contenido);
  const lineas = contenido.split("\n").length;
  console.log(`Escrito ${RUTA_SALIDA} — ${migraciones.length} migraciones + seed, ${lineas} lineas`);
}
