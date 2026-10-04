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
