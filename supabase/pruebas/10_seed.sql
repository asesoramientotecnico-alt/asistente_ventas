-- Aserciones sobre supabase/seed.sql.
--
-- Corren sobre la base recien sembrada, antes de que 20_esquema.sql toque nada.
-- Los numeros salen de data/crosssell_rules.json y data/procesos.json: si el JSON cambia
-- y estas cifras no, es que el seed dejo de reflejar la fuente.
\o /dev/null

do $$
begin
  assert (select count(*) from dominio) = 9, 'tienen que entrar los 9 dominios';
  assert (select count(*) from categoria) = 70, 'las 69 categorias del JSON mas la de descarte';
  assert (select count(*) from categoria where activo) = 69, 'la categoria de descarte entra inactiva';
  assert (select activo from categoria where codigo = 'otro') = false,
    'la categoria de descarte nunca se sugiere';
  assert (select count(*) from tipo_producto) = 27, 'tienen que entrar los 27 tipos';
  assert (select count(*) from complemento) = 100, 'tienen que entrar los 100 complementos';
  assert (select count(*) from complemento_categoria) = 172, 'y sus 172 familias asociadas';
  assert (select count(*) from nota_tecnica where ambito = 'dominio') = 14, 'las 14 notas por dominio';
  assert (select count(*) from aporte_por_grado) = 3, 'aporte para 304, 316 y 310';
  assert (select count(*) from grado_equivalencia) = 8, 'las 8 equivalencias de grado';
  assert (select count(*) from proceso) = 8, 'los 8 procesos del blueprint';
  assert (select count(*) from proceso_categoria) = 38, 'y sus familias asociadas';
end;
$$;

-- Ningun complemento puede quedar sin familias: seria una sugerencia vacia en pantalla.
do $$
begin
  assert not exists (
    select 1 from complemento c
    where not exists (select 1 from complemento_categoria cc where cc.complemento_id = c.id)
  ), 'hay complementos sin ninguna familia asociada';
end;
$$;

-- Invariante 3 del blueprint: el grado tipico es borrador hasta que lo firme Oficina Tecnica.
do $$
begin
  assert not exists (select 1 from proceso where revisado),
    'ningun proceso puede entrar marcado como revisado';
  assert not exists (select 1 from proceso where motivo_grado <> ''),
    'el motivo del grado lo escribe Oficina Tecnica: el seed no lo inventa';
  assert (select grado_tipico from proceso where codigo = 'farma') = '316L',
    'el grado tipico si se siembra, con el texto del blueprint';
end;
$$;

-- Sin base_url la app no genera links. Arranca vacia a proposito.
do $$
begin
  assert (select valor from config where clave = 'ecommerce_base_url') = '',
    'la base del ecommerce no se conoce todavia';
  assert (select count(*) from link_categoria where url_fija is not null) = 0,
    'ninguna categoria puede venir con una URL cableada desde el seed';
end;
$$;

-- Muestras concretas de las reglas, para que un error de mapeo no pase como un conteo ok.
do $$
declare
  motivo_aporte text;
begin
  assert (select pregunta_grado from tipo_producto where codigo = 'cano') = true,
    'el cano pregunta el grado';
  assert (select pregunta_grado from tipo_producto where codigo = 'brida') = false,
    'la brida no pregunta el grado';

  select c.motivo into motivo_aporte
  from complemento c
  join tipo_producto tp on tp.id = c.tipo_producto_id
  where tp.codigo = 'cano' and c.nombre = 'Consumible de aporte';
  assert motivo_aporte = 'Para unir los tramos; el grado de aporte lo define el grado del caño.',
    'el motivo del complemento tiene que salir tal cual del JSON';

  assert exists (
    select 1 from complemento c
    join tipo_producto tp on tp.id = c.tipo_producto_id
    join complemento_categoria cc on cc.complemento_id = c.id
    join categoria cat on cat.id = cc.categoria_id
    where tp.codigo = 'brida' and c.prioridad = 'oblig' and cat.codigo = 'junta'
  ), 'toda brida sella contra una junta: tiene que ser un complemento obligatorio';

  assert (select aporte from aporte_por_grado where grado = '316') = '316L',
    'el aporte de la familia 316 es 316L';
  assert (select familia from grado_equivalencia where grado = '316L') = '316',
    'un 316L del catalogo tiene que resolver el aporte de la familia 316';
end;
$$;

\o
