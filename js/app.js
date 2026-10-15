/* Gestión de Tareas — Etapa 1: usuarios, tareas, estados, categorías e historial. */
(() => {
  "use strict";

  // Si se llega desde el enlace de "olvidé mi contraseña", se detecta ANTES de que Supabase limpie la dirección.
  const hashInicial = location.hash;
  let recuperando = /type=recovery/.test(hashInicial);
  const errorEnlace = /error_code=otp_expired|error=access_denied/.test(hashInicial);

  const sb = window.supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_KEY);

  // ---------- Constantes ----------
  const ESTADOS = [
    ["pendiente", "Pendiente"],
    ["en_proceso", "En proceso"],
    ["en_espera", "En espera de respuesta"],
    ["realizado", "Realizado"],
  ];
  const PRIORIDADES = [["baja", "Baja"], ["normal", "Normal"], ["alta", "Alta"], ["urgente", "Urgente"]];
  const nombreEstado = Object.fromEntries(ESTADOS);
  const nombrePrio = Object.fromEntries(PRIORIDADES);
  const DIAS_PROXIMO = 2; // "próxima a vencer" = vence hoy o en los próximos 2 días

  // ---------- Estado de la app ----------
  const S = {
    session: null, yo: null,
    perfiles: [], categorias: [], tareas: [], eventos: [], alertas: [],
    filtros: { q: "", estado: "", responsable: "", categoria: "", prioridad: "", venc: "" },
    orden: (() => { try { return localStorage.getItem("orden") || "nuevas"; } catch { return "nuevas"; } })(),
    agrupar: (() => { try { return localStorage.getItem("agrupar") !== "no"; } catch { return true; } })(),
    plegadas: (() => { try { return new Set(JSON.parse(localStorage.getItem("plegadas") || "[]")); } catch { return new Set(); } })(),
  };

  // ---------- Utilidades ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const sumarDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const fFecha = (iso) => iso ? new Date(iso + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  const fFechaHora = (ts) => ts ? new Date(ts).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  const perfil = (id) => S.perfiles.find((p) => p.id === id);
  const nombre = (id) => (id ? (perfil(id)?.full_name || "Usuario") : "Sin asignar");
  const categoria = (id) => S.categorias.find((c) => c.id === id);
  const miembrosActivos = () => S.perfiles.filter((p) => p.active).sort((a, b) => a.full_name.localeCompare(b.full_name));

  function vencimiento(t) {
    if (!t.due_date || t.status === "realizado") return null;
    const hoy = hoyISO();
    if (t.due_date < hoy) return "vencida";
    if (t.due_date <= sumarDias(hoy, DIAS_PROXIMO)) return "proxima";
    return "ok";
  }

  let toastTimer;
  function toast(msg, error = false, ms = 3200) {
    const el = $("#toast");
    el.textContent = msg; el.className = "toast show" + (error ? " error" : "");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.className = "toast"), ms);
  }
  function errorMsg(e) {
    const m = e?.message || String(e);
    if (/Invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos.";
    if (/Email not confirmed/i.test(m)) return "Tenés que confirmar tu correo antes de ingresar (revisá tu bandeja de entrada).";
    if (/already registered/i.test(m)) return "Ese correo ya tiene una cuenta. Probá ingresar.";
    if (/row-level security/i.test(m)) return "No tenés permiso para hacer esto.";
    if (/Failed to fetch/i.test(m)) return "Sin conexión con el servidor. Revisá tu internet.";
    if (/rate limit|too many/i.test(m)) return "Se alcanzó el límite de correos por hora. Probá más tarde o pedile al administrador una contraseña temporal.";
    if (/should be different/i.test(m)) return "La contraseña nueva tiene que ser distinta de la anterior.";
    if (/at least|weak|short/i.test(m)) return "La contraseña es muy corta o débil. Usá al menos 8 caracteres.";
    return m;
  }

  // ---------- Acceso ----------
  let modoRegistro = false;
  function mostrar(id) {
    ["#pantalla-login", "#pantalla-olvide", "#pantalla-nueva-clave", "#pantalla-pendiente", "#app"].forEach((s) => $(s).classList.toggle("hidden", s !== id));
  }

  $("#toggle-registro").addEventListener("click", () => {
    modoRegistro = !modoRegistro;
    $("#login-titulo").textContent = modoRegistro ? "Crear cuenta" : "Ingresar";
    $("#btn-login").textContent = modoRegistro ? "Crear cuenta" : "Ingresar";
    $("#campo-nombre").classList.toggle("hidden", !modoRegistro);
    $("#form-login [name=nombre]").required = modoRegistro;
    $("#toggle-registro").textContent = modoRegistro ? "¿Ya tenés cuenta? Ingresá" : "¿No tenés cuenta? Registrate";
    $("#login-msg").textContent = "";
  });

  $("#form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const msg = $("#login-msg"); msg.className = "login-msg"; msg.textContent = "";
    const btn = $("#btn-login"); btn.disabled = true;
    try {
      if (modoRegistro) {
        const { data, error } = await sb.auth.signUp({
          email: f.get("email").trim(), password: f.get("password"),
          options: { data: { full_name: f.get("nombre").trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          msg.className = "login-msg ok";
          msg.textContent = "Cuenta creada. Revisá tu correo para confirmarla y después ingresá.";
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: f.get("email").trim(), password: f.get("password") });
        if (error) throw error;
      }
    } catch (e) { msg.textContent = errorMsg(e); }
    finally { btn.disabled = false; }
  });

  document.addEventListener("click", async (ev) => {
    if (ev.target.closest("[data-accion=salir]")) { await sb.auth.signOut(); }
  });
  $("#btn-recargar-pend").addEventListener("click", () => iniciarSesion(S.session));

  // ---------- Olvidé mi contraseña ----------
  $("#btn-olvide").addEventListener("click", () => {
    $("#form-olvide").email.value = $("#form-login").email.value;
    $("#olvide-msg").textContent = ""; mostrar("#pantalla-olvide");
  });
  $("#volver-login").addEventListener("click", () => mostrar("#pantalla-login"));
  $("#form-olvide").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = $("#olvide-msg"); msg.className = "login-msg"; msg.textContent = "";
    const btn = ev.target.querySelector("[type=submit]"); btn.disabled = true;
    const { error } = await sb.auth.resetPasswordForEmail(ev.target.email.value.trim(), {
      redirectTo: location.origin + location.pathname,
    });
    btn.disabled = false;
    if (error) { msg.textContent = errorMsg(error); return; }
    msg.className = "login-msg ok";
    msg.textContent = "Si el correo está registrado, en unos minutos te llega un enlace. Revisá también la carpeta de spam.";
  });
  $("#form-nueva-clave").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = ev.target, msg = $("#nueva-clave-msg");
    msg.className = "login-msg";
    if (f.p1.value !== f.p2.value) { msg.textContent = "Las contraseñas no coinciden."; return; }
    const { error } = await sb.auth.updateUser({ password: f.p1.value });
    if (error) { msg.textContent = errorMsg(error); return; }
    recuperando = false; f.reset();
    history.replaceState(null, "", location.pathname + "#/inicio");
    const { data } = await sb.auth.getSession();
    toast("Contraseña actualizada");
    if (data.session) iniciarSesion(data.session); else mostrar("#pantalla-login");
  });
  if (errorEnlace) {
    history.replaceState(null, "", location.pathname);
    setTimeout(() => { mostrar("#pantalla-olvide"); $("#olvide-msg").textContent = "El enlace venció o ya se usó. Pedí uno nuevo."; }, 0);
  }

  // ---------- Cambiar mi contraseña (estando adentro) ----------
  $("#btn-mi-clave").addEventListener("click", () => {
    const m = $("#modal");
    S.tareaAbierta = null;
    m.innerHTML = `
      <div class="modal-head"><strong>Cambiar mi contraseña</strong><button class="icon-btn" id="m-cerrar" aria-label="Cerrar">✕</button></div>
      <form class="modal-body" id="form-mi-clave" style="max-width:420px">
        <label>Nueva contraseña<input name="p1" type="password" required minlength="8" autocomplete="new-password"></label>
        <label>Repetila<input name="p2" type="password" required minlength="8" autocomplete="new-password"></label>
        <div class="acciones"><button class="btn primary" type="submit">Guardar</button></div>
      </form>`;
    m.showModal();
    $("#m-cerrar").onclick = () => m.close();
    $("#form-mi-clave").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      if (f.p1.value !== f.p2.value) { toast("Las contraseñas no coinciden", true); return; }
      const { error } = await sb.auth.updateUser({ password: f.p1.value });
      if (error) { toast(errorMsg(error), true); return; }
      m.close(); toast("Contraseña cambiada");
    });
  });

  sb.auth.onAuthStateChange((evento, session) => {
    if (evento === "PASSWORD_RECOVERY" || (recuperando && session)) {
      recuperando = true; S.session = session; mostrar("#pantalla-nueva-clave"); return;
    }
    if (evento === "SIGNED_OUT" || !session) { S.session = null; S.yo = null; detenerTiempoReal(); mostrar("#pantalla-login"); return; }
    if (evento === "SIGNED_IN" || evento === "INITIAL_SESSION") {
      if (S.session?.user?.id === session.user.id && S.yo) { S.session = session; return; }
      setTimeout(() => iniciarSesion(session), 0); // fuera del callback, como recomienda Supabase
    }
  });

  async function iniciarSesion(session) {
    S.session = session;
    const { data: yo, error } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    if (error) { toast(errorMsg(error), true); return; }
    if (!yo || !yo.active) { S.yo = yo; mostrar("#pantalla-pendiente"); return; }
    S.yo = yo;
    $("#user-name").textContent = yo.full_name;
    document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", yo.role !== "admin"));
    mostrar("#app");
    await cargarTodo();
    iniciarTiempoReal();
    router();
  }

  // ---------- Datos ----------
  async function cargarTodo() {
    const [p, c, t, e, n] = await Promise.all([
      sb.from("profiles").select("*").order("full_name"),
      sb.from("categories").select("*").order("sort_order").order("name"),
      sb.from("tasks").select("*").order("created_at", { ascending: false }).limit(5000),
      sb.from("task_events").select("*").order("created_at", { ascending: false }).limit(15),
      sb.from("notifications").select("*").eq("user_id", S.yo.id).order("created_at", { ascending: false }).limit(100),
    ]);
    for (const r of [p, c, t, e, n]) if (r.error) { toast(errorMsg(r.error), true); return; }
    S.perfiles = p.data; S.categorias = c.data; S.tareas = t.data; S.eventos = e.data; S.alertas = n.data;
    S.yo = S.perfiles.find((x) => x.id === S.yo.id) || S.yo;
    actualizarBadges();
  }

  let canal, recargaTimer;
  function iniciarTiempoReal() {
    detenerTiempoReal();
    canal = sb.channel("cambios")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, programarRecarga)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_events" }, programarRecarga)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, programarRecarga)
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, programarRecarga)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments" }, programarRecarga)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_attachments" }, programarRecarga)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${S.yo.id}` }, (cambio) => {
        if (cambio.eventType === "INSERT") toast("🔔 " + cambio.new.message, false, 7000);
        programarRecarga();
      })
      .subscribe();
  }
  function detenerTiempoReal() { if (canal) { sb.removeChannel(canal); canal = null; } }
  function programarRecarga() {
    clearTimeout(recargaTimer);
    recargaTimer = setTimeout(async () => {
      await cargarTodo();
      // No redibujar si el usuario está escribiendo en un formulario
      const activo = document.activeElement;
      const escribiendo = activo && /INPUT|TEXTAREA|SELECT/.test(activo.tagName) && !activo.classList.contains("estado-select") && activo.type !== "search";
      if (!escribiendo) router(true);
    }, 400);
  }

  function actualizarBadges() {
    const mias = S.tareas.filter((t) => t.assigned_to === S.yo?.id && t.status !== "realizado").length;
    $("#badge-mias").textContent = mias || "";
    const sinLeer = S.alertas.filter((a) => !a.read_at).length;
    $("#badge-alertas").textContent = sinLeer || "";
    $("#badge-alertas-menu").textContent = sinLeer || "";
    document.title = (sinLeer ? `(${sinLeer}) ` : "") + "Gestión de Tareas";
    const pend = S.perfiles.filter((p) => !p.active).length;
    $("#badge-pend").textContent = S.yo?.role === "admin" && pend ? pend : "";
  }

  // ---------- Navegación ----------
  window.addEventListener("hashchange", () => router());
  $("#menu-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("abierto"));

  function router(soloRedibujar = false) {
    if (!S.yo?.active) return;
    const [ruta, param] = (location.hash.replace(/^#\//, "").split("?")[0] || "inicio").split("/");
    document.querySelectorAll(".sidebar a").forEach((a) => a.classList.toggle("activo", a.dataset.ruta === ruta));
    $("#sidebar").classList.remove("abierto");
    if (!soloRedibujar && !$("#modal").open) S.selector = null;
    const vistas = { inicio: vistaInicio, todas: () => vistaLista("todas"), mias: () => vistaLista("mias"), realizadas: () => vistaLista("realizadas"), nueva: vistaNueva, alertas: vistaAlertas, usuarios: vistaUsuarios, categorias: vistaCategorias };
    if (ruta === "nueva" && soloRedibujar) return; // no borrar lo que se está escribiendo
    (vistas[ruta] || vistaInicio)();
    if (ruta === "tarea" && param && !soloRedibujar) abrirTarea(Number(param));
    if ($("#modal").open && soloRedibujar && S.tareaAbierta) refrescarActividad(S.tareaAbierta);
  }

  // ---------- Vista: Inicio ----------
  function vistaInicio() {
    const abiertas = S.tareas.filter((t) => t.status !== "realizado");
    const cuenta = (fn) => S.tareas.filter(fn).length;
    const hace7 = Date.now() - 7 * 864e5;
    const realizadasRecientes = S.tareas.filter((t) => t.status === "realizado" && new Date(t.completed_at) > hace7)
      .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
    const vencidas = abiertas.filter((t) => vencimiento(t) === "vencida");
    const proximas = abiertas.filter((t) => vencimiento(t) === "proxima");
    const stat = (cls, n, l, href) => `<a class="stat ${cls}" href="${href}"><div class="n">${n}</div><div class="l">${l}</div></a>`;

    $("#contenido").innerHTML = `
      <h1>Hola, ${esc(S.yo.full_name.split(" ")[0])}</h1>
      <div class="stats">
        ${stat("pendiente", cuenta((t) => t.status === "pendiente"), "Pendientes", "#/todas?estado=pendiente")}
        ${stat("en_proceso", cuenta((t) => t.status === "en_proceso"), "En proceso", "#/todas?estado=en_proceso")}
        ${stat("en_espera", cuenta((t) => t.status === "en_espera"), "En espera de respuesta", "#/todas?estado=en_espera")}
        ${stat("vencidas", vencidas.length, "Vencidas", "#/todas?venc=vencida")}
        ${stat("proximas", proximas.length, "Próximas a vencer", "#/todas?venc=proxima")}
        ${stat("realizado", realizadasRecientes.length, "Realizadas (7 días)", "#/realizadas")}
      </div>
      <h2>Requieren atención</h2>
      <div class="lista" id="lista-atencion"></div>`;
    const atencion = [...vencidas, ...proximas, ...abiertas.filter((t) => t.priority === "urgente" && !vencimiento(t)?.match(/vencida|proxima/))]
      .filter((t, i, arr) => arr.indexOf(t) === i).slice(0, 10);
    pintarLista($("#lista-atencion"), atencion, "Nada urgente ni vencido. 👌");
  }

  // ---------- Vista: listas ----------
  function leerFiltrosDeURL() {
    const qs = new URLSearchParams(location.hash.split("?")[1] || "");
    if ([...qs.keys()].length) {
      Object.keys(S.filtros).forEach((k) => (S.filtros[k] = qs.get(k) || ""));
      history.replaceState(null, "", location.hash.split("?")[0]);
    }
  }

  function vistaLista(tipo) {
    if (location.hash.includes("?")) leerFiltrosDeURL();
    const F = S.filtros;
    const titulos = { todas: "Todas las tareas", mias: "Mis tareas", realizadas: "Realizadas" };
    const opts = (arr, sel, vacio) => `<option value="">${vacio}</option>` + arr.map(([v, l]) => `<option value="${esc(v)}" ${String(sel) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("");

    $("#contenido").innerHTML = `
      <h1>${titulos[tipo]}</h1>
      <div class="toolbar">
        <input type="search" id="f-q" placeholder="Buscar por título o descripción (proveedor, cliente, n.º de factura…)" value="${esc(F.q)}">
        ${tipo === "realizadas" ? "" : `<select id="f-estado">${opts(ESTADOS.filter(([v]) => v !== "realizado"), F.estado, "Todos los estados abiertos")}</select>`}
        ${tipo === "mias" ? "" : `<select id="f-responsable">${opts([["__none", "Sin asignar"], ...miembrosActivos().map((p) => [p.id, p.full_name])], F.responsable, "Todos los responsables")}</select>`}
        <select id="f-categoria">${opts(S.categorias.map((c) => [c.id, c.name]), F.categoria, "Todas las categorías")}</select>
        <select id="f-prioridad">${opts(PRIORIDADES, F.prioridad, "Todas las prioridades")}</select>
        ${tipo === "realizadas" ? "" : `<select id="f-venc">${opts([["vencida", "Vencidas"], ["proxima", "Próximas a vencer"], ["sin", "Sin fecha límite"]], F.venc, "Cualquier vencimiento")}</select>`}
        ${tipo === "realizadas" ? "" : `<select id="f-orden" title="Orden">
          <option value="nuevas" ${S.orden === "nuevas" ? "selected" : ""}>Orden: más nuevas primero</option>
          <option value="urgencia" ${S.orden === "urgencia" ? "selected" : ""}>Orden: por urgencia</option>
        </select>`}
        ${tipo === "todas" ? `<select id="f-agrupar" title="Vista">
          <option value="si" ${S.agrupar ? "selected" : ""}>Vista: por categoría</option>
          <option value="no" ${S.agrupar ? "" : "selected"}>Vista: lista simple</option>
        </select>` : ""}
        ${Object.values(F).some(Boolean) ? '<button class="btn sm" id="f-limpiar">Limpiar filtros</button>' : ""}
      </div>
      <div class="lista" id="lista"></div>`;

    const pintar = () => {
      const q = F.q.trim().toLowerCase();
      let ts = S.tareas.filter((t) => (tipo === "realizadas" ? t.status === "realizado" : t.status !== "realizado"));
      if (tipo === "mias") ts = ts.filter((t) => t.assigned_to === S.yo.id);
      if (q) ts = ts.filter((t) => (t.title + " " + t.description + " #" + t.id).toLowerCase().includes(q));
      if (F.estado && tipo !== "realizadas") ts = ts.filter((t) => t.status === F.estado);
      if (F.responsable && tipo !== "mias") ts = ts.filter((t) => (F.responsable === "__none" ? !t.assigned_to : t.assigned_to === F.responsable));
      if (F.categoria) ts = ts.filter((t) => String(t.category_id) === F.categoria);
      if (F.prioridad) ts = ts.filter((t) => t.priority === F.prioridad);
      if (F.venc === "sin") ts = ts.filter((t) => !t.due_date);
      else if (F.venc) ts = ts.filter((t) => vencimiento(t) === F.venc);
      if (tipo === "realizadas") ts.sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
      else if (S.orden === "urgencia") ts.sort(ordenAbiertas);
      else ts.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
      const vacio = tipo === "mias" ? "No tenés tareas abiertas asignadas." : "No hay tareas con estos filtros.";
      if (tipo === "todas" && S.agrupar && ts.length) pintarPorCategoria($("#lista"), ts);
      else pintarLista($("#lista"), ts, vacio);
    };
    const enlazar = (id, key) => { const el = $(id); if (el) el.addEventListener(el.type === "search" ? "input" : "change", () => { F[key] = el.value; if (key !== "q") vistaLista(tipo); else pintar(); }); };
    enlazar("#f-q", "q"); enlazar("#f-estado", "estado"); enlazar("#f-responsable", "responsable");
    enlazar("#f-categoria", "categoria"); enlazar("#f-prioridad", "prioridad"); enlazar("#f-venc", "venc");
    $("#f-agrupar")?.addEventListener("change", (ev) => {
      S.agrupar = ev.target.value === "si";
      try { localStorage.setItem("agrupar", S.agrupar ? "si" : "no"); } catch { /* sin almacenamiento */ }
      pintar();
    });
    $("#f-orden")?.addEventListener("change", (ev) => {
      S.orden = ev.target.value;
      try { localStorage.setItem("orden", S.orden); } catch { /* sin almacenamiento */ }
      pintar();
    });
    $("#f-limpiar")?.addEventListener("click", () => { Object.keys(F).forEach((k) => (F[k] = "")); vistaLista(tipo); });
    pintar();
  }

  // Agrupa las tareas (ya filtradas y ordenadas) por categoría, en el orden de las categorías.
  function pintarPorCategoria(cont, tareas) {
    const grupos = [...S.categorias.map((c) => ({ key: String(c.id), nombre: c.name, color: c.color })),
      { key: "sin", nombre: "Sin categoría", color: "#94a3b8" }]
      .map((g) => ({ ...g, tareas: tareas.filter((t) => (t.category_id ? String(t.category_id) : "sin") === g.key) }))
      .filter((g) => g.tareas.length);
    cont.innerHTML = grupos.map((g) => {
      const plegada = S.plegadas.has(g.key);
      const vencidas = g.tareas.filter((t) => vencimiento(t) === "vencida").length;
      return `
        <section class="grupo-cat ${plegada ? "plegada" : ""}" data-key="${esc(g.key)}">
          <button class="grupo-cab" aria-expanded="${!plegada}">
            <span class="flecha">▾</span>
            <span class="dot" style="background:${esc(g.color)}"></span>
            <span class="grupo-nombre">${esc(g.nombre)}</span>
            <span class="grupo-n">${g.tareas.length}</span>
            ${vencidas ? `<span class="chip prio prio-urgente">${vencidas} vencida${vencidas > 1 ? "s" : ""}</span>` : ""}
          </button>
          <div class="lista grupo-lista"></div>
        </section>`;
    }).join("");
    cont.querySelectorAll(".grupo-cat").forEach((sec, i) => {
      pintarLista(sec.querySelector(".grupo-lista"), grupos[i].tareas, "");
      sec.querySelector(".grupo-cab").addEventListener("click", () => {
        const k = sec.dataset.key;
        if (S.plegadas.has(k)) S.plegadas.delete(k); else S.plegadas.add(k);
        sec.classList.toggle("plegada");
        sec.querySelector(".grupo-cab").setAttribute("aria-expanded", String(!S.plegadas.has(k)));
        try { localStorage.setItem("plegadas", JSON.stringify([...S.plegadas])); } catch { /* sin almacenamiento */ }
      });
    });
  }

  const pesoPrio = { urgente: 0, alta: 1, normal: 2, baja: 3 };
  function ordenAbiertas(a, b) {
    const va = { vencida: 0, proxima: 1 }[vencimiento(a)] ?? 2, vb = { vencida: 0, proxima: 1 }[vencimiento(b)] ?? 2;
    if (va !== vb) return va - vb;
    if (pesoPrio[a.priority] !== pesoPrio[b.priority]) return pesoPrio[a.priority] - pesoPrio[b.priority];
    if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
    if (!!a.due_date !== !!b.due_date) return a.due_date ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  }

  function pintarLista(cont, tareas, textoVacio) {
    if (!tareas.length) { cont.innerHTML = `<div class="vacio">${esc(textoVacio)}</div>`; return; }
    cont.innerHTML = tareas.map(htmlTarea).join("");
    cont.querySelectorAll(".tarea").forEach((el) => {
      const id = Number(el.dataset.id);
      el.addEventListener("click", (ev) => { if (!ev.target.closest(".estado-select")) abrirTarea(id); });
      el.querySelector(".estado-select").addEventListener("change", (ev) => cambiarEstado(id, ev.target.value));
    });
  }

  function htmlTarea(t) {
    const cat = categoria(t.category_id);
    const v = vencimiento(t);
    const venc = t.due_date ? `<span class="venc ${v || ""}">${v === "vencida" ? "Vencida · " : v === "proxima" ? "Vence pronto · " : "Vence "}${fFecha(t.due_date)}</span>` : "";
    return `
      <div class="tarea prio-${t.priority} ${t.status}" data-id="${t.id}">
        <div class="prio-bar" title="Prioridad ${nombrePrio[t.priority]}"></div>
        <div>
          <div class="titulo">${esc(t.title)}</div>
          <div class="meta">
            ${t.priority === "alta" || t.priority === "urgente" ? `<span class="chip prio prio-${t.priority}">${nombrePrio[t.priority]}</span>` : ""}
            ${cat ? `<span class="chip"><span class="dot" style="background:${esc(cat.color)}"></span>${esc(cat.name)}</span>` : ""}
            <span>👤 ${esc(nombre(t.assigned_to))}</span>
            ${venc}
            ${t.is_private ? '<span class="chip privada" title="Privada: solo creador, responsable y administrador">🔒 Privada</span>' : ""}
            <span>#${t.id}</span>
          </div>
        </div>
        <div class="lado">
          <select class="estado-select st-${t.status}" aria-label="Estado">
            ${ESTADOS.map(([v, l]) => `<option value="${v}" ${v === t.status ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </div>
      </div>`;
  }

  async function cambiarEstado(id, estado) {
    const { error } = await sb.from("tasks").update({ status: estado }).eq("id", id);
    if (error) { toast(errorMsg(error), true); return; }
    const t = S.tareas.find((x) => x.id === id); if (t) t.status = estado;
    toast(`Estado cambiado a "${nombreEstado[estado]}"`);
    await cargarTodo(); router(true);
  }

  // ---------- Formulario de tarea (crear / editar) ----------
  function htmlFormTarea(t = {}, completo = false) {
    const sel = (arr, val) => arr.map(([v, l]) => `<option value="${esc(v)}" ${String(val ?? "") === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("");
    const cats = S.categorias.filter((c) => c.active || c.id === t.category_id).map((c) => [c.id, c.name]);
    return `
      <label>Título *<input name="title" required maxlength="200" value="${esc(t.title)}" placeholder="Ej.: Pedir cotización a proveedor X"></label>
      <div class="fila">
        <label>Responsable<select name="assigned_to">${sel([["", "Sin asignar"], ...miembrosActivos().map((p) => [p.id, p.full_name])], t.assigned_to)}</select></label>
        <label>Prioridad<select name="priority">${sel(PRIORIDADES, t.priority || "normal")}</select></label>
      </div>
      ${(() => {
        const puedeCambiar = !t.id || t.created_by === S.yo.id || S.yo.role === "admin";
        return `<label class="check-privada${puedeCambiar ? "" : " deshabilitado"}">
          <input type="checkbox" name="is_private" ${t.is_private ? "checked" : ""} ${puedeCambiar ? "" : "disabled"}>
          <span>🔒 <strong>Privada</strong> — solo la ven quien la creó, el responsable y el administrador${puedeCambiar ? "" : " (solo quien la creó puede cambiar esto)"}</span>
        </label>`;
      })()}
      <div class="${completo ? "" : "hidden"}" id="mas-campos">
        <label>Descripción<textarea name="description" placeholder="Detalles, proveedor, cliente, número de factura…">${esc(t.description)}</textarea></label>
        <div class="fila">
          <label>Categoría<select name="category_id">${sel([["", "Sin categoría"], ...cats], t.category_id)}</select></label>
          <label>Fecha límite<input type="date" name="due_date" value="${esc(t.due_date || "")}"></label>
          ${t.id ? `<label>Estado<select name="status">${sel(ESTADOS, t.status)}</select></label>` : ""}
        </div>
      </div>
      ${completo ? "" : '<button type="button" class="link mas-opciones" id="btn-mas">+ Descripción, categoría y fecha límite</button>'}`;
  }

  function datosForm(form) {
    const f = new FormData(form);
    const d = {
      title: f.get("title").trim(),
      assigned_to: f.get("assigned_to") || null,
      priority: f.get("priority"),
      description: (f.get("description") || "").trim(),
      category_id: f.get("category_id") ? Number(f.get("category_id")) : null,
      due_date: f.get("due_date") || null,
    };
    if (f.has("status")) d.status = f.get("status");
    const priv = form.querySelector("[name=is_private]");
    if (priv && !priv.disabled) d.is_private = priv.checked;
    return d;
  }

  function vistaNueva() {
    $("#contenido").innerHTML = `
      <h1>Crear tarea o aviso</h1>
      <form class="form-card" id="form-nueva">
        ${htmlFormTarea({}, false)}
        ${htmlZonaArchivos("n")}
        <div class="acciones">
          <button type="button" class="btn" onclick="history.back()">Cancelar</button>
          <button class="btn primary" type="submit">Crear</button>
        </div>
      </form>`;
    $("#btn-mas").addEventListener("click", (ev) => { $("#mas-campos").classList.remove("hidden"); ev.target.remove(); });
    $("#form-nueva [name=title]").focus();
    const sel = selectorArchivos("n", $("#form-nueva"));
    $("#form-nueva").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = ev.submitter || ev.target.querySelector("[type=submit]");
      const archivos = sel.archivos();
      if (!validarArchivos(archivos)) return;
      btn.disabled = true; btn.textContent = archivos.length ? "Creando y subiendo archivos…" : "Creando…";
      const { data, error } = await sb.from("tasks").insert(datosForm(ev.target)).select().single();
      if (error) { btn.disabled = false; btn.textContent = "Crear"; toast(errorMsg(error), true); return; }
      const fallidos = await subirArchivos(data.id, archivos, null);
      btn.disabled = false;
      if (fallidos.length) toast(`La tarea se creó, pero no se pudieron subir: ${fallidos.join(", ")}`, true);
      else toast("Tarea creada");
      await cargarTodo();
      location.hash = data.assigned_to === S.yo.id ? "#/mias" : "#/todas";
    });
  }

  // ---------- Archivos ----------
  const MAX_MB = 10;
  const BUCKET = "adjuntos";
  const fTamano = (b) => b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1048576).toFixed(1) + " MB";
  const nombreSeguro = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "archivo";

  const esImagen = (a) => /^image\/(png|jpe?g|gif|webp|bmp)$/i.test(a.mime_type || a.type || "");

  // Reduce capturas y fotos pesadas para no gastar el espacio gratuito (1 GB).
  async function optimizarImagen(f) {
    if (!/^image\/(png|jpe?g|webp|bmp)$/i.test(f.type) || f.size < 700 * 1024) return f;
    try {
      const bmp = await createImageBitmap(f);
      const escala = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(bmp.width * escala); cv.height = Math.round(bmp.height * escala);
      const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.85));
      if (!blob || blob.size >= f.size) return f;
      return new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    } catch { return f; }
  }

  function htmlZonaArchivos(pref) {
    return `
      <div class="zona-archivos" id="${pref}-zona">
        <div class="chips" id="${pref}-chips"></div>
        <label class="btn sm adjuntar">📎 Adjuntar archivos<input type="file" name="archivos" multiple hidden></label>
        <span class="meta pista">o pegá una imagen o recorte con <strong>Ctrl+V</strong>, o arrastrá archivos acá</span>
      </div>`;
  }

  // Maneja los archivos elegidos, pegados (Ctrl+V) o arrastrados de un formulario.
  function selectorArchivos(pref, form) {
    let lista = [];
    const chips = $(`#${pref}-chips`, form);
    const input = form.querySelector("input[type=file]");
    const pintar = () => {
      chips.innerHTML = lista.map((f, i) => `
        <span class="chip-archivo">
          ${f.type.startsWith("image/") ? `<img src="${f._vista}" alt="">` : "📄"}
          <span class="n">${esc(f.name)}</span><span class="cuando">${fTamano(f.size)}</span>
          <button type="button" class="link" data-i="${i}" title="Quitar">✕</button>
        </span>`).join("");
      chips.querySelectorAll("button").forEach((b) => (b.onclick = () => { URL.revokeObjectURL(lista[b.dataset.i]._vista); lista.splice(Number(b.dataset.i), 1); pintar(); }));
    };
    const agregar = async (files, pegado = false) => {
      for (let f of files) {
        if (pegado && f.type.startsWith("image/")) {
          const ts = new Date().toLocaleString("sv").replace(/[: ]/g, "-");
          f = new File([f], `recorte-${ts}.${(f.type.split("/")[1] || "png").replace("jpeg", "jpg")}`, { type: f.type });
        }
        f = await optimizarImagen(f);
        if (f.type.startsWith("image/")) f._vista = URL.createObjectURL(f);
        lista.push(f);
      }
      pintar();
    };
    input.addEventListener("change", () => { agregar([...input.files]); input.value = ""; });
    form.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); form.classList.add("arrastrando"); } });
    form.addEventListener("dragleave", (e) => { if (!form.contains(e.relatedTarget)) form.classList.remove("arrastrando"); });
    form.addEventListener("drop", (e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); form.classList.remove("arrastrando"); agregar([...e.dataTransfer.files]); });
    const sel = {
      archivos: () => [...lista],
      limpiar: () => { lista.forEach((f) => f._vista && URL.revokeObjectURL(f._vista)); lista = []; pintar(); },
      pegar: (files) => agregar(files, true),
    };
    S.selector = sel;
    if (pref === "n") S.selectorNueva = sel;
    return sel;
  }

  // Ctrl+V en cualquier parte: si el portapapeles trae una imagen o archivo, se adjunta.
  document.addEventListener("paste", (e) => {
    if (!S.selector || !e.clipboardData) return;
    const files = [...e.clipboardData.items].filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter(Boolean);
    const traeTexto = [...e.clipboardData.types].includes("text/plain");
    if (!files.length || traeTexto) return; // si es texto, se pega normal
    e.preventDefault();
    S.selector.pegar(files);
    toast(files.length > 1 ? `${files.length} imágenes agregadas` : "Imagen agregada");
  });

  function validarArchivos(archivos) {
    const grandes = archivos.filter((f) => f.size > MAX_MB * 1048576);
    if (grandes.length) { toast(`Superan ${MAX_MB} MB: ${grandes.map((f) => f.name).join(", ")}`, true); return false; }
    return true;
  }

  // Sube cada archivo a la carpeta de la tarea y lo registra. Devuelve los nombres que fallaron.
  async function subirArchivos(taskId, archivos, commentId) {
    const fallidos = [];
    for (const f of archivos) {
      const ruta = `${taskId}/${crypto.randomUUID()}-${nombreSeguro(f.name)}`;
      const up = await sb.storage.from(BUCKET).upload(ruta, f, { contentType: f.type || "application/octet-stream" });
      if (up.error) { console.error(up.error); fallidos.push(f.name); continue; }
      const { error } = await sb.from("task_attachments").insert({
        task_id: taskId, comment_id: commentId, file_name: f.name, storage_path: ruta, size_bytes: f.size, mime_type: f.type || "",
      });
      if (error) { console.error(error); await sb.storage.from(BUCKET).remove([ruta]); fallidos.push(f.name); }
    }
    return fallidos;
  }

  async function descargarAdjunto(a) {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(a.storage_path, 120, { download: a.file_name });
    if (error) { toast(errorMsg(error), true); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function borrarAdjuntos(lista) {
    if (!lista.length) return true;
    const { data, error } = await sb.from("task_attachments").delete().in("id", lista.map((a) => a.id)).select("storage_path");
    if (error) { toast(errorMsg(error), true); return false; }
    if (data.length < lista.length) { toast("Solo podés borrar archivos que subiste vos.", true); }
    if (data.length) await sb.storage.from(BUCKET).remove(data.map((d) => d.storage_path));
    return true;
  }

  // ---------- Detalle de tarea (ventana) ----------
  async function abrirTarea(id) {
    const t = S.tareas.find((x) => x.id === id);
    if (!t) { toast("No se encontró la tarea #" + id, true); return; }
    S.tareaAbierta = id;
    marcarLeidas(S.alertas.filter((a) => a.task_id === id && !a.read_at).map((a) => a.id));
    const m = $("#modal");
    m.innerHTML = `
      <div class="modal-head"><strong>Tarea #${t.id} · ${esc(t.title)}</strong><button class="icon-btn" id="m-cerrar" aria-label="Cerrar">✕</button></div>
      <div class="modal-body">
        <div class="grid2">
          <form id="form-editar">
            ${htmlFormTarea(t, true)}
            <div class="acciones">
              ${S.yo.role === "admin" ? '<button type="button" class="btn danger" id="m-borrar">Eliminar</button>' : ""}
              <button class="btn primary" type="submit">Guardar cambios</button>
            </div>
            <p class="meta">Creada por <strong>${esc(nombre(t.created_by))}</strong> el ${fFechaHora(t.created_at)}</p>
            ${t.completed_at ? `<p class="meta">Realizada por <strong>${esc(nombre(t.completed_by))}</strong> el ${fFechaHora(t.completed_at)}</p>` : ""}
          </form>
          <div>
            <form id="form-comentario" class="composer">
              <textarea name="body" placeholder="Escribí una novedad: se envió el correo, llegó la respuesta, se pagó…"></textarea>
              <div class="chips" id="c-chips"></div>
              <div class="composer-acciones">
                <label class="btn sm adjuntar">📎 Adjuntar<input type="file" name="archivos" multiple hidden></label>
                <span class="meta pista">o pegá una captura con Ctrl+V</span>
                <button class="btn primary sm" type="submit">Comentar</button>
              </div>
            </form>
            <div id="m-archivos"></div>
            <h2 style="margin-top:16px">Actividad</h2>
            <ul class="historial" id="m-actividad"><li class="cuando">Cargando…</li></ul>
          </div>
        </div>
      </div>`;
    if (!m.open) m.showModal();
    $("#m-cerrar").onclick = () => m.close();

    $("#form-editar").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const d = datosForm(ev.target);
      if (!d.title) { toast("El título es obligatorio", true); return; }
      const { error } = await sb.from("tasks").update(d).eq("id", id);
      if (error) { toast(errorMsg(error), true); return; }
      toast("Cambios guardados"); m.close(); await cargarTodo(); router(true);
    });
    $("#m-borrar")?.addEventListener("click", async () => {
      if (!confirm("¿Eliminar definitivamente esta tarea, sus comentarios y sus archivos? Si ya está resuelta, mejor marcala como Realizada.")) return;
      const { data: adj } = await sb.from("task_attachments").select("storage_path").eq("task_id", id);
      const { error } = await sb.from("tasks").delete().eq("id", id);
      if (error) { toast(errorMsg(error), true); return; }
      if (adj?.length) await sb.storage.from(BUCKET).remove(adj.map((a) => a.storage_path));
      toast("Tarea eliminada"); m.close(); await cargarTodo(); router(true);
    });

    const fc = $("#form-comentario");
    const selC = selectorArchivos("c", fc);
    fc.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const body = fc.body.value.trim();
      const archivos = selC.archivos();
      if (!body && !archivos.length) { toast("Escribí algo o adjuntá un archivo", true); return; }
      if (!validarArchivos(archivos)) return;
      const btn = ev.submitter || ev.target.querySelector("[type=submit]"); btn.disabled = true; btn.textContent = archivos.length ? "Subiendo…" : "Enviando…";
      const { data: c, error } = await sb.from("task_comments").insert({ task_id: id, body }).select().single();
      if (error) { btn.disabled = false; btn.textContent = "Comentar"; toast(errorMsg(error), true); return; }
      const fallidos = await subirArchivos(id, archivos, c.id);
      btn.disabled = false; btn.textContent = "Comentar";
      fc.reset(); selC.limpiar();
      if (fallidos.length) toast(`No se pudieron subir: ${fallidos.join(", ")}`, true); else toast("Comentario agregado");
      refrescarActividad(id);
    });
    refrescarActividad(id);
  }
  $("#modal").addEventListener("close", () => {
    S.tareaAbierta = null;
    S.selector = location.hash.startsWith("#/nueva") ? S.selectorNueva : null;
    if (location.hash.startsWith("#/tarea")) history.replaceState(null, "", "#/todas");
  });

  async function refrescarActividad(id) {
    const [ev, co, ad] = await Promise.all([
      sb.from("task_events").select("*").eq("task_id", id),
      sb.from("task_comments").select("*").eq("task_id", id),
      sb.from("task_attachments").select("*").eq("task_id", id).order("created_at"),
    ]);
    const ul = $("#m-actividad"); if (!ul || S.tareaAbierta !== id) return;
    const err = ev.error || co.error || ad.error;
    if (err) { ul.innerHTML = `<li>${esc(errorMsg(err))}</li>`; return; }

    const adjuntos = ad.data;
    // Miniaturas: enlaces temporales (1 hora) para las imágenes
    const imgs = adjuntos.filter(esImagen);
    const urls = {};
    if (imgs.length) {
      const { data } = await sb.storage.from(BUCKET).createSignedUrls(imgs.map((a) => a.storage_path), 3600);
      (data || []).forEach((u) => { if (u.signedUrl) urls[u.path] = u.signedUrl; });
    }
    if (S.tareaAbierta !== id) return;
    const puedeBorrar = (autor) => autor === S.yo.id || S.yo.role === "admin";
    const htmlAdj = (a, conMiniatura = false) => `
      ${conMiniatura && urls[a.storage_path] ? `<a href="${esc(urls[a.storage_path])}" target="_blank" rel="noopener" class="miniatura"><img src="${esc(urls[a.storage_path])}" alt="${esc(a.file_name)}" loading="lazy"></a>` : ""}
      <div class="adjunto">
        <button class="link a-bajar" data-id="${a.id}">${esImagen(a) ? "🖼️" : "📄"} ${esc(a.file_name)}</button>
        <span class="cuando">${fTamano(a.size_bytes)}</span>
        ${puedeBorrar(a.uploaded_by) ? `<button class="link a-borrar" data-id="${a.id}" title="Borrar archivo">✕</button>` : ""}
      </div>`;

    // Lista de todos los archivos de la tarea, arriba de la actividad
    $("#m-archivos").innerHTML = adjuntos.length
      ? `<div class="card archivos"><h2>Archivos (${adjuntos.length})</h2>${adjuntos.map((a) => htmlAdj(a)).join("")}</div>` : "";

    // Línea de tiempo: comentarios (con sus archivos) + cambios de la tarea + archivos sueltos
    const items = [
      ...co.data.map((c) => ({ when: c.created_at, html: `
        <li class="comentario">
          <div><strong>${esc(nombre(c.author))}</strong> comentó
            ${puedeBorrar(c.author) ? `<button class="link c-borrar" data-id="${c.id}" title="Borrar comentario">Borrar</button>` : ""}</div>
          ${c.body ? `<div class="cuerpo">${esc(c.body)}</div>` : ""}
          ${adjuntos.filter((a) => a.comment_id === c.id).map((a) => htmlAdj(a, true)).join("")}
          <div class="cuando">${fFechaHora(c.created_at)}</div>
        </li>` })),
      ...ev.data.filter((e) => e.kind !== "comentario" && e.kind !== "adjunto").map((e) => ({ when: e.created_at, id: e.id, html: `<li>${textoEvento(e)}<div class="cuando">${fFechaHora(e.created_at)}</div></li>` })),
      // Archivos subidos sin comentario (por ejemplo, al crear la tarea)
      ...adjuntos.filter((a) => !a.comment_id).map((a) => ({ when: a.created_at, html: `<li><strong>${esc(nombre(a.uploaded_by))}</strong> adjuntó un archivo${htmlAdj(a, true)}<div class="cuando">${fFechaHora(a.created_at)}</div></li>` })),
    ].sort((a, b) => b.when.localeCompare(a.when) || (b.id || 0) - (a.id || 0));
    ul.innerHTML = items.map((i) => i.html).join("") || '<li class="cuando">Sin actividad.</li>';

    const porId = (aid) => adjuntos.find((a) => a.id === Number(aid));
    $("#modal").querySelectorAll(".a-bajar").forEach((b) => (b.onclick = () => descargarAdjunto(porId(b.dataset.id))));
    $("#modal").querySelectorAll(".a-borrar").forEach((b) => (b.onclick = async () => {
      const a = porId(b.dataset.id);
      if (!confirm(`¿Borrar el archivo "${a.file_name}"?`)) return;
      if (await borrarAdjuntos([a])) { toast("Archivo borrado"); refrescarActividad(id); }
    }));
    $("#modal").querySelectorAll(".c-borrar").forEach((b) => (b.onclick = async () => {
      const cid = Number(b.dataset.id);
      if (!confirm("¿Borrar este comentario y sus archivos?")) return;
      if (!(await borrarAdjuntos(adjuntos.filter((a) => a.comment_id === cid)))) return;
      const { error } = await sb.from("task_comments").delete().eq("id", cid);
      if (error) { toast(errorMsg(error), true); return; }
      toast("Comentario borrado"); refrescarActividad(id);
    }));
  }

  function textoEvento(e) {
    const quien = `<strong>${esc(nombre(e.actor))}</strong>`;
    const d = e.detail || {};
    switch (e.kind) {
      case "creada": return `${quien} creó la tarea${d.assigned_to ? ` y la asignó a ${esc(nombre(d.assigned_to))}` : ""}`;
      case "estado": return `${quien} cambió el estado: ${esc(nombreEstado[d.from])} → <strong>${esc(nombreEstado[d.to])}</strong>`;
      case "asignada": return d.to ? `${quien} asignó la tarea a <strong>${esc(nombre(d.to))}</strong>` : `${quien} dejó la tarea sin asignar`;
      case "editada": return `${quien} editó: ${esc((d.fields || []).join(", "))}`;
      case "comentario": return `${quien} comentó${d.excerpt ? `: “${esc(d.excerpt)}”` : " (con archivos)"}`;
      case "adjunto": return `${quien} adjuntó <strong>${esc(d.file_name)}</strong>`;
      default: return `${quien} ${esc(e.kind)}`;
    }
  }
  function htmlEventoGlobal(e) {
    const t = S.tareas.find((x) => x.id === e.task_id);
    return `<li>${textoEvento(e)} — <a href="#/tarea/${e.task_id}">${esc(t ? t.title : "#" + e.task_id)}</a><div class="cuando">${fFechaHora(e.created_at)}</div></li>`;
  }

  // ---------- Alertas ----------
  const iconoAlerta = { asignada: "👤", comentario: "💬", realizada: "✅", por_vencer: "⏰", vencida: "⚠️" };

  async function marcarLeidas(ids) {
    if (!ids.length) return;
    const ahora = new Date().toISOString();
    S.alertas.forEach((a) => { if (ids.includes(a.id)) a.read_at = ahora; });
    actualizarBadges();
    const { error } = await sb.from("notifications").update({ read_at: ahora }).in("id", ids);
    if (error) toast(errorMsg(error), true);
  }

  function vistaAlertas() {
    const sinLeer = S.alertas.filter((a) => !a.read_at);
    $("#contenido").innerHTML = `
      <div class="titulo-fila">
        <h1>Alertas</h1>
        ${sinLeer.length ? '<button class="btn sm" id="al-todas">Marcar todas como leídas</button>' : ""}
      </div>
      <div class="lista" id="al-lista">
        ${S.alertas.map((a) => `
          <div class="alerta ${a.read_at ? "leida" : ""} k-${a.kind}" data-id="${a.id}" data-task="${a.task_id ?? ""}">
            <span class="ico">${iconoAlerta[a.kind] || "🔔"}</span>
            <div>
              <div class="msg">${esc(a.message)}</div>
              <div class="cuando">${fFechaHora(a.created_at)}${a.actor ? " · " + esc(nombre(a.actor)) : ""}</div>
            </div>
            ${a.read_at ? "" : '<span class="punto" title="Sin leer"></span>'}
          </div>`).join("") || '<div class="vacio">No tenés alertas. Te vamos a avisar acá cuando te asignen una tarea, comenten en una tuya o algo esté por vencer.</div>'}
      </div>
      <div class="card ajustes">
        <h2>Recordatorio de vencimientos</h2>
        <label style="margin:0">Avisarme de las tareas que tengo asignadas
          <select id="al-dias" style="max-width:260px">
            ${[[0, "el mismo día que vencen"], [1, "1 día antes"], [2, "2 días antes"], [3, "3 días antes"], [5, "5 días antes"], [7, "7 días antes"]]
              .map(([v, l]) => `<option value="${v}" ${S.yo.remind_days === v ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </label>
        <p class="meta">Si la tarea vence y sigue abierta, también te llega una alerta de "vencida". Cada aviso llega una sola vez.</p>
      </div>`;
    $("#al-todas")?.addEventListener("click", async () => { await marcarLeidas(sinLeer.map((a) => a.id)); vistaAlertas(); });
    document.querySelectorAll(".alerta").forEach((el) => el.addEventListener("click", async () => {
      await marcarLeidas([Number(el.dataset.id)]);
      if (el.dataset.task) abrirTarea(Number(el.dataset.task)); else vistaAlertas();
    }));
    $("#al-dias").addEventListener("change", async (ev) => {
      const dias = Number(ev.target.value);
      const { error } = await sb.from("profiles").update({ remind_days: dias }).eq("id", S.yo.id);
      if (error) { toast(errorMsg(error), true); return; }
      S.yo.remind_days = dias; toast("Preferencia guardada");
    });
  }

  // ---------- Admin: usuarios ----------
  function vistaUsuarios() {
    if (S.yo.role !== "admin") { location.hash = "#/inicio"; return; }
    const filas = [...S.perfiles].sort((a, b) => a.active - b.active || a.full_name.localeCompare(b.full_name)).map((p) => `
      <tr data-id="${p.id}">
        <td><input class="u-nombre" value="${esc(p.full_name)}"></td>
        <td>${esc(p.email)}</td>
        <td><select class="u-rol" ${p.id === S.yo.id ? "disabled" : ""}><option value="member" ${p.role === "member" ? "selected" : ""}>Integrante</option><option value="admin" ${p.role === "admin" ? "selected" : ""}>Administrador</option></select></td>
        <td>${p.id === S.yo.id ? "Activo (vos)" : `<label style="margin:0;display:flex;gap:6px;align-items:center;color:var(--text)"><input type="checkbox" class="u-activo" style="width:auto" ${p.active ? "checked" : ""}> ${p.active ? "Activo" : "<strong style='color:#b54708'>Pendiente</strong>"}</label>`}</td>
        <td style="white-space:nowrap"><button class="btn sm u-guardar">Guardar</button>
          ${p.id === S.yo.id ? "" : '<button class="btn sm u-clave" title="Generar una contraseña temporal">Nueva contraseña</button>'}</td>
      </tr>`).join("");
    $("#contenido").innerHTML = `
      <h1>Usuarios</h1>
      <p class="meta" style="margin-bottom:6px"><strong>Si alguien olvidó su contraseña:</strong> puede usar "¿Olvidaste tu contraseña?" en la pantalla de ingreso, o vos le generás una temporal con "Nueva contraseña" y se la pasás por WhatsApp. Después la cambia con el ícono 🔑 de arriba.</p>
      <p class="meta" style="margin-bottom:14px">Cada integrante se registra desde la pantalla de ingreso con "Registrate". Después aparece acá como <strong>Pendiente</strong>: tildá "Activo" y guardá para darle acceso. Para quitarle el acceso a alguien, destildá "Activo".</p>
      <div class="tabla-scroll"><table>
        <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Acceso</th><th></th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>`;
    document.querySelectorAll("tr[data-id] .u-clave").forEach((b) => b.addEventListener("click", async () => {
      const tr = b.closest("tr"), p = perfil(tr.dataset.id);
      if (!confirm(`¿Generar una contraseña nueva para ${p.full_name}? La actual deja de funcionar.`)) return;
      b.disabled = true;
      const { data, error } = await sb.functions.invoke("admin-reset-password", { body: { user_id: p.id } });
      b.disabled = false;
      if (error || !data?.password) {
        let det = data?.error;
        try { det = det || (await error.context.json()).error; } catch { /* sin detalle */ }
        toast(det || errorMsg(error), true); return;
      }
      const m = $("#modal"); S.tareaAbierta = null;
      m.innerHTML = `
        <div class="modal-head"><strong>Contraseña temporal</strong><button class="icon-btn" id="m-cerrar" aria-label="Cerrar">✕</button></div>
        <div class="modal-body" style="max-width:460px">
          <p>Nueva contraseña para <strong>${esc(p.full_name)}</strong> (${esc(p.email)}):</p>
          <div class="clave-temporal" id="clave-temp">${esc(data.password)}</div>
          <div class="acciones" style="justify-content:flex-start"><button class="btn primary sm" id="copiar-clave">Copiar</button></div>
          <p class="meta">Pasásela por un medio privado. Al entrar, conviene que la cambie con el ícono 🔑. Esta contraseña no se vuelve a mostrar.</p>
        </div>`;
      m.showModal();
      $("#m-cerrar").onclick = () => m.close();
      $("#copiar-clave").onclick = async () => {
        try { await navigator.clipboard.writeText(data.password); toast("Copiada"); } catch { toast("Seleccioná y copiá a mano", true); }
      };
    }));
    document.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.querySelector(".u-guardar").addEventListener("click", async () => {
        const id = tr.dataset.id;
        const cambios = { full_name: tr.querySelector(".u-nombre").value.trim() };
        if (id !== S.yo.id) { cambios.role = tr.querySelector(".u-rol").value; cambios.active = tr.querySelector(".u-activo").checked; }
        const { error } = await sb.from("profiles").update(cambios).eq("id", id);
        if (error) { toast(errorMsg(error), true); return; }
        toast("Usuario actualizado"); await cargarTodo(); vistaUsuarios();
      });
    });
  }

  // ---------- Admin: categorías ----------
  function vistaCategorias() {
    if (S.yo.role !== "admin") { location.hash = "#/inicio"; return; }
    const uso = (id) => S.tareas.filter((t) => t.category_id === id).length;
    $("#contenido").innerHTML = `
      <h1>Categorías</h1>
      <div class="tabla-scroll"><table>
        <thead><tr><th>Color</th><th>Nombre</th><th>Orden</th><th>Visible</th><th>Tareas</th><th></th></tr></thead>
        <tbody>
          ${S.categorias.map((c) => `
            <tr data-id="${c.id}">
              <td><input type="color" class="c-color" value="${esc(c.color)}"></td>
              <td><input class="c-nombre" value="${esc(c.name)}"></td>
              <td><input type="number" class="c-orden" value="${c.sort_order}" style="width:70px"></td>
              <td><input type="checkbox" class="c-activa" style="width:auto" ${c.active ? "checked" : ""}></td>
              <td>${uso(c.id)}</td>
              <td><button class="btn sm c-guardar">Guardar</button></td>
            </tr>`).join("")}
          <tr id="c-nueva">
            <td><input type="color" class="c-color" value="#64748b"></td>
            <td><input class="c-nombre" placeholder="Nueva categoría"></td>
            <td><input type="number" class="c-orden" value="${S.categorias.length + 1}" style="width:70px"></td>
            <td></td><td></td>
            <td><button class="btn sm primary c-crear">Agregar</button></td>
          </tr>
        </tbody>
      </table></div>
      <p class="meta" style="margin-top:10px">Destildar "Visible" oculta la categoría al crear tareas nuevas, sin afectar las tareas que ya la usan.</p>`;
    const leer = (tr) => ({ name: tr.querySelector(".c-nombre").value.trim(), color: tr.querySelector(".c-color").value, sort_order: Number(tr.querySelector(".c-orden").value) || 0 });
    document.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.querySelector(".c-guardar").addEventListener("click", async () => {
        const d = { ...leer(tr), active: tr.querySelector(".c-activa").checked };
        if (!d.name) { toast("El nombre no puede quedar vacío", true); return; }
        const { error } = await sb.from("categories").update(d).eq("id", Number(tr.dataset.id));
        if (error) { toast(/duplicate/i.test(error.message) ? "Ya existe una categoría con ese nombre" : errorMsg(error), true); return; }
        toast("Categoría guardada"); await cargarTodo(); vistaCategorias();
      });
    });
    $(".c-crear").addEventListener("click", async () => {
      const d = leer($("#c-nueva"));
      if (!d.name) { toast("Escribí un nombre", true); return; }
      const { error } = await sb.from("categories").insert(d);
      if (error) { toast(/duplicate/i.test(error.message) ? "Ya existe una categoría con ese nombre" : errorMsg(error), true); return; }
      toast("Categoría agregada"); await cargarTodo(); vistaCategorias();
    });
  }
})();
