#!/usr/bin/env bash
# Crea el repositorio "Cursed Chess by Jorge" en GitHub y sube el código.
# Requiere: gh CLI autenticado (gh auth login) o que ya esté configurado el remoto.
set -e

REPO="Cursed-Chess-by-Jorge"   # nombre interno (GitHub no permite espacios)
DESC="Cursed Chess by Jorge — ajedrez maldito personalizable, captura el rey para ganar"

if ! command -v gh >/dev/null 2>&1; then
  echo "No se encontró 'gh'. Instálalo y haz 'gh auth login', o crea el repo a mano:"
  echo "  git remote add origin git@github.com:TU_USUARIO/${REPO}.git"
  exit 1
fi

# Crear el repositorio (privado; cambia --public si lo prefieres)
gh repo create "$REPO" --private --description "$DESC" --source=. --push --remote origin

echo ""
echo "✅ Repositorio creado y código subido a GitHub."
echo "   Puedes cambiar el nombre visible a 'Cursed Chess by Jorge' en la configuración del repo."
