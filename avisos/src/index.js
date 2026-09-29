/* Avisos por correo de xdanx.cl (Cloudflare Worker).
   - Cada minuto revisa si Daniel está en vivo en Kick y, al prender, manda un correo
     a quienes eligieron "Streams en Kick" (máximo uno cada 8 horas).
   - El robot de GitHub le avisa los videos nuevos (POST /video) y manda un correo
     a quienes eligieron "Videos nuevos" (una sola vez por video).
   Los correos los manda Kit. Secretos: KIT_API_KEY, AVISOS_TOKEN y, si existen,
   LINKTWIN_API_KEY (links que abren la app) y KICK_CLIENT_ID + KICK_CLIENT_SECRET
   (API oficial de Kick). Estado en el KV AVISOS. */

const KICK_SLUG = "xdanx_of";
const TAG_STREAMS = 24112659;   // Kit: "Streams en Kick"
const TAG_VIDEOS = 24112664;    // Kit: "Videos nuevos"
const REMITENTE = "contacto@xdanx.cl";
const HORAS_ENTRE_AVISOS_DE_STREAM = 8;
const HORAS_MAX_VIDEO = 6;      // no avisar videos más viejos que esto

export default {
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(revisarKick(env));
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (req.method === "POST" && url.pathname === "/video") return await avisoVideo(req, env);
      if (url.pathname === "/estado") {
        if (!autorizado(req, env, url)) return json({ error: "sin permiso" }, 401);
        return json(await estadoKick(env));
      }
      if (url.pathname === "/probar-stream") {
        // Deja el correo de stream como borrador en Kit para revisarlo (no le llega a nadie).
        // Con ?enviar lo manda de verdad a los suscriptores de streams: usar solo para probar.
        if (!autorizado(req, env, url)) return json({ error: "sin permiso" }, 401);
        const vivo = { titulo: url.searchParams.get("titulo") || "Prueba de aviso", categoria: "Just Chatting" };
        const link = await linkApp(env, "https://kick.com/" + KICK_SLUG);
        return json(await enviarCorreo(env, correoStream(vivo, link), TAG_STREAMS, !url.searchParams.has("enviar")));
      }
      return new Response("Avisos de xdanx.cl funcionando.", { headers: { "content-type": "text/plain; charset=utf-8" } });
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  },
};

/* ---------- Kick ---------- */

async function revisarKick(env) {
  const ahora = await estadoKick(env);
  if (ahora.vivo === null) return;                       // no se pudo saber, no tocar nada
  const antes = (await env.AVISOS.get("kick:vivo")) === "1";
  if (ahora.vivo === antes) return;
  await env.AVISOS.put("kick:vivo", ahora.vivo ? "1" : "0");
  if (!ahora.vivo) return;

  const ultimo = Number(await env.AVISOS.get("kick:ultimo-aviso")) || 0;
  if (Date.now() - ultimo < HORAS_ENTRE_AVISOS_DE_STREAM * 3600e3) return;
  await env.AVISOS.put("kick:ultimo-aviso", String(Date.now()));
  await enviarCorreo(env, correoStream(ahora, await linkApp(env, "https://kick.com/" + KICK_SLUG)), TAG_STREAMS);
}

// { vivo: true/false/null, titulo, categoria, fuente }
async function estadoKick(env) {
  if (env.KICK_CLIENT_ID && env.KICK_CLIENT_SECRET) {
    try {
      const token = await tokenKick(env);
      const r = await fetch("https://api.kick.com/public/v1/channels?slug=" + KICK_SLUG, {
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      });
      if (r.ok) {
        const c = ((await r.json()).data || [])[0] || {};
        const s = c.stream || {};
        return { vivo: !!s.is_live, titulo: c.stream_title || "", categoria: (c.category || {}).name || "", fuente: "oficial" };
      }
    } catch (e) { /* si falla, se prueba la otra forma */ }
  }
  try {
    const r = await fetch("https://kick.com/api/v2/channels/" + KICK_SLUG, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (avisos xdanx.cl)" },
    });
    if (!r.ok) return { vivo: null, fuente: "publica", error: "HTTP " + r.status };
    const l = (await r.json()).livestream;
    return {
      vivo: !!(l && l.is_live),
      titulo: (l && l.session_title) || "",
      categoria: (l && l.categories && l.categories[0] && l.categories[0].name) || "",
      fuente: "publica",
    };
  } catch (e) {
    return { vivo: null, fuente: "publica", error: String(e) };
  }
}

async function tokenKick(env) {
  const guardado = await env.AVISOS.get("kick:token", "json");
  if (guardado && guardado.vence > Date.now() + 60e3) return guardado.token;
  const r = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.KICK_CLIENT_ID,
      client_secret: env.KICK_CLIENT_SECRET,
    }),
  });
  if (!r.ok) throw new Error("Kick token HTTP " + r.status);
  const t = await r.json();
  await env.AVISOS.put("kick:token", JSON.stringify({ token: t.access_token, vence: Date.now() + (t.expires_in || 3600) * 1000 }));
  return t.access_token;
}

/* ---------- Videos (los manda el robot de GitHub) ---------- */

async function avisoVideo(req, env) {
  if (!autorizado(req, env)) return json({ error: "sin permiso" }, 401);
  const { videos = [] } = await req.json();
  const hechos = [];
  for (const v of videos) {
    if (!v || !v.id) continue;
    if (await env.AVISOS.get("video:" + v.id)) { hechos.push({ id: v.id, estado: "ya avisado" }); continue; }
    const horas = (Date.now() - Date.parse(v.publicado)) / 3600e3;
    if (!(horas <= HORAS_MAX_VIDEO)) {
      await env.AVISOS.put("video:" + v.id, "viejo");
      hechos.push({ id: v.id, estado: "muy viejo, no se avisa" });
      continue;
    }
    await env.AVISOS.put("video:" + v.id, "avisado");
    const r = await enviarCorreo(env, correoVideo(v, await linkApp(env, "https://www.youtube.com/watch?v=" + v.id)), TAG_VIDEOS);
    hechos.push({ id: v.id, estado: "avisado", kit: r.id || r.error });
  }
  return json({ hechos });
}

/* ---------- Correos ---------- */

function correoStream(vivo, link) {
  const titulo = vivo.titulo || "Estoy en vivo";
  return {
    asunto: "🔴 Estoy en vivo en Kick: " + titulo,
    previa: "Ya empezamos, métete al stream 😁☘️🚀",
    html:
      `<p>¡Hola! Acabo de prender stream en Kick 🔴</p>` +
      `<p style="font-size:20px;font-weight:bold;margin:18px 0 6px">${esc(titulo)}</p>` +
      (vivo.categoria ? `<p style="color:#6b6470;margin:0 0 18px">${esc(vivo.categoria)}</p>` : "") +
      boton(link, "Entrar al stream", "#53fc18", "#0b0b0b") +
      `<p>Te espero adentro, lo vamos a pasar increíble 😁☘️🚀<br>Daniel</p>` + pie(),
  };
}

function correoVideo(v, link) {
  const canal = v.canal_nombre || "mi canal";
  return {
    asunto: "Video nuevo en " + canal + ": " + v.titulo,
    previa: "Recién salido del horno, pasa a verlo 😁☘️🚀",
    html:
      `<p>¡Hola! Acabo de subir video nuevo en <strong>${esc(canal)}</strong> ☘️</p>` +
      `<p><a href="${link}"><img src="${esc(v.miniatura || "https://i.ytimg.com/vi/" + v.id + "/hqdefault.jpg")}" ` +
      `alt="${esc(v.titulo)}" width="560" border="0" style="width:100%;max-width:560px;height:auto;border-radius:12px;display:block"></a></p>` +
      `<p style="font-size:20px;font-weight:bold;margin:14px 0 18px">${esc(v.titulo)}</p>` +
      boton(link, "Ver video", "#ff1e6e", "#ffffff") +
      `<p>Pasa a verlo y cuéntame en los comentarios qué te pareció 😁☘️🚀<br>Daniel</p>` + pie(),
  };
}

// Link que abre directo la app (YouTube o Kick) usando LinkTwin. Se guarda para no crearlo dos veces.
// Si no hay llave de LinkTwin o falla, se usa el link normal.
async function linkApp(env, url) {
  if (!env.LINKTWIN_API_KEY) return url;
  const guardado = await env.AVISOS.get("link:" + url);
  if (guardado) return guardado;
  try {
    const r = await fetch("https://linktw.in/api/url/add", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.LINKTWIN_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const d = await r.json();
    if (d && !d.error && d.shorturl) {
      await env.AVISOS.put("link:" + url, d.shorturl);
      return d.shorturl;
    }
  } catch (e) { /* se usa el link normal */ }
  return url;
}

function boton(href, texto, fondo, color) {
  return `<p style="margin:0 0 22px"><a href="${href}" style="display:inline-block;background:${fondo};color:${color};` +
    `text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:10px">${texto} →</a></p>`;
}

function pie() {
  return `<p style="color:#8a8290;font-size:13px;margin-top:26px">Recibes esto porque activaste las notificaciones en ` +
    `<a href="https://xdanx.cl" style="color:#ff1e6e">xdanx.cl</a>.</p>`;
}

// Crea y programa un broadcast en Kit para los suscriptores con esa etiqueta.
// Con "borrador" no lo manda: lo deja guardado en Kit para revisarlo.
async function enviarCorreo(env, correo, etiqueta, borrador) {
  const cuerpo = {
    subject: correo.asunto,
    preview_text: correo.previa,
    description: correo.asunto,
    content: correo.html,
    public: false,
    published_at: new Date().toISOString(),
    send_at: borrador ? null : new Date(Date.now() + 60e3).toISOString(),
    email_address: REMITENTE,
    subscriber_filter: [{ all: [{ type: "tag", ids: [etiqueta] }], any: null, none: null }],
  };
  const r = await fetch("https://api.kit.com/v4/broadcasts", {
    method: "POST",
    headers: { "X-Kit-Api-Key": env.KIT_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) return { error: "Kit HTTP " + r.status + ": " + JSON.stringify(datos).slice(0, 300) };
  return { id: datos.broadcast && datos.broadcast.id, borrador: !!borrador };
}

/* ---------- utilidades ---------- */

function autorizado(req, env, url) {
  const h = req.headers.get("Authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : url && url.searchParams.get("token");
  return !!env.AVISOS_TOKEN && t === env.AVISOS_TOKEN;
}

function esc(t) {
  return String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
