# FTTH GIS Editor

Primera entrega de un editor GIS tipo My Maps para redes FTTH.

## Qué hace esta versión

- mapa base con Leaflet
- importación de archivos `.kml`, `.kmz` y `.geojson`
- creación de:
  - nodos
  - líneas de fibra óptica
  - cajas de empalme
  - cajas NAP
- panel de propiedades para editar nombre, código, estado, color y observaciones
- guardado local en el navegador
- exportación a GeoJSON
- edición geométrica usando Leaflet-Geoman

## Requisitos

- Node.js LTS
- Visual Studio Code

## Cómo ejecutarlo

1. Abrí esta carpeta en Visual Studio Code.
2. Abrí una terminal.
3. Ejecutá:

```bash
npm install
npm run dev
```

4. Abrí en el navegador la URL que te muestre la terminal, normalmente:

```bash
http://localhost:5173
```

## Cómo usarlo

### Dibujar elementos

En el panel izquierdo:

- **Nodo**: activa dibujo de un marcador para nodo.
- **Caja empalme**: activa dibujo de un marcador para caja de empalme.
- **Caja NAP**: activa dibujo de un marcador para NAP.
- **Línea fibra**: activa dibujo de una polilínea.

Después hacé clic en el mapa para crear el objeto.

### Editar un elemento

1. Seleccionalo desde el mapa o desde la lista de elementos.
2. Editá sus propiedades en el panel derecho.
3. Para mover o modificar geometrías, usá las herramientas de Leaflet-Geoman del mapa.

### Importar KML o KMZ

1. Clic en **Cargar KML / KMZ / GeoJSON**.
2. Elegí tu archivo.
3. El sistema lo convierte y lo dibuja sobre el mapa.

## Notas de esta primera versión

- solo se soportan puntos y líneas
- los polígonos se ignoran en esta entrega
- el guardado es local al navegador, no hay base de datos todavía
- está pensada como base para una versión 2 con capas, estilos avanzados y persistencia real
