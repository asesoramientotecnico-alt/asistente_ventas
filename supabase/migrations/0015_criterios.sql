-- 0015 — Aplica pregunta_medida y criterio a un proyecto ya sembrado.
--
-- 0014 agrega las columnas con su default; el seed las llena, pero entra con
-- `on conflict do nothing` y no toca las filas que ya existen. En un proyecto que ya
-- importo el catalogo, esto es lo que las pone al dia.
--
-- Las listas salen de data/criterios.json, que es la fuente. Si cambian ahi, se
-- regenera el seed y se agrega otra migracion: no se edita esta.
--
-- Cada UPDATE esta condicionado al valor por defecto, asi que si Oficina Tecnica ya
-- ajusto un criterio a mano, su version queda intacta.

-- Los 11 tipos cuyo catalogo declara la medida en pulgadas.
update tipo_producto set pregunta_medida = true
where codigo in ('cano', 'acc_soldar_ind', 'brida', 'niple', 'acc_rosc_sw', 'valvula_ind', 'union_sanitaria', 'acc_soldar_san', 'valvula_san', 'instrumentacion', 'acc_tanque')
  and pregunta_medida = false;

-- Pares que se filtran por el aporte del grado. Van primero porque un complemento que
-- depende del grado nunca se filtra por medida: el diametro de una varilla TIG es el de
-- la varilla, no el del cano.
update complemento_categoria cc set criterio = 'aporte'
from complemento c
where cc.complemento_id = c.id
  and c.depende_del_grado
  and cc.criterio = 'ninguno';

-- Pares que se filtran por medida: disparador con medida, familia con medida, y los dos
-- dentro de una linea donde la designacion en pulgadas es comparable. Una brida
-- industrial de 2" (60,30 mm) no monta en tubo sanitario de 2" (50,80 mm).
-- `categoria` va en un exists y no en el join: en un UPDATE ... FROM, Postgres no deja
-- referenciar la tabla destino (cc) desde el ON de un join.
update complemento_categoria cc set criterio = 'medida'
from complemento c
join tipo_producto tp on tp.id = c.tipo_producto_id
join dominio d on d.id = tp.dominio_id
where cc.complemento_id = c.id
  and not c.depende_del_grado
  and exists (
    select 1 from categoria cat
    where cat.id = cc.categoria_id
      and cat.codigo in ('cano', 'tubo', 'acc_soldar_ind', 'acc_soldar_san', 'brida', 'niple', 'acc_rosc_sw', 'valvula_ind', 'valvula_san', 'union_sanitaria', 'instrumentacion', 'acople_rapido', 'soporte_san', 'mirilla', 'filtro_san', 'filtro_ind')
  )
  and d.codigo in ('tuberia', 'sanitario')
  and tp.codigo in ('cano', 'acc_soldar_ind', 'brida', 'niple', 'acc_rosc_sw', 'valvula_ind', 'union_sanitaria', 'acc_soldar_san', 'valvula_san', 'instrumentacion', 'acc_tanque')
  and cc.criterio = 'ninguno';
