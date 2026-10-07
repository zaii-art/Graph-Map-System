// ---- Added feature: Locate (tap to read coordinates). Does not change any earlier code. ----
// Photo mode  -> pixels from the top-left corner of the photo (x, y).
// Online map  -> latitude, longitude.
const locateMode = document.getElementById("locateMode");
const locateBox = document.getElementById("locateBox");
const locateList = document.getElementById("locateList");
const mapEl = map.getContainer();
let locatedPoints = [];       // {lat, lng, text, marker}

// ---------- coordinate text ----------
function coordParts(lat, lng) {
    if (photoMode && photoDimensions) {
        return {text: Math.round(lng) + ", " + Math.round(photoDimensions.height - lat)};
    }
    return {text: lat.toFixed(6) + ", " + lng.toFixed(6)};
}

// ---------- copy helper (works on plain http too) ----------
function copyText(text) {
    const fallback = () => {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch (e) {}
        ta.remove();
        return ok;
    };
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(() => true, () => fallback());
    }
    return Promise.resolve(fallback());
}

// ---------- dots + list ----------
function dotIcon(n) {
    return L.divIcon({
        className: "locate-icon",
        html: '<div class="locate-dot">' + n + "</div>",
        iconSize: [18, 18],
        iconAnchor: [9, 9]
    });
}

function renderLocated() {
    locatedPoints.forEach((p, i) => p.marker.setIcon(dotIcon(i + 1)));
    locateBox.hidden = !(locatedPoints.length || locateMode.checked);
    locateList.innerHTML = "";
    if (!locatedPoints.length) {
        locateList.innerHTML = '<p class="hint">Tap the map, a road, or a vertex to add a point.</p>';
        return;
    }
    locatedPoints.forEach((p, i) => {
        const row = document.createElement("div");
        row.className = "locate-row";
        row.innerHTML = '<span class="locate-num">' + (i + 1) + '</span><span class="locate-text"></span>' +
            '<button type="button" title="Copy">📋</button><button type="button" title="Remove">✕</button>';
        row.querySelector(".locate-text").textContent = p.text;
        const [copyBtn, delBtn] = row.querySelectorAll("button");
        copyBtn.onclick = () => copyText(p.text).then(ok => {
            result.textContent = ok ? "Copied: " + p.text : "Could not copy. Press and hold the numbers to copy them.";
        });
        delBtn.onclick = () => {
            map.removeLayer(p.marker);
            locatedPoints = locatedPoints.filter(x => x !== p);
            renderLocated();
        };
        locateList.appendChild(row);
    });
}

function addLocatedPoint(lat, lng) {
    const marker = L.marker([lat, lng], {icon: dotIcon(locatedPoints.length + 1), interactive: false, keyboard: false, zIndexOffset: 1000}).addTo(map);
    const p = {lat, lng, text: coordParts(lat, lng).text, marker};
    locatedPoints.push(p);
    renderLocated();
    result.textContent = "Point " + locatedPoints.length + ": " + p.text;
}

function clearLocated() {
    locatedPoints.forEach(p => map.removeLayer(p.marker));
    locatedPoints = [];
    renderLocated();
}

document.getElementById("locateClear").onclick = clearLocated;
document.getElementById("locateCopyAll").onclick = () => {
    if (!locatedPoints.length) { result.textContent = "No located points yet."; return; }
    copyText(locatedPoints.map((p, i) => (i + 1) + ": " + p.text).join("\n")).then(ok => {
        result.textContent = ok ? "Copied " + locatedPoints.length + " point(s)." : "Could not copy the points.";
    });
};

// ---------- switch ----------
locateMode.addEventListener("change", () => {
    mapEl.classList.toggle("locating", locateMode.checked);
    map.closePopup();
    if (locateMode.checked) result.textContent = "Locate on: tap the map, a road, or a vertex to mark its coordinates.";
    renderLocated();
});

// ---------- taps ----------
// Listen before the map, roads and vertices so a tap only locates while the switch is on.
let downPos = null;
mapEl.addEventListener("pointerdown", e => { downPos = {x: e.clientX, y: e.clientY}; }, true);
mapEl.addEventListener("click", e => {
    if (!locateMode.checked) return;
    if (e.target.closest(".leaflet-control, .leaflet-popup")) return;   // zoom buttons etc. still work
    e.stopPropagation();
    e.preventDefault();
    if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 8) return;   // it was a drag, not a tap

    // Tapping a vertex gives that vertex's exact position.
    const icon = e.target.closest(".node-icon");
    const hit = icon && nodes.find(n => n.marker && n.marker.getElement() === icon);
    if (hit) { addLocatedPoint(hit.lat, hit.lng); return; }

    const ll = map.mouseEventToLatLng(e);
    addLocatedPoint(ll.lat, ll.lng);
}, true);

// ---------- vertex menu shows its coordinates ----------
const _nodePopupContent = nodePopupContent;
nodePopupContent = function (node) {
    const box = _nodePopupContent(node);
    const info = document.createElement("div");
    info.className = "node-coords";
    info.textContent = coordParts(node.lat, node.lng).text;
    const title = box.querySelector("b");
    if (title) title.insertAdjacentElement("afterend", info); else box.prepend(info);
    return box;
};

// ---------- located dots belong to one background: clear them when it changes ----------
let bgKey = null;
setInterval(() => {
    const key = photoMode + ":" + (photoOverlay ? L.stamp(photoOverlay) : 0);
    if (bgKey !== null && key !== bgKey && locatedPoints.length) clearLocated();
    bgKey = key;
}, 300);

renderLocated();
