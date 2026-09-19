-- 0016 — Identificacion del material: facetas, buscador y orden por venta real.
--
-- Corrige lo que se vio usando la pantalla (PLAN-F2.md, seccion 8):
--
--   1. Bajo "Accesorios para soldar" aparecian primero bujes BSPT y NPT. No era el
--      filtro: era el ORDEN, alfabetico por descripcion, donde "BNS3" gana contra
--      "CURVA". Son 15 items sobre 1.142, y las curvas de 90 -- 158 items y lo mas
--      vendido de la familia -- no se veian.
--   2. La familia de 69 categorias es un balde grueso: acc_soldar_ind mezcla 23 `Tipo`
--      distintos que el mostrador jamas mezclaria.
--   3. Medida y grado no alcanzan para identificar un material.

-- ── Atributos que faltaban ──────────────────────────────────────────────────────────
--
-- `tipo` y `norma` ya se importaban. Faltan estos dos, que son los ejes de las familias
-- donde la medida no aplica: chapa se elige por terminacion (21 valores distintos) y
-- varias lineas por forma.
alter table catalogo_item add column terminacion text;
alter table catalogo_item add column forma       text;

-- ── Texto de busqueda ───────────────────────────────────────────────────────────────
--
-- Concatena lo que el asesor escribiria — "curva 2 316" — sin que tenga que acertar en
-- que columna esta cada cosa.
--
-- Se llena en la importacion y no como columna generada: `array_to_string` es STABLE, no
-- IMMUTABLE, y Postgres no la acepta en un `generated always as`. Ademas queda
-- consistente con `medidas`, que tambien la arma src/logica/ en el import.
alter table catalogo_item add column texto_busqueda text not null default '';

create extension if not exists pg_trgm;
create index catalogo_item_busqueda on catalogo_item using gin (texto_busqueda gin_trgm_ops);
create index catalogo_item_tipo on catalogo_item (import_batch_id, categoria_codigo, tipo);

-- ── Ranking de venta real ───────────────────────────────────────────────────────────
--
-- Reemplaza el orden alfabetico. Sale de los 641.661 renglones de pedido de 2025-2026,
-- agregados por familia y tipo: ningun dato de cliente, solo conteos.
--
-- Se agrega por (categoria, tipo) y no por material_id para que sobreviva a un cambio de
-- catalogo: un codigo nuevo de curva de 90 hereda el lugar de las curvas de 90 en vez de
-- entrar ultimo.
--
-- ORDENA, NO FILTRA. Un item de baja rotacion sigue estando, mas abajo. Esconder stock
-- por poca venta seria peor que el problema que resuelve.
create table ranking_venta (
  categoria_codigo text not null references categoria (codigo) on delete cascade,
  tipo             text not null,
  lineas           integer not null default 0,
  clientes         integer not null default 0,
  primary key (categoria_codigo, tipo),
  constraint ranking_venta_no_negativo check (lineas >= 0 and clientes >= 0)
);

comment on table ranking_venta is
  'Volumen de venta por familia y tipo, agregado del historico 2025-2026. Solo ordena la presentacion; nunca filtra ni esconde items. Se regenera con scripts/historico/ranking-venta.ts --sql.';

comment on column ranking_venta.clientes is
  'Clientes distintos que lo compraron. 500 renglones de un cliente no son lo mismo que 500 de 200 clientes: lo segundo es mejor senial de demanda general.';

alter table ranking_venta enable row level security;
create policy ranking_venta_lee on ranking_venta
  for select to authenticated using (true);
create policy ranking_venta_escribe_ot on ranking_venta
  for all to authenticated using (es_oficina_tecnica()) with check (es_oficina_tecnica());

-- ── Facetas: que ejes ofrecer y con cuantos items ───────────────────────────────────
--
-- Devuelve, para el conjunto que queda despues de los filtros ya elegidos, las opciones
-- de cada eje con su conteo. La app decide cuales mostrar segun la regla de 8.4:
--
--   Un eje se ofrece solo si esta poblado en la mayoria de los items que quedan y si
--   realmente parte el conjunto. Uno mayormente vacio es refinamiento opcional, y
--   elegirlo no descarta a los items que no declaran el valor.
--
-- Por eso devuelve tambien `sin_dato`: sin ese numero la app no puede distinguir un eje
-- util de uno que esconderia la mayoria del stock. El Schedule del cano es el caso: esta
-- vacio en el 86% de los items.
create function facetas_de_categoria(
  p_categoria   text,
  p_tipo        text default null,
  p_medida      text default null,
  p_grado       text default null,
  p_terminacion text default null,
  p_norma       text default null
)
returns table (eje text, valor text, items bigint, sin_dato bigint)
language sql
stable
security invoker
set search_path = public as $$
  with base as (
    select ci.*
    from catalogo_item ci
    where ci.import_batch_id = batch_activo()
      and ci.categoria_codigo = p_categoria
      and (p_tipo        is null or ci.tipo = p_tipo)
      and (p_medida      is null or ci.medidas @> array[p_medida])
      and (p_grado       is null or ci.grado_norm = p_grado)
      and (p_terminacion is null or ci.terminacion = p_terminacion)
      and (p_norma       is null or ci.norma = p_norma)
  ),
  -- Un eje por rama. `medida` sale de un array, los demas de una columna.
  ejes as (
    select 'tipo'        as eje, nullif(trim(tipo), '')        as valor from base
    union all
    select 'grado',              nullif(trim(grado_norm), '')          from base
    union all
    select 'terminacion',        nullif(trim(terminacion), '')         from base
    union all
    select 'norma',              nullif(trim(norma), '')               from base
    union all
    select 'schedule',           nullif(trim(schedule), '')            from base
    union all
    select 'forma',              nullif(trim(forma), '')               from base
    union all
    select 'rosca',              nullif(trim(rosca), '')               from base
    union all
    select 'medida', m from base left join lateral unnest(
      case when cardinality(base.medidas) = 0 then array[null::text] else base.medidas end
    ) as m on true
  )
  select
    e.eje,
    e.valor,
    count(*) filter (where e.valor is not null)::bigint,
    -- El mismo total de vacios repetido en cada fila del eje: la app necesita el
    -- denominador para decidir si el eje sirve, y asi evita una segunda consulta.
    sum(count(*)) filter (where e.valor is null) over (partition by e.eje)::bigint
  from ejes e
  group by e.eje, e.valor
  having e.valor is not null
  order by e.eje, count(*) desc, e.valor;
$$;

comment on function facetas_de_categoria is
  'Opciones y conteos de cada eje para lo que queda despues de los filtros ya elegidos. Incluye sin_dato por eje: un eje mayormente vacio se ofrece como refinamiento opcional, nunca como paso obligatorio.';

-- ── Buscador ────────────────────────────────────────────────────────────────────────
--
-- El campo unico de arriba de la pantalla. Cada palabra tiene que aparecer en el item:
-- "curva 2 316" trae las curvas de 2" en 316, sin que el asesor acierte en que columna
-- esta cada cosa.
--
-- El orden es por venta real, no por descripcion. Es el mismo arreglo que el de las
-- facetas: lo mas vendido primero.
create function buscar_items(p_texto text, p_limite int default 20)
returns table (
  material_id      text,
  descripcion      text,
  categoria_codigo text,
  etiqueta         text,
  tipo             text,
  grado_norm       text,
  medidas          text[]
)
language sql
stable
security invoker
set search_path = public as $$
  with palabras as (
    select unnest(string_to_array(lower(trim(p_texto)), ' ')) as p
  )
  select ci.material_id, ci.descripcion, ci.categoria_codigo, cat.etiqueta,
         ci.tipo, ci.grado_norm, ci.medidas
  from catalogo_item ci
  join categoria cat on cat.codigo = ci.categoria_codigo
  left join ranking_venta rv
    on rv.categoria_codigo = ci.categoria_codigo and rv.tipo = ci.tipo
  where ci.import_batch_id = batch_activo()
    and cat.activo
    and trim(coalesce(p_texto, '')) <> ''
    and not exists (
      select 1 from palabras
      where palabras.p <> '' and ci.texto_busqueda not like '%' || palabras.p || '%'
    )
  order by coalesce(rv.lineas, 0) desc, ci.descripcion
  limit greatest(p_limite, 0);
$$;

comment on function buscar_items is
  'Busqueda por palabras sueltas sobre descripcion, tipo, calidad y medida. Ordena por venta real: lo mas vendido primero.';

-- ── Items de una familia, ahora ordenados por venta y filtrables por tipo ───────────
--
-- Reemplaza a items_de_categoria de 0014, que ordenaba por descripcion. Ese orden es
-- exactamente lo que ponia los bujes NPT arriba de las curvas de 90.
create function items_de_categoria_v2(
  p_categoria   text,
  p_tipo        text default null,
  p_medida      text default null,
  p_grado       text default null,
  p_terminacion text default null,
  p_norma       text default null,
  p_limite      int  default 25
)
returns table (
  material_id text,
  descripcion text,
  tipo        text,
  grado_norm  text,
  medidas     text[]
)
language sql
stable
security invoker
set search_path = public as $$
  select ci.material_id, ci.descripcion, ci.tipo, ci.grado_norm, ci.medidas
  from catalogo_item ci
  left join ranking_venta rv
    on rv.categoria_codigo = ci.categoria_codigo and rv.tipo = ci.tipo
  where ci.import_batch_id = batch_activo()
    and ci.categoria_codigo = p_categoria
    and (p_tipo        is null or ci.tipo = p_tipo)
    and (p_medida      is null or ci.medidas @> array[p_medida])
    and (p_grado       is null or ci.grado_norm = p_grado)
    and (p_terminacion is null or ci.terminacion = p_terminacion)
    and (p_norma       is null or ci.norma = p_norma)
  order by coalesce(rv.lineas, 0) desc, ci.descripcion
  limit greatest(p_limite, 0);
$$;

create function contar_items_v2(
  p_categoria   text,
  p_tipo        text default null,
  p_medida      text default null,
  p_grado       text default null,
  p_terminacion text default null,
  p_norma       text default null
)
returns bigint
language sql
stable
security invoker
set search_path = public as $$
  select count(*)::bigint
  from catalogo_item ci
  where ci.import_batch_id = batch_activo()
    and ci.categoria_codigo = p_categoria
    and (p_tipo        is null or ci.tipo = p_tipo)
    and (p_medida      is null or ci.medidas @> array[p_medida])
    and (p_grado       is null or ci.grado_norm = p_grado)
    and (p_terminacion is null or ci.terminacion = p_terminacion)
    and (p_norma       is null or ci.norma = p_norma);
$$;
