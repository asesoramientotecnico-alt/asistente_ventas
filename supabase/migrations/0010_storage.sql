-- 0010 — Bucket del catalogo.
--
-- El Excel original se guarda para auditoria: permite reconstruir un import viejo o
-- volver a correr el clasificador sobre el archivo que le dio origen.
--
-- Bucket privado. Solo Oficina Tecnica sube y lee.

insert into storage.buckets (id, name, public)
values ('catalogo', 'catalogo', false)
on conflict (id) do nothing;

create policy catalogo_lee_ot on storage.objects
  for select to authenticated
  using (bucket_id = 'catalogo' and es_oficina_tecnica());

create policy catalogo_sube_ot on storage.objects
  for insert to authenticated
  with check (bucket_id = 'catalogo' and es_oficina_tecnica());
