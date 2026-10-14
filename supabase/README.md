# Base de datos

La estructura de la base ya está creada en tu proyecto de Supabase **gestion-tareas**.
Las migraciones aplicadas pueden verse en Supabase → Database → Migrations:

1. `etapa1_usuarios_tareas_estados`: tablas de perfiles, categorías, tareas e historial, más las reglas de seguridad (RLS).
2. `permitir_cambios_desde_panel`: permite que el dueño del proyecto active usuarios desde el panel de Supabase.
3. `revocar_funciones_anon`: endurece permisos.
4. `corregir_historial_campos`: corrige el registro de los campos editados.

No hace falta ejecutar nada de esta carpeta. Es documentación.
5. `etapa2_comentarios_adjuntos`: tablas de comentarios y adjuntos, la carpeta privada de archivos "adjuntos" (máximo 10 MB por archivo) y sus reglas de seguridad.
6. `adjuntos_evento_solo_sueltos`: evita que el historial registre dos veces el mismo archivo.
7. `etapa3_alertas`: tabla de alertas, avisos automáticos (asignación, comentario, tarea realizada), revisión de vencimientos cada hora con pg_cron (tareas `revisar-vencimientos` y `limpiar-alertas`, visibles en Supabase → Integrations → Cron).
