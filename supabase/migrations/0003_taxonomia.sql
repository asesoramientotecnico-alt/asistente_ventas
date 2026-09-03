-- 0003 — Taxonomia y reglas de venta cruzada.
--
-- Esto es lo que Oficina Tecnica edita sin redeploy. Se siembra desde
-- data/crosssell_rules.json: 9 dominios, 69 categorias, 27 tipos y sus complementos.
--
-- Las claves naturales (`codigo`) son unicas porque el seed es idempotente: corre contra
-- una base ya poblada sin duplicar nada.

create type prioridad_complemento as enum ('oblig', 'reco', 'opc');

-- Las 9 lineas de producto.
create table dominio (
  id     uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  icono  text,
  orden  integer not null default 0
);

-- Las 69 categorias funcionales, mas 'otro' como categoria de descarte inactiva.
create table categoria (
  id       uuid primary key default gen_random_uuid(),
  codigo   text not null unique,
  etiqueta text not null,
  activo   boolean not null default true
);

comment on column categoria.activo is
  'Una categoria inactiva nunca se sugiere. La categoria de descarte del clasificador entra aca con activo = false.';

-- El conteo de items NO se guarda: se calcula contra catalogo_item del batch activo
-- (ver v_conteo_categoria en 0007). Un total persistido envejece con el primer import.

-- Los 27 disparadores: lo que el cliente pide.
create table tipo_producto (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique,
  dominio_id     uuid not null references dominio (id) on delete restrict,
  nombre         text not null,
  pregunta_grado boolean not null default false,
  orden          integer not null default 0
);

-- La regla de venta cruzada.
create table complemento (
  id                uuid primary key default gen_random_uuid(),
  tipo_producto_id  uuid not null references tipo_producto (id) on delete cascade,
  nombre            text not null,
  prioridad         prioridad_complemento not null,
  motivo            text not null default '',
  depende_del_grado boolean not null default false,
  orden             integer not null default 0,
  unique (tipo_producto_id, nombre)
);

comment on column complemento.motivo is
  'El "por que" que el asesor le repite al cliente. No es decorativo.';

create table complemento_categoria (
  complemento_id uuid not null references complemento (id) on delete cascade,
  categoria_id   uuid not null references categoria (id) on delete restrict,
  orden          integer not null default 0,
  primary key (complemento_id, categoria_id)
);

-- Aporte de soldadura por familia de grado.
create table aporte_por_grado (
  grado  text primary key,
  aporte text not null,
  motivo text not null
);

comment on table aporte_por_grado is
  'Indexada por familia de grado (304, 316, 310), no por la calidad literal del catalogo.';

-- La columna Calidad del catalogo trae 304L / 316L / 310S en la mayoria de las filas.
-- Sin este colapso, aporte_por_grado no matchea y el asesor ve el motivo generico
-- justo en el caso mas comun. Es tabla y no codigo para que Oficina Tecnica la amplie.
create table grado_equivalencia (
  grado   text primary key,
  familia text not null references aporte_por_grado (grado) on delete cascade
);

create index grado_equivalencia_familia on grado_equivalencia (familia);

-- Notas tecnicas por ambito. La referencia es polimorfica: la valida el seed, no una FK.
create table nota_tecnica (
  id        uuid primary key default gen_random_uuid(),
  ambito    text not null check (ambito in ('dominio', 'proceso', 'tipo')),
  ambito_id uuid not null,
  texto     text not null,
  orden     integer not null default 0
);

create index nota_tecnica_ambito on nota_tecnica (ambito, ambito_id);

-- Recien ahora existe `categoria`: el catalogo no puede quedar con una categoria que la
-- taxonomia desconozca. Si el clasificador empieza a devolver un codigo nuevo, el import
-- falla en vez de dejar filas huerfanas.
alter table catalogo_item
  add constraint catalogo_item_categoria_fk
  foreign key (categoria_codigo) references categoria (codigo) on update cascade;
