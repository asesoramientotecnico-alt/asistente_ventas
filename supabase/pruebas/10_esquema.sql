-- Aserciones sobre el esquema: constraints, derivados y vistas.
-- Corren como superusuario, que se saltea RLS. Las politicas se prueban en 20_rls.sql.
--
-- La salida se descarta: lo que importa es que ninguna asercion levante excepcion.
\o /dev/null

create schema pruebas;

create function pruebas.debe_fallar(sentencia text, etiqueta text) returns void
language plpgsql as $$
begin
  begin
    execute sentencia;
  exception when others then
    return;
  end;
  raise exception 'FALLO: se esperaba un error en "%"', etiqueta;
end;
$$;

-- En UPDATE y DELETE, RLS no levanta error: filtra las filas y afecta cero.
-- Solo INSERT falla, por el WITH CHECK. Por eso hacen falta las dos aserciones.
create function pruebas.debe_no_afectar(sentencia text, etiqueta text) returns void
language plpgsql as $$
declare
  n integer;
begin
  execute sentencia;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALLO: "%" afecto % fila(s) y no tendria que afectar ninguna', etiqueta, n;
  end if;
end;
$$;

grant usage on schema pruebas to authenticated, anon;
grant execute on all functions in schema pruebas to authenticated, anon;

-- ── Datos minimos ───────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@famiq.com.ar'),
  ('22222222-2222-2222-2222-222222222222', 'asesor1@famiq.com.ar'),
  ('33333333-3333-3333-3333-333333333333', 'ot@famiq.com.ar'),
  ('44444444-4444-4444-4444-444444444444', 'asesor2@famiq.com.ar');

update perfil set rol = 'admin'           where user_id = '11111111-1111-1111-1111-111111111111';
update perfil set rol = 'oficina_tecnica' where user_id = '33333333-3333-3333-3333-333333333333';

do $$
begin
  assert (select count(*) from perfil) = 4, 'el trigger de alta no creo los 4 perfiles';
  assert (select nombre from perfil where user_id = '22222222-2222-2222-2222-222222222222') = 'asesor1',
    'el nombre por defecto sale del mail';
  assert (select rol from perfil where user_id = '44444444-4444-4444-4444-444444444444') = 'asesor',
    'el rol por defecto es asesor';
  -- Sin usuario autenticado (migracion, service_role, editor SQL) el rol si se puede
  -- cambiar: es la unica forma de crear el primer admin.
  assert (select rol from perfil where user_id = '11111111-1111-1111-1111-111111111111') = 'admin',
    'no se pudo crear el primer admin desde una sesion sin auth.uid()';
  assert (select rol from perfil where user_id = '33333333-3333-3333-3333-333333333333') = 'oficina_tecnica',
    'no se pudo asignar el rol de oficina tecnica';
end;
$$;

select pruebas.debe_fallar(
  $$insert into auth.users (email) values ('externo@gmail.com')$$,
  'alta con mail fuera del dominio corporativo');

-- ── Taxonomia ───────────────────────────────────────────────────────────────────────
insert into dominio (codigo, nombre, orden) values ('tuberia', 'Tuberia de proceso industrial', 1);

insert into categoria (codigo, etiqueta) values
  ('cano', 'Caños / tubos'),
  ('brida', 'Bridas'),
  ('varilla_tig', 'Varilla TIG'),
  ('mirilla', 'Mirillas');
insert into categoria (codigo, etiqueta, activo) values ('otro', 'Sin clasificar', false);

insert into tipo_producto (codigo, dominio_id, nombre, pregunta_grado)
select 'cano', id, 'Caño / tubo de proceso', true from dominio where codigo = 'tuberia';

insert into complemento (tipo_producto_id, nombre, prioridad, motivo, depende_del_grado)
select id, 'Consumible de aporte', 'oblig', 'Para unir los tramos.', true
from tipo_producto where codigo = 'cano';

insert into complemento_categoria (complemento_id, categoria_id)
select c.id, cat.id from complemento c, categoria cat
where c.nombre = 'Consumible de aporte' and cat.codigo = 'varilla_tig';

insert into aporte_por_grado (grado, aporte, motivo) values
  ('304', '308L', 'Sobre-aleado: compensa la dilucion.'),
  ('316', '316L', 'Conserva el molibdeno.');
insert into grado_equivalencia (grado, familia) values
  ('316L', '316'), ('304L', '304');

select pruebas.debe_fallar(
  $$insert into grado_equivalencia (grado, familia) values ('321', '347')$$,
  'equivalencia hacia una familia sin aporte definido');

select pruebas.debe_fallar(
  $$insert into complemento (tipo_producto_id, nombre, prioridad)
    select id, 'Consumible de aporte', 'reco' from tipo_producto where codigo = 'cano'$$,
  'complemento duplicado en el mismo tipo');

select pruebas.debe_fallar(
  $$insert into complemento (tipo_producto_id, nombre, prioridad)
    select id, 'Otro', 'obligatorio' from tipo_producto where codigo = 'cano'$$,
  'prioridad fuera de oblig | reco | opc');

-- ── Catalogo ────────────────────────────────────────────────────────────────────────
insert into import_batch (id, archivo, layout_hash, estado, filas, filas_otro, activado_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'catalogo-2026-04.xlsx', 'hash1', 'activo', 3, 1, now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'catalogo-2026-03.xlsx', 'hash1', 'descartado', 2, 0, null);

select pruebas.debe_fallar(
  $$insert into import_batch (archivo, layout_hash, estado) values ('otro.xlsx', 'hash1', 'activo')$$,
  'dos batches activos a la vez');

select pruebas.debe_fallar(
  $$insert into import_batch (archivo, layout_hash, filas, filas_otro)
    values ('mal.xlsx', 'hash1', 10, 20)$$,
  'filas_otro mayor que filas');

insert into catalogo_item (import_batch_id, material_id, descripcion, negocio, familia, categoria_codigo, grado_norm) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '303798', 'CA CD 100,0x100,0 2,00 304', 'CAÑOS', 'CAÑOS ESTRUCTURALES', 'cano', '304'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '300000', 'ABCL  1 1/2"        304', 'INOXSALE', 'INOXSALE', 'otro', '304'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '336057', 'VAR TIG 308L 2,40MM', 'SOLDADURA', 'SOLDADURA', 'varilla_tig', '308L'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '303798', 'CA CD 100,0x100,0 2,00 304', 'CAÑOS', 'CAÑOS ESTRUCTURALES', 'cano', '304');

select pruebas.debe_fallar(
  $$insert into catalogo_item (import_batch_id, material_id, categoria_codigo)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '303798', 'cano')$$,
  'material_id repetido dentro del mismo batch');

select pruebas.debe_fallar(
  $$insert into catalogo_item (import_batch_id, material_id, categoria_codigo)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '999999', 'categoria_que_no_existe')$$,
  'categoria fuera de la taxonomia');

do $$
begin
  assert batch_activo() = 'aaaaaaaa-0000-0000-0000-000000000001', 'batch_activo() no devuelve el activo';
  assert (select count(*) from v_batch_activo) = 1, 'v_batch_activo devuelve mas de una fila';
end;
$$;

-- ── Vistas ──────────────────────────────────────────────────────────────────────────
do $$
begin
  assert (select items from v_conteo_categoria where codigo = 'cano') = 1,
    'el conteo tiene que ser contra el batch activo, no contra todos los batches';
  assert (select items from v_conteo_categoria where codigo = 'brida') = 0,
    'una categoria sin items en el batch activo cuenta 0';
  -- brida no la usa ninguna regla todavia: no es una familia vacia problematica.
  assert not exists (select 1 from v_familias_vacias where codigo = 'brida'),
    'una categoria sin reglas no deberia aparecer como familia vacia';
end;
$$;

-- Ahora si: mirilla queda referenciada por una regla y sin items en el batch activo.
insert into complemento_categoria (complemento_id, categoria_id)
select c.id, cat.id from complemento c, categoria cat
where c.nombre = 'Consumible de aporte' and cat.codigo = 'mirilla';

do $$
begin
  assert exists (select 1 from v_familias_vacias where codigo = 'mirilla'),
    'invariante 1: una familia referenciada por una regla y sin items tiene que reportarse';
  assert not exists (select 1 from v_familias_vacias where codigo = 'varilla_tig'),
    'una familia con items no es una familia vacia';
end;
$$;

-- ── Links ───────────────────────────────────────────────────────────────────────────
do $$
begin
  assert (select count(*) from config where clave in ('ecommerce_base_url', 'ecommerce_search_template')) = 2,
    'faltan las claves de config del ecommerce';
  assert (select valor from config where clave = 'ecommerce_base_url') = '',
    'la config del ecommerce arranca vacia: sin base_url no se generan links';
end;
$$;

select pruebas.debe_fallar(
  $$insert into link_categoria (categoria_id, url_fija)
    select id, 'famiq.com.ar/canos' from categoria where codigo = 'cano'$$,
  'url_fija sin esquema http');

insert into link_categoria (categoria_id, url_fija)
select id, 'https://www.famiq.com.ar/canos' from categoria where codigo = 'cano';
insert into link_categoria (categoria_id, terminos_busqueda)
select id, 'varilla tig inox' from categoria where codigo = 'varilla_tig';

do $$
begin
  assert (select resolucion from v_cobertura_links where codigo = 'cano') = 'url_fija',
    'con url_fija gana la url_fija';
  assert (select resolucion from v_cobertura_links where codigo = 'varilla_tig') = 'busqueda_con_terminos',
    'sin url_fija resuelve por terminos de busqueda';
  assert (select resolucion from v_cobertura_links where codigo = 'brida') = 'busqueda_por_etiqueta',
    'sin nada configurado cae en la etiqueta de la categoria';
  assert not exists (select 1 from v_cobertura_links where codigo = 'otro'),
    'la categoria de descarte esta inactiva y no entra en la cobertura de links';
end;
$$;

-- ── Procesos ────────────────────────────────────────────────────────────────────────
insert into proceso (codigo, nombre, grado_tipico, motivo_grado, orden) values
  ('cerveceria', 'Cerveceria', '304L / 316L en contacto', 'Borrador de Oficina Tecnica.', 1);

do $$
begin
  assert (select revisado from proceso where codigo = 'cerveceria') = false,
    'el grado tipico arranca sin firmar';
end;
$$;

select pruebas.debe_fallar(
  $$update proceso set revisado = true where codigo = 'cerveceria'$$,
  'marcar revisado sin dejar quien y cuando');

update proceso
set revisado = true, revisado_por = '33333333-3333-3333-3333-333333333333', revisado_at = now()
where codigo = 'cerveceria';

insert into proceso_categoria (proceso_id, categoria_id, prioridad)
select p.id, c.id, 'oblig' from proceso p, categoria c
where p.codigo = 'cerveceria' and c.codigo = 'cano';

-- ── Trazabilidad ────────────────────────────────────────────────────────────────────
insert into sesion (id, usuario_id, puerta) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'producto');

insert into sesion_sugerencia (sesion_id, complemento_id, categoria_id, prioridad)
select 'bbbbbbbb-0000-0000-0000-000000000001', c.id, cat.id, 'oblig'
from complemento c, categoria cat
where c.nombre = 'Consumible de aporte' and cat.codigo = 'varilla_tig';

-- La puerta por material sugiere formatos sin regla previa: las dos referencias en null es valido.
insert into sesion_sugerencia (sesion_id, categoria_id, prioridad)
select 'bbbbbbbb-0000-0000-0000-000000000001', id, 'reco' from categoria where codigo = 'cano';

select pruebas.debe_fallar(
  $$insert into sesion_sugerencia (sesion_id, complemento_id, proceso_categoria_id, categoria_id, prioridad)
    select 'bbbbbbbb-0000-0000-0000-000000000001', c.id, pc.id, cat.id, 'reco'
    from complemento c, proceso_categoria pc, categoria cat
    where cat.codigo = 'cano' limit 1$$,
  'una sugerencia disparada por dos reglas a la vez');

\o
