# Página web de xDanx

Página con mis 4 canales, mis videos nuevos, mis redes y contacto de negocios.
Estilo Danx (oscuro, rosado neón y violeta).

## Qué hace

- **Arriba:** xDanx, DANX, xDanx Gameplays y xDanx Vlogs. Al pasar el mouse se ve la vista previa del canal en la pantalla grande. Al hacer clic se abre el canal en YouTube. En el celular, el primer toque muestra la vista previa y el segundo abre el canal.
- **Pantalla grande:** cada 8 segundos pasa un video de la última semana de todos los canales. Si hay menos de 4, se completa con los más recientes. No incluye Shorts ni directos en curso.
- **En vivo:** cada minuto la página le pregunta a Kick si estoy transmitiendo. Si lo estoy, la pantalla grande muestra el directo (sin sonido) con el título, cuántos están viendo y el botón "Entrar al stream". Arriba aparece "En vivo" y la pestaña del navegador dice "En vivo · xDanx". Para probarlo con otro canal que esté en vivo: agregar `?probar-vivo=nombre` a la dirección (por ejemplo `index.html?probar-vivo=xqc`).
- **Redes:** Kick, Instagram y X, con mis fotos de perfil y el color de cada plataforma.
- **Contacto de negocios:** correo, botón para copiarlo y estadísticas de xDanx y DANX (las del media kit) con el PDF para descargar.

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html`, `estilos.css`, `app.js` | La página |
| `datos/datos.js` | Canales y videos. Lo escribe el robot, no editar a mano |
| `datos/estadisticas.js` | Números del media kit. Lo escribe `scripts/estadisticas.py` |
| `scripts/actualizar.py` | Saca los videos de YouTube |
| `scripts/estadisticas.py` | Copia las estadísticas y los PDF desde el agente danx-manager |
| `.github/workflows/actualizar.yml` | El robot de GitHub (cada 6 horas) |

## Cambiar cosas a mano

- **Cada cuántos segundos cambia el video:** `SEGUNDOS_POR_VIDEO` en `app.js`.
- **Redes o correo:** en `index.html`.
- **Estadísticas nuevas** (después de que el agente haga un media kit nuevo): `python scripts/estadisticas.py`.

## Probar en el computador

Doble clic en `index.html`. Se abre en el navegador tal cual.

## Publicar en internet (GitHub Pages, gratis)

1. Crear cuenta en https://github.com (gratis).
2. Crear un repositorio nuevo, público, llamado `xdanx.github.io` si la cuenta se llama `xdanx`. Si no, cualquier nombre sirve.
3. Subir todos los archivos de esta carpeta.
4. En el repositorio: **Settings → Pages → Branch: main → Save**. En un par de minutos la página queda en línea.
5. Clave de YouTube para el robot: en https://console.cloud.google.com (proyecto Danx Tools) **APIs y servicios → Credenciales → Crear credenciales → Clave de API**. Conviene limitarla a "YouTube Data API v3".
6. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Nombre `YOUTUBE_API_KEY` y como valor la clave.
7. Para probar el robot: pestaña **Actions → Actualizar videos → Run workflow**.

## Dominio propio (opcional)

`xdanx.com` tiene dueño hasta el 13-09-2027 (GoDaddy). Libres el 29-09-2026: `xdanx.cl`, `xdanx.tv`, `xdanx.net`, `xdanx.live`, `xdanxof.com`.
Al comprar uno: en GitHub **Settings → Pages → Custom domain**, y en la página donde se compró se agregan los registros DNS que indica GitHub.
