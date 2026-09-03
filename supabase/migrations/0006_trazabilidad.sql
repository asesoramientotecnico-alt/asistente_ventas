-- 0006 — Trazabilidad.
--
-- Cada sugerencia mostrada queda registrada con la regla que la disparo y con lo que el
-- asesor hizo con ella. El panel de metricas es F3, pero el esquema tiene que soportarlo
-- desde F1 o los datos de los primeros meses no existen.

create type puerta_sesion as enum ('producto', 'proceso', 'material');

create table sesion (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null references perfil (user_id) on delete cascade,
  puerta           puerta_sesion not null,
  tipo_producto_id uuid references tipo_producto (id) on delete set null,
  proceso_id       uuid references proceso (id) on delete set null,
  grado            text,
  derivada_a_ot    boolean not null default false,
  iniciada_at      timestamptz not null default now(),
  cerrada_at       timestamptz
);

comment on column sesion.grado is
  'Grado con el que la sesion termino trabajando, ya sea el sugerido o el que puso el asesor.';
comment on column sesion.derivada_a_ot is
  'El asesor marco el caso como critico y lo derivo a Oficina Tecnica.';

create index sesion_usuario on sesion (usuario_id, iniciada_at desc);

create table sesion_sugerencia (
  id                   uuid primary key default gen_random_uuid(),
  sesion_id            uuid not null references sesion (id) on delete cascade,
  complemento_id       uuid references complemento (id) on delete set null,
  proceso_categoria_id uuid references proceso_categoria (id) on delete set null,
  categoria_id         uuid not null references categoria (id) on delete restrict,
  prioridad            prioridad_complemento not null,
  aceptada             boolean not null default false,
  generado_link        boolean not null default false,
  mostrada_at          timestamptz not null default now(),
  -- Una sugerencia viene de una regla de complemento o de una de proceso, no de las dos.
  -- Las dos en null es valido: la puerta por material sugiere formatos sin regla previa.
  constraint sesion_sugerencia_una_regla
    check (num_nonnulls(complemento_id, proceso_categoria_id) <= 1)
);

comment on column sesion_sugerencia.aceptada is
  'El asesor la dejo marcada al confirmar el carrito. Es lo que despues dice que regla no sirve.';
comment on column sesion_sugerencia.generado_link is
  'Se llego a generar el link al ecommerce para esta familia.';

create index sesion_sugerencia_sesion on sesion_sugerencia (sesion_id);
create index sesion_sugerencia_complemento on sesion_sugerencia (complemento_id) where complemento_id is not null;
create index sesion_sugerencia_categoria on sesion_sugerencia (categoria_id);
