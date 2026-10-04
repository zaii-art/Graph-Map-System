const map = L.map("map").setView([10.73, 124.03], 15);

// Esri World Street Map: free (no API key) and labels places in English.
// If its tiles fail to load, the map automatically falls back to standard OpenStreetMap tiles.
const ESRI_ATTRIBUTION = "Tiles &copy; Esri &mdash; Source: Esri, HERE, Garmin, OpenStreetMap contributors";
const OSM_ATTRIBUTION = "&copy; OpenStreetMap contributors";
const tileLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: ESRI_ATTRIBUTION
}).addTo(map);

let tileErrors = 0;
let usingFallbackTiles = false;
tileLayer.on("tileerror", () => {
    tileErrors++;
    if (tileErrors >= 6 && !usingFallbackTiles) {
        usingFallbackTiles = true;
        map.attributionControl.removeAttribution(ESRI_ATTRIBUTION);
        map.attributionControl.addAttribution(OSM_ATTRIBUTION);
        tileLayer.setUrl("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
    }
});

// In photo mode, use pixel-like coordinates so the image keeps its natural aspect ratio.
let photoMap = null;

let photoOverlay = null;
let photoBounds = null;
let uploadedPhotoData = null;
let photoMode = false;
let undoStack = [];
let photoDimensions = null;

let nodes = [];
let edges = [];
let edgeLayers = [];
let nodeLayers = [];
let pathLayers = [];
let selectedNode = null;
let edgeStart = null;
let nodeCounter = 1;
let currentPath = [];

const nodeMode = document.getElementById("nodeMode");
const edgeMode = document.getElementById("edgeMode");
const startNode = document.getElementById("startNode");
const goalNode = document.getElementById("goalNode");
const result = document.getElementById("result");
const metrics = document.getElementById("metrics");
const photoUpload = document.getElementById("photoUpload");

map.on("click", e => {
    if (!nodeMode.checked) return;
    addNode(e.latlng.lat, e.latlng.lng);
});

function addNode(lat, lng, id = null) {
    pushUndoState();
    const node = { id: id || "V" + nodeCounter++, lat, lng };
    nodes.push(node);
    drawNode(node);
    refreshNodeSelects();
    updateMetrics();
    result.textContent = `${node.id} created.`;
}

function drawNode(node) {
    // The visible dot is small, but the clickable area is a 44x44 px box (good for fingers).
    const marker = L.marker([node.lat, node.lng], {
        icon: L.divIcon({
            className: "node-icon",
            html: '<span class="node-dot"></span>',
            iconSize: [44, 44],
            iconAnchor: [22, 22]
        }),
        keyboard: false
    }).addTo(map);

    marker.bindTooltip(node.id, {
        permanent: true,
        direction: "top",
        className: "node-label",
        offset: [0, -10]
    });

    marker.on("click", ev => {
        L.DomEvent.stopPropagation(ev);
        if (edgeMode.checked) {
            handleEdgeClick(node);
        } else {
            setNodeClass(selectedNode, "selected", false);
            selectedNode = node;
            setNodeClass(node, "selected", true);
            result.textContent = `${node.id} selected.`;
            openNodePopup(node);
        }
    });

    node.marker = marker;
    nodeLayers.push(marker);
}

function setNodeClass(node, cls, on) {
    if (!node || !node.marker) return;
    const el = node.marker.getElement();
    const dot = el && el.querySelector(".node-dot");
    if (dot) dot.classList.toggle(cls, on);
}

function clearEdgeStart() {
    setNodeClass(edgeStart, "edge-start", false);
    edgeStart = null;
}

edgeMode.addEventListener("change", () => { clearEdgeStart(); map.closePopup(); });

// Tapping a vertex (when Draw Edge is off) opens a small menu with Delete, Set start and Set goal.
function nodePopupContent(node) {
    const box = document.createElement("div");
    box.className = "node-pop";
    box.innerHTML = `<b>${node.id}</b>
        <div class="pop-row">
            <button type="button" class="pop-btn" data-act="start">Set start</button>
            <button type="button" class="pop-btn" data-act="goal">Set goal</button>
        </div>
        <button type="button" class="pop-btn pop-del" data-act="delete">🗑 Delete vertex</button>`;
    box.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => {
            const act = btn.dataset.act;
            if (act === "start") {
                startNode.value = node.id;
                updateEndpointHighlight();
                result.textContent = `${node.id} set as start.`;
                map.closePopup();
            } else if (act === "goal") {
                goalNode.value = node.id;
                updateEndpointHighlight();
                result.textContent = `${node.id} set as goal.`;
                map.closePopup();
            } else {
                selectedNode = node;
                map.closePopup();
                deleteSelectedNode();
            }
        });
    });
    return box;
}

function openNodePopup(node) {
    L.popup({closeButton: false, offset: [0, -4], className: "node-popup", autoPanPadding: [20, 20]})
        .setLatLng([node.lat, node.lng])
        .setContent(nodePopupContent(node))
        .openOn(map);
}

function handleEdgeClick(node) {
    if (!edgeStart) {
        edgeStart = node;
        setNodeClass(node, "edge-start", true);
        result.textContent = `Edge start: ${node.id}. Click another vertex.`;
        return;
    }

    if (edgeStart.id === node.id) {
        clearEdgeStart();
        result.textContent = "Edge cancelled.";
        return;
    }

    const exists = edges.some(e =>
        (e.a === edgeStart.id && e.b === node.id) ||
        (e.a === node.id && e.b === edgeStart.id)
    );

    if (exists) {
        result.textContent = "That edge already exists.";
        clearEdgeStart();
        return;
    }

    const a = edgeStart;
    const b = node;
    const distance = map.distance([a.lat, a.lng], [b.lat, b.lng]);

    pushUndoState();
    const edge = { a: a.id, b: b.id, weight: Math.max(1, Math.round(distance)) };
    edges.push(edge);

    const line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
        color: "#555", weight: 3
    }).addTo(map);
    line.bindTooltip(edge.weight + (photoMode ? " units" : " m"), {sticky: true});
    edge.layer = line;
    edgeLayers.push(line);
    wireEdge(edge);

    clearEdgeStart();
    result.textContent = `Connected ${a.id} ↔ ${b.id}. Weight: ${edge.weight}${photoMode ? " units" : " m"}`;
    updateMetrics();
}

function refreshNodeSelects() {
    const oldStart = startNode.value;
    const oldGoal = goalNode.value;
    startNode.innerHTML = '<option value="">Select start</option>';
    goalNode.innerHTML = '<option value="">Select goal</option>';

    nodes.forEach(n => {
        startNode.add(new Option(n.id, n.id));
        goalNode.add(new Option(n.id, n.id));
    });

    if (nodes.some(n => n.id === oldStart)) startNode.value = oldStart;
    if (nodes.some(n => n.id === oldGoal)) goalNode.value = oldGoal;
    updateEndpointHighlight();
}

// Labels are hidden by default, so mark the chosen start (green) and goal (orange) on the map.
function updateEndpointHighlight() {
    nodes.forEach(n => {
        setNodeClass(n, "start", n.id === startNode.value);
        setNodeClass(n, "goal", n.id === goalNode.value);
    });
}
startNode.addEventListener("change", updateEndpointHighlight);
goalNode.addEventListener("change", updateEndpointHighlight);

document.getElementById("showLabels").onchange = e => {
    document.getElementById("map").classList.toggle("hide-labels", !e.target.checked);
};

function updateMetrics(visited = 0, path = 0, ms = 0) {
    document.getElementById("metricNodes").textContent = nodes.length;
    document.getElementById("metricEdges").textContent = edges.length;
    document.getElementById("metricVisited").textContent = visited;
    document.getElementById("metricPath").textContent = path;
    document.getElementById("metricTime").textContent = ms.toFixed(2) + " ms";
}

document.getElementById("searchBtn").onclick = () => {
    clearPath();
    const s = startNode.value;
    const g = goalNode.value;

    if (!s || !g) {
        result.textContent = "Choose both a start node and a goal node.";
        return;
    }
    if (s === g) {
        result.textContent = "Start and goal are the same.";
        return;
    }

    const algorithm = document.getElementById("algorithm").value;
    const t0 = performance.now();
    let answer;

    if (algorithm === "bfs") answer = bfs(s, g);
    else if (algorithm === "dfs") answer = dfs(s, g);
    else if (algorithm === "dijkstra") answer = dijkstra(s, g);
    else answer = astar(s, g);

    const ms = performance.now() - t0;

    if (!answer.path.length) {
        result.textContent = "No path found. Check that the start and goal are connected.";
        updateMetrics(answer.visited, 0, ms);
        return;
    }

    drawPath(answer.path);
    result.textContent = `${algorithm.toUpperCase()} found: ${answer.path.join(" → ")}`;
    updateMetrics(answer.visited, answer.path.length - 1, ms);
};

function adjacency() {
    const graph = {};
    nodes.forEach(n => graph[n.id] = []);
    edges.forEach(e => {
        if (e.blocked) return;
        graph[e.a].push({to: e.b, w: e.weight});
        graph[e.b].push({to: e.a, w: e.weight});
    });
    return graph;
}

function bfs(start, goal) {
    const graph = adjacency(), q = [start], parent = {[start]: null};
    let visited = 0; const order = [];
    while (q.length) {
        const current = q.shift();
        visited++; order.push(current);
        if (current === goal) break;
        for (const next of graph[current]) {
            if (!(next.to in parent)) {
                parent[next.to] = current;
                q.push(next.to);
            }
        }
    }
    return {path: makePath(parent, start, goal), visited, order};
}

function dfs(start, goal) {
    const graph = adjacency(), stack = [start], parent = {[start]: null};
    let visited = 0; const order = [];
    while (stack.length) {
        const current = stack.pop();
        visited++; order.push(current);
        if (current === goal) break;
        for (const next of graph[current]) {
            if (!(next.to in parent)) {
                parent[next.to] = current;
                stack.push(next.to);
            }
        }
    }
    return {path: makePath(parent, start, goal), visited, order};
}

function dijkstra(start, goal) {
    const graph = adjacency(), dist = {}, parent = {}, used = new Set();
    nodes.forEach(n => dist[n.id] = Infinity);
    dist[start] = 0;
    parent[start] = null;
    let visited = 0; const order = [];

    while (used.size < nodes.length) {
        let current = null;
        for (const n of nodes) {
            if (!used.has(n.id) && (current === null || dist[n.id] < dist[current])) current = n.id;
        }
        if (current === null || dist[current] === Infinity) break;
        used.add(current);
        visited++; order.push(current);
        if (current === goal) break;

        for (const next of graph[current]) {
            const newDist = dist[current] + next.w;
            if (newDist < dist[next.to]) {
                dist[next.to] = newDist;
                parent[next.to] = current;
            }
        }
    }
    return {path: makePath(parent, start, goal), visited, order};
}

function astar(start, goal) {
    const graph = adjacency();
    const goalObj = nodes.find(n => n.id === goal);
    const gScore = {}, parent = {}, open = [start], closed = new Set();
    nodes.forEach(n => gScore[n.id] = Infinity);
    gScore[start] = 0;
    parent[start] = null;
    let visited = 0; const order = [];

    function heuristic(id) {
        const n = nodes.find(x => x.id === id);
        return map.distance([n.lat, n.lng], [goalObj.lat, goalObj.lng]);
    }
    function fScore(id) { return gScore[id] + heuristic(id); }

    while (open.length) {
        let bestIndex = 0;
        for (let i = 1; i < open.length; i++) {
            if (fScore(open[i]) < fScore(open[bestIndex])) bestIndex = i;
        }
        const current = open.splice(bestIndex, 1)[0];
        visited++; order.push(current);
        if (current === goal) break;
        closed.add(current);

        for (const next of graph[current]) {
            if (closed.has(next.to)) continue;
            const tentative = gScore[current] + next.w;
            if (tentative < gScore[next.to]) {
                parent[next.to] = current;
                gScore[next.to] = tentative;
                if (!open.includes(next.to)) open.push(next.to);
            }
        }
    }
    return {path: makePath(parent, start, goal), visited, order};
}

function makePath(parent, start, goal) {
    if (!(goal in parent)) return [];
    const path = [];
    let current = goal;
    while (current !== null && current !== undefined) {
        path.unshift(current);
        current = parent[current];
    }
    return path[0] === start ? path : [];
}

function drawPath(path) {
    currentPath = path.slice();
    for (let i = 0; i < path.length - 1; i++) {
        const a = nodes.find(n => n.id === path[i]);
        const b = nodes.find(n => n.id === path[i + 1]);
        const line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
            color: "#e53935", weight: 7
        }).addTo(map);
        pathLayers.push(line);
    }
}

function clearPath() {
    currentPath = [];
    pathLayers.forEach(x => map.removeLayer(x));
    pathLayers = [];
}

function clearGraphLayers() {
    [...nodeLayers, ...edgeLayers, ...pathLayers].forEach(layer => map.removeLayer(layer));
    nodes = [];
    edges = [];
    nodeLayers = [];
    edgeLayers = [];
    pathLayers = [];
    selectedNode = null;
    edgeStart = null;
    nodeCounter = 1;
    refreshNodeSelects();
    updateMetrics();
}

function pushUndoState() {
    // Save graph structure before each change. Image data is kept separately.
    undoStack.push({
        nodes: nodes.map(n => ({id: n.id, lat: n.lat, lng: n.lng})),
        edges: edges.map(e => ({a: e.a, b: e.b, weight: e.weight, blocked: !!e.blocked})),
        nodeCounter
    });
    if (undoStack.length > 50) undoStack.shift();
}

function rebuildGraph(snapshot) {
    [...nodeLayers, ...edgeLayers, ...pathLayers].forEach(layer => map.removeLayer(layer));
    nodes = [];
    edges = [];
    nodeLayers = [];
    edgeLayers = [];
    pathLayers = [];
    selectedNode = null;
    edgeStart = null;

    (snapshot.nodes || []).forEach(n => {
        const node = {id: n.id, lat: n.lat, lng: n.lng};
        nodes.push(node);
    });
    nodeCounter = snapshot.nodeCounter || (nodes.length + 1);
    nodes.forEach(drawNode);

    (snapshot.edges || []).forEach(e => {
        const a = nodes.find(n => n.id === e.a);
        const b = nodes.find(n => n.id === e.b);
        if (!a || !b) return;
        const edge = {a: e.a, b: e.b, weight: e.weight, blocked: !!e.blocked};
        const line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
            color: "#555", weight: 3
        }).addTo(map);
        line.bindTooltip(edge.weight + (photoMode ? " units" : " m"), {sticky: true});
        edge.layer = line;
        edges.push(edge);
        edgeLayers.push(line);
    wireEdge(edge);
    });

    refreshNodeSelects();
    updateMetrics();
}

document.getElementById("undoBtn").onclick = () => {
    if (!undoStack.length) {
        result.textContent = "Nothing to undo yet.";
        return;
    }
    clearPath();
    const snapshot = undoStack.pop();
    rebuildGraph(snapshot);
    result.textContent = "Last graph action undone.";
};

photoUpload.addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        result.textContent = "Please choose a JPG, PNG, or WebP image.";
        return;
    }

    const reader = new FileReader();
    reader.onload = e => {
        uploadedPhotoData = e.target.result;
        usePhotoBackground(uploadedPhotoData);
        result.textContent = "Map photo loaded. Turn on Draw Node and click intersections to add vertices.";
    };
    reader.readAsDataURL(file);
    event.target.value = "";
});

function usePhotoBackground(dataUrl) {
    clearGraphLayers();
    undoStack = [];

    if (photoOverlay) {
        map.removeLayer(photoOverlay);
        photoOverlay = null;
    }

    // Hide online tiles and make the map a simple coordinate plane.
    tileLayer.setOpacity(0);
    photoMode = true;

    const img = new Image();
    img.onload = () => {
        photoDimensions = {width: img.naturalWidth, height: img.naturalHeight};

        // Use CRS.Simple so the overlay bounds are exactly the image's pixel dimensions.
        map.options.crs = L.CRS.Simple;
        const bounds = [[0, 0], [img.naturalHeight, img.naturalWidth]];
        photoBounds = bounds;
        photoOverlay = L.imageOverlay(dataUrl, bounds, {interactive: false}).addTo(map);
        photoOverlay.bringToBack();

        // Map click coordinates now map directly onto the uploaded image.
        // Pad the pan limit so you can move freely while zoomed in (a tight limit makes the view snap back).
        // zoomSnap 0 lets pinch-zoom stay exactly where you stop instead of jumping to a whole zoom level.
        map.options.zoomSnap = 0;
        map.options.zoomDelta = 0.5;
        map.options.bounceAtZoomLimits = false;
        map.setMaxBounds(L.latLngBounds(bounds).pad(1));
        map.options.maxBoundsViscosity = 0.3;
        map.setMinZoom(-10);
        map.setMaxZoom(10);
        map.fitBounds(bounds, {animate: false});
        const fitZoom = map.getZoom();
        map.setMinZoom(fitZoom - 1.5);
        map.setMaxZoom(fitZoom + 4);

        map.dragging.enable();
        map.scrollWheelZoom.enable();
        map.doubleClickZoom.enable();
        map.boxZoom.enable();
        map.keyboard.enable();

        result.textContent = `Photo loaded (${img.naturalWidth} × ${img.naturalHeight}). Turn on Draw Node and click intersections.`;
    };
    img.onerror = () => {
        result.textContent = "Could not read that image. Please try another JPG or PNG.";
    };
    img.src = dataUrl;
}
function useOnlineMap() {
    if (photoOverlay) {
        map.removeLayer(photoOverlay);
        photoOverlay = null;
    }
    const wasPhoto = photoMode;
    tileLayer.setOpacity(1);
    photoMode = false;
    uploadedPhotoData = null;
    photoDimensions = null;
    map.setMaxBounds(null);
    map.options.zoomSnap = 1;
    map.options.zoomDelta = 1;
    map.setMinZoom(0);
    map.setMaxZoom(19);
    if (wasPhoto) {
        // Photo mode switched the map to a flat pixel grid; switch back to real-world coordinates.
        map.options.crs = L.CRS.EPSG3857;
        map.setView([10.73, 124.03], 15, {animate: false, reset: true});
    }

    map.dragging.enable();
    map.scrollWheelZoom.enable();
    map.doubleClickZoom.enable();
    map.boxZoom.enable();
    map.keyboard.enable();

    result.textContent = "Online map restored. Existing photo-mode graph was cleared.";
    clearGraphLayers();
}

document.getElementById("onlineMapBtn").onclick = useOnlineMap;

function deleteSelectedNode() {
    if (!selectedNode) {
        result.textContent = "Click a vertex first, then press Delete.";
        return;
    }

    pushUndoState();
    const id = selectedNode.id;
    edges = edges.filter(e => {
        if (e.a === id || e.b === id) {
            if (e.layer) map.removeLayer(e.layer);
            edgeLayers = edgeLayers.filter(layer => layer !== e.layer);
            return false;
        }
        return true;
    });

    const index = nodes.findIndex(n => n.id === id);
    if (index >= 0) nodes.splice(index, 1);
    if (selectedNode.marker) map.removeLayer(selectedNode.marker);
    nodeLayers = nodeLayers.filter(layer => layer !== selectedNode.marker);

    selectedNode = null;
    refreshNodeSelects();
    updateMetrics();
    result.textContent = `${id} deleted.`;
}
document.getElementById("deleteBtn").onclick = deleteSelectedNode;

document.getElementById("resetBtn").onclick = () => {
    if (!confirm("Reset the entire graph?")) return;
    pushUndoState();
    clearGraphLayers();
    result.textContent = "Graph reset.";
};

document.getElementById("jsonBtn").onclick = () => {
    // Keys are ordered so nodes/edges are readable at the top of the file;
    // the huge base64 image goes last.
    const data = {
        photoMode,
        nodes: nodes.map(n => ({id: n.id, lat: n.lat, lng: n.lng})),
        edges: edges.map(e => ({a: e.a, b: e.b, weight: e.weight, blocked: !!e.blocked})),
        backgroundImageData: uploadedPhotoData
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "graph-map.json";
    a.click();
    URL.revokeObjectURL(a.href);
};


function showImagePreview(dataUrl) {
    let box = document.getElementById("imagePreview");
    if (!box) {
        box = document.createElement("div");
        box.id = "imagePreview";
        box.innerHTML = '<div class="preview-card"><p>Press and hold the picture → <b>Download image</b></p><img alt="Graph map"><button type="button">Close</button></div>';
        box.querySelector("button").onclick = () => box.classList.remove("open");
        document.body.appendChild(box);
    }
    box.querySelector("img").src = dataUrl;
    box.classList.add("open");
}

document.getElementById("saveBtn").onclick = () => {
    if (!photoMode || !uploadedPhotoData || !photoDimensions) {
        result.textContent = "Saving a picture works in photo mode. Upload a map photo first (use { } to save graph data only).";
        return;
    }
    const img = new Image();
    img.onload = () => {
        const W = photoDimensions.width, H = photoDimensions.height;
        const canvas = document.createElement("canvas");
        // Cap the output size: huge phone photos can exceed the browser's canvas limit.
        const k = Math.min(1, 4096 / Math.max(W, H));
        canvas.width = Math.round(W * k); canvas.height = Math.round(H * k);
        const ctx = canvas.getContext("2d");
        ctx.scale(k, k);
        const scale = Math.max(W, H) / 1000;      // keep lines/dots readable on big photos
        const pt = n => [n.lng, H - n.lat];       // CRS.Simple: y goes up, canvas y goes down
        const byId = id => nodes.find(n => n.id === id);

        ctx.drawImage(img, 0, 0, W, H);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.strokeStyle = "#555"; ctx.lineWidth = 3 * scale;
        edges.forEach(e => {
            const a = byId(e.a), b = byId(e.b);
            if (!a || !b) return;
            ctx.beginPath(); ctx.moveTo(...pt(a)); ctx.lineTo(...pt(b)); ctx.stroke();
        });

        if (currentPath.length > 1) {
            ctx.strokeStyle = "#e53935"; ctx.lineWidth = 7 * scale;
            ctx.beginPath();
            currentPath.forEach((id, i) => {
                const [x, y] = pt(byId(id));
                i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            });
            ctx.stroke();
        }

        const showLabels = document.getElementById("showLabels").checked;
        ctx.font = `bold ${14 * scale}px Arial`;
        ctx.textAlign = "center";
        nodes.forEach(n => {
            const [x, y] = pt(n);
            ctx.beginPath(); ctx.arc(x, y, 8 * scale, 0, Math.PI * 2);
            ctx.fillStyle = n.id === startNode.value ? "#2e7d32" : n.id === goalNode.value ? "#ef6c00" : "#666";
            ctx.fill();
            ctx.lineWidth = 2 * scale; ctx.strokeStyle = "#333"; ctx.stroke();
            if (showLabels) {
                ctx.lineWidth = 4 * scale; ctx.strokeStyle = "white"; ctx.strokeText(n.id, x, y - 12 * scale);
                ctx.fillStyle = "#222"; ctx.fillText(n.id, x, y - 12 * scale);
            }
        });

        try {
            const dataUrl = canvas.toDataURL("image/png");
            canvas.toBlob(blob => {
                if (blob) {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = "graph-map.png";
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                }
                showImagePreview(dataUrl);
                result.textContent = "Image ready (graph-map.png). If it did not download, press and hold the picture and choose Download image.";
            }, "image/png");
        } catch (err) {
            result.textContent = "Could not create the image: " + err.message;
        }
    };
    img.onerror = () => { result.textContent = "Could not read the uploaded photo for export."; };
    img.src = uploadedPhotoData;
};

document.getElementById("loadBtn").onclick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
            try {
                const data = JSON.parse(event.target.result);
                clearGraphLayers();

                if (data.backgroundImageData) {
                    uploadedPhotoData = data.backgroundImageData;
                    usePhotoBackground(uploadedPhotoData);
                } else {
                    uploadedPhotoData = null;
                    useOnlineMap();
                }

                // Restore graph after the background switch clears the old graph.
                (data.nodes || []).forEach(n => {
                    nodes.push({id: n.id, lat: n.lat, lng: n.lng});
                    const number = parseInt(n.id.replace("V", ""), 10);
                    if (!Number.isNaN(number)) nodeCounter = Math.max(nodeCounter, number + 1);
                });

                nodes.forEach(n => drawNode(n));

                (data.edges || []).forEach(e => {
                    const a = nodes.find(n => n.id === e.a);
                    const b = nodes.find(n => n.id === e.b);
                    if (!a || !b) return;
                    const edge = {a: e.a, b: e.b, weight: e.weight, blocked: !!e.blocked};
                    const line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
                        color: "#555", weight: 3
                    }).addTo(map);
                    line.bindTooltip(edge.weight + (photoMode ? " units" : " m"), {sticky: true});
                    edge.layer = line;
                    edges.push(edge);
                    edgeLayers.push(line);
    wireEdge(edge);
                });

                refreshNodeSelects();
                updateMetrics();
                result.textContent = "Graph and background loaded.";
            } catch (err) {
                result.textContent = "Could not load that file. Please choose a valid graph-map JSON file.";
            }
        };
        reader.readAsText(file);
    };
    input.click();
};

document.getElementById("showMetrics").onchange = e => {
    metrics.classList.toggle("hidden", !e.target.checked);
};

document.querySelectorAll(".tab").forEach(tab => {
    tab.onclick = () => {
        document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
        tab.classList.add("active");
        const type = tab.dataset.tab;

        const descriptions = {
            search: ["Graph Information", "Use BFS, DFS, Dijkstra, or A* to search the graph."],
            constraint: ["Constraint Search", "Placeholder module: future rules can include blocked roads, maximum distance, or required locations."],
            genetic: ["Genetic Algorithm", "Placeholder module: route optimization using population, fitness, selection, crossover, and mutation."],
            neural: ["Neural Network", "Placeholder module: a future model could learn from graph/map data."]
        };

        document.getElementById("panelTitle").textContent = descriptions[type][0];
        document.getElementById("tabDescription").textContent = descriptions[type][1];
    };
});

updateMetrics();


// Minimize / expand the Graph Information panel by tapping its header.
const infoPanel = document.querySelector(".panel");
function togglePanel() {
    const collapsed = infoPanel.classList.toggle("collapsed");
    document.getElementById("panelHeader").setAttribute("aria-expanded", String(!collapsed));
}
document.getElementById("panelHeader").addEventListener("click", togglePanel);
document.getElementById("panelHeader").addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); togglePanel(); }
});

// ---- Place / country search (uses OpenStreetMap Nominatim; needs internet) ----
const placeForm = document.getElementById("placeForm");
const placeInput = document.getElementById("placeInput");
const placeResults = document.getElementById("placeResults");

function hidePlaceResults() {
    placeResults.classList.remove("open");
    placeResults.innerHTML = "";
}

function goToPlace(place) {
    hidePlaceResults();
    const [south, north, west, east] = place.boundingbox.map(Number);
    map.fitBounds([[south, west], [north, east]], {maxZoom: 16});
    result.textContent = `Showing: ${place.display_name}`;
}

placeForm.addEventListener("submit", async e => {
    e.preventDefault();
    const q = placeInput.value.trim();
    if (!q) return;
    hidePlaceResults();

    if (photoMode) {
        result.textContent = "Place search works on the online map. Tap 🌐 first (this clears the photo graph).";
        return;
    }

    result.textContent = "Searching…";
    try {
        const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=en&q=" + encodeURIComponent(q);
        const res = await fetch(url, {headers: {"Accept": "application/json", "Accept-Language": "en"}});
        if (!res.ok) throw new Error("HTTP " + res.status);
        const places = await res.json();

        if (!places.length) {
            result.textContent = `No place found for “${q}”.`;
            return;
        }
        if (places.length === 1) {
            goToPlace(places[0]);
            return;
        }

        result.textContent = "Choose a result from the list.";
        places.forEach(p => {
            const li = document.createElement("li");
            li.textContent = p.display_name;
            li.addEventListener("click", () => goToPlace(p));
            placeResults.appendChild(li);
        });
        placeResults.classList.add("open");
    } catch (err) {
        result.textContent = "Search failed. Check your internet connection and try again.";
    }
});

document.addEventListener("click", e => {
    if (!placeForm.contains(e.target)) hidePlaceResults();
});
