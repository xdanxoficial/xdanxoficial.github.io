/* Pagina de xDanx: barra de canales, pantalla que rota videos cada 8 s,
   vista previa de canal al pasar el mouse y panel de estadisticas para marcas.
   Los datos vienen de datos/datos.js (robot) y datos/estadisticas.js (media kit). */
(function () {
  "use strict";

  var DATOS = window.DATOS || { canales: [], rotacion: [] };
  var EST = window.ESTADISTICAS || { perfiles: {}, marcas: [] };
  var SEGUNDOS_POR_VIDEO = 8;
  var TACTIL = window.matchMedia("(hover: none)").matches;
  var POCO_MOVIMIENTO = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var PAISES = { CL: "Chile", MX: "México", AR: "Argentina", CO: "Colombia", PE: "Perú", ES: "España",
    US: "Estados Unidos", VE: "Venezuela", EC: "Ecuador", UY: "Uruguay", BO: "Bolivia", PY: "Paraguay",
    GT: "Guatemala", CR: "Costa Rica", DO: "Rep. Dominicana", PA: "Panamá", HN: "Honduras", SV: "El Salvador" };
  var GENEROS = { female: "Mujeres", male: "Hombres", genderUserSpecified: "Otro" };
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
    "septiembre", "octubre", "noviembre", "diciembre"];

  var ICONO = {
    flecha: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    play: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
    pausa: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
    cerrar: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    volver: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    gente: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19"/><circle cx="10" cy="7.5" r="3.5"/><path d="M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.2a3.5 3.5 0 0 1 0 6.6"/></svg>',
    sube: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
    ojo: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    izq: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    der: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    bajar: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>'
  };

  /* ---------- formatos (estilo chileno: 642K, 1,3M, 7.080) ---------- */
  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function miles(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function corto(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",").replace(",0", "") + "M";
    if (n >= 1e5) return Math.round(n / 1000) + "K";
    return miles(n);
  }
  function duracion(s) {
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    var dos = function (v) { return (v < 10 ? "0" : "") + v; };
    return h ? h + ":" + dos(m) + ":" + dos(x) : m + ":" + dos(x);
  }
  function cuando(iso) {
    var f = new Date(iso), hoy = new Date();
    var dias = Math.floor((new Date(hoy.toDateString()) - new Date(f.toDateString())) / 864e5);
    if (dias <= 0) return "Hoy";
    if (dias === 1) return "Ayer";
    if (dias < 7) return "Hace " + dias + " días";
    return f.getDate() + " de " + MESES[f.getMonth()];
  }
  function fechaLarga(iso) {
    var f = new Date(iso);
    return f.getDate() + " de " + MESES[f.getMonth()] + " de " + f.getFullYear();
  }
  function canal(clave) {
    for (var i = 0; i < DATOS.canales.length; i++) if (DATOS.canales[i].clave === clave) return DATOS.canales[i];
    return null;
  }
  function foto(url, clase) {
    return url ? '<img src="' + esc(url) + '" alt="" loading="lazy"' + (clase ? ' class="' + clase + '"' : "") + ">"
      : '<span class="sin-foto"></span>';
  }
  function $(id) { return document.getElementById(id); }

  var lista = $("canales"), pantalla = $("pantalla"), rot = $("rotacion"), previa = $("previa"), vivo = $("vivo");
  // Capa que se ve cuando nadie mira un canal: los videos, o el directo si estoy en vivo.
  var base = rot;

  /* ---------- barra de canales ---------- */
  lista.innerHTML = DATOS.canales.map(function (c) {
    return '<li><a class="canal" href="' + esc(c.url) + '" target="_blank" rel="noopener" data-clave="' + esc(c.clave) + '">' +
      foto(c.foto) + '<div><strong>' + esc(c.nombre) + '</strong><span><b>' + corto(c.suscriptores) +
      '</b> suscriptores</span></div></a></li>';
  }).join("");

  /* ---------- rotacion de videos ---------- */
  var videos = DATOS.rotacion || [];
  var actual = 0, transcurrido = 0, pausaUsuario = false, pausaMouse = false, enPrevia = false;

  if (!videos.length) {
    rot.innerHTML = '<p class="vacio">Pronto vas a ver aquí mis videos nuevos.</p>';
  } else {
    rot.innerHTML = videos.map(function (v, i) {
      var c = canal(v.canal) || { nombre: "" };
      return '<a class="slide" href="https://youtu.be/' + esc(v.id) + '" target="_blank" rel="noopener" ' +
        'role="group" aria-roledescription="video" aria-label="' + (i + 1) + ' de ' + videos.length + '">' +
        '<img src="' + esc(v.miniatura || "https://i.ytimg.com/vi/" + v.id + "/hqdefault.jpg") + '" alt="" ' + (i ? 'loading="lazy"' : "") + '>' +
        '<div class="info"><span class="etiqueta"><i></i>' + (v.esta_semana ? "Nuevo esta semana" : "Video reciente") +
        " · " + esc(c.nombre) + "</span><h2>" + esc(v.titulo) + '</h2><p class="meta"><span>' + cuando(v.publicado) +
        "</span><span>" + duracion(v.segundos) + '</span></p><span class="btn">Ver video ' + ICONO.play + "</span></div></a>";
    }).join("") +
      '<button class="flecha-rot izq" type="button" data-paso="-1" aria-label="Video anterior">' + ICONO.izq + "</button>" +
      '<button class="flecha-rot der" type="button" data-paso="1" aria-label="Video siguiente">' + ICONO.der + "</button>" +
      '<div class="controles" id="controles"><div class="puntos">' + videos.map(function (v, i) {
        return '<button class="punto" type="button" data-i="' + i + '" aria-label="Ver video ' + (i + 1) + '"></button>';
      }).join("") + '</div><button class="pausar" type="button" id="pausar" aria-label="Pausar">' + ICONO.pausa + "</button></div>";
  }
  var slides = rot.querySelectorAll(".slide"), puntos = rot.querySelectorAll(".punto");
  var controles = $("controles"), botonPausa = $("pausar");

  function mostrar(i) {
    if (!slides.length) return;
    actual = (i + slides.length) % slides.length;
    transcurrido = 0;
    for (var k = 0; k < slides.length; k++) {
      var si = k === actual;
      slides[k].classList.toggle("visible", si);
      slides[k].setAttribute("aria-hidden", si ? "false" : "true");
      slides[k].tabIndex = si ? 0 : -1;
      puntos[k].classList.toggle("hecho", k < actual);
      puntos[k].classList.remove("actual");
      puntos[k].setAttribute("aria-current", si ? "true" : "false");
    }
    void puntos[actual].offsetWidth;          // reinicia la animacion de la barrita
    puntos[actual].classList.add("actual");
  }
  function pausado() { return pausaUsuario || pausaMouse || enPrevia || base !== rot || document.hidden; }
  function marcarPausa() { if (controles) controles.classList.toggle("pausa", pausado()); }

  if (slides.length) {
    controles.style.setProperty("--dura", SEGUNDOS_POR_VIDEO + "s");
    mostrar(0);
    if (slides.length > 1) {
      setInterval(function () {
        if (pausado()) return;
        transcurrido += 100;
        if (transcurrido >= SEGUNDOS_POR_VIDEO * 1000) mostrar(actual + 1);
      }, 100);
    } else {
      controles.hidden = true;
      rot.querySelectorAll(".flecha-rot").forEach(function (f) { f.hidden = true; });
    }
    rot.addEventListener("click", function (e) {
      var f = e.target.closest(".flecha-rot");
      if (f) { mostrar(actual + +f.getAttribute("data-paso")); return; }
      var p = e.target.closest(".punto");
      if (p) { mostrar(+p.getAttribute("data-i")); return; }
      if (e.target.closest("#pausar")) {
        pausaUsuario = !pausaUsuario;
        botonPausa.innerHTML = pausaUsuario ? ICONO.play : ICONO.pausa;
        botonPausa.setAttribute("aria-label", pausaUsuario ? "Seguir" : "Pausar");
        marcarPausa();
      }
    });
    rot.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") mostrar(actual - 1);
      else if (e.key === "ArrowRight") mostrar(actual + 1);
    });
    rot.addEventListener("mouseenter", function () { pausaMouse = true; marcarPausa(); });
    rot.addEventListener("mouseleave", function () { pausaMouse = false; marcarPausa(); });
    document.addEventListener("visibilitychange", marcarPausa);
  }

  /* ---------- vista previa de un canal ---------- */
  var claveActiva = null, esperaVolver = null;

  function htmlPrevia(c) {
    var portada = c.banner ? ' style="background-image:url(\'' + esc(c.banner) + '\')"' : "";
    var minis = (c.ultimos || []).map(function (v) {
      return '<a class="mini" href="https://youtu.be/' + esc(v.id) + '" target="_blank" rel="noopener">' +
        '<span class="foto"><img src="https://i.ytimg.com/vi/' + esc(v.id) + '/mqdefault.jpg" alt="" loading="lazy">' +
        '<span class="dura">' + duracion(v.segundos) + "</span></span><strong>" + esc(v.titulo) +
        "</strong><small>" + cuando(v.publicado) + "</small></a>";
    }).join("");
    return '<div class="portada"' + portada + "></div>" +
      '<div class="cuerpo"><div class="cabeza">' + foto(c.foto) + "<div>" +
      '<p class="eyebrow">Canal de YouTube · ' + esc(c.handle) + "</p><h2>" + esc(c.nombre) + "</h2>" +
      '<div class="cifras-canal"><span><b>' + corto(c.suscriptores) + "</b>suscriptores</span><span><b>" +
      miles(c.total_videos) + "</b>" + (c.total_videos === 1 ? "video" : "videos") + "</span></div>" + (c.descripcion ? "<p>" + esc(c.descripcion) + "</p>" : "") +
      '</div><div class="botones"><a class="btn" href="' + esc(c.url) + '" target="_blank" rel="noopener">Ir al canal ' + ICONO.flecha + "</a>" +
      '<button class="btn ghost" type="button" data-volver>' + ICONO.volver +
      (base === rot ? " Videos nuevos" : " Volver al directo") + "</button></div></div>" +
      "<div><h3>Últimos videos</h3>" + (minis ? '<div class="miniaturas">' + minis + "</div>"
        : '<p class="vacio">Todavía no hay videos largos en este canal.</p>') + "</div></div>";
  }

  function abrirPrevia(clave) {
    clearTimeout(esperaVolver);
    if (clave === claveActiva) return;
    var c = canal(clave);
    if (!c) return;
    claveActiva = clave;
    enPrevia = true;
    marcarPausa();
    previa.innerHTML = htmlPrevia(c);
    previa.classList.add("visible");
    base.classList.remove("visible");
    lista.querySelectorAll(".canal").forEach(function (a) {
      a.classList.toggle("activo", a.getAttribute("data-clave") === clave);
    });
  }
  function volver() {
    clearTimeout(esperaVolver);
    if (!claveActiva) return;
    claveActiva = null;
    enPrevia = false;
    previa.classList.remove("visible");
    base.classList.add("visible");
    lista.querySelectorAll(".canal.activo").forEach(function (a) { a.classList.remove("activo"); });
    if (base === rot) mostrar(actual);
    marcarPausa();
    // Vaciar la vista previa cuando termina de desaparecer, para que no estire la pantalla.
    setTimeout(function () { if (!claveActiva) previa.innerHTML = ""; }, 500);
  }
  function volverPronto() { clearTimeout(esperaVolver); esperaVolver = setTimeout(volver, 350); }

  lista.addEventListener("mouseover", function (e) {
    var a = e.target.closest(".canal");
    if (a && !TACTIL) abrirPrevia(a.getAttribute("data-clave"));
  });
  lista.addEventListener("mouseleave", function () { if (!TACTIL) volverPronto(); });
  pantalla.addEventListener("mouseenter", function () { clearTimeout(esperaVolver); });
  pantalla.addEventListener("mouseleave", function () { if (!TACTIL) volverPronto(); });

  // En el celular no hay mouse: el primer toque muestra la vista previa, el segundo abre el canal.
  lista.addEventListener("click", function (e) {
    var a = e.target.closest(".canal");
    if (a && TACTIL && a.getAttribute("data-clave") !== claveActiva) {
      e.preventDefault();
      abrirPrevia(a.getAttribute("data-clave"));
      pantalla.scrollIntoView({ behavior: POCO_MOVIMIENTO ? "auto" : "smooth", block: "nearest" });
    }
  });
  previa.addEventListener("click", function (e) { if (e.target.closest("[data-volver]")) volver(); });

  // Teclado: al llegar con Tab a un canal se ve su vista previa. Un toque tambien da foco,
  // pero sin :focus-visible; si se contara, el toque abriria el canal al tiro.
  lista.addEventListener("focusin", function (e) {
    var a = e.target.closest(".canal");
    if (a && a.matches(":focus-visible")) abrirPrevia(a.getAttribute("data-clave"));
  });
  $("inicio").addEventListener("focusout", function (e) {
    if (!e.relatedTarget || !$("inicio").contains(e.relatedTarget)) volverPronto();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && claveActiva) volver(); });

  /* ---------- en vivo en Kick ----------
     Cada minuto se le pregunta a Kick si estoy en vivo. Si lo estoy, el directo pasa
     al frente de la pantalla grande (con el reproductor de Kick, sin sonido).
     Para probarlo con otro canal que este en vivo: agrega ?probar-vivo=nombre a la direccion. */
  var KICK = (location.href.match(/[?&#]probar-vivo=([\w-]+)/) || [])[1] || "xdanx_of";   // vale antes o despues del #
  var URL_KICK = "https://kick.com/" + KICK;
  var pill = $("pill-vivo"), estadoKick = $("kick-estado"), textoKick = estadoKick ? estadoKick.innerHTML : "";
  var tituloPagina = document.title;

  function haceCuanto(inicio) {
    var min = Math.max(0, Math.round((Date.now() - new Date(inicio.replace(" ", "T") + "Z")) / 60000));
    return min < 60 ? min + " min" : Math.floor(min / 60) + " h " + (min % 60) + " min";
  }

  function datosVivo(l) {
    var cat = (l.categories && l.categories[0] && l.categories[0].name) || "";
    return '<span class="viendo"><b>' + miles(l.viewer_count || 0) + "</b> viendo</span>" +
      (cat ? "<span>" + esc(cat) + "</span>" : "") +
      (l.start_time ? "<span>Empezó hace " + haceCuanto(l.start_time) + "</span>" : "");
  }

  function mostrarVivo(l) {
    if (base !== vivo) {
      vivo.innerHTML =
        '<div class="reproductor"><iframe src="https://player.kick.com/' + KICK + '?autoplay=true&muted=true" ' +
        'title="Mi stream en vivo en Kick" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>' +
        '<div class="vivo-info"><span class="en-vivo"><i></i>En vivo ahora</span>' +
        '<p class="donde">Kick · @' + esc(KICK) + "</p><h2 id=\"vivo-titulo\"></h2>" +
        '<p class="meta" id="vivo-datos"></p>' +
        '<a class="btn kick" href="' + URL_KICK + '" target="_blank" rel="noopener">Entrar al stream ' + ICONO.play + "</a>" +
        '<p class="nota-vivo">La vista previa no tiene sonido. Entra a Kick para escuchar y escribir en el chat.</p></div>';
      var antes = base;
      base = vivo;
      pantalla.classList.add("transmitiendo");
      if (!claveActiva) { antes.classList.remove("visible"); vivo.classList.add("visible"); }
      if (pill) pill.hidden = false;
      if (estadoKick) { estadoKick.innerHTML = "<i></i>En vivo ahora"; estadoKick.classList.add("vivo"); }
      document.title = "En vivo · " + tituloPagina;
      var boton = previa.querySelector("[data-volver]");
      if (boton) boton.innerHTML = ICONO.volver + " Volver al directo";
      marcarPausa();
    }
    $("vivo-titulo").textContent = l.session_title || "Estoy en vivo";
    $("vivo-datos").innerHTML = datosVivo(l);
  }

  function ocultarVivo() {
    if (base !== vivo) return;
    base = rot;
    pantalla.classList.remove("transmitiendo");
    if (!claveActiva) { vivo.classList.remove("visible"); rot.classList.add("visible"); mostrar(actual); }
    vivo.innerHTML = "";                       // corta el reproductor
    if (pill) pill.hidden = true;
    if (estadoKick) { estadoKick.innerHTML = textoKick; estadoKick.classList.remove("vivo"); }
    document.title = tituloPagina;
    marcarPausa();
  }

  function revisarKick() {
    if (document.hidden || !window.fetch) return;
    fetch("https://kick.com/api/v2/channels/" + KICK)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;                        // si Kick no responde, se queda como estaba
        var l = d.livestream;
        if (l && l.is_live) mostrarVivo(l); else ocultarVivo();
      })
      .catch(function () {});
  }
  revisarKick();
  setInterval(revisarKick, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) revisarKick(); });

  /* ---------- contacto de negocios ---------- */
  var botonCopiar = $("copiar"), correo = $("correo");
  function aviso(t) { botonCopiar.textContent = t; setTimeout(function () { botonCopiar.textContent = "Copiar correo"; }, 2000); }
  function seleccionar() {
    var r = document.createRange(); r.selectNodeContents(correo);
    var s = getSelection(); s.removeAllRanges(); s.addRange(r); aviso("Correo seleccionado");
  }
  botonCopiar.addEventListener("click", function () {
    try { navigator.clipboard.writeText(correo.textContent.trim()).then(function () { aviso("Correo copiado"); }, seleccionar); }
    catch (err) { seleccionar(); }
  });

  $("kits").innerHTML = Object.keys(EST.perfiles).map(function (p) {
    var e = EST.perfiles[p], c = canal(p) || {};
    return '<button class="kit" type="button" data-perfil="' + esc(p) + '">' + foto(c.foto) +
      "<div><strong>Estadísticas de " + esc(e.titulo) + "</strong><span>" + corto(c.suscriptores || e.suscriptores) +
      " suscriptores · países, edades y marcas</span></div>" + ICONO.flecha.replace('class="i"', 'class="i flecha"') + "</button>";
  }).join("");

  /* ---------- panel de estadisticas ---------- */
  var panel = $("panel");

  function barras(filas) {
    return "<ul>" + filas.map(function (f) {
      return '<li class="barra" style="--p:' + f[1] + '%"><div><span>' + esc(f[0]) + "</span><b>" +
        Math.round(f[1]) + "%</b></div><i></i></li>";
    }).join("") + "</ul>";
  }

  function abrirPanel(perfil) {
    var e = EST.perfiles[perfil], c = canal(perfil) || {};
    if (!e) return;
    var edades = Object.keys(e.edades || {}).map(function (k) {
      return [k.replace("age", "").replace(/-$/, "+").replace("-", "–"), e.edades[k]];
    });
    var genero = Object.keys(e.genero || {}).map(function (k) { return [GENEROS[k] || k, e.genero[k]]; });
    var paises = (e.paises || []).map(function (p) { return [PAISES[p.codigo] || p.codigo, p.pct]; });
    var marcas = (EST.marcas || []).map(function (m) {
      return '<a class="marca-c" href="' + esc(m.video) + '" target="_blank" rel="noopener"><span class="logo">' +
        (m.logo ? '<img src="' + esc(m.logo) + '" alt="">' : esc(m.nombre.charAt(0))) + "</span><div><strong>" +
        esc(m.nombre) + "</strong><small>Ver la integración</small></div></a>";
    }).join("");

    panel.innerHTML = '<div class="panel-in">' +
      '<div class="panel-top">' + foto(c.foto || "") + '<div><p class="eyebrow">Media kit · ' + esc(e.handle) + '</p>' +
      '<h2 id="panel-titulo">' + esc(e.titulo) + '</h2></div><button class="cerrar" type="button" data-cerrar aria-label="Cerrar">' +
      ICONO.cerrar + "</button></div>" +
      (e.descripcion ? '<p class="desc">' + esc(e.descripcion) + "</p>" : "") +
      '<div class="cifras">' +
      '<div class="cifra"><span class="circulo">' + ICONO.gente + "</span><div><b>" + corto(e.suscriptores) + "</b><span>suscriptores</span></div></div>" +
      '<div class="cifra"><span class="circulo">' + ICONO.sube + "</span><div><b>" + miles(e.mediana_engaged) +
      "</b><span>vistas con interacción por video (mediana de los últimos " + (e.n_videos || 10) + ")</span></div></div>" +
      '<div class="cifra"><span class="circulo">' + ICONO.ojo + "</span><div><b>" + Math.round(e.pct_visto_medio) +
      "%</b><span>de cada video visto, en promedio</span></div></div></div>" +
      '<div class="tres"><div><h3>Países</h3>' + barras(paises) + "</div><div><h3>Edades</h3>" + barras(edades) +
      "</div><div><h3>Género</h3>" + barras(genero) + "</div></div>" +
      (marcas ? '<div><h3>Marcas con las que ya trabajé</h3><div class="marcas">' + marcas + "</div></div>" : "") +
      '<div class="botones"><a class="btn" href="mailto:contacto@xdanx.cl?subject=' +
      encodeURIComponent("Contacto de negocios · " + e.titulo) + '">Escríbeme ' + ICONO.flecha + "</a>" +
      (e.pdf ? '<a class="btn ghost" href="' + esc(e.pdf) + '" download>' + ICONO.bajar + " Descargar media kit (PDF)</a>" : "") +
      (c.url ? '<a class="btn ghost" href="' + esc(c.url) + '" target="_blank" rel="noopener">Ver el canal ' + ICONO.play + "</a>" : "") +
      "</div>" +
      '<p class="nota">Datos de YouTube Analytics, últimos 90 días. Actualizado el ' + fechaLarga(e.fecha + "T12:00:00") + ".</p></div>";

    if (panel.showModal) panel.showModal(); else panel.setAttribute("open", "");
    panel.scrollTop = 0;
  }
  function cerrarPanel() { if (panel.close) panel.close(); else panel.removeAttribute("open"); }

  $("kits").addEventListener("click", function (e) {
    var b = e.target.closest(".kit");
    if (b) abrirPanel(b.getAttribute("data-perfil"));
  });
  panel.addEventListener("click", function (e) {
    if (e.target === panel || e.target.closest("[data-cerrar]")) cerrarPanel();
  });

  if (DATOS.actualizado) $("actualizado").textContent = "Videos actualizados el " + fechaLarga(DATOS.actualizado) + ".";
})();
