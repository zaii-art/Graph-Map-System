# Graph Map Algorithm System

A Flask web app inspired by a classroom graph/map algorithm visualizer.

## Features
- Online OpenStreetMap background
- Upload your own JPG, PNG, or WebP map photo
- Preserves the photo's original aspect ratio (no stretching)
- Draw vertices by clicking intersections
- Connect vertices with edges
- Undo last graph action (up to 50 actions)
- Approximate edge weights
- BFS, DFS, Dijkstra, and A* search
- Start/goal selection and highlighted path
- Search metrics
- Save/load graph as JSON, including the uploaded photo
- Delete vertices (tap a vertex → Delete) and reset the graph
- Search a country or place on the online map
- Minimizable Graph Information panel
- Save the edited photo as a PNG (💾) or the graph data as JSON ({ })

## New in this version
- Vertex labels (V1, V2, ...) are shown by default (Labels checkbox)
- Search animation: visited nodes light up yellow, then the path is drawn
- Total path cost, plus a "Compare all algorithms" table
- Tap an edge to edit its weight
- Constraints tab: tap edges to block them, required via-node, max cost
- Genetic Algorithm tab: best order to visit several stops
- Neural Network tab is still a placeholder

## Run
```bash
pip install -r requirements.txt
python app.py
```
Open `http://127.0.0.1:5000`.

## Photo upload
1. Click **Upload Map Photo**.
2. Select a JPG, PNG, or WebP image.
3. Turn on **Draw Node** and click intersections.
4. Turn on **Draw Edge**, click one vertex, then another.
5. Choose start and goal, select an algorithm, and press **Search**.
6. Use **↶ Undo** to undo the last graph change.

The photo is stored inside the exported JSON file as image data. Therefore, the JSON can be large, but loading it should restore the picture as well as vertices and edges. The uploaded image is processed in the browser and is not sent to the Flask server.

The map tiles and Leaflet library require an internet connection.

## Locate (coordinates)
- Turn on the **📍 Locate** switch (next to Draw Node / Draw Edge), then tap the map, a road, or a vertex.
- Each tap adds a small red numbered dot. The coordinates are shown in the **Located points** list in the Graph Information panel, with 📋 (copy), ✕ (remove), **Copy all points** and **Clear**.
- On a photo the coordinates are pixels from the top-left corner (x, y). On the online map they are latitude, longitude.
- Tapping a vertex (Locate off) also shows its coordinates in the vertex menu.
- Code lives in `static/locate.js`; `app.js` and `extra.js` are unchanged.
