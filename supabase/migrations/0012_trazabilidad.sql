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
