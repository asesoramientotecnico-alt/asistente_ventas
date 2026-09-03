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
