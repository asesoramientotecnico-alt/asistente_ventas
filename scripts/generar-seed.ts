/**
 * Genera supabase/seed.sql desde data/crosssell_rules.json y data/procesos.json.
 *
 * El seed es SQL y no un script que escriba contra la base: asi se aplica con
 * `supabase db reset`, se revisa en el diff y se prueba local con pnpm probar:migraciones.
 * La logica no se duplica a mano — sale del JSON, que sigue siendo la fuente.
 *
 * Todo entra con ON CONFLICT DO NOTHING: el seed llena lo que falta y nunca pisa lo que
 * Oficina Tecnica ya edito. Para re-sincronizar una regla contra el JSON hay que borrar
 * la fila primero.
 *
 * Uso:
 *   pnpm seed:generar     escribe supabase/seed.sql
 *   pnpm seed:verificar   falla si el archivo quedo desactualizado respecto de los JSON
 */
import { readFileSync, writeFileSync } from "node:fs";
import { EQUIVALENCIAS_GRADO_SEMILLA } from "../src/logica/grado.ts";
import { CATEGORIA_OTRO } from "../src/logica/clasificador.ts";

const RUTA_REGLAS = "data/crosssell_rules.json";
const RUTA_PROCESOS = "data/procesos.json";
const RUTA_SALIDA = "supabase/seed.sql";

interface Complemento {
  nombre: string;
  prioridad: string;
  motivo: string;
  familias: string[];
  depende_del_grado: boolean;
}

interface Reglas {
  categorias: Record<string, { etiqueta: string }>;
  aporte_por_grado: Record<string, { aporte: string; motivo: string }>;
  dominios: Array<{ id: string; nombre: string }>;
  tipos: Record<
    string,
    { dominio: string; nombre: string; pregunta_grado: boolean; complementos: Complemento[] }
  >;
  notas_por_dominio: Record<string, string[]>;
}

interface Procesos {
  procesos: Array<{
    codigo: string;
    nombre: string;
    grado_tipico: string;
    orden: number;
    categorias: string[];
  }>;
}

const reglas = JSON.parse(readFileSync(RUTA_REGLAS, "utf8")) as Reglas;
const procesos = (JSON.parse(readFileSync(RUTA_PROCESOS, "utf8")) as Procesos).procesos;

const txt = (v: string) => `'${v.replace(/'/g, "''")}'`;
const bool = (v: boolean) => (v ? "true" : "false");

/** Valida antes de generar: un seed que referencia algo inexistente falla recien en psql. */
function validar(): void {
  const categorias = new Set(Object.keys(reglas.categorias));
  const dominios = new Set(reglas.dominios.map((d) => d.id));
  const problemas: string[] = [];

  for (const [codigo, tipo] of Object.entries(reglas.tipos)) {
    if (!dominios.has(tipo.dominio)) problemas.push(`tipo ${codigo}: dominio ${tipo.dominio} no existe`);
    for (const c of tipo.complementos) {
      if (!["oblig", "reco", "opc"].includes(c.prioridad)) {
        problemas.push(`tipo ${codigo} / ${c.nombre}: prioridad "${c.prioridad}" invalida`);
      }
      for (const f of c.familias) {
        if (!categorias.has(f)) problemas.push(`tipo ${codigo} / ${c.nombre}: familia ${f} no existe`);
      }
    }
  }
  for (const d of Object.keys(reglas.notas_por_dominio)) {
    if (!dominios.has(d)) problemas.push(`nota: dominio ${d} no existe`);
  }
  for (const e of EQUIVALENCIAS_GRADO_SEMILLA) {
    if (!(e.familia in reglas.aporte_por_grado)) {
      problemas.push(`equivalencia ${e.grado}: la familia ${e.familia} no tiene aporte definido`);
    }
  }
  for (const p of procesos) {
    for (const c of p.categorias) {
      if (!categorias.has(c)) problemas.push(`proceso ${p.codigo}: categoria ${c} no existe`);
    }
  }
  if (problemas.length > 0) {
    console.error(`No se genero el seed. ${problemas.length} problema(s):`);
    for (const p of problemas) console.error(`  - ${p}`);
    process.exit(1);
  }
}

function generar(): string {
  const s: string[] = [];

  s.push(`-- ARCHIVO GENERADO. No editar a mano: se regenera con \`pnpm seed:generar\`.
-- Fuente: ${RUTA_REGLAS} y ${RUTA_PROCESOS}.
--
-- Todo va con ON CONFLICT DO NOTHING: el seed llena lo que falta y nunca pisa lo que
-- Oficina Tecnica edito. Para re-sincronizar una regla hay que borrar la fila primero.

begin;
`);

  // ── Dominios ──────────────────────────────────────────────────────────────────────
  s.push(`-- ${reglas.dominios.length} lineas de producto.
insert into dominio (codigo, nombre, orden) values`);
  s.push(
    reglas.dominios.map((d, i) => `  (${txt(d.id)}, ${txt(d.nombre)}, ${i + 1})`).join(",\n") +
      `\non conflict (codigo) do nothing;\n`,
  );

  // ── Categorias ────────────────────────────────────────────────────────────────────
  const categorias = Object.entries(reglas.categorias);
  s.push(`-- ${categorias.length} categorias funcionales.
insert into categoria (codigo, etiqueta) values`);
  s.push(
    categorias.map(([codigo, c]) => `  (${txt(codigo)}, ${txt(c.etiqueta)})`).join(",\n") +
      `\non conflict (codigo) do nothing;\n`,
  );

  s.push(`-- La categoria de descarte del clasificador. Inactiva: nunca se sugiere, pero tiene que
-- existir porque catalogo_item.categoria_codigo tiene FK contra categoria.codigo.
insert into categoria (codigo, etiqueta, activo)
values (${txt(CATEGORIA_OTRO)}, 'Sin clasificar', false)
on conflict (codigo) do nothing;
`);

  // ── Tipos de producto ─────────────────────────────────────────────────────────────
  const tipos = Object.entries(reglas.tipos);
  s.push(`-- ${tipos.length} disparadores de venta cruzada.
insert into tipo_producto (codigo, dominio_id, nombre, pregunta_grado, orden)
select v.codigo, d.id, v.nombre, v.pregunta_grado, v.orden
from (values`);
  s.push(
    tipos
      .map(
        ([codigo, t], i) =>
          `  (${txt(codigo)}, ${txt(t.dominio)}, ${txt(t.nombre)}, ${bool(t.pregunta_grado)}, ${i + 1})`,
      )
      .join(",\n") +
      `\n) as v(codigo, dominio, nombre, pregunta_grado, orden)
join dominio d on d.codigo = v.dominio
on conflict (codigo) do nothing;\n`,
  );

  // ── Complementos ──────────────────────────────────────────────────────────────────
  const complementos = tipos.flatMap(([codigoTipo, t]) =>
    t.complementos.map((c, i) => ({ tipo: codigoTipo, orden: i + 1, ...c })),
  );
  s.push(`-- ${complementos.length} complementos: la regla de venta cruzada propiamente dicha.
insert into complemento (tipo_producto_id, nombre, prioridad, motivo, depende_del_grado, orden)
select tp.id, v.nombre, v.prioridad::prioridad_complemento, v.motivo, v.depende_del_grado, v.orden
from (values`);
  s.push(
    complementos
      .map(
        (c) =>
          `  (${txt(c.tipo)}, ${txt(c.nombre)}, ${txt(c.prioridad)}, ${txt(c.motivo)}, ${bool(c.depende_del_grado)}, ${c.orden})`,
      )
      .join(",\n") +
      `\n) as v(tipo, nombre, prioridad, motivo, depende_del_grado, orden)
join tipo_producto tp on tp.codigo = v.tipo
on conflict (tipo_producto_id, nombre) do nothing;\n`,
  );

  // ── Familias de cada complemento ──────────────────────────────────────────────────
  const familias = complementos.flatMap((c) =>
    c.familias.map((f, i) => ({ tipo: c.tipo, complemento: c.nombre, categoria: f, orden: i + 1 })),
  );
  s.push(`-- ${familias.length} familias asociadas a los complementos.
insert into complemento_categoria (complemento_id, categoria_id, orden)
select c.id, cat.id, v.orden
from (values`);
  s.push(
    familias
      .map((f) => `  (${txt(f.tipo)}, ${txt(f.complemento)}, ${txt(f.categoria)}, ${f.orden})`)
      .join(",\n") +
      `\n) as v(tipo, complemento, categoria, orden)
join tipo_producto tp on tp.codigo = v.tipo
join complemento c on c.tipo_producto_id = tp.id and c.nombre = v.complemento
join categoria cat on cat.codigo = v.categoria
on conflict do nothing;\n`,
  );

  // ── Aporte por grado ──────────────────────────────────────────────────────────────
  s.push(`-- Aporte de soldadura por familia de grado.
insert into aporte_por_grado (grado, aporte, motivo) values`);
  s.push(
    Object.entries(reglas.aporte_por_grado)
      .map(([g, a]) => `  (${txt(g)}, ${txt(a.aporte)}, ${txt(a.motivo)})`)
      .join(",\n") + `\non conflict (grado) do nothing;\n`,
  );

  s.push(`-- La columna Calidad del catalogo trae 304L / 316L / 310S, no 304 / 316 / 310.
-- Sin este colapso el aporte no matchea justo en el caso mas comun.
insert into grado_equivalencia (grado, familia) values`);
  s.push(
    EQUIVALENCIAS_GRADO_SEMILLA.map((e) => `  (${txt(e.grado)}, ${txt(e.familia)})`).join(",\n") +
      `\non conflict (grado) do nothing;\n`,
  );

  // ── Notas por dominio ─────────────────────────────────────────────────────────────
  const notas = Object.entries(reglas.notas_por_dominio).flatMap(([dominio, textos]) =>
    textos.map((texto, i) => ({ dominio, texto, orden: i + 1 })),
  );
  s.push(`-- ${notas.length} notas tecnicas por linea de producto.
insert into nota_tecnica (ambito, ambito_id, texto, orden)
select 'dominio', d.id, v.texto, v.orden
from (values`);
  s.push(
    notas.map((n) => `  (${txt(n.dominio)}, ${txt(n.texto)}, ${n.orden})`).join(",\n") +
      `\n) as v(dominio, texto, orden)
join dominio d on d.codigo = v.dominio
where not exists (
  select 1 from nota_tecnica nt
  where nt.ambito = 'dominio' and nt.ambito_id = d.id and nt.texto = v.texto
);\n`,
  );

  // ── Procesos ──────────────────────────────────────────────────────────────────────
  s.push(`-- ${procesos.length} procesos (puerta B, pantalla en F2).
--
-- grado_tipico es BORRADOR: entra con revisado = false y motivo_grado vacio. La
-- justificacion tecnica del grado la escribe Oficina Tecnica; no se genera desde aca.
insert into proceso (codigo, nombre, grado_tipico, motivo_grado, revisado, orden) values`);
  s.push(
    procesos
      .map((p) => `  (${txt(p.codigo)}, ${txt(p.nombre)}, ${txt(p.grado_tipico)}, '', false, ${p.orden})`)
      .join(",\n") + `\non conflict (codigo) do nothing;\n`,
  );

  const procesoCategorias = procesos.flatMap((p) =>
    p.categorias.map((c, i) => ({ proceso: p.codigo, categoria: c, orden: i + 1 })),
  );
  s.push(`-- Familias tipicas de cada proceso. Todas entran como 'reco': el blueprint lista las
-- familias pero no su prioridad, y asignarla es parte de la revision de Oficina Tecnica.
insert into proceso_categoria (proceso_id, categoria_id, prioridad, orden)
select p.id, cat.id, 'reco'::prioridad_complemento, v.orden
from (values`);
  s.push(
    procesoCategorias
      .map((pc) => `  (${txt(pc.proceso)}, ${txt(pc.categoria)}, ${pc.orden})`)
      .join(",\n") +
      `\n) as v(proceso, categoria, orden)
join proceso p on p.codigo = v.proceso
join categoria cat on cat.codigo = v.categoria
on conflict (proceso_id, categoria_id) do nothing;\n`,
  );

  // ── Links ─────────────────────────────────────────────────────────────────────────
  s.push(`-- Una fila de link por categoria activa, vacia. Es lo que alimenta el reporte de
-- cobertura: sin filas, el panel no tendria que mostrar y no se sabria que falta cargar.
insert into link_categoria (categoria_id)
select id from categoria where activo
on conflict (categoria_id) do nothing;

commit;
`);

  return s.join("\n");
}

validar();
const contenido = generar();

if (process.argv.includes("--verificar")) {
  let actual = "";
  try {
    actual = readFileSync(RUTA_SALIDA, "utf8");
  } catch {
    console.error(`Falta ${RUTA_SALIDA}. Corre: pnpm seed:generar`);
    process.exit(1);
  }
  if (actual !== contenido) {
    console.error(`${RUTA_SALIDA} quedo desactualizado respecto de los JSON. Corre: pnpm seed:generar`);
    process.exit(1);
  }
  console.log(`OK  ${RUTA_SALIDA} esta al dia.`);
} else {
  writeFileSync(RUTA_SALIDA, contenido);
  console.log(`Escrito ${RUTA_SALIDA}`);
}
