-- 0004 — Procesos (puerta B).
--
-- Se siembran en F1 con la tabla de la seccion 7 del blueprint; la pantalla es F2.
--
-- El grado tipico es BORRADOR hasta que Oficina Tecnica lo firme: `revisado` arranca en
-- false y el panel muestra el aviso mientras siga asi. La app sugiere, el asesor decide.

create table proceso (
  id           uuid primary key default gen_random_uuid(),
  codigo       text not null unique,
  nombre       text not null,
  grado_tipico text not null default '',
  motivo_grado text not null default '',
  nota         text,
  revisado     boolean not null default false,
  revisado_por uuid references perfil (user_id) on delete set null,
  revisado_at  timestamptz,
  orden        integer not null default 0,
  constraint proceso_revisado_con_firma check (
    (revisado = false and revisado_por is null and revisado_at is null)
    or (revisado = true and revisado_por is not null and revisado_at is not null)
  )
);

comment on column proceso.grado_tipico is
  'Sugerencia, no recomendacion tecnica firme. Editable por el asesor en cada sesion.';
comment on column proceso.revisado is
  'False = borrador sin firmar por Oficina Tecnica. La UI avisa mientras este en false.';

create table proceso_categoria (
  id           uuid primary key default gen_random_uuid(),
  proceso_id   uuid not null references proceso (id) on delete cascade,
  categoria_id uuid not null references categoria (id) on delete restrict,
  prioridad    prioridad_complemento not null default 'reco',
  orden        integer not null default 0,
  unique (proceso_id, categoria_id)
);
