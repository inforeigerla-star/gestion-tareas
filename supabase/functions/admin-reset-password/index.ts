// Función del servidor: un ADMINISTRADOR genera una contraseña temporal para otro usuario.
// La clave de servicio (SUPABASE_SERVICE_ROLE_KEY) la provee Supabase dentro del servidor:
// nunca viaja al navegador ni está en el código de la app.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Contraseña fácil de dictar: sin letras confusas (0/O, 1/l/I)
function generarClave(largo = 10) {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = new Uint32Array(largo);
  crypto.getRandomValues(r);
  return Array.from(r, (n) => letras[n % letras.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) ¿Quién llama? Se usa la sesión del usuario que hizo el pedido.
  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return json({ error: "Tenés que iniciar sesión" }, 401);

  // 2) ¿Es administrador activo?
  const { data: esAdmin, error: errAdmin } = await comoUsuario.rpc("is_admin");
  if (errAdmin || esAdmin !== true) return json({ error: "Solo un administrador puede hacer esto" }, 403);

  // 3) Datos del pedido
  let userId = "";
  try { userId = (await req.json()).user_id ?? ""; } catch { /* cuerpo inválido */ }
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "Usuario inválido" }, 400);
  if (userId === user.id) return json({ error: "Para tu propia cuenta usá 'Cambiar mi contraseña'" }, 400);

  // 4) Cambiar la contraseña con permisos de servidor
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const clave = generarClave();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: clave });
  if (error) return json({ error: "No se pudo cambiar la contraseña: " + error.message }, 500);

  return json({ password: clave });
});
