// Configuración de conexión a Supabase.
// Esta clave es la "publicable": está pensada para ir en el navegador y NO es secreta.
// La protección de los datos la hacen las reglas de seguridad (RLS) de la base:
// sin usuario activo aprobado no se puede leer ni escribir nada.
// NUNCA pongas acá la clave "service_role" / "secret".
window.APP_CONFIG = {
  SUPABASE_URL: "https://ocrhgbbnsxgsrgmoajhc.supabase.co",
  SUPABASE_KEY: "sb_publishable_LlG5PoMOzr9LIzxLlgS-ZQ_gE9XDGps",
};
