# Puesta en marcha de la base

## Arranque rápido (proyecto nuevo de Supabase)

1. Crear el proyecto en supabase.com (elegir la organización con espacio disponible;
   región São Paulo por latencia con Argentina).
2. **SQL Editor → New query** → pegar el contenido de `supabase/instalar.sql` → Run.
3. **Authentication → URL Configuration**: cargar Site URL y Redirect URLs (sección 2).
4. **Project Settings → API**: copiar la URL y la clave pública a `.env.local` y a Vercel
   (sección 4).
5. Entrar a la app una vez con el correo de Famiq, para que el alta cree el usuario.
6. Promoverse a admin desde el SQL Editor (sección 3).
7. Importar el catálogo desde `/admin/import`.

Los pasos 1 a 6 son de una sola vez por proyecto. El 7 se repite en cada actualización del
Excel.

## 1. Aplicar el esquema

Dos caminos, según si hay CLI a mano o no.

### Sin instalar nada: editor SQL del panel

`supabase/instalar.sql` es un archivo generado que junta las 12 migraciones en orden más
el seed. Sirve para pegarlo entero en **SQL Editor → New query** en el panel de Supabase y
correrlo de una sola vez, sin `supabase link` ni cadena de conexión.

Se regenera con `pnpm instalador:generar` cada vez que se agrega una migración; nunca se
edita a mano. `pnpm instalador:verificar` (parte de `pnpm verificar`) falla si quedó
desactualizado respecto de `supabase/migrations/` o `supabase/seed.sql`.

No es idempotente en el tramo de las migraciones: correrlo dos veces sobre el mismo
proyecto falla en el primer `create type`, a propósito — es el aviso de que el esquema ya
estaba, en vez de dejarlo aplicado a medias. El seed sí lo es (ver más abajo).

### Con la CLI

Con el proyecto de Supabase creado y la CLI enlazada (`supabase link`):

```bash
supabase db push        # aplica supabase/migrations/ en orden
psql "$DATABASE_URL" -f supabase/seed.sql
```

`supabase db reset` sobre un entorno local aplica migraciones y `seed.sql` de una.

El seed se puede volver a correr sin miedo: entra todo con `on conflict do nothing`, así
que llena lo que falta y no pisa lo que Oficina Técnica haya editado. El contracara es que
para re-sincronizar una regla contra el JSON hay que borrar la fila primero.

## 2. Configurar Auth

En **Authentication → URL Configuration**:

- *Site URL*: la URL de producción en Vercel.
- *Redirect URLs*: agregar `https://<dominio>/auth/callback` y, para desarrollo,
  `http://localhost:3000/auth/callback`.

El acceso es por enlace de correo, sin contraseña. El dominio corporativo lo hace cumplir
el trigger `crear_perfil_para_usuario` de `0001_perfil.sql`: un alta con un mail que no
termine en `@famiq.com.ar` falla en la base, no en la interfaz. Si Famiq suma otro dominio,
se cambia ahí y queda versionado.

## 3. Crear el primer admin

El alta crea todos los perfiles con rol `asesor`, y promover a alguien requiere ser admin.
El primer admin se crea desde el editor SQL de Supabase, que corre sin usuario autenticado
y por eso puede saltear esa regla:

```sql
update perfil set rol = 'admin'
where user_id = (select id from auth.users where email = 'jortiz@famiq.com.ar');
```

De ahí en adelante los roles se gestionan desde la aplicación.

## 4. Variables de entorno

Copiar `.env.example` a `.env.local` y completarlo con los datos de **Project Settings →
API**. Las mismas variables van en Vercel.

La aplicación usa siempre la clave pública, nunca la de servicio: todas las consultas pasan
por las políticas de RLS. No hay atajos.

---

## Levantar todo local

Con Docker corriendo:

```bash
npx supabase start          # aplica las migraciones y el seed
cp .env.example .env.local  # completar con las claves que imprime `supabase start`
pnpm build && pnpm start
```

Los correos de acceso no salen a internet: quedan en Mailpit, en
http://127.0.0.1:54324. El primer admin se crea con el `update` de arriba.

En modo `pnpm dev` el navegador puede no hidratar si el websocket de HMR no conecta; con
`pnpm build && pnpm start` no pasa.

---

## Probar el esquema sin Supabase

```bash
pnpm probar:migraciones
```

Levanta una base desde cero en un Postgres local, aplica el shim de `auth`, las migraciones
en orden, el seed dos veces —para verificar que es idempotente— y corre las aserciones de
`supabase/pruebas/`. Apunta a otro Postgres con `PGURL_BASE`.

`supabase/pruebas/00_shim_auth.sql` **no se aplica al proyecto de Supabase**: ahí el schema
`auth`, los roles y `auth.uid()` ya existen. Sirve solo para poder correr el esquema
completo, con RLS incluido, contra un Postgres pelado.
