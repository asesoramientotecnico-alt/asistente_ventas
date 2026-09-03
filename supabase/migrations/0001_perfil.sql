-- 0001 — Usuarios y roles.
--
-- El alta la dispara Supabase Auth: cada usuario de auth.users recibe un perfil con rol
-- 'asesor'. La promocion a 'oficina_tecnica' o 'admin' la hace un admin, nunca el propio
-- usuario (ver el trigger de mas abajo y las politicas de 0008).

create type rol_usuario as enum ('asesor', 'oficina_tecnica', 'admin');

create table perfil (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  nombre         text not null default '',
  sucursal       text,
  rol            rol_usuario not null default 'asesor',
  creado_at      timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

comment on table perfil is 'Datos del asesor. El rol determina que puede leer y escribir (ver 0008).';

-- Utilitario reusado por el resto de las tablas con actualizado_at.
create function tocar_actualizado_at() returns trigger
language plpgsql as $$
begin
  new.actualizado_at := now();
  return new;
end;
$$;

create trigger perfil_tocar_actualizado_at
  before update on perfil
  for each row execute function tocar_actualizado_at();

-- Alta automatica del perfil, restringida al dominio corporativo.
-- Si Famiq suma otro dominio de mail, se cambia aca y queda versionado.
create function crear_perfil_para_usuario() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  dominio_permitido constant text := '@famiq.com.ar';
begin
  if new.email is null or right(lower(new.email), length(dominio_permitido)) <> dominio_permitido then
    raise exception 'Solo se permiten cuentas del dominio %', dominio_permitido
      using errcode = 'check_violation';
  end if;

  insert into public.perfil (user_id, nombre)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nombre', ''), split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function crear_perfil_para_usuario();

-- El rol solo lo cambia un admin. Un asesor puede editar su nombre y su sucursal.
--
-- Cuando auth.uid() es null no hay usuario autenticado: es el service_role, una migracion
-- o el editor SQL de Supabase. Ahi el cambio se permite, y es la unica forma de crear el
-- primer admin — si no, promover requeriria ser admin y nadie lo seria nunca.
create function proteger_rol() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and new.rol is distinct from old.rol
     and not exists (
       select 1 from public.perfil p
       where p.user_id = auth.uid() and p.rol = 'admin'
     )
  then
    new.rol := old.rol;
  end if;
  return new;
end;
$$;

create trigger perfil_proteger_rol
  before update on perfil
  for each row execute function proteger_rol();

-- Helpers para las politicas de RLS. Son security definer para poder leer `perfil`
-- sin quedar atrapados en la politica de la propia tabla.
create function rol_actual() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from public.perfil where user_id = auth.uid();
$$;

create function es_oficina_tecnica() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(rol_actual() in ('oficina_tecnica', 'admin'), false);
$$;

create function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(rol_actual() = 'admin', false);
$$;
