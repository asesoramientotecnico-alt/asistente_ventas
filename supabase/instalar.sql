-- ARCHIVO GENERADO. No editar a mano: se regenera con `pnpm instalador:generar`.
--
-- Puesta en marcha de un proyecto de Supabase desde cero, para pegar en el editor SQL
-- del panel. Contiene las 13 migraciones en orden mas el seed.
--
-- Es idempotente en el seed (on conflict do nothing) pero NO en las migraciones: si se
-- corre dos veces, la segunda falla en el primer `create type`. Eso es a proposito —
-- avisa que el esquema ya estaba aplicado en vez de dejarlo a medias.
--
-- Despues de correrlo, en orden:
--   1. Authentication > URL Configuration: Site URL y la Redirect URL /auth/callback.
--   2. Entrar a la app una vez con el correo de Famiq, para que se cree el usuario.
--   3. Volver aca y promoverse a admin:
--        update perfil set rol = 'admin'
--        where user_id = (select id from auth.users where email = 'tu@famiq.com.ar');
--   4. Importar el Excel del catalogo desde /admin/import.


-- ═══════════════════════════════════════════════════════════════════════════════
-- 0001_perfil.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- 0001 — Usuarios y roles.
--
-- El alta la dispara Supabase Auth: cada usuario de auth.users recibe un perfil con rol
-- 'asesor'. La promocion a 'oficina_tecnica' o 'admin' la hace un admin, nunca el propio
-- usuario (ver el trigger de mas abajo y las politicas de 0008).

create type rol_usuario as enum ('asesor', 'oficina_tecnica', 'admin');

create table perfil (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  nombre         text not null default '',
  sucursal       text,
  rol            rol_usuario not null default 'asesor',
  creado_at      timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

comment on table perfil is 'Datos del asesor. El rol determina que puede leer y escribir (ver 0008).';

-- Utilitario reusado por el resto de las tablas con actualizado_at.
create function tocar_actualizado_at() returns trigger
language plpgsql as $$
begin
  new.actualizado_at := now();
  return new;
end;
$$;

create trigger perfil_tocar_actualizado_at
  before update on perfil
  for each row execute function tocar_actualizado_at();

-- Alta automatica del perfil, restringida al dominio corporativo.
-- Si Famiq suma otro dominio de mail, se cambia aca y queda versionado.
create function crear_perfil_para_usuario() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  dominio_permitido constant text := '@famiq.com.ar';
begin
  if new.email is null or right(lower(new.email), length(dominio_permitido)) <> dominio_permitido then
    raise exception 'Solo se permiten cuentas del dominio %', dominio_permitido
      using errcode = 'check_violation';
  end if;

  insert into public.perfil (user_id, nombre)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nombre', ''), split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function crear_perfil_para_usuario();

-- El rol solo lo cambia un admin. Un asesor puede editar su nombre y su sucursal.
--
-- Cuando auth.uid() es null no hay usuario autenticado: es el service_role, una migracion
-- o el editor SQL de Supabase. Ahi el cambio se permite, y es la unica forma de crear el
-- primer admin — si no, promover requeriria ser admin y nadie lo seria nunca.
create function proteger_rol() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and new.rol is distinct from old.rol
     and not exists (
       select 1 from public.perfil p
       where p.user_id = auth.uid() and p.rol = 'admin'
     )
  then
    new.rol := old.rol;
  end if;
  return new;
end;
$$;

create trigger perfil_proteger_rol
  before update on perfil
  for each row execute function proteger_rol();

-- Helpers para las politicas de RLS. Son security definer para poder leer `perfil`
-- sin quedar atrapados en la politica de la propia tabla.
create function rol_actual() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from public.perfil where user_id = auth.uid();
$$;

create function es_oficina_tecnica() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(rol_actual() in ('oficina_tecnica', 'admin'), false);
$$;

create function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(rol_actual() = 'admin', false);
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0002_catalogo.sql
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0003_taxonomia.sql
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0004_procesos.sql
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0005_links.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- 0005 — Resolucion de links al ecommerce.
--
-- Cero URLs en el codigo. La resolucion es: url_fija -> plantilla de busqueda con
-- terminos_busqueda -> plantilla con la etiqueta de la categoria.
--
-- Todavia no sabemos como esta armado famiq.com.ar. Por eso la config arranca vacia:
-- mientras no haya base_url, la app no genera links en vez de generar links rotos.

create table link_categoria (
  categoria_id      uuid primary key references categoria (id) on delete cascade,
  url_fija          text,
  terminos_busqueda text,
  actualizado_at    timestamptz not null default now(),
  actualizado_por   uuid references perfil (user_id) on delete set null,
  constraint link_categoria_url_absoluta check (url_fija is null or url_fija ~ '^https?://')
);

create trigger link_categoria_tocar_actualizado_at
  before update on link_categoria
  for each row execute function tocar_actualizado_at();

create table config (
  clave          text primary key,
  valor          text not null default '',
  descripcion    text,
  actualizado_at timestamptz not null default now()
);

create trigger config_tocar_actualizado_at
  before update on config
  for each row execute function tocar_actualizado_at();

insert into config (clave, valor, descripcion) values
  ('ecommerce_base_url', '',
   'Base del ecommerce, sin barra final. Ej: https://www.famiq.com.ar'),
  ('ecommerce_search_template', '',
   'Plantilla de busqueda con los marcadores {base} y {q}. Ej: {base}/buscar?q={q}');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0006_trazabilidad.sql
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0007_vistas.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- 0007 — Vistas de consulta.
--
-- Todas con security_invoker: la vista se evalua con los permisos del usuario que
-- consulta, no con los del dueño. Sin eso, una vista se saltea el RLS de 0008.

-- El batch vigente. Una fila o ninguna.
create view v_batch_activo
with (security_invoker = true) as
select id, archivo, subido_at, activado_at, filas, filas_otro, layout_hash
from import_batch
where estado = 'activo';

-- Items por categoria en el batch activo. Es la fuente del conteo que ve el asesor:
-- un total persistido en la taxonomia envejeceria con el primer import.
create view v_conteo_categoria
with (security_invoker = true) as
select
  c.id           as categoria_id,
  c.codigo,
  c.etiqueta,
  c.activo,
  count(ci.id)   as items
from categoria c
left join catalogo_item ci
  on ci.categoria_codigo = c.codigo
 and ci.import_batch_id = batch_activo()
group by c.id, c.codigo, c.etiqueta, c.activo;

-- Invariante 1: nunca sugerir una familia que no este en el catalogo con items > 0.
-- Lista las categorias que alguna regla referencia y que quedaron vacias en el batch
-- activo. La app no las muestra; este reporte es para que Oficina Tecnica las vea.
create view v_familias_vacias
with (security_invoker = true) as
select
  vc.categoria_id,
  vc.codigo,
  vc.etiqueta,
  vc.items,
  exists (select 1 from complemento_categoria cc where cc.categoria_id = vc.categoria_id) as usada_en_complementos,
  exists (select 1 from proceso_categoria pc where pc.categoria_id = vc.categoria_id)     as usada_en_procesos
from v_conteo_categoria vc
where vc.items = 0
  and vc.activo
  and (
    exists (select 1 from complemento_categoria cc where cc.categoria_id = vc.categoria_id)
    or exists (select 1 from proceso_categoria pc where pc.categoria_id = vc.categoria_id)
  );

-- Cobertura de links: que familias resuelven por URL propia y cuales caen al fallback de
-- busqueda. Es lo que dice que cargar cuando se revise el sitio.
create view v_cobertura_links
with (security_invoker = true) as
select
  c.id       as categoria_id,
  c.codigo,
  c.etiqueta,
  lc.url_fija,
  lc.terminos_busqueda,
  case
    when lc.url_fija is not null                then 'url_fija'
    when nullif(lc.terminos_busqueda, '') is not null then 'busqueda_con_terminos'
    else 'busqueda_por_etiqueta'
  end as resolucion
from categoria c
left join link_categoria lc on lc.categoria_id = c.id
where c.activo;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0008_rls.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- 0008 — Row Level Security.
--
-- Va al final a proposito: se escribe sobre un esquema ya completo y queda en un solo
-- archivo auditable, en vez de repartida en siete.
--
-- Regla general:
--   * Cualquier usuario autenticado LEE taxonomia, catalogo, links y config.
--   * `oficina_tecnica` y `admin` ESCRIBEN reglas, procesos, links, config e imports.
--   * `admin` ademas gestiona perfiles y roles.
--   * Cada asesor escribe y lee sus propias sesiones; `oficina_tecnica` y `admin` leen todas.
--
-- El rol `anon` no tiene ninguna politica: sin sesion no se lee nada.
--
-- Nota sobre imports: la seccion 3 del blueprint dice que los gestiona `admin`, pero la 1
-- y la 6 dicen que la carga periodica del Excel la hace Oficina Tecnica y que el panel de
-- import es de `oficina_tecnica` / `admin`. Se resolvio por las dos ultimas: importa
-- Oficina Tecnica. Lo exclusivo de `admin` queda en usuarios y roles.

alter table perfil                enable row level security;
alter table import_batch          enable row level security;
alter table catalogo_item         enable row level security;
alter table dominio               enable row level security;
alter table categoria             enable row level security;
alter table tipo_producto         enable row level security;
alter table complemento           enable row level security;
alter table complemento_categoria enable row level security;
alter table aporte_por_grado      enable row level security;
alter table grado_equivalencia    enable row level security;
alter table nota_tecnica          enable row level security;
alter table proceso               enable row level security;
alter table proceso_categoria     enable row level security;
alter table link_categoria        enable row level security;
alter table config                enable row level security;
alter table sesion                enable row level security;
alter table sesion_sugerencia     enable row level security;


-- ── Perfiles ────────────────────────────────────────────────────────────────────────
create policy perfil_lee_propio on perfil
  for select to authenticated using (user_id = auth.uid());

create policy perfil_lee_equipo on perfil
  for select to authenticated using (es_oficina_tecnica());

-- El cambio de rol lo bloquea el trigger proteger_rol de 0001, no esta politica.
create policy perfil_edita_propio on perfil
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy perfil_admin on perfil
  for all to authenticated using (es_admin()) with check (es_admin());


-- ── Catalogo ────────────────────────────────────────────────────────────────────────
create policy import_batch_lee on import_batch
  for select to authenticated using (true);

create policy import_batch_escribe_ot on import_batch
  for all to authenticated using (es_oficina_tecnica()) with check (es_oficina_tecnica());

create policy catalogo_item_lee on catalogo_item
  for select to authenticated using (true);

create policy catalogo_item_escribe_ot on catalogo_item
  for all to authenticated using (es_oficina_tecnica()) with check (es_oficina_tecnica());


-- ── Taxonomia y reglas ──────────────────────────────────────────────────────────────
create policy dominio_lee on dominio
  for select to authenticated using (true);
create policy dominio_escribe_ot on dominio
  for all to authenticated using (es_oficina_tecnica()) with check (es_oficina_tecnica());

create policy categoria_lee on categoria
  for select to authenticated using (true);
create policy categoria_escribe_ot on categoria
  for all to authenticated using (es_oficina_tecnica()) with check (es_oficina_tecnica());

create policy tipo_producto_lee on tipo_producto
  for select to authenticated using (true);
create policy tipo_producto_escribe_ot on tipo_producto
  for all to authenticated using (es_oficina_tecnica()) with check (es_oficina_tecnica());

create policy complemento_lee on complemento
  for select to authenticated using (true);
create policy complemento_escribe_ot on complemento
  for all to authenticated using (es_oficina_tecnica()) with check (es_oficina_tecnica());

create policy complemento_categoria_lee on complemento_categoria
  for select to authenticated using (true);
create policy complemento_categoria_escribe_ot on complemento_categoria
  for all to authenticated using (es_oficina_tecnica()) with check (es_oficina_tecnica());

create policy aporte_por_grado_lee on aporte_por_grado
  for select to authenticated using (true);
create policy aporte_por_grado_escribe_ot on aporte_por_grado
  for all to authenticated using (es_oficina_tecnica()) with check (es_oficina_tecnica());

create policy grado_equivalencia_lee on grado_equivalencia
  for select to authenticated using (true);
create policy grado_equivalencia_escribe_ot on grado_equivalencia
  for all to authenticated using (es_oficina_tecnica()) with check (es_oficina_tecnica());

create policy nota_tecnica_lee on nota_tecnica
  for select to authenticated using (true);
create policy nota_tecnica_escribe_ot on nota_tecnica
  for all to authenticated using (es_oficina_tecnica()) with check (es_oficina_tecnica());


-- ── Procesos ────────────────────────────────────────────────────────────────────────
create policy proceso_lee on proceso
  for select to authenticated using (true);
create policy proceso_escribe_ot on proceso
  for all to authenticated using (es_oficina_tecnica()) with check (es_oficina_tecnica());

create policy proceso_categoria_lee on proceso_categoria
  for select to authenticated using (true);
create policy proceso_categoria_escribe_ot on proceso_categoria
  for all to authenticated using (es_oficina_tecnica()) with check (es_oficina_tecnica());


-- ── Links y configuracion ───────────────────────────────────────────────────────────
create policy link_categoria_lee on link_categoria
  for select to authenticated using (true);
create policy link_categoria_escribe_ot on link_categoria
  for all to authenticated using (es_oficina_tecnica()) with check (es_oficina_tecnica());

create policy config_lee on config
  for select to authenticated using (true);
create policy config_escribe_ot on config
  for all to authenticated using (es_oficina_tecnica()) with check (es_oficina_tecnica());


-- ── Trazabilidad ────────────────────────────────────────────────────────────────────
create policy sesion_propia on sesion
  for all to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create policy sesion_lee_equipo on sesion
  for select to authenticated using (es_oficina_tecnica());

create policy sesion_sugerencia_propia on sesion_sugerencia
  for all to authenticated
  using (exists (select 1 from sesion s where s.id = sesion_id and s.usuario_id = auth.uid()))
  with check (exists (select 1 from sesion s where s.id = sesion_id and s.usuario_id = auth.uid()));

create policy sesion_sugerencia_lee_equipo on sesion_sugerencia
  for select to authenticated using (es_oficina_tecnica());

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0009_importacion.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- 0009 — Activacion de batch y headers del import.
--
-- Guardar los headers, y no solo su hash, es lo que permite mostrarle a Oficina Tecnica
-- QUE cambio en el layout. Con el hash solo se puede decir que cambio algo.

alter table import_batch add column headers jsonb not null default '[]'::jsonb;

comment on column import_batch.headers is
  'Los headers del archivo, en orden. El diff del proximo import se calcula contra los del ultimo batch activo.';

-- Activar un batch y descartar el anterior tienen que pasar juntos: el indice unico
-- parcial de 0002 rechaza cualquier instante con dos batches activos. Adentro de una
-- funcion son una sola transaccion.
--
-- Volver atras es la misma operacion sobre el batch anterior, no una funcion aparte.
create function activar_batch(p_batch uuid) returns void
language plpgsql
security invoker
set search_path = public as $$
declare
  filas_afectadas integer;
begin
  -- Con auth.uid() nulo esto corre desde una migracion o el editor SQL, no desde la app.
  if auth.uid() is not null and not es_oficina_tecnica() then
    raise exception 'Solo Oficina Tecnica puede activar un batch de catalogo'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from import_batch where id = p_batch) then
    raise exception 'El batch % no existe', p_batch using errcode = 'no_data_found';
  end if;

  update import_batch set estado = 'descartado' where estado = 'activo' and id <> p_batch;

  update import_batch
  set estado = 'activo', activado_at = now()
  where id = p_batch;

  get diagnostics filas_afectadas = row_count;
  if filas_afectadas <> 1 then
    raise exception 'No se pudo activar el batch %', p_batch using errcode = 'insufficient_privilege';
  end if;
end;
$$;

comment on function activar_batch is
  'Activa un batch y descarta el que estaba activo, en una sola transaccion. Volver atras es llamarla con el batch anterior.';

-- Conteo por categoria de un batch cualquiera, no solo del activo. Es lo que permite
-- comparar un import nuevo contra el anterior antes de activarlo.
create function conteo_por_categoria(p_batch uuid)
returns table (categoria_codigo text, items bigint)
language sql
stable
security invoker
set search_path = public as $$
  select ci.categoria_codigo, count(*)::bigint
  from catalogo_item ci
  where ci.import_batch_id = p_batch
  group by ci.categoria_codigo;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0010_storage.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- 0010 — Bucket del catalogo.
--
-- El Excel original se guarda para auditoria: permite reconstruir un import viejo o
-- volver a correr el clasificador sobre el archivo que le dio origen.
--
-- Bucket privado. Solo Oficina Tecnica sube y lee.

insert into storage.buckets (id, name, public)
values ('catalogo', 'catalogo', false)
on conflict (id) do nothing;

create policy catalogo_lee_ot on storage.objects
  for select to authenticated
  using (bucket_id = 'catalogo' and es_oficina_tecnica());

create policy catalogo_sube_ot on storage.objects
  for insert to authenticated
  with check (bucket_id = 'catalogo' and es_oficina_tecnica());

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0011_grados_disponibles.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- 0011 — Grados presentes en el catalogo para una familia.
--
-- Alimenta el selector de grado de la puerta por producto. No es una lista fija en el
-- codigo: son los grados que realmente estan en el batch activo. Si el catalogo no tiene
-- 310 en caños, el asesor no lo puede elegir.
--
-- Va como funcion y no como consulta desde la app para no traer miles de filas al
-- navegador solo para sacarles los valores distintos.
create function grados_de_categoria(p_categoria text)
returns table (grado text, items bigint)
language sql
stable
security invoker
set search_path = public as $$
  select ci.grado_norm, count(*)::bigint
  from catalogo_item ci
  where ci.import_batch_id = batch_activo()
    and ci.categoria_codigo = p_categoria
    and ci.grado_norm is not null
  group by ci.grado_norm
  order by count(*) desc, ci.grado_norm;
$$;

comment on function grados_de_categoria is
  'Grados con items en el batch activo para una familia. La app sugiere el tipico; el asesor elige de esta lista.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0012_trazabilidad.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- 0012 — Registro de sugerencias.
--
-- Crear la sesion y sus sugerencias tiene que pasar junto: una sesion sin sugerencias no
-- dice nada y una sugerencia sin sesion no se puede atribuir.
--
-- Devuelve la clave de cada sugerencia con su id, para que la pantalla pueda despues
-- marcar cuales llegaron a generar un link.
--
-- security invoker: escribe como el asesor y pasa por las politicas de 0008. Un asesor no
-- puede registrar una sesion a nombre de otro.
create function registrar_sugerencias(
  p_puerta puerta_sesion,
  p_tipo text,
  p_grado text,
  p_sugerencias jsonb
) returns table (clave text, sugerencia_id uuid)
language plpgsql
security invoker
set search_path = public as $$
declare
  v_sesion    uuid;
  v_tipo      uuid;
  v_categoria uuid;
  v_id        uuid;
  s           jsonb;
begin
  if auth.uid() is null then
    raise exception 'Hay que tener sesion iniciada para registrar sugerencias'
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_tipo from tipo_producto where codigo = p_tipo;

  insert into sesion (usuario_id, puerta, tipo_producto_id, grado)
  values (auth.uid(), p_puerta, v_tipo, nullif(p_grado, ''))
  returning id into v_sesion;

  for s in select * from jsonb_array_elements(p_sugerencias) loop
    select id into v_categoria from categoria where codigo = s ->> 'categoria';
    if v_categoria is null then
      continue;  -- una familia que ya no existe no invalida el resto del registro
    end if;

    insert into sesion_sugerencia (
      sesion_id, complemento_id, categoria_id, prioridad, aceptada
    ) values (
      v_sesion,
      nullif(s ->> 'complemento_id', '')::uuid,
      v_categoria,
      (s ->> 'prioridad')::prioridad_complemento,
      coalesce((s ->> 'aceptada')::boolean, false)
    )
    returning id into v_id;

    clave := s ->> 'clave';
    sugerencia_id := v_id;
    return next;
  end loop;
end;
$$;

comment on function registrar_sugerencias is
  'Registra una consulta y todas las sugerencias que se le mostraron al asesor, marcando cuales acepto. Base de las metricas de F3.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0013_motivos_aporte.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- 0013 — Los motivos del aporte dejan de repetir el nombre del aporte.
--
-- La pantalla ahora muestra el aporte como etiqueta al lado del complemento ("Aporte
-- 316L"), asi que el motivo ya no tiene que nombrarlo: quedaba "Aporte 316L · Aporte 316L
-- para conservar el molibdeno...". Pasaba con los tres grados.
--
-- El contenido tecnico se preserva palabra por palabra; se saca solo la mencion repetida.
--
-- El seed entra con `on conflict do nothing`, con lo cual en un proyecto ya sembrado no
-- alcanza con regenerarlo: hace falta este UPDATE.
--
-- Cada UPDATE esta condicionado al texto viejo EXACTO. Si Oficina Tecnica ya edito ese
-- motivo, la condicion no matchea y su version queda intacta: una migracion no tiene por
-- que pisar una decision tecnica de otro.

update aporte_por_grado
set motivo = 'Sobre-aleado: compensa la dilución; es el estándar de los austeníticos 18/8.'
where grado = '304'
  and motivo = '308L sobre-aleado: compensa la dilución; aporte estándar de austeníticos 18/8.';

update aporte_por_grado
set motivo = '25/20: mantiene el alto Cr/Ni y la resistencia en caliente.'
where grado = '310'
  and motivo = 'Aporte 310 (25/20) para mantener el alto Cr/Ni y la resistencia en caliente.';

update aporte_por_grado
set motivo = 'Conserva el molibdeno y la resistencia al picado por cloruros.'
where grado = '316'
  and motivo = 'Aporte 316L para conservar el molibdeno y la resistencia al picado por cloruros.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- seed.sql — taxonomia, reglas y procesos
-- ═══════════════════════════════════════════════════════════════════════════════

-- ARCHIVO GENERADO. No editar a mano: se regenera con `pnpm seed:generar`.
-- Fuente: data/crosssell_rules.json y data/procesos.json.
--
-- Todo va con ON CONFLICT DO NOTHING: el seed llena lo que falta y nunca pisa lo que
-- Oficina Tecnica edito. Para re-sincronizar una regla hay que borrar la fila primero.

begin;

-- 9 lineas de producto.
insert into dominio (codigo, nombre, orden) values
  ('tuberia', 'Tubería de proceso industrial', 1),
  ('sanitario', 'Línea sanitaria / alimenticia', 2),
  ('materiaprima', 'Materia prima', 3),
  ('tapas', 'Tapas y puertas de tanque', 4),
  ('bulones', 'Bulonería y fijación', 5),
  ('arquitectura', 'Línea arquitectura', 6),
  ('soldadura', 'Consumibles de soldadura', 7),
  ('abrasivos', 'Abrasivos y acabado', 8),
  ('quimica', 'Auxiliares y química', 9)
on conflict (codigo) do nothing;

-- 69 categorias funcionales.
insert into categoria (codigo, etiqueta) values
  ('cano', 'Caños / tubos'),
  ('tubo', 'Tubos'),
  ('acc_soldar_ind', 'Accesorios para soldar (industriales)'),
  ('acc_soldar_san', 'Accesorios sanitarios para soldar'),
  ('brida', 'Bridas'),
  ('niple', 'Niples'),
  ('acc_rosc_sw', 'Accesorios roscados / socket weld'),
  ('valvula_ind', 'Válvulas industriales'),
  ('valvula_san', 'Válvulas sanitarias'),
  ('acc_valvula_san', 'Repuestos de válvula sanitaria'),
  ('actuador', 'Actuadores'),
  ('union_sanitaria', 'Uniones sanitarias'),
  ('bomba', 'Bombas'),
  ('acc_bomba', 'Repuestos de bomba'),
  ('instrumentacion', 'Instrumentación'),
  ('acc_tanque', 'Accesorios de tanque'),
  ('sistema_limpieza', 'Sistema de limpieza (spray ball)'),
  ('tapa_puerta', 'Tapas y puertas'),
  ('acc_tapa', 'Herrajes de tapa'),
  ('mirilla', 'Mirillas'),
  ('soporte_san', 'Soportes sanitarios'),
  ('filtro_san', 'Filtros sanitarios'),
  ('filtro_ind', 'Filtros industriales'),
  ('acople_rapido', 'Acoples rápidos'),
  ('junta', 'Juntas / gaskets'),
  ('chapa', 'Chapas / bobinas'),
  ('barra', 'Barras'),
  ('planchuela', 'Planchuelas'),
  ('angulo', 'Ángulos'),
  ('otra_mp', 'Otras materias primas'),
  ('bulon', 'Tornillos / bulones'),
  ('tuerca', 'Tuercas'),
  ('arandela', 'Arandelas'),
  ('varilla_roscada', 'Varillas roscadas / espárragos'),
  ('abrazadera', 'Abrazaderas'),
  ('remache', 'Remaches'),
  ('cable', 'Cables'),
  ('baranda', 'Barandas / pasamanos'),
  ('griferia', 'Grifería'),
  ('acc_vidrio', 'Accesorios para vidrio'),
  ('herraje_arq', 'Herrajes de arquitectura'),
  ('acc_bano', 'Accesorios de baño'),
  ('arq_otro', 'Otros de arquitectura'),
  ('broca', 'Brocas'),
  ('varilla_tig', 'Varilla TIG'),
  ('alambre_mig', 'Alambre MIG'),
  ('electrodo_revestido', 'Electrodo revestido'),
  ('tungsteno', 'Electrodo de tungsteno'),
  ('combo', 'Combos de consumibles'),
  ('disco_corte', 'Discos de corte'),
  ('flap', 'Discos flap'),
  ('lija', 'Lijas'),
  ('acabado', 'Vellón / acabado'),
  ('cepillo', 'Cepillos / cardas'),
  ('pulido', 'Pasta de pulido'),
  ('banda', 'Bandas'),
  ('fresa', 'Fresas'),
  ('decapante', 'Decapante'),
  ('pasivante', 'Pasivante'),
  ('neutralizante', 'Neutralizante'),
  ('limpieza', 'Limpiadores'),
  ('revestimiento', 'Revestimiento protector'),
  ('respaldo', 'Respaldo de raíz (pasta cerámica)'),
  ('antiproyecciones', 'Antiproyecciones'),
  ('detector', 'Detector ferrita/molibdeno'),
  ('ndt', 'Tinta penetrante (END)'),
  ('sellador_rosca', 'Sellador / fijador / antigripante de rosca'),
  ('adhesivo_montaje', 'Adhesivos / selladores de montaje'),
  ('lubricante', 'Lubricantes')
on conflict (codigo) do nothing;

-- La categoria de descarte del clasificador. Inactiva: nunca se sugiere, pero tiene que
-- existir porque catalogo_item.categoria_codigo tiene FK contra categoria.codigo.
insert into categoria (codigo, etiqueta, activo)
values ('otro', 'Sin clasificar', false)
on conflict (codigo) do nothing;

-- 27 disparadores de venta cruzada.
insert into tipo_producto (codigo, dominio_id, nombre, pregunta_grado, orden)
select v.codigo, d.id, v.nombre, v.pregunta_grado, v.orden
from (values
  ('cano', 'tuberia', 'Caño / tubo de proceso', true, 1),
  ('acc_soldar_ind', 'tuberia', 'Accesorio para soldar (codo/tee/reducción)', true, 2),
  ('brida', 'tuberia', 'Brida', false, 3),
  ('niple', 'tuberia', 'Niple / medio niple', false, 4),
  ('acc_rosc_sw', 'tuberia', 'Accesorio roscado / socket weld', false, 5),
  ('valvula_ind', 'tuberia', 'Válvula industrial', false, 6),
  ('union_sanitaria', 'sanitario', 'Unión sanitaria (Clamp/SMS/DIN)', false, 7),
  ('acc_soldar_san', 'sanitario', 'Accesorio sanitario para soldar (incl. pharma)', true, 8),
  ('valvula_san', 'sanitario', 'Válvula sanitaria (mariposa/pistón)', false, 9),
  ('bomba', 'sanitario', 'Bomba sanitaria / centrífuga', false, 10),
  ('instrumentacion', 'sanitario', 'Instrumentación / alta presión', false, 11),
  ('acc_tanque', 'sanitario', 'Accesorio para tanque', false, 12),
  ('chapa', 'materiaprima', 'Chapa / bobina', true, 13),
  ('barra', 'materiaprima', 'Barra redonda', true, 14),
  ('planchuela', 'materiaprima', 'Planchuela', true, 15),
  ('angulo', 'materiaprima', 'Ángulo', true, 16),
  ('tapa_puerta', 'tapas', 'Tapa / puerta de tanque', false, 17),
  ('bulon', 'bulones', 'Tornillo / bulón', false, 18),
  ('varilla_roscada', 'bulones', 'Varilla roscada / espárrago', false, 19),
  ('baranda', 'arquitectura', 'Baranda / pasamanos', false, 20),
  ('griferia', 'arquitectura', 'Grifería / herrajes de baño', false, 21),
  ('tungsteno', 'soldadura', 'Electrodo de tungsteno', false, 22),
  ('varilla_tig', 'soldadura', 'Varilla TIG', false, 23),
  ('alambre_mig', 'soldadura', 'Alambre MIG', false, 24),
  ('electrodo_revestido', 'soldadura', 'Electrodo revestido (MMA)', false, 25),
  ('disco_corte', 'abrasivos', 'Disco de corte / abrasivo', false, 26),
  ('decapante', 'quimica', 'Decapante / pasivante', false, 27)
) as v(codigo, dominio, nombre, pregunta_grado, orden)
join dominio d on d.codigo = v.dominio
on conflict (codigo) do nothing;

-- 100 complementos: la regla de venta cruzada propiamente dicha.
insert into complemento (tipo_producto_id, nombre, prioridad, motivo, depende_del_grado, orden)
select tp.id, v.nombre, v.prioridad::prioridad_complemento, v.motivo, v.depende_del_grado, v.orden
from (values
  ('cano', 'Accesorios para soldar', 'oblig', 'Codos, tees y reducciones del mismo grado para armar la línea.', false, 1),
  ('cano', 'Consumible de aporte', 'oblig', 'Para unir los tramos; el grado de aporte lo define el grado del caño.', true, 2),
  ('cano', 'Bridas', 'reco', 'Conexiones desmontables a equipos y válvulas.', false, 3),
  ('cano', 'Química de terminación', 'oblig', 'Decapar y pasivar cada soldadura para que la junta no oxide.', false, 4),
  ('cano', 'Abrasivos', 'reco', 'Corte, biselado y acabado del cordón.', false, 5),
  ('acc_soldar_ind', 'Caño / tubo', 'reco', 'El tramo recto que conecta los accesorios.', false, 1),
  ('acc_soldar_ind', 'Consumible de aporte', 'oblig', 'Aporte del grado del accesorio.', true, 2),
  ('acc_soldar_ind', 'Bridas', 'reco', 'Conexión desmontable de la línea.', false, 3),
  ('acc_soldar_ind', 'Química de terminación', 'oblig', 'Decapar y pasivar cada soldadura.', false, 4),
  ('acc_soldar_ind', 'Abrasivos', 'reco', 'Preparación y acabado.', false, 5),
  ('brida', 'Juntas / gaskets', 'oblig', 'Toda brida sella contra una junta; material según fluido y temperatura.', false, 1),
  ('brida', 'Espárragos, tuercas y arandelas', 'oblig', 'El set de apriete de la brida.', false, 2),
  ('brida', 'Consumible de aporte', 'reco', 'Si es welding-neck o slip-on hay que soldarla al caño.', true, 3),
  ('brida', 'Caño', 'reco', 'El tramo que se une a la brida.', false, 4),
  ('niple', 'Accesorios roscados / SW', 'oblig', 'El niple conecta los fittings roscados.', false, 1),
  ('niple', 'Sellador / antigripante de rosca', 'oblig', 'Sellar y proteger la unión roscada.', false, 2),
  ('niple', 'Válvulas', 'reco', 'Cierre o regulación en la línea roscada.', false, 3),
  ('acc_rosc_sw', 'Niples', 'reco', 'Conectores entre fittings.', false, 1),
  ('acc_rosc_sw', 'Sellador / antigripante de rosca', 'oblig', 'Sellado de la unión roscada.', false, 2),
  ('acc_rosc_sw', 'Válvulas', 'reco', '', false, 3),
  ('acc_rosc_sw', 'Consumible (versiones SW)', 'reco', 'Las versiones socket-weld se sueldan.', false, 4),
  ('valvula_ind', 'Bridas', 'reco', 'Para montar la válvula bridada.', false, 1),
  ('valvula_ind', 'Juntas', 'oblig', 'Sellado de las caras de montaje.', false, 2),
  ('valvula_ind', 'Espárragos y tuercas', 'oblig', 'Set de apriete.', false, 3),
  ('valvula_ind', 'Accesorios roscados / niples', 'reco', 'Si es válvula roscada.', false, 4),
  ('union_sanitaria', 'Juntas sanitarias', 'oblig', 'La unión clamp no sella sin junta: EPDM/silicona/PTFE/Viton según fluido y temperatura.', false, 1),
  ('union_sanitaria', 'Abrazaderas clamp', 'oblig', 'El collar que cierra la unión.', false, 2),
  ('union_sanitaria', 'Accesorios sanitarios para soldar', 'reco', 'Para empalmar la unión a la línea.', false, 3),
  ('union_sanitaria', 'Tubo sanitario', 'reco', '', false, 4),
  ('acc_soldar_san', 'Consumible de aporte 316L', 'oblig', 'Aporte bajo carbono (316L/308L) para no perder corrosión ni contaminar producto.', true, 1),
  ('acc_soldar_san', 'Respaldo / back-purge', 'oblig', 'Proteger la raíz interior (cara en contacto con producto).', false, 2),
  ('acc_soldar_san', 'Química: decapar/pasivar + revestimiento', 'oblig', 'Terminación higiénica de la soldadura interior.', false, 3),
  ('acc_soldar_san', 'Uniones sanitarias', 'reco', '', false, 4),
  ('valvula_san', 'Juntas y kit de repuesto', 'oblig', 'Sellos EPDM/silicona/Viton: repuesto de desgaste.', false, 1),
  ('valvula_san', 'Actuadores', 'reco', 'Para automatizar (mariposa neumática).', false, 2),
  ('valvula_san', 'Uniones sanitarias', 'reco', 'Para montar la válvula a la línea.', false, 3),
  ('valvula_san', 'Instrumentación', 'opc', '', false, 4),
  ('bomba', 'Repuestos de bomba', 'oblig', 'Sellos mecánicos, rodetes y repuestos de desgaste.', false, 1),
  ('bomba', 'Uniones sanitarias', 'oblig', 'Para conectar la bomba a la línea.', false, 2),
  ('bomba', 'Válvulas', 'reco', '', false, 3),
  ('bomba', 'Instrumentación', 'opc', 'Manómetros, sensores.', false, 4),
  ('instrumentacion', 'Conectores y adaptadores', 'oblig', 'Para completar el armado del instrumento.', false, 1),
  ('instrumentacion', 'Válvulas y manifolds', 'reco', '', false, 2),
  ('instrumentacion', 'Juntas', 'reco', '', false, 3),
  ('acc_tanque', 'Juntas', 'oblig', 'Sellado de bocas y conexiones.', false, 1),
  ('acc_tanque', 'Tapas y puertas', 'reco', '', false, 2),
  ('acc_tanque', 'Sistema de limpieza (spray ball)', 'reco', 'CIP del tanque.', false, 3),
  ('acc_tanque', 'Mirillas y soportes', 'opc', '', false, 4),
  ('chapa', 'Abrasivos: corte y acabado', 'oblig', 'Para cortar, biselar y dar la terminación pedida.', false, 1),
  ('chapa', 'Química de terminación', 'oblig', 'Decapar/pasivar zonas trabajadas; limpiador de inox.', false, 2),
  ('chapa', 'Consumible de aporte', 'reco', 'Si se va a soldar la chapa.', true, 3),
  ('chapa', 'Película / revestimiento protector', 'reco', 'Proteger la cara durante manipuleo.', false, 4),
  ('chapa', 'Brocas', 'opc', 'Si se perfora.', false, 5),
  ('barra', 'Brocas', 'reco', 'Mecanizado y perforado.', false, 1),
  ('barra', 'Abrasivos', 'reco', 'Acabado y pulido.', false, 2),
  ('barra', 'Consumible de aporte', 'opc', 'Si se suelda.', true, 3),
  ('planchuela', 'Abrasivos', 'reco', 'Corte y acabado.', false, 1),
  ('planchuela', 'Consumible de aporte', 'opc', '', true, 2),
  ('planchuela', 'Brocas', 'opc', '', false, 3),
  ('angulo', 'Abrasivos', 'reco', 'Corte y acabado.', false, 1),
  ('angulo', 'Consumible de aporte', 'opc', '', true, 2),
  ('tapa_puerta', 'Juntas de tapa', 'oblig', 'La tapa sella contra su junta: repuesto de desgaste habitual.', false, 1),
  ('tapa_puerta', 'Herrajes (bisagras, manijas, cierres)', 'oblig', 'Accesorios de la tapa.', false, 2),
  ('tapa_puerta', 'Bulonería', 'reco', 'Fijación de la tapa.', false, 3),
  ('tapa_puerta', 'Accesorios de tanque', 'opc', '', false, 4),
  ('bulon', 'Tuercas', 'oblig', 'Todo bulón necesita su tuerca del mismo paso.', false, 1),
  ('bulon', 'Arandelas', 'reco', 'Plana y de presión para distribuir la carga.', false, 2),
  ('bulon', 'Antigripante / pasta lubricante', 'oblig', 'En inox el galling es crítico: la rosca se agarrota en seco. La pasta lo evita.', false, 3),
  ('bulon', 'Fijador de rosca', 'reco', 'Evita aflojamiento por vibración.', false, 4),
  ('varilla_roscada', 'Tuercas', 'oblig', '', false, 1),
  ('varilla_roscada', 'Arandelas', 'reco', '', false, 2),
  ('varilla_roscada', 'Antigripante', 'oblig', 'Evitar agarrotamiento de la rosca inox.', false, 3),
  ('baranda', 'Herrajes y conectores', 'oblig', 'Curvas, uniones, soportes de pared.', false, 1),
  ('baranda', 'Accesorios para vidrio', 'reco', 'Si lleva paños de vidrio.', false, 2),
  ('baranda', 'Adhesivo / sellador de montaje', 'oblig', 'Loctite 680 para uniones tubo-conector + sellador.', false, 3),
  ('baranda', 'Abrasivos de acabado', 'reco', 'Satinado o pulido del pasamanos.', false, 4),
  ('baranda', 'Limpiador / pulidor', 'reco', '', false, 5),
  ('griferia', 'Accesorios y repuestos', 'reco', '', false, 1),
  ('griferia', 'Selladores / fijadores', 'reco', '', false, 2),
  ('griferia', 'Limpiador', 'opc', '', false, 3),
  ('tungsteno', 'Varilla TIG de aporte', 'oblig', 'Quien compra tungsteno suelda TIG: necesita la varilla.', false, 1),
  ('tungsteno', 'Respaldo de raíz', 'reco', 'Pasta cerámica para proteger la raíz.', false, 2),
  ('tungsteno', 'Química de terminación', 'oblig', 'Decapar y pasivar el cordón.', false, 3),
  ('tungsteno', 'Acabado', 'reco', '', false, 4),
  ('varilla_tig', 'Electrodo de tungsteno', 'oblig', 'La varilla no enciende sola; el tungsteno según espesor.', false, 1),
  ('varilla_tig', 'Respaldo de raíz', 'reco', '', false, 2),
  ('varilla_tig', 'Química de terminación', 'oblig', '', false, 3),
  ('varilla_tig', 'Abrasivos', 'reco', '', false, 4),
  ('alambre_mig', 'Antiproyecciones', 'oblig', 'El MIG salpica; evita pegado de salpicaduras y reproceso.', false, 1),
  ('alambre_mig', 'Química de terminación', 'oblig', '', false, 2),
  ('alambre_mig', 'Abrasivos', 'reco', '', false, 3),
  ('electrodo_revestido', 'Antiproyecciones', 'oblig', '', false, 1),
  ('electrodo_revestido', 'Abrasivos', 'oblig', 'Remoción de escoria y acabado.', false, 2),
  ('electrodo_revestido', 'Química de terminación', 'oblig', '', false, 3),
  ('disco_corte', 'Acabado progresivo', 'reco', 'Bajar grano con flap, lija y vellón.', false, 1),
  ('disco_corte', 'Cepillo de inox', 'reco', 'Carda de acero inox (nunca de carbono, contamina).', false, 2),
  ('disco_corte', 'Decapado y pasivado', 'oblig', 'Amolar inox altera la capa pasiva: decapar y pasivar.', false, 3),
  ('decapante', 'Secuencia: pasivar y neutralizar', 'oblig', 'Decapar→pasivar→neutralizar es una sola secuencia.', false, 1),
  ('decapante', 'Limpiadores y protección', 'reco', '', false, 2),
  ('decapante', 'Verificación', 'opc', 'Detector de ferrita/molibdeno.', false, 3)
) as v(tipo, nombre, prioridad, motivo, depende_del_grado, orden)
join tipo_producto tp on tp.codigo = v.tipo
on conflict (tipo_producto_id, nombre) do nothing;

-- 172 familias asociadas a los complementos.
insert into complemento_categoria (complemento_id, categoria_id, orden)
select c.id, cat.id, v.orden
from (values
  ('cano', 'Accesorios para soldar', 'acc_soldar_ind', 1),
  ('cano', 'Consumible de aporte', 'varilla_tig', 1),
  ('cano', 'Consumible de aporte', 'alambre_mig', 2),
  ('cano', 'Consumible de aporte', 'electrodo_revestido', 3),
  ('cano', 'Bridas', 'brida', 1),
  ('cano', 'Química de terminación', 'decapante', 1),
  ('cano', 'Química de terminación', 'pasivante', 2),
  ('cano', 'Química de terminación', 'neutralizante', 3),
  ('cano', 'Abrasivos', 'disco_corte', 1),
  ('cano', 'Abrasivos', 'flap', 2),
  ('cano', 'Abrasivos', 'lija', 3),
  ('acc_soldar_ind', 'Caño / tubo', 'cano', 1),
  ('acc_soldar_ind', 'Caño / tubo', 'tubo', 2),
  ('acc_soldar_ind', 'Consumible de aporte', 'varilla_tig', 1),
  ('acc_soldar_ind', 'Consumible de aporte', 'alambre_mig', 2),
  ('acc_soldar_ind', 'Consumible de aporte', 'electrodo_revestido', 3),
  ('acc_soldar_ind', 'Bridas', 'brida', 1),
  ('acc_soldar_ind', 'Química de terminación', 'decapante', 1),
  ('acc_soldar_ind', 'Química de terminación', 'pasivante', 2),
  ('acc_soldar_ind', 'Química de terminación', 'neutralizante', 3),
  ('acc_soldar_ind', 'Abrasivos', 'disco_corte', 1),
  ('acc_soldar_ind', 'Abrasivos', 'flap', 2),
  ('acc_soldar_ind', 'Abrasivos', 'lija', 3),
  ('brida', 'Juntas / gaskets', 'junta', 1),
  ('brida', 'Espárragos, tuercas y arandelas', 'varilla_roscada', 1),
  ('brida', 'Espárragos, tuercas y arandelas', 'tuerca', 2),
  ('brida', 'Espárragos, tuercas y arandelas', 'arandela', 3),
  ('brida', 'Consumible de aporte', 'varilla_tig', 1),
  ('brida', 'Consumible de aporte', 'alambre_mig', 2),
  ('brida', 'Consumible de aporte', 'electrodo_revestido', 3),
  ('brida', 'Caño', 'cano', 1),
  ('niple', 'Accesorios roscados / SW', 'acc_rosc_sw', 1),
  ('niple', 'Sellador / antigripante de rosca', 'sellador_rosca', 1),
  ('niple', 'Sellador / antigripante de rosca', 'lubricante', 2),
  ('niple', 'Válvulas', 'valvula_ind', 1),
  ('acc_rosc_sw', 'Niples', 'niple', 1),
  ('acc_rosc_sw', 'Sellador / antigripante de rosca', 'sellador_rosca', 1),
  ('acc_rosc_sw', 'Sellador / antigripante de rosca', 'lubricante', 2),
  ('acc_rosc_sw', 'Válvulas', 'valvula_ind', 1),
  ('acc_rosc_sw', 'Consumible (versiones SW)', 'electrodo_revestido', 1),
  ('acc_rosc_sw', 'Consumible (versiones SW)', 'varilla_tig', 2),
  ('valvula_ind', 'Bridas', 'brida', 1),
  ('valvula_ind', 'Juntas', 'junta', 1),
  ('valvula_ind', 'Espárragos y tuercas', 'varilla_roscada', 1),
  ('valvula_ind', 'Espárragos y tuercas', 'tuerca', 2),
  ('valvula_ind', 'Espárragos y tuercas', 'arandela', 3),
  ('valvula_ind', 'Accesorios roscados / niples', 'acc_rosc_sw', 1),
  ('valvula_ind', 'Accesorios roscados / niples', 'niple', 2),
  ('union_sanitaria', 'Juntas sanitarias', 'junta', 1),
  ('union_sanitaria', 'Abrazaderas clamp', 'abrazadera', 1),
  ('union_sanitaria', 'Accesorios sanitarios para soldar', 'acc_soldar_san', 1),
  ('union_sanitaria', 'Tubo sanitario', 'tubo', 1),
  ('acc_soldar_san', 'Consumible de aporte 316L', 'varilla_tig', 1),
  ('acc_soldar_san', 'Consumible de aporte 316L', 'alambre_mig', 2),
  ('acc_soldar_san', 'Respaldo / back-purge', 'respaldo', 1),
  ('acc_soldar_san', 'Química: decapar/pasivar + revestimiento', 'decapante', 1),
  ('acc_soldar_san', 'Química: decapar/pasivar + revestimiento', 'pasivante', 2),
  ('acc_soldar_san', 'Química: decapar/pasivar + revestimiento', 'revestimiento', 3),
  ('acc_soldar_san', 'Uniones sanitarias', 'union_sanitaria', 1),
  ('valvula_san', 'Juntas y kit de repuesto', 'junta', 1),
  ('valvula_san', 'Juntas y kit de repuesto', 'acc_valvula_san', 2),
  ('valvula_san', 'Actuadores', 'actuador', 1),
  ('valvula_san', 'Uniones sanitarias', 'union_sanitaria', 1),
  ('valvula_san', 'Instrumentación', 'instrumentacion', 1),
  ('bomba', 'Repuestos de bomba', 'acc_bomba', 1),
  ('bomba', 'Uniones sanitarias', 'union_sanitaria', 1),
  ('bomba', 'Válvulas', 'valvula_san', 1),
  ('bomba', 'Instrumentación', 'instrumentacion', 1),
  ('instrumentacion', 'Conectores y adaptadores', 'instrumentacion', 1),
  ('instrumentacion', 'Válvulas y manifolds', 'valvula_ind', 1),
  ('instrumentacion', 'Juntas', 'junta', 1),
  ('acc_tanque', 'Juntas', 'junta', 1),
  ('acc_tanque', 'Tapas y puertas', 'tapa_puerta', 1),
  ('acc_tanque', 'Sistema de limpieza (spray ball)', 'sistema_limpieza', 1),
  ('acc_tanque', 'Mirillas y soportes', 'mirilla', 1),
  ('acc_tanque', 'Mirillas y soportes', 'soporte_san', 2),
  ('chapa', 'Abrasivos: corte y acabado', 'disco_corte', 1),
  ('chapa', 'Abrasivos: corte y acabado', 'flap', 2),
  ('chapa', 'Abrasivos: corte y acabado', 'lija', 3),
  ('chapa', 'Abrasivos: corte y acabado', 'acabado', 4),
  ('chapa', 'Química de terminación', 'decapante', 1),
  ('chapa', 'Química de terminación', 'pasivante', 2),
  ('chapa', 'Química de terminación', 'limpieza', 3),
  ('chapa', 'Consumible de aporte', 'varilla_tig', 1),
  ('chapa', 'Consumible de aporte', 'alambre_mig', 2),
  ('chapa', 'Consumible de aporte', 'electrodo_revestido', 3),
  ('chapa', 'Película / revestimiento protector', 'revestimiento', 1),
  ('chapa', 'Brocas', 'broca', 1),
  ('barra', 'Brocas', 'broca', 1),
  ('barra', 'Abrasivos', 'flap', 1),
  ('barra', 'Abrasivos', 'lija', 2),
  ('barra', 'Abrasivos', 'pulido', 3),
  ('barra', 'Consumible de aporte', 'varilla_tig', 1),
  ('barra', 'Consumible de aporte', 'electrodo_revestido', 2),
  ('planchuela', 'Abrasivos', 'flap', 1),
  ('planchuela', 'Abrasivos', 'lija', 2),
  ('planchuela', 'Abrasivos', 'disco_corte', 3),
  ('planchuela', 'Consumible de aporte', 'varilla_tig', 1),
  ('planchuela', 'Consumible de aporte', 'electrodo_revestido', 2),
  ('planchuela', 'Brocas', 'broca', 1),
  ('angulo', 'Abrasivos', 'flap', 1),
  ('angulo', 'Abrasivos', 'disco_corte', 2),
  ('angulo', 'Consumible de aporte', 'varilla_tig', 1),
  ('angulo', 'Consumible de aporte', 'electrodo_revestido', 2),
  ('tapa_puerta', 'Juntas de tapa', 'junta', 1),
  ('tapa_puerta', 'Herrajes (bisagras, manijas, cierres)', 'acc_tapa', 1),
  ('tapa_puerta', 'Bulonería', 'bulon', 1),
  ('tapa_puerta', 'Bulonería', 'tuerca', 2),
  ('tapa_puerta', 'Accesorios de tanque', 'acc_tanque', 1),
  ('bulon', 'Tuercas', 'tuerca', 1),
  ('bulon', 'Arandelas', 'arandela', 1),
  ('bulon', 'Antigripante / pasta lubricante', 'sellador_rosca', 1),
  ('bulon', 'Antigripante / pasta lubricante', 'lubricante', 2),
  ('bulon', 'Fijador de rosca', 'sellador_rosca', 1),
  ('varilla_roscada', 'Tuercas', 'tuerca', 1),
  ('varilla_roscada', 'Arandelas', 'arandela', 1),
  ('varilla_roscada', 'Antigripante', 'sellador_rosca', 1),
  ('varilla_roscada', 'Antigripante', 'lubricante', 2),
  ('baranda', 'Herrajes y conectores', 'herraje_arq', 1),
  ('baranda', 'Herrajes y conectores', 'arq_otro', 2),
  ('baranda', 'Accesorios para vidrio', 'acc_vidrio', 1),
  ('baranda', 'Adhesivo / sellador de montaje', 'adhesivo_montaje', 1),
  ('baranda', 'Abrasivos de acabado', 'flap', 1),
  ('baranda', 'Abrasivos de acabado', 'acabado', 2),
  ('baranda', 'Abrasivos de acabado', 'pulido', 3),
  ('baranda', 'Limpiador / pulidor', 'limpieza', 1),
  ('griferia', 'Accesorios y repuestos', 'acc_bano', 1),
  ('griferia', 'Accesorios y repuestos', 'herraje_arq', 2),
  ('griferia', 'Selladores / fijadores', 'adhesivo_montaje', 1),
  ('griferia', 'Selladores / fijadores', 'sellador_rosca', 2),
  ('griferia', 'Limpiador', 'limpieza', 1),
  ('tungsteno', 'Varilla TIG de aporte', 'varilla_tig', 1),
  ('tungsteno', 'Respaldo de raíz', 'respaldo', 1),
  ('tungsteno', 'Química de terminación', 'decapante', 1),
  ('tungsteno', 'Química de terminación', 'pasivante', 2),
  ('tungsteno', 'Química de terminación', 'neutralizante', 3),
  ('tungsteno', 'Acabado', 'flap', 1),
  ('tungsteno', 'Acabado', 'acabado', 2),
  ('tungsteno', 'Acabado', 'lija', 3),
  ('varilla_tig', 'Electrodo de tungsteno', 'tungsteno', 1),
  ('varilla_tig', 'Respaldo de raíz', 'respaldo', 1),
  ('varilla_tig', 'Química de terminación', 'decapante', 1),
  ('varilla_tig', 'Química de terminación', 'pasivante', 2),
  ('varilla_tig', 'Química de terminación', 'neutralizante', 3),
  ('varilla_tig', 'Abrasivos', 'flap', 1),
  ('varilla_tig', 'Abrasivos', 'acabado', 2),
  ('alambre_mig', 'Antiproyecciones', 'antiproyecciones', 1),
  ('alambre_mig', 'Química de terminación', 'decapante', 1),
  ('alambre_mig', 'Química de terminación', 'pasivante', 2),
  ('alambre_mig', 'Química de terminación', 'neutralizante', 3),
  ('alambre_mig', 'Abrasivos', 'disco_corte', 1),
  ('alambre_mig', 'Abrasivos', 'flap', 2),
  ('alambre_mig', 'Abrasivos', 'lija', 3),
  ('electrodo_revestido', 'Antiproyecciones', 'antiproyecciones', 1),
  ('electrodo_revestido', 'Abrasivos', 'disco_corte', 1),
  ('electrodo_revestido', 'Abrasivos', 'flap', 2),
  ('electrodo_revestido', 'Abrasivos', 'lija', 3),
  ('electrodo_revestido', 'Química de terminación', 'decapante', 1),
  ('electrodo_revestido', 'Química de terminación', 'pasivante', 2),
  ('electrodo_revestido', 'Química de terminación', 'neutralizante', 3),
  ('disco_corte', 'Acabado progresivo', 'flap', 1),
  ('disco_corte', 'Acabado progresivo', 'lija', 2),
  ('disco_corte', 'Acabado progresivo', 'acabado', 3),
  ('disco_corte', 'Cepillo de inox', 'cepillo', 1),
  ('disco_corte', 'Decapado y pasivado', 'decapante', 1),
  ('disco_corte', 'Decapado y pasivado', 'pasivante', 2),
  ('decapante', 'Secuencia: pasivar y neutralizar', 'pasivante', 1),
  ('decapante', 'Secuencia: pasivar y neutralizar', 'neutralizante', 2),
  ('decapante', 'Limpiadores y protección', 'limpieza', 1),
  ('decapante', 'Limpiadores y protección', 'revestimiento', 2),
  ('decapante', 'Verificación', 'detector', 1),
  ('decapante', 'Verificación', 'ndt', 2)
) as v(tipo, complemento, categoria, orden)
join tipo_producto tp on tp.codigo = v.tipo
join complemento c on c.tipo_producto_id = tp.id and c.nombre = v.complemento
join categoria cat on cat.codigo = v.categoria
on conflict do nothing;

-- Aporte de soldadura por familia de grado.
insert into aporte_por_grado (grado, aporte, motivo) values
  ('304', '308L', 'Sobre-aleado: compensa la dilución; es el estándar de los austeníticos 18/8.'),
  ('310', '310', '25/20: mantiene el alto Cr/Ni y la resistencia en caliente.'),
  ('316', '316L', 'Conserva el molibdeno y la resistencia al picado por cloruros.')
on conflict (grado) do nothing;

-- La columna Calidad del catalogo trae 304L / 316L / 310S, no 304 / 316 / 310.
-- Sin este colapso el aporte no matchea justo en el caso mas comun.
insert into grado_equivalencia (grado, familia) values
  ('304', '304'),
  ('304L', '304'),
  ('304H', '304'),
  ('316', '316'),
  ('316L', '316'),
  ('316TI', '316'),
  ('310', '310'),
  ('310S', '310')
on conflict (grado) do nothing;

-- 14 notas tecnicas por linea de producto.
insert into nota_tecnica (ambito, ambito_id, texto, orden)
select 'dominio', d.id, v.texto, v.orden
from (values
  ('tuberia', 'Hacer coincidir el grado de caño, accesorio y aporte; mezclar grados causa corrosión y pérdida de propiedades.', 1),
  ('tuberia', 'Toda soldadura debe decaparse y pasivarse: la coloración de revenido es zona empobrecida en cromo.', 2),
  ('sanitario', 'En contacto con producto, aporte 316L bajo carbono y back-purge para no oxidar la raíz interior.', 1),
  ('sanitario', 'La junta es el punto de desgaste: confirmar material según fluido, temperatura y CIP.', 2),
  ('materiaprima', 'Abrasivos y cepillos de uso exclusivo en inox; si tocaron acero al carbono generan óxido.', 1),
  ('materiaprima', 'Tras cortar o amolar, decapar y pasivar la zona trabajada.', 2),
  ('bulones', 'El galling es el problema nº1 del inox: ofrecer siempre antigripante con bulonería y espárragos.', 1),
  ('bulones', 'Verificar que tuerca y arandela sean del mismo grado que el bulón.', 2),
  ('arquitectura', 'Las uniones de pasamanos van con adhesivo de montaje; ofrecer limpiador/pulidor para mantenimiento.', 1),
  ('tapas', 'La junta de la tapa es consumible: venta recurrente de repuesto.', 1),
  ('soldadura', 'No mezclar abrasivos usados en acero al carbono. Proteger la raíz en cañería.', 1),
  ('abrasivos', 'Respetar la secuencia de grano (corte→flap grueso→flap fino→vellón).', 1),
  ('quimica', 'Seguridad: decapante y pasivante contienen ácidos (HF/HNO₃). Usar EPP y neutralizar residuos.', 1),
  ('quimica', 'El pasivado no reemplaza al decapado: primero quitar el óxido, después pasivar.', 2)
) as v(dominio, texto, orden)
join dominio d on d.codigo = v.dominio
where not exists (
  select 1 from nota_tecnica nt
  where nt.ambito = 'dominio' and nt.ambito_id = d.id and nt.texto = v.texto
);

-- 8 procesos (puerta B, pantalla en F2).
--
-- grado_tipico es BORRADOR: entra con revisado = false y motivo_grado vacio. La
-- justificacion tecnica del grado la escribe Oficina Tecnica; no se genera desde aca.
insert into proceso (codigo, nombre, grado_tipico, motivo_grado, revisado, orden) values
  ('cerveceria', 'Cerveceria', '304L / 316L en contacto', '', false, 1),
  ('lacteos', 'Lacteos y alimentos', '304L / 316L', '', false, 2),
  ('farma', 'Farma', '316L', '', false, 3),
  ('vinos', 'Vinos y tanques', '304L / 316L', '', false, 4),
  ('quimica', 'Quimica e industrial', '304L / 316L / 310 con temperatura', '', false, 5),
  ('oil_gas', 'O&G y alta presion', '316L', '', false, 6),
  ('arquitectura', 'Arquitectura', '304 interior / 316 exterior y costa', '', false, 7),
  ('estructural', 'Estructural y taller', '304 / 430 segun exposicion', '', false, 8)
on conflict (codigo) do nothing;

-- Familias tipicas de cada proceso. Todas entran como 'reco': el blueprint lista las
-- familias pero no su prioridad, y asignarla es parte de la revision de Oficina Tecnica.
insert into proceso_categoria (proceso_id, categoria_id, prioridad, orden)
select p.id, cat.id, 'reco'::prioridad_complemento, v.orden
from (values
  ('cerveceria', 'acc_valvula_san', 1),
  ('cerveceria', 'union_sanitaria', 2),
  ('cerveceria', 'valvula_san', 3),
  ('cerveceria', 'bomba', 4),
  ('cerveceria', 'acc_soldar_san', 5),
  ('lacteos', 'acc_soldar_san', 1),
  ('lacteos', 'union_sanitaria', 2),
  ('lacteos', 'bomba', 3),
  ('lacteos', 'tapa_puerta', 4),
  ('lacteos', 'valvula_san', 5),
  ('farma', 'acc_soldar_san', 1),
  ('farma', 'tubo', 2),
  ('farma', 'junta', 3),
  ('farma', 'union_sanitaria', 4),
  ('vinos', 'tapa_puerta', 1),
  ('vinos', 'acc_tanque', 2),
  ('vinos', 'sistema_limpieza', 3),
  ('vinos', 'junta', 4),
  ('vinos', 'valvula_san', 5),
  ('quimica', 'cano', 1),
  ('quimica', 'acc_soldar_ind', 2),
  ('quimica', 'brida', 3),
  ('quimica', 'valvula_ind', 4),
  ('quimica', 'junta', 5),
  ('oil_gas', 'instrumentacion', 1),
  ('oil_gas', 'acc_rosc_sw', 2),
  ('oil_gas', 'valvula_ind', 3),
  ('oil_gas', 'niple', 4),
  ('arquitectura', 'baranda', 1),
  ('arquitectura', 'griferia', 2),
  ('arquitectura', 'herraje_arq', 3),
  ('arquitectura', 'acc_vidrio', 4),
  ('arquitectura', 'acc_bano', 5),
  ('estructural', 'chapa', 1),
  ('estructural', 'barra', 2),
  ('estructural', 'planchuela', 3),
  ('estructural', 'angulo', 4),
  ('estructural', 'cano', 5)
) as v(proceso, categoria, orden)
join proceso p on p.codigo = v.proceso
join categoria cat on cat.codigo = v.categoria
on conflict (proceso_id, categoria_id) do nothing;

-- Una fila de link por categoria activa, vacia. Es lo que alimenta el reporte de
-- cobertura: sin filas, el panel no tendria que mostrar y no se sabria que falta cargar.
insert into link_categoria (categoria_id)
select id from categoria where activo
on conflict (categoria_id) do nothing;

commit;
