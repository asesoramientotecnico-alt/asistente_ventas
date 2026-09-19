-- 0014 — Medida nominal en pulgadas y criterio de filtrado por par de familias.
--
-- Hasta aca la sugerencia era generica: "Bridas". Con esto pasa a ser "Bridas de 2\" en
-- 316", que es lo que el asesor necesita cuando el cliente pide una medida concreta.
--
-- Dos piezas:
--
--   catalogo_item.medidas       las medidas nominales del item, ya normalizadas.
--   complemento_categoria.criterio   como se filtra ESE par disparador-familia.
--
-- El criterio va por par y no global a proposito: la medida del cano NO filtra el
-- aporte. El diametro de una varilla TIG es el de la varilla (1,60 / 2,40 mm), no el del
-- cano; lo que une cano y aporte es el grado. Un parametro global de medida propagado a
-- todos los complementos devolveria vacio, o peor, la varilla de 2,40 porque el numero
-- se parece.

-- ── Medidas del item ────────────────────────────────────────────────────────────────
--
-- Array y no columna simple: una reduccion declara DOS medidas y pertenece a las dos
-- lineas. Una reduccion 2" x 1 1/2" tiene que aparecer tanto para quien arma en 2" como
-- para quien arma en 1 1/2".
--
-- La normalizacion la hace src/logica/medida.ts en la importacion, no la base: es la
-- misma pieza que usan los tests y corre una sola vez por import en vez de en cada
-- consulta.
alter table catalogo_item add column medidas text[] not null default '{}';

comment on column catalogo_item.medidas is
  'Medidas nominales en pulgadas, normalizadas (2", 1 1/2"). Dos entradas en las reducciones. Vacio si el item no declara medida o el dato no es interpretable.';

-- GIN para `medidas @> array[...]`: es una consulta de contencion sobre array.
create index catalogo_item_medidas on catalogo_item using gin (medidas);

-- ── Que tipos pueden preguntar la medida ────────────────────────────────────────────
--
-- Espejo de `pregunta_grado`: el selector de medida solo aparece donde el catalogo tiene
-- con que llenarlo. Medido sobre las 16.973 filas, 11 de los 27 tipos tienen medida en
-- pulgadas en mas del 90% de sus items (bridas 98, niples 98, accesorios 96-98, valvulas
-- 93-94, uniones 95) y 16 no la tienen en absoluto: chapa, barra, planchuela, angulo,
-- buloneria, tapas, bombas y todos los consumibles estan en 0-1%.
--
-- Mostrar un selector vacio en esos 16 seria peor que no mostrarlo.
alter table tipo_producto add column pregunta_medida boolean not null default false;

comment on column tipo_producto.pregunta_medida is
  'Si el catalogo tiene medida en pulgadas para esta familia. False en las 16 que no la declaran: el selector no se muestra.';

-- ── Criterio de filtrado por par ────────────────────────────────────────────────────
create type criterio_filtro as enum ('ninguno', 'medida', 'grado', 'aporte', 'rosca');

comment on type criterio_filtro is
  'Como se filtra la familia complementaria segun lo que eligio el asesor. ninguno: no se filtra. medida: misma pulgada. grado: mismo grado. aporte: el grado de aporte que resuelve aporte_por_grado. rosca: mismo TIPO de rosca (metrica/Bsw/Unc), no el mismo paso -- el paso no esta en el catalogo como columna.';

alter table complemento_categoria
  add column criterio criterio_filtro not null default 'ninguno';

-- ── Medidas disponibles para una familia ────────────────────────────────────────────
--
-- Alimenta el selector de medida, igual que grados_de_categoria alimenta el de grado:
-- son las medidas que realmente estan en el batch activo, no una lista fija.
--
-- El orden lo hace la app con ordenarMedidas(): en SQL "10\"" ordena antes que "2\"",
-- que en mostrador no tiene sentido.
create function medidas_de_categoria(p_categoria text)
returns table (medida text, items bigint)
language sql
stable
security invoker
set search_path = public as $$
  select m, count(*)::bigint
  from catalogo_item ci
  cross join lateral unnest(ci.medidas) as m
  where ci.import_batch_id = batch_activo()
    and ci.categoria_codigo = p_categoria
  group by m
  order by count(*) desc, m;
$$;

comment on function medidas_de_categoria is
  'Medidas con items en el batch activo para una familia. El orden final lo hace la app: en SQL las pulgadas ordenan alfabeticamente.';

-- ── Items de una familia, filtrados ─────────────────────────────────────────────────
--
-- Es la enumeracion que ve el asesor. Devuelve los items del catalogo, nunca inventa
-- codigos, y no dice nada de precio ni de stock: eso lo resuelve el ecommerce.
--
-- Un filtro en null no filtra. Asi el mismo llamado sirve para los cuatro criterios sin
-- armar la consulta a mano en la app.
create function items_de_categoria(
  p_categoria text,
  p_medida    text default null,
  p_grado     text default null,
  p_rosca     text default null,
  p_limite    int  default 50
)
returns table (
  material_id text,
  descripcion text,
  grado_norm  text,
  medidas     text[],
  rosca       text
)
language sql
stable
security invoker
set search_path = public as $$
  select ci.material_id, ci.descripcion, ci.grado_norm, ci.medidas, ci.rosca
  from catalogo_item ci
  where ci.import_batch_id = batch_activo()
    and ci.categoria_codigo = p_categoria
    and (p_medida is null or ci.medidas @> array[p_medida])
    and (p_grado  is null or ci.grado_norm = p_grado)
    and (p_rosca  is null or ci.rosca = p_rosca)
  order by ci.descripcion
  limit greatest(p_limite, 0);
$$;

comment on function items_de_categoria is
  'Items del batch activo de una familia, con los filtros que apliquen. La app enumera lo que devuelve; no premarca ninguno ni afirma precio o stock.';

-- ── Cuantos items quedan despues de filtrar ─────────────────────────────────────────
--
-- Se necesita aparte del listado: la pantalla muestra "4 items" en el acordeon cerrado
-- sin traerse las filas, y el limite del listado no tiene que mentir sobre el total.
create function contar_items_de_categoria(
  p_categoria text,
  p_medida    text default null,
  p_grado     text default null,
  p_rosca     text default null
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
    and (p_medida is null or ci.medidas @> array[p_medida])
    and (p_grado  is null or ci.grado_norm = p_grado)
    and (p_rosca  is null or ci.rosca = p_rosca);
$$;
