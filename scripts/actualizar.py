"""Actualiza datos/datos.js con los canales y los videos recientes de Daniel.

Lo corre el robot de GitHub cada 6 horas (.github/workflows/actualizar.yml)
con la clave gratis de YouTube en la variable YOUTUBE_API_KEY.
En el computador se puede correr igual:
    set YOUTUBE_API_KEY=la-clave
    python scripts/actualizar.py
o con un permiso de lectura del agente danx-manager:
    python scripts/actualizar.py --token "ruta/a/tokens/xdanx.json"

Solo lee datos publicos. Si YouTube falla, no toca el archivo que ya existe.
"""
import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from googleapiclient.discovery import build

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "datos" / "datos.js"

# Orden en que salen en la barra de arriba.
CANALES = [
    {"clave": "xdanx", "id": "UC6GElnCOnUGxUOO5BmoPfsA", "handle": "@xdanx1"},
    {"clave": "danx", "id": "UCTXVxxNix47y4X-dK6hp2Mw", "handle": "@danxof"},
    {"clave": "gameplays", "id": "UC1CMcCgfl_c4P1-mZ2ewUXg", "handle": "@xdanxgameplays"},
    {"clave": "vlogs", "id": "UCeefuHkRPSzwzQdKg1EmFgg", "handle": "@xDanxVlogs"},
]

DIAS_SEMANA = 7
MINIMO_ROTACION = 4      # si la semana trae menos videos, se completa con los mas recientes
VIDEOS_POR_CANAL = 4     # los que se ven en la vista previa de cada canal
SEGUNDOS_SHORT = 180     # los Shorts no entran: su miniatura vertical se ve mal en la pantalla
HORAS_AVISO = 6          # videos mas nuevos que esto se avisan por correo (ver avisos/)

# Recorte "escritorio" del banner del canal (el mismo que usa YouTube en la pagina del canal).
RECORTE_BANNER = "=w1707-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj"

_DURACION = re.compile(r"^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$")


def duracion_segundos(iso):
    m = _DURACION.match(iso or "")
    if not m:
        return 0
    d, h, mi, s = (int(x) if x else 0 for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


def foto_grande(miniaturas):
    for tam in ("maxres", "high", "medium", "default"):
        if tam in miniaturas:
            return miniaturas[tam]["url"]
    return ""


def servicio(token):
    if token:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        cred = Credentials.from_authorized_user_file(token)
        if not cred.valid and cred.refresh_token:
            cred.refresh(Request())
        return build("youtube", "v3", credentials=cred, cache_discovery=False)
    clave = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not clave:
        sys.exit("Falta la clave de YouTube: define YOUTUBE_API_KEY o usa --token.")
    return build("youtube", "v3", developerKey=clave, cache_discovery=False)


def leer_canales(yt):
    r = yt.channels().list(part="snippet,statistics,brandingSettings,contentDetails",
                           id=",".join(c["id"] for c in CANALES)).execute()
    por_id = {c["id"]: c for c in r.get("items", [])}
    canales = []
    for base in CANALES:
        c = por_id.get(base["id"])
        if not c:
            raise RuntimeError(f"YouTube no devolvio el canal {base['handle']}")
        banner = (c.get("brandingSettings", {}).get("image", {}) or {}).get("bannerExternalUrl", "")
        canales.append({
            **base,
            "nombre": c["snippet"]["title"],
            "descripcion": c["snippet"].get("description", "").strip().split("\n")[0][:160],
            "foto": foto_grande(c["snippet"].get("thumbnails", {})),
            "banner": banner + RECORTE_BANNER if banner else "",
            "suscriptores": int(c["statistics"].get("subscriberCount", 0)),
            "total_videos": int(c["statistics"].get("videoCount", 0)),
            "url": f"https://www.youtube.com/{base['handle']}",
            "subidas": c["contentDetails"]["relatedPlaylists"]["uploads"],
        })
    return canales


def videos_recientes(yt, canal):
    """Ultimos videos publicos y largos del canal, del mas nuevo al mas viejo."""
    r = yt.playlistItems().list(part="contentDetails", playlistId=canal["subidas"],
                                maxResults=50).execute()
    ids = [i["contentDetails"]["videoId"] for i in r.get("items", [])]
    if not ids:
        return []
    r = yt.videos().list(part="snippet,contentDetails,status,liveStreamingDetails",
                         id=",".join(ids)).execute()
    videos = []
    for v in r.get("items", []):
        sn = v["snippet"]
        segundos = duracion_segundos(v["contentDetails"].get("duration", ""))
        if (v["status"].get("privacyStatus") != "public"
                or sn.get("liveBroadcastContent", "none") != "none"   # en vivo o programado
                or segundos <= SEGUNDOS_SHORT):
            continue
        videos.append({
            "id": v["id"],
            "titulo": sn["title"],
            "publicado": sn["publishedAt"],
            "segundos": segundos,
            "miniatura": foto_grande(sn.get("thumbnails", {})),
            "canal": canal["clave"],
        })
    videos.sort(key=lambda v: v["publicado"], reverse=True)
    return videos


def armar(yt, ahora):
    canales = leer_canales(yt)
    todos = []
    for c in canales:
        vids = videos_recientes(yt, c)
        c["ultimos"] = vids[:VIDEOS_POR_CANAL]
        del c["subidas"]
        todos += vids
    todos.sort(key=lambda v: v["publicado"], reverse=True)
    limite = (ahora - timedelta(days=DIAS_SEMANA)).strftime("%Y-%m-%dT%H:%M:%SZ")
    semana = [dict(v, esta_semana=True) for v in todos if v["publicado"] >= limite]
    if len(semana) < MINIMO_ROTACION:
        vistos = {v["id"] for v in semana}
        semana += [dict(v, esta_semana=False) for v in todos if v["id"] not in vistos][
            :MINIMO_ROTACION - len(semana)]
    return {
        "actualizado": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "canales": canales,
        "rotacion": semana,
    }


def avisar_videos_nuevos(datos, ahora):
    """Le pasa al Worker de avisos los videos de las ultimas horas para que mande el correo.
    El Worker se acuerda de cuales ya aviso, asi que no importa mandarlos mas de una vez."""
    url, token = os.environ.get("AVISOS_URL"), os.environ.get("AVISOS_TOKEN")
    if not (url and token):
        return
    limite = (ahora - timedelta(hours=HORAS_AVISO)).strftime("%Y-%m-%dT%H:%M:%SZ")
    nombres = {c["clave"]: c["nombre"] for c in datos["canales"]}
    nuevos = [dict(v, canal_nombre=nombres.get(v["canal"], "")) for v in datos["rotacion"]
              if v["publicado"] >= limite]
    if not nuevos:
        return
    pedido = urllib.request.Request(
        url.rstrip("/") + "/video", data=json.dumps({"videos": nuevos}).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + token,
                 "User-Agent": "robot-xdanx"})
    try:
        with urllib.request.urlopen(pedido, timeout=30) as r:
            print("Avisos:", r.read().decode("utf-8"))
    except Exception as e:  # que un problema con los avisos no frene la pagina
        print("No se pudo avisar los videos nuevos:", e)

def sin_cambios(datos):
    """True si solo cambiaria la hora: asi el robot no guarda un cambio cada 6 horas."""
    if not SALIDA.exists():
        return False
    texto = SALIDA.read_text(encoding="utf-8")
    try:
        viejo = json.loads(texto[texto.index("{"):texto.rindex("}") + 1])
    except ValueError:
        return False
    return all(viejo.get(k) == datos[k] for k in ("canales", "rotacion"))


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--token", help="permiso OAuth de solo lectura (en vez de la clave)")
    args = p.parse_args()
    ahora = datetime.now(timezone.utc)
    datos = armar(servicio(args.token), ahora)
    if not datos["rotacion"]:
        sys.exit("YouTube no devolvio videos: dejo el archivo anterior tal cual.")
    avisar_videos_nuevos(datos, ahora)
    if sin_cambios(datos):
        print("Nada nuevo en YouTube: no toco el archivo.")
        return
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    texto = json.dumps(datos, ensure_ascii=False, indent=1)
    SALIDA.write_text("/* Lo escribe scripts/actualizar.py. No editar a mano. */\n"
                      f"window.DATOS = {texto};\n", encoding="utf-8")
    print(f"Listo: {len(datos['rotacion'])} videos en la pantalla "
          f"({sum(v['esta_semana'] for v in datos['rotacion'])} de esta semana).")


if __name__ == "__main__":
    main()
