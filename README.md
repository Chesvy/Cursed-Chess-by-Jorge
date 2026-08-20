# ♟️ Cursed Chess by Jorge

Un ajedrez "maldito" y totalmente personalizable. Gana el jugador que **capture al rey enemigo** (nada de jaque mate).

App web de una sola página (HTML + CSS + JS vanilla). No necesita instalar nada: solo abrir `index.html` o servir la carpeta.

## Cómo ejecutar

```bash
cd cursed-chess
python3 -m http.server 8080
# abre http://localhost:8080
```

O simplemente abre `index.html` en tu navegador (aunque un servidor local es lo más fiable).

## Funciones

### 🎮 Partida simple
- Modo clásico con las piezas, tablero y reglas de toda la vida.
- Juega **2 personas** (misma pantalla) o **contra la IA** (3 niveles de dificultad).
- Con o sin **temporizador** (minutos por jugador + incremento).
- En todos los modos se gana **capturando al rey**.

### 🎨 Customizar (Editor de tableros)
Puedes diseñar tableros y guardarlos (no se borran al cerrar la app):
- Tamaño del tablero de 2×2 a 24×24 (las celdas se escalan para caber en pantalla).
- **Casillas vacías** donde ninguna pieza puede quedarse.
- **Agujero negro** (4×4): absorbe las piezas que entran en su zona.
- **Agujero blanco** (4×4): empuja las piezas hacia afuera.
- **Cintas transportadoras** de nivel 1–5 que empujan las piezas en una dirección.
- **Casillas de agua**: las piezas custom con habilidad *marina* pueden moverse; las piezas normales se hunden.
- Colocar piezas de ambos colores donde quieras.
- Los tableros custom se guardan y cargan y se juegan igual que uno normal (2 personas o vs IA).

### 🧬 Diseñar piezas
Crea piezas nuevas además de las originales:
- Nombre y símbolo (emoji).
- Movimientos a tu gusto (delx, dely, deslizante, salto, solo mover / solo capturar).
- Habilidades: *Marina*, *Fantasma* (ignora bloqueos), *Pesada* (no la empujan cintas ni agujeros).
- Las piezas se guardan y se pueden usar en cualquier partida o tablero.

### 💾 Guardar / cargar
- Guarda y carga partidas en cualquier momento.
- Guarda y carga tableros y piezas custom.
- Todo se conserva al cerrar la aplicación (almacenamiento local del navegador).

## Estructura

```
cursed-chess/
  index.html       # interfaz y pantallas
  css/style.css    # estilos
  js/
    engine.js      # motor: movimientos, captura del rey, elementos del tablero
    pieces.js      # registro de piezas (clásicas + custom)
    ai.js          # IA (minimax)
    storage.js     # guardado/carga (localStorage)
    app.js         # controlador e interfaz
  test-engine.js   # pruebas del motor (node test-engine.js)
  smoke.js         # prueba de integración (node smoke.js)
```

## Licencia

Uso libre. Hecho con cariño por Jorge. 😈
