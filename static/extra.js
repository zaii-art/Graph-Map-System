// ---- Added features: animation, cost, constraints, compare, genetic, edge weights ----
const ALGOS = {bfs, dfs, dijkstra, astar};
const unit = () => photoMode ? " units" : " m";
let timers = [];

// ---------- helpers ----------
function pathCost(path) {
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const e = edges.find(x => !x.blocked && ((x.a === path[i] && x.b === path[i + 1]) || (x.b === path[i] && x.a === path[i + 1])));
        total += e ? e.weight : 0;
    }
    return total;
}
function clearVisited() {
    timers.forEach(clearTimeout); timers = [];
    nodes.forEach(n => setNodeClass(n, "visited", false));
}
const _clearPath = clearPath;
clearPath = function () { _clearPath(); clearVisited(); };

// Flash visited nodes one by one, then draw the final path.
function animate(order, path, done) {
    const step = Math.min(250, 3000 / Math.max(order.length, 1));
    order.forEach((id, i) => timers.push(setTimeout(() => setNodeClass(nodes.find(n => n.id === id), "visited", true), i * step)));
    timers.push(setTimeout(() => { drawPath(path); if (done) done(); }, order.length * step + 150));
}

// ---------- edges: block / unblock (Constraints tab) or edit weight ----------
function styleEdge(edge) {
    edge.layer.setStyle(edge.blocked ? {color: "#c62828", dashArray: "6 8", weight: 3} : {color: "#555", dashArray: null, weight: 3});
}
function wireEdge(edge) {
    styleEdge(edge);
    edge.layer.on("click", ev => {
        L.DomEvent.stopPropagation(ev);
        if (nodeMode.checked || edgeMode.checked) return;
        clearPath();
        if (activeTab() === "constraint") {
            pushUndoState();
            edge.blocked = !edge.blocked;
            styleEdge(edge);
            result.textContent = `Edge ${edge.a} ↔ ${edge.b} ${edge.blocked ? "blocked" : "unblocked"}.`;
        } else {
            const v = prompt(`Weight for ${edge.a} ↔ ${edge.b}`, edge.weight);
            const w = Math.round(Number(v));
            if (v === null || !(w > 0)) return;
            pushUndoState();
            edge.weight = w;
            edge.layer.setTooltipContent(w + unit());
            result.textContent = `Weight of ${edge.a} ↔ ${edge.b} set to ${w}.`;
        }
        updateMetrics();
    });
}

// ---------- tabs ----------
const activeTab = () => document.querySelector(".tab.active").dataset.tab;
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
    const type = t.dataset.tab;
    document.getElementById("searchBox").hidden = type !== "search";
    document.getElementById("constraintBox").hidden = type !== "constraint";
    document.getElementById("geneticBox").hidden = type !== "genetic";
    document.getElementById("neuralBox").hidden = type !== "neural";
    document.getElementById("tabDescription").textContent = {
        search: "Use BFS, DFS, Dijkstra, or A* to search the graph.",
        constraint: "Search with rules: blocked edges, a required via-node, and a max cost.",
        genetic: "Pick stops; a genetic algorithm finds a short order to visit them.",
        neural: "Neural Network: not built yet."
    }[type];
    document.getElementById("searchBtn").disabled = type === "genetic" || type === "neural";
}));

const _refresh = refreshNodeSelects;
refreshNodeSelects = function () {
    _refresh();
    const via = document.getElementById("viaNode"), oldVia = via.value;
    via.innerHTML = '<option value="">None</option>';
    const ga = document.getElementById("gaStops"), oldGa = [...ga.selectedOptions].map(o => o.value);
    ga.innerHTML = "";
    nodes.forEach(n => {
        via.add(new Option(n.id, n.id));
        const o = new Option(n.id, n.id); o.selected = oldGa.includes(n.id); ga.add(o);
    });
    if (nodes.some(n => n.id === oldVia)) via.value = oldVia;
};
refreshNodeSelects();

// ---------- search (with animation, cost, via-node and max cost) ----------
function runAlgo(name, s, g, via) {
    const t0 = performance.now();
    let ans;
    if (via) {
        const a = ALGOS[name](s, via), b = ALGOS[name](via, g);
        ans = {path: a.path.length && b.path.length ? a.path.concat(b.path.slice(1)) : [], visited: a.visited + b.visited, order: a.order.concat(b.order)};
    } else ans = ALGOS[name](s, g);
    ans.ms = performance.now() - t0;
    ans.cost = pathCost(ans.path);
    return ans;
}

document.getElementById("searchBtn").onclick = () => {
    clearPath();
    const s = startNode.value, g = goalNode.value;
    if (!s || !g) { result.textContent = "Choose both a start node and a goal node."; return; }
    if (s === g) { result.textContent = "Start and goal are the same."; return; }
    const name = document.getElementById("algorithm").value;
    const constraint = activeTab() === "constraint";
    const via = constraint ? document.getElementById("viaNode").value : "";
    const maxCost = constraint ? Number(document.getElementById("maxCost").value) : 0;

    const ans = runAlgo(name, s, g, via);
    updateMetrics(ans.visited, Math.max(ans.path.length - 1, 0), ans.ms);
    document.getElementById("metricCost").textContent = ans.cost + unit();
    if (!ans.path.length) {
        result.textContent = "No path found (check that nodes are connected and not blocked).";
        animate(ans.order, [], null);
        return;
    }
    animate(ans.order, ans.path, () => {
        let msg = `${name.toUpperCase()} found: ${ans.path.join(" → ")} (cost ${ans.cost}${unit()})`;
        if (maxCost && ans.cost > maxCost) msg += `. Exceeds max cost ${maxCost}!`;
        result.textContent = msg;
    });
};

// ---------- compare all algorithms ----------
document.getElementById("compareBtn").onclick = () => {
    const s = startNode.value, g = goalNode.value;
    if (!s || !g || s === g) { result.textContent = "Choose different start and goal nodes first."; return; }
    const rows = Object.keys(ALGOS).map(n => ({n, ...runAlgo(n, s, g, "")}));
    const best = Math.min(...rows.filter(r => r.path.length).map(r => r.cost));
    document.getElementById("compareOut").innerHTML =
        "<table><tr><th>Algo</th><th>Visited</th><th>Hops</th><th>Cost</th><th>ms</th></tr>" +
        rows.map(r => `<tr class="${r.path.length && r.cost === best ? "best" : ""}"><td>${r.n.toUpperCase()}</td><td>${r.visited}</td><td>${Math.max(r.path.length - 1, 0)}</td><td>${r.path.length ? r.cost : "—"}</td><td>${r.ms.toFixed(2)}</td></tr>`).join("") +
        "</table>";
};

// ---------- genetic algorithm: best order to visit chosen stops ----------
document.getElementById("gaRun").onclick = () => {
    clearPath();
    const s = startNode.value, g = goalNode.value;
    const mids = [...document.getElementById("gaStops").selectedOptions].map(o => o.value).filter(v => v !== s && v !== g);
    if (!s || !g || s === g) { result.textContent = "Choose start and goal first."; return; }
    if (mids.length < 2) { result.textContent = "Select at least 2 stops (hold Ctrl / tap several)."; return; }

    const cache = {};
    const leg = (a, b) => cache[a + ">" + b] || (cache[a + ">" + b] = (() => { const p = dijkstra(a, b).path; return {path: p, cost: p.length ? pathCost(p) : Infinity}; })());
    const total = order => [s, ...order, g].reduce((sum, id, i, arr) => i ? sum + leg(arr[i - 1], id).cost : 0, 0);

    const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const tournament = pop => { let b = null; for (let i = 0; i < 3; i++) { const c = pop[Math.random() * pop.length | 0]; if (!b || c.cost < b.cost) b = c; } return b; };
    const crossover = (p1, p2) => {            // order crossover (OX)
        const a = Math.random() * p1.length | 0, b = a + (Math.random() * (p1.length - a) | 0);
        const mid = p1.slice(a, b + 1);
        return [...p2.filter(x => !mid.includes(x)).slice(0, a), ...mid, ...p2.filter(x => !mid.includes(x)).slice(a)];
    };
    const mk = o => ({order: o, cost: total(o)});

    let pop = Array.from({length: 60}, () => mk(shuffle(mids)));
    pop.sort((x, y) => x.cost - y.cost);
    const first = pop[0].cost;
    for (let gen = 0; gen < 150; gen++) {
        const next = pop.slice(0, 2);          // elitism
        while (next.length < 60) {
            let child = crossover(tournament(pop).order, tournament(pop).order);
            if (Math.random() < 0.2) { const i = Math.random() * child.length | 0, j = Math.random() * child.length | 0; [child[i], child[j]] = [child[j], child[i]]; }
            next.push(mk(child));
        }
        pop = next.sort((x, y) => x.cost - y.cost);
    }
    const best = pop[0];
    if (!isFinite(best.cost)) { result.textContent = "Some stops are not connected, so no route exists."; return; }
    const stops = [s, ...best.order, g];
    const full = stops.reduce((acc, id, i) => i ? acc.concat(leg(stops[i - 1], id).path.slice(1)) : [id], []);
    drawPath(full);
    updateMetrics(0, full.length - 1, 0);
    document.getElementById("metricCost").textContent = best.cost + unit();
    result.textContent = `GA best order: ${stops.join(" → ")} (cost ${best.cost}${unit()}; generation 1 was ${first}${unit()}).`;
};
