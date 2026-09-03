-- Aserciones sobre el esquema: constraints, derivados y vistas.
--
-- Corren despues del seed, sobre la taxonomia real (9 dominios, 70 categorias, 27 tipos),
-- y como superusuario, que se saltea RLS. Las politicas se prueban en 20_rls.sql.
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

-- ── Usuarios ────────────────────────────────────────────────────────────────────────
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

-- ── Integridad de la taxonomia ──────────────────────────────────────────────────────
select pruebas.debe_fallar(
  $$insert into grado_equivalencia (grado, familia) values ('321', '347')$$,
  'equivalencia hacia una familia sin aporte definido');

select pruebas.debe_fallar(
  $$insert into complemento (tipo_producto_id, nombre, prioridad)
    select id, 'Consumible de aporte', 'reco' from tipo_producto where codigo = 'cano'$$,
  'complemento duplicado en el mismo tipo');

select pruebas.debe_fallar(
  $$insert into complemento (tipo_producto_id, nombre, prioridad)
    select id, 'Inventado', 'obligatorio' from tipo_producto where codigo = 'cano'$$,
  'prioridad fuera de oblig | reco | opc');

select pruebas.debe_fallar(
  $$delete from categoria where codigo = 'varilla_tig'$$,
  'borrar una categoria referenciada por una regla');

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

-- Filas reales del archivo.
insert into catalogo_item (import_batch_id, material_id, descripcion, negocio, familia, tipo, calidad, categoria_codigo, grado_norm) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '303798', 'CA CD 100,0x100,0 2,00 304', 'CAÑOS', 'CAÑOS ESTRUCTURALES', 'CAÑO CON COSTURA', '304', 'cano', '304'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '300105', 'ABOM   073                 304', 'INOXSALE', 'INOXSALE', 'Abrazadera', '304', 'otro', '304'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '336057', 'ELECTRODO TUNGSTENO 1,60MM BOHLER WT20', 'SOLDADURA', 'SOLDADURA', 'Electrodo', '', 'tungsteno', null),
  ('aaaaaaaa-0000-0000-0000-000000000002', '303798', 'CA CD 100,0x100,0 2,00 304', 'CAÑOS', 'CAÑOS ESTRUCTURALES', 'CAÑO CON COSTURA', '304', 'cano', '304');

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
  assert (select items from v_conteo_categoria where codigo = 'tungsteno') = 1,
    'la fila de tungsteno tiene que contar en su categoria';
  assert (select items from v_conteo_categoria where codigo = 'brida') = 0,
    'una categoria sin items en el batch activo cuenta 0';

  -- Invariante 1: una familia que alguna regla sugiere y que quedo sin items se reporta.
  assert exists (select 1 from v_familias_vacias where codigo = 'mirilla'),
    'mirilla la sugiere el complemento de acc_tanque y no tiene items: tendria que reportarse';
  assert not exists (select 1 from v_familias_vacias where codigo = 'cano'),
    'una familia con items no es una familia vacia';
  -- fresa no la referencia ningun complemento ni ningun proceso.
  assert not exists (select 1 from v_familias_vacias where codigo = 'fresa'),
    'una categoria que ninguna regla sugiere no es un problema de cobertura';
  assert not exists (select 1 from v_familias_vacias where codigo = 'otro'),
    'la categoria de descarte esta inactiva y no entra en el reporte';
end;
$$;

-- ── Links ───────────────────────────────────────────────────────────────────────────
do $$
begin
  assert (select count(*) from config where clave in ('ecommerce_base_url', 'ecommerce_search_template')) = 2,
    'faltan las claves de config del ecommerce';
  assert (select valor from config where clave = 'ecommerce_base_url') = '',
    'la config del ecommerce arranca vacia: sin base_url no se generan links';
  assert (select count(*) from link_categoria) = (select count(*) from categoria where activo),
    'el seed tiene que dejar una fila de link por categoria activa';
end;
$$;

select pruebas.debe_fallar(
  $$update link_categoria set url_fija = 'famiq.com.ar/canos'
    where categoria_id = (select id from categoria where codigo = 'cano')$$,
  'url_fija sin esquema http');

update link_categoria set url_fija = 'https://www.famiq.com.ar/canos'
where categoria_id = (select id from categoria where codigo = 'cano');
update link_categoria set terminos_busqueda = 'varilla tig inox'
where categoria_id = (select id from categoria where codigo = 'varilla_tig');

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
select pruebas.debe_fallar(
  $$update proceso set revisado = true where codigo = 'cerveceria'$$,
  'marcar revisado sin dejar quien y cuando');

update proceso
set revisado = true, revisado_por = '33333333-3333-3333-3333-333333333333', revisado_at = now()
where codigo = 'cerveceria';

-- ── Trazabilidad ────────────────────────────────────────────────────────────────────
insert into sesion (id, usuario_id, puerta) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'producto');

insert into sesion_sugerencia (sesion_id, complemento_id, categoria_id, prioridad)
select 'bbbbbbbb-0000-0000-0000-000000000001', c.id, cat.id, c.prioridad
from complemento c
join tipo_producto tp on tp.id = c.tipo_producto_id
join categoria cat on cat.codigo = 'varilla_tig'
where tp.codigo = 'cano' and c.nombre = 'Consumible de aporte';

-- La puerta por material sugiere formatos sin regla previa: las dos referencias en null es valido.
insert into sesion_sugerencia (sesion_id, categoria_id, prioridad)
select 'bbbbbbbb-0000-0000-0000-000000000001', id, 'reco' from categoria where codigo = 'cano';

select pruebas.debe_fallar(
  $$insert into sesion_sugerencia (sesion_id, complemento_id, proceso_categoria_id, categoria_id, prioridad)
    select 'bbbbbbbb-0000-0000-0000-000000000001', c.id, pc.id, cat.id, 'reco'
    from complemento c, proceso_categoria pc, categoria cat
    where cat.codigo = 'cano' limit 1$$,
  'una sugerencia disparada por dos reglas a la vez');

do $$
begin
  assert (select items from conteo_por_categoria('aaaaaaaa-0000-0000-0000-000000000001')
          where categoria_codigo = 'cano') = 1,
    'conteo_por_categoria tiene que contar el batch que se le pide';
  assert (select count(*) from conteo_por_categoria('aaaaaaaa-0000-0000-0000-000000000002')) = 1,
    'y funcionar sobre un batch que no esta activo';
end;
$$;

-- ── Activacion y rollback de batch ──────────────────────────────────────────────────
-- Va al final: deja el batch activo como estaba para no arrastrar efectos.
select activar_batch('aaaaaaaa-0000-0000-0000-000000000002');
do $$
begin
  assert batch_activo() = 'aaaaaaaa-0000-0000-0000-000000000002', 'no se activo el batch pedido';
  assert (select estado from import_batch where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'descartado',
    'el batch que estaba activo tiene que quedar descartado';
  assert (select count(*) from import_batch where estado = 'activo') = 1,
    'nunca puede haber dos batches activos';
  assert (select items from v_conteo_categoria where codigo = 'tungsteno') = 0,
    'los conteos tienen que seguir al batch activo';
end;
$$;

-- Volver atras es la misma operacion sobre el batch anterior.
select activar_batch('aaaaaaaa-0000-0000-0000-000000000001');
do $$
begin
  assert batch_activo() = 'aaaaaaaa-0000-0000-0000-000000000001', 'el rollback no restauro el batch anterior';
  assert (select items from v_conteo_categoria where codigo = 'tungsteno') = 1,
    'despues del rollback los conteos vuelven a los del batch restaurado';
end;
$$;

select pruebas.debe_fallar(
  $$select activar_batch('00000000-0000-0000-0000-000000000000')$$,
  'activar un batch que no existe');

\o
