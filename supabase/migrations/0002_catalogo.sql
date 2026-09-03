-- 0002 — Catalogo importado.
--
-- Cada import es un batch completo: el catalogo no se actualiza fila por fila, se reemplaza.
-- Solo un batch esta activo a la vez y el anterior se conserva para poder volver atras.

create type estado_batch as enum ('pendiente', 'validado', 'activo', 'descartado');

create table import_batch (
  id              uuid primary key default gen_random_uuid(),
  archivo         text not null,
  archivo_storage text,
  subido_por      uuid references perfil (user_id) on delete set null,
  subido_at       timestamptz not null default now(),
  filas           integer not null default 0,
  filas_otro      integer not null default 0,
  layout_hash     text not null,
  estado          estado_batch not null default 'pendiente',
  activado_at     timestamptz,
  nota            text,
  constraint import_batch_filas_no_negativas check (filas >= 0 and filas_otro >= 0),
  constraint import_batch_otro_no_supera_filas check (filas_otro <= filas)
);

comment on column import_batch.layout_hash is
  'SHA-256 sobre la lista ORDENADA de headers normalizados. Un hash sobre un conjunto no ordenado no detectaria un reordenamiento de columnas, que es justo lo que corre los datos.';
comment on column import_batch.filas_otro is
  'Filas que cayeron en la categoria de descarte. Si sube respecto al import anterior, el catalogo cambio y hay que revisar el clasificador.';
comment on column import_batch.archivo_storage is
  'Ruta del Excel original en Supabase Storage. Se guarda para auditoria del import.';

-- Un solo batch activo, garantizado por la base y no por la aplicacion.
create unique index import_batch_unico_activo
  on import_batch ((estado))
  where estado = 'activo';

create index import_batch_subido_at on import_batch (subido_at desc);

create table catalogo_item (
  id               bigint generated always as identity primary key,
  import_batch_id  uuid not null references import_batch (id) on delete cascade,

  material_id      text not null,
  descripcion      text not null default '',

  negocio          text not null default '',
  familia          text not null default '',
  tipo             text not null default '',
  calidad          text not null default '',
  norma            text not null default '',

  -- Dimensiones: se importan aunque F1 todavia no las use.
  acabado          text,
  diametro         text,
  espesor          text,
  rosca            text,
  schedule         text,
  serie            text,
  tipojunta        text,

  -- Derivados en la importacion por src/logica/clasificador.ts y src/logica/grado.ts.
  categoria_codigo text not null,
  grado_norm       text
);

comment on column catalogo_item.categoria_codigo is
  'Salida del clasificador. La FK contra categoria.codigo se agrega en 0003.';

create unique index catalogo_item_material_por_batch
  on catalogo_item (import_batch_id, material_id);

create index catalogo_item_categoria on catalogo_item (import_batch_id, categoria_codigo);
create index catalogo_item_grado on catalogo_item (import_batch_id, grado_norm);
create index catalogo_item_negocio on catalogo_item (import_batch_id, negocio);

-- Id del batch activo. Se usa en las vistas de 0007 y en las consultas de la app.
create function batch_activo() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.import_batch where estado = 'activo' limit 1;
$$;
