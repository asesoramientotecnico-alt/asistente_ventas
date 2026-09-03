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
