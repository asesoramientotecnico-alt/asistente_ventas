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
