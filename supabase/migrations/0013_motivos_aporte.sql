-- 0013 — Los motivos del aporte dejan de repetir el nombre del aporte.
--
-- La pantalla ahora muestra el aporte como etiqueta al lado del complemento ("Aporte
-- 316L"), asi que el motivo ya no tiene que nombrarlo: quedaba "Aporte 316L · Aporte 316L
-- para conservar el molibdeno...". Pasaba con los tres grados.
--
-- El contenido tecnico se preserva palabra por palabra; se saca solo la mencion repetida.
--
-- El seed entra con `on conflict do nothing`, con lo cual en un proyecto ya sembrado no
-- alcanza con regenerarlo: hace falta este UPDATE.
--
-- Cada UPDATE esta condicionado al texto viejo EXACTO. Si Oficina Tecnica ya edito ese
-- motivo, la condicion no matchea y su version queda intacta: una migracion no tiene por
-- que pisar una decision tecnica de otro.

update aporte_por_grado
set motivo = 'Sobre-aleado: compensa la dilución; es el estándar de los austeníticos 18/8.'
where grado = '304'
  and motivo = '308L sobre-aleado: compensa la dilución; aporte estándar de austeníticos 18/8.';

update aporte_por_grado
set motivo = '25/20: mantiene el alto Cr/Ni y la resistencia en caliente.'
where grado = '310'
  and motivo = 'Aporte 310 (25/20) para mantener el alto Cr/Ni y la resistencia en caliente.';

update aporte_por_grado
set motivo = 'Conserva el molibdeno y la resistencia al picado por cloruros.'
where grado = '316'
  and motivo = 'Aporte 316L para conservar el molibdeno y la resistencia al picado por cloruros.';
