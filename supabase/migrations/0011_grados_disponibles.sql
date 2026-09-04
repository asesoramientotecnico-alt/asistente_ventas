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
