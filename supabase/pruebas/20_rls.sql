-- Aserciones sobre las politicas de RLS de 0008.
--
-- Cada bloque se hace pasar por un usuario distinto: `set local role authenticated` mas
-- el claim `sub`, que es de donde sale auth.uid() en el shim. Depende de los datos que
-- deja 10_esquema.sql.
--
--   11111111… admin      22222222… asesor1      33333333… oficina_tecnica      44444444… asesor2
--
-- La salida se descarta: lo que importa es que ninguna asercion levante excepcion.
\o /dev/null

-- ── Sin sesion no se lee nada ───────────────────────────────────────────────────────
begin;
set local role anon;
do $$
begin
  assert (select count(*) from categoria) = 0, 'anon no tendria que leer la taxonomia';
  assert (select count(*) from catalogo_item) = 0, 'anon no tendria que leer el catalogo';
  assert (select count(*) from perfil) = 0, 'anon no tendria que leer perfiles';
end;
$$;
commit;

-- ── Asesor: lee la taxonomia, no la escribe ─────────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  assert es_oficina_tecnica() = false, 'un asesor no es oficina tecnica';
  assert es_admin() = false, 'un asesor no es admin';
  assert (select count(*) from categoria) > 0, 'el asesor tiene que leer la taxonomia';
  assert (select count(*) from catalogo_item) > 0, 'el asesor tiene que leer el catalogo';
  assert (select count(*) from v_conteo_categoria) > 0, 'las vistas tienen que ser legibles';
end;
$$;
select pruebas.debe_fallar(
  $$insert into categoria (codigo, etiqueta) values ('inventada', 'Inventada')$$,
  'un asesor creando una categoria');
select pruebas.debe_no_afectar(
  $$update complemento set motivo = 'lo cambio yo'$$,
  'un asesor editando una regla');
select pruebas.debe_fallar(
  $$insert into catalogo_item (import_batch_id, material_id, categoria_codigo)
    values ('aaaaaaaa-0000-0000-0000-000000000001', '111111', 'cano')$$,
  'un asesor escribiendo en el catalogo');
select pruebas.debe_no_afectar(
  $$update config set valor = 'https://otro.com' where clave = 'ecommerce_base_url'$$,
  'un asesor cambiando la config del ecommerce');
select pruebas.debe_no_afectar(
  $$delete from categoria where codigo = 'cano'$$,
  'un asesor borrando una categoria');
commit;

-- ── Asesor: sus sesiones si, las de otro no ─────────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into sesion (id, usuario_id, puerta)
values ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'producto');
insert into sesion_sugerencia (sesion_id, categoria_id, prioridad)
select 'bbbbbbbb-0000-0000-0000-000000000002', id, 'reco' from categoria where codigo = 'cano';
do $$
begin
  assert (select count(*) from sesion) = 2, 'el asesor ve sus dos sesiones y ninguna mas';
end;
$$;
select pruebas.debe_fallar(
  $$insert into sesion (usuario_id, puerta)
    values ('44444444-4444-4444-4444-444444444444', 'producto')$$,
  'un asesor abriendo una sesion a nombre de otro');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$
begin
  assert (select count(*) from sesion) = 0, 'asesor2 no tendria que ver las sesiones de asesor1';
  assert (select count(*) from sesion_sugerencia) = 0, 'ni sus sugerencias';
end;
$$;
select pruebas.debe_fallar(
  $$insert into sesion_sugerencia (sesion_id, categoria_id, prioridad)
    select 'bbbbbbbb-0000-0000-0000-000000000002', id, 'reco' from categoria where codigo = 'cano'$$,
  'un asesor sumando sugerencias a la sesion de otro');
commit;

-- ── Perfil propio: se edita el nombre, no el rol ────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  assert (select count(*) from perfil) = 1, 'un asesor solo ve su propio perfil';
end;
$$;
update perfil set nombre = 'Asesor Uno', sucursal = 'Casa Central'
where user_id = '22222222-2222-2222-2222-222222222222';
-- El trigger proteger_rol revierte el cambio de rol en silencio: el update no falla,
-- pero el rol queda como estaba.
update perfil set rol = 'admin' where user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  assert (select nombre from perfil where user_id = '22222222-2222-2222-2222-222222222222') = 'Asesor Uno',
    'el asesor tiene que poder editar su nombre';
  assert (select rol from perfil where user_id = '22222222-2222-2222-2222-222222222222') = 'asesor',
    'un asesor no puede promoverse a admin';
end;
$$;
commit;

-- ── Oficina Tecnica: escribe reglas, links, config e imports; lee todas las sesiones ──
begin;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  assert es_oficina_tecnica() = true, 'el rol oficina_tecnica tiene que dar es_oficina_tecnica()';
  assert es_admin() = false, 'oficina_tecnica no es admin';
  assert (select count(*) from sesion) >= 2, 'oficina tecnica lee las sesiones de todos';
  assert (select count(*) from sesion_sugerencia) >= 2, 'y sus sugerencias';
  assert (select count(*) from perfil) = 4, 'oficina tecnica lee los perfiles del equipo';
end;
$$;
insert into categoria (codigo, etiqueta) values ('tapa_puerta', 'Tapas y puertas');
update complemento set motivo = 'Motivo revisado por Oficina Tecnica.';
update config set valor = 'https://www.famiq.com.ar' where clave = 'ecommerce_base_url';
insert into import_batch (archivo, layout_hash, estado) values ('catalogo-2026-05.xlsx', 'hash1', 'pendiente');
insert into proceso (codigo, nombre, grado_tipico) values ('farma', 'Farma', '316L');
select pruebas.debe_no_afectar(
  $$update perfil set rol = 'admin' where user_id = '44444444-4444-4444-4444-444444444444'$$,
  'oficina tecnica promoviendo a un asesor');
do $$
begin
  assert (select rol from perfil where user_id = '44444444-4444-4444-4444-444444444444') = 'asesor',
    'el rol de asesor2 no tendria que haber cambiado';
end;
$$;
commit;

-- ── Admin: gestiona roles ───────────────────────────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
  assert es_admin() = true, 'el rol admin tiene que dar es_admin()';
  assert es_oficina_tecnica() = true, 'un admin tambien puede lo de oficina tecnica';
  assert (select count(*) from perfil) = 4, 'el admin ve todos los perfiles';
end;
$$;
update perfil set rol = 'oficina_tecnica' where user_id = '44444444-4444-4444-4444-444444444444';
do $$
begin
  assert (select rol from perfil where user_id = '44444444-4444-4444-4444-444444444444') = 'oficina_tecnica',
    'el admin tiene que poder promover a un asesor';
end;
$$;
commit;

\o
