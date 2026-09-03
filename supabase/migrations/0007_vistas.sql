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
