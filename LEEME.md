# Gestión de Tareas — Etapas 1, 2 y 3

## Qué hace esta versión

- Cada persona entra con su correo y su contraseña. El primer usuario que se registra queda como **administrador**. Los demás quedan **pendientes** hasta que el administrador los activa.
- Se pueden crear tareas o avisos de forma rápida: solo el título es obligatorio, y el responsable puede quedar "Sin asignar".
- El estado se cambia desde la lista: Pendiente, En proceso, En espera de respuesta o Realizado.
- Hay un panel de inicio con contadores (pendientes, en proceso, en espera, vencidas, próximas a vencer y realizadas) y las últimas novedades del equipo.
- Hay tres vistas: **Todas las tareas**, **Mis tareas** y **Realizadas**. Todas tienen buscador y filtros por estado, responsable, categoría, prioridad y vencimiento.
- Cada tarea guarda su historial automático: quién la creó, quién la asignó, quién cambió el estado, quién la editó y cuándo.
- El administrador gestiona los **usuarios** (activar, desactivar, dar el rol de administrador) y las **categorías** (crear, renombrar, cambiar el color, ocultar).
- Los cambios se ven en vivo en todas las computadoras, sin recargar la página.
- **Comentarios** en cada tarea: cada integrante puede anotar novedades ("se envió el correo", "llegó la respuesta") y quedan registrados con su nombre y la fecha.
- **Archivos adjuntos** (hasta 10 MB cada uno): se pueden adjuntar al crear la tarea o junto con un comentario. Todos los archivos de la tarea aparecen juntos en el recuadro "Archivos" y se descargan con un clic.
- **Pegar imágenes y recortes:** en "Crear tarea" o en la caja de comentario, apretá **Ctrl+V** después de copiar una imagen o hacer un recorte (en Windows: **Windows + Shift + S**). También se pueden **arrastrar** archivos desde una carpeta. Antes de enviar ves una vista previa y podés quitar lo que no quieras. Las imágenes se muestran en miniatura dentro de la tarea; con un clic se abren en grande.
- Las capturas y fotos pesadas se achican solas (hasta 2000 píxeles de ancho) para no gastar el espacio gratuito.
- Cada persona puede borrar solo sus propios comentarios y archivos. El administrador puede borrar cualquiera.

**Alertas (🔔 arriba a la derecha y "Alertas" en el menú):**
- Te avisa cuando **te asignan una tarea**, cuando **comentan** en una tarea que tenés asignada o que creaste vos, y cuando alguien **marca como realizada** una tarea que creaste.
- **Vencimientos:** el servidor revisa **cada hora** (aunque nadie tenga la app abierta) y avisa al responsable cuando una tarea está por vencer y cuando ya venció. Cada aviso llega **una sola vez**.
- En "Alertas" cada uno elige con cuántos días de anticipación quiere el recordatorio (de 0 a 7; por defecto, 1 día).
- Si tenés la app abierta, la alerta aparece al instante en un aviso abajo de la pantalla y el número se ve en la pestaña del navegador, por ejemplo "(2) Gestión de Tareas".
- Al abrir una tarea, sus alertas quedan marcadas como leídas. Las alertas leídas se borran solas a los 90 días.
- **Importante:** no hay correo ni avisos en el celular. Una persona se entera **solo cuando abre la app**.

**Todavía no incluye:** calendario.

**Límites que conviene conocer:**
- El buscador busca en el título y la descripción de la tarea, **no en los comentarios**. Si el número de factura solo aparece en un comentario, no lo va a encontrar. Conviene ponerlo en la descripción.
- El plan gratuito de Supabase permite **1 GB de archivos en total**. Con facturas en PDF (de 100 a 300 KB cada una) alcanza para varios miles. Si suben fotos del celular, que pesan de 3 a 5 MB, se llena mucho más rápido.

## Dónde están los datos

En Supabase, proyecto **gestion-tareas** (https://supabase.com/dashboard/project/ocrhgbbnsxgsrgmoajhc).
Las reglas de seguridad de la base hacen que nadie pueda ver ni modificar nada si no inició sesión con una cuenta activada por el administrador.

## Paso 1 — Configurar Supabase (una sola vez, unos 2 minutos)

1. Entrá a https://supabase.com/dashboard/project/ocrhgbbnsxgsrgmoajhc
2. En el menú izquierdo andá a **Authentication** → **Sign In / Providers** (en algunas versiones se llama **Providers** → **Email**).
3. Desactivá **"Confirm email"** y guardá.
   *¿Por qué?* El servicio de correo gratuito de Supabase envía muy pocos mails por hora y los confirmaba con demoras o no llegaban. No hace falta: igual nadie entra sin que el administrador lo active.
4. En **Authentication** → **URL Configuration**, por ahora dejá todo como está. Se ajusta cuando publiquemos la app online.

## Paso 2 — Probar la app en tu computadora

> Hacer doble clic en `index.html` **no funciona**, porque el navegador bloquea la conexión cuando la página se abre como archivo. Hay que abrirla con un pequeño servidor local.

1. Abrí la carpeta `gestion-tareas` en tu Escritorio.
2. Hacé clic en la barra de dirección de la carpeta (arriba), escribí `powershell` y apretá Enter.
3. En la ventana azul pegá este comando y apretá Enter:
   ```
   npx --yes serve -l 5173 .
   ```
4. Abrí Chrome en **http://localhost:5173**
5. Tocá **"¿No tenés cuenta? Registrate"**, completá tu nombre, tu correo y una contraseña. **Hacelo vos primero**, para quedar como administrador.
6. Para cerrar el servidor, volvé a la ventana azul y apretá `Ctrl + C`.

## Paso 3 — Sumar al equipo

1. Cada integrante se registra desde la pantalla de ingreso. Esto va a funcionar para todos recién cuando la app esté publicada online, en la etapa 7. Mientras tanto, pueden registrarse desde tu computadora.
2. Vos entrás a **Usuarios**, tildás **Activo** en cada uno y tocás **Guardar**.

## Copias de seguridad

El plan gratuito de Supabase **no te deja descargar copias de seguridad**: las copias diarias son del plan pago. Hoy, si algo se borra por error, no hay forma de recuperarlo. En la etapa de publicación vamos a armar una exportación semanal de los datos. Hasta entonces, no cargues información que no tengas en otro lado.

Atención: si el proyecto no se usa durante 7 días, Supabase lo pausa. Para reactivarlo hay que entrar al panel y tocar "Restore".

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Estructura de la página |
| `css/estilos.css` | Diseño visual |
| `js/app.js` | Toda la lógica de la app |
| `js/config.js` | Dirección del proyecto en Supabase y la clave **publicable** (es pública por diseño: la seguridad la dan las reglas de la base). **Nunca** pongas ahí la clave `service_role`. |
| `js/vendor/` | Biblioteca oficial de Supabase, copiada localmente |
| `supabase/README.md` | Qué cambios se hicieron en la base |


## Publicación online (GitHub Pages)

**Dirección de la app:** https://inforeigerla-star.github.io/gestion-tareas/

- El código está en https://github.com/inforeigerla-star/gestion-tareas (repositorio público: se ve el código, **no los datos**).
- Cada vez que se sube un cambio al repositorio, GitHub publica la nueva versión sola en 1 o 2 minutos. Es gratis y no tiene límite de actualizaciones.
- GitHub guarda cada versión anterior. Si una actualización rompe algo, se puede volver atrás.
- La copia de esta carpeta en el Escritorio sirve para probar la app en tu computadora, pero **la versión que usa el equipo es la de GitHub**.

**En el celular:** abrí la dirección en Chrome (Android) o Safari (iPhone) → menú → **"Agregar a pantalla de inicio"**. Queda un ícono como si fuera una aplicación.

**Sumar al equipo:** pasales la dirección. Cada uno se registra en "Registrate" y vos lo activás en **Usuarios**.

**Permisos:** la app de Claude en GitHub tiene acceso solo a este repositorio (GitHub → Settings → Applications → Claude → Configure).
