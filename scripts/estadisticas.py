"""Copia a la pagina las estadisticas del media kit que arma el agente danx-manager.

Se corre en el computador de Daniel despues de que el agente haga un media kit nuevo:
    python scripts/estadisticas.py
Escribe datos/estadisticas.js, copia los PDF a pdf/ y baja los logos de las marcas a
img/marcas/. Con --publicar tambien guarda y sube el cambio a GitHub (lo usa la rutina del lunes).
Solo pasa datos publicos del media kit (nada de correos de cuentas ni precios).
"""
import argparse
import json
import re
import shutil
import subprocess
import urllib.request
from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parent.parent
AGENTE = Path.home() / "Documents" / "Agentes o Aut Danx Claude" / "danx-manager"
PERFILES = ["xdanx", "danx"]   # los otros canales todavia son chicos para marcas

CAMPOS = ["titulo", "handle", "fecha", "suscriptores", "mediana_engaged", "n_videos",
          "paises", "edades", "genero", "pct_visto_medio"]


def slug(nombre):
    return re.sub(r"[^a-z0-9]+", "-", nombre.lower()).strip("-")


def bajar_logo(url, destino_sin_ext):
    pedido = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(pedido, timeout=20) as r:
        tipo = r.headers.get("Content-Type", "")
        cuerpo = r.read()
    ext = ".svg" if "svg" in tipo or url.endswith(".svg") else ".png"
    destino = destino_sin_ext.with_suffix(ext)
    destino.write_bytes(cuerpo)
    return destino.relative_to(RAIZ).as_posix()


def git(*cmd):
    return subprocess.run(["git", *cmd], cwd=RAIZ, capture_output=True, text=True)


def publicar():
    """Sube a GitHub (y asi a xdanx.cl) los archivos del media kit, solo si cambiaron."""
    git("add", "datos/estadisticas.js", "pdf", "img/marcas")
    if git("diff", "--staged", "--quiet").returncode == 0:
        print("Sin cambios: la pagina ya tiene el media kit de hoy.")
        return 0
    r = git("commit", "-m", "Media kit actualizado desde la rutina semanal")
    if r.returncode:
        print("No pude guardar el cambio:", r.stderr.strip())
        return 1
    # el robot de videos tambien sube cambios: se trae lo nuevo antes de subir
    git("pull", "--rebase", "--autostash", "origin", "main")
    r = git("push", "origin", "HEAD:main")
    if r.returncode:
        print("No pude subir a GitHub:", r.stderr.strip())
        return 1
    print("Subido: xdanx.cl muestra el media kit nuevo en unos minutos.")
    return 0


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--agente", type=Path, default=AGENTE, help="carpeta de danx-manager")
    p.add_argument("--publicar", action="store_true",
                   help="despues de copiar, guardar y subir a GitHub si hay cambios")
    args = p.parse_args()

    reglas = yaml.safe_load((args.agente / "config" / "reglas.yaml").read_text(encoding="utf-8"))
    kit = reglas["media_kit"]
    salida = {"perfiles": {}, "marcas": [], "redes": []}
    try:
        enlaces = json.loads((args.agente / "media-kit" / "urls.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        enlaces = {}

    (RAIZ / "pdf").mkdir(exist_ok=True)
    for perfil in PERFILES:
        est = json.loads((args.agente / "estadisticas" / f"{perfil}.json").read_text(encoding="utf-8"))
        datos = {k: est[k] for k in CAMPOS if k in est}
        datos["descripcion"] = kit["descripcion"].get(perfil, "")
        pdf = args.agente / "media-kit" / f"{perfil}.pdf"
        if pdf.exists():
            shutil.copy2(pdf, RAIZ / "pdf" / f"media-kit-{perfil}.pdf")
            datos["pdf"] = f"pdf/media-kit-{perfil}.pdf"
        if enlaces.get(perfil):
            datos["url_kit"] = enlaces[perfil]   # media kit publicado (pagina de Claude)
        salida["perfiles"][perfil] = datos
    for r in kit.get("redes") or []:
        salida["redes"].append({"nombre": r["nombre"], "seguidores": r["seguidores"], "url": r["url"]})

    carpeta = RAIZ / "img" / "marcas"
    carpeta.mkdir(parents=True, exist_ok=True)
    for m in kit["marcas"]:
        marca = {"nombre": m["nombre"], "video": m["video"], "logo": ""}
        try:
            marca["logo"] = bajar_logo(m["logo"], carpeta / slug(m["nombre"]))
        except Exception as e:  # sin logo se ve la inicial: no vale la pena frenar todo
            print(f"No pude bajar el logo de {m['nombre']}: {e}")
        salida["marcas"].append(marca)

    texto = json.dumps(salida, ensure_ascii=False, indent=1)
    (RAIZ / "datos" / "estadisticas.js").write_text(
        "/* Lo escribe scripts/estadisticas.py con los datos del media kit. No editar a mano. */\n"
        f"window.ESTADISTICAS = {texto};\n", encoding="utf-8")
    print("Listo: estadisticas de " + ", ".join(salida["perfiles"]) +
          f" y {sum(1 for m in salida['marcas'] if m['logo'])} logos de marcas.")
    if args.publicar:
        raise SystemExit(publicar())


if __name__ == "__main__":
    main()
