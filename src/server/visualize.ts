import { createServer as createHttpServer } from "http";
import { getAllNodes, getNeighbors } from "../db/index.js";

const PORT = parseInt(process.env.GRAPH_UI_PORT ?? "3333", 10);

// Minimal HTML page with a vis-network force-directed graph
const GRAPH_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TokenOS — Codebase Visualization</title>
  <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0f1117; color: #e1e4e8; font-family: system-ui, sans-serif; height: 100vh; display: flex; flex-direction: column; }
    header { padding: 12px 20px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; align-items: center; gap: 12px; }
    header h1 { font-size: 16px; font-weight: 600; color: #58a6ff; }
    header small { color: #8b949e; font-size: 12px; }
    #graph { flex: 1; }
    #info { position: absolute; top: 60px; right: 16px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px 16px; max-width: 300px; display: none; font-size: 13px; }
    #info h3 { color: #58a6ff; margin-bottom: 6px; }
    #info p { color: #8b949e; line-height: 1.5; }
    .tag { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 11px; margin-left: 6px; }
    .function { background: #1f6feb; } .class { background: #388bfd; }
    .file { background: #56d364; color: #0d1117; } .import { background: #6e40c9; } .variable { background: #f78166; color: #0d1117; }
  </style>
</head>
<body>
  <header>
    <h1>⬡ TokenOS</h1>
    <small id="stats">Loading...</small>
  </header>
  <div id="graph"></div>
  <div id="info"><h3 id="info-name"></h3><p id="info-detail"></p></div>
  <script>
    const TYPE_COLORS = {
      function: { background: '#1f6feb', border: '#388bfd' },
      class:    { background: '#388bfd', border: '#58a6ff' },
      file:     { background: '#56d364', border: '#3fb950', font: { color: '#0d1117' } },
      import:   { background: '#6e40c9', border: '#a371f7' },
      variable: { background: '#f78166', border: '#ffa198', font: { color: '#0d1117' } },
    };

    async function init() {
      const res = await fetch('/api/graph-data');
      const { nodes: rawNodes, edges: rawEdges } = await res.json();

      document.getElementById('stats').textContent =
        rawNodes.length + ' nodes · ' + rawEdges.length + ' edges';

      const nodes = new vis.DataSet(rawNodes.map(n => ({
        id: n.id,
        label: n.name,
        title: n.id,
        value: Math.max(1, n.importance),
        color: TYPE_COLORS[n.type] ?? { background: '#21262d', border: '#30363d' },
        font: { color: '#e1e4e8', size: 12 },
        borderWidth: 1.5,
      })));

      const edges = new vis.DataSet(rawEdges.map(e => ({
        from: e.from_node, to: e.to_node,
        label: e.type,
        arrows: 'to',
        color: { color: '#30363d', highlight: '#58a6ff' },
        font: { color: '#8b949e', size: 10, align: 'middle' },
        smooth: { type: 'curvedCW', roundness: 0.15 },
      })));

      const container = document.getElementById('graph');
      const isLarge = nodes.length > 500;
      const network = new vis.Network(container, { nodes, edges }, {
        physics: isLarge ? false : { stabilization: { iterations: 150 }, barnesHut: { gravitationalConstant: -3000 } },
        layout: isLarge ? { improvedLayout: false } : undefined,
        interaction: { hover: true, navigationButtons: true, keyboard: true },
        edges: { smooth: isLarge ? false : { type: 'curvedCW', roundness: 0.15 } }
      });

      network.on('click', params => {
        if (!params.nodes.length) { document.getElementById('info').style.display = 'none'; return; }
        const n = rawNodes.find(x => x.id === params.nodes[0]);
        if (!n) return;
        document.getElementById('info').style.display = 'block';
        document.getElementById('info-name').textContent = n.name + ' (' + n.type + ')';
        document.getElementById('info-detail').innerHTML =
          '<b>File:</b> ' + n.file_path.split('/').slice(-2).join('/') +
          (n.summary ? '<br><b>Summary:</b> ' + n.summary : '') +
          '<br><b>Importance:</b> ' + n.importance;
      });
    }
    init();
  </script>
</body>
</html>`;

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TokenOS Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
  <style>
    body { background: #0f1117; color: #e1e4e8; font-family: system-ui, sans-serif; overflow-x: hidden; }
    /* Antigravity Glassmorphism */
    .glass-card {
      background: rgba(22, 27, 34, 0.4);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.2);
      transition: transform 0.3s ease-out, box-shadow 0.3s ease-out;
      will-change: transform;
    }
    .glass-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 30px 60px rgba(0,0,0,0.3), 0 0 20px rgba(88, 166, 255, 0.1);
      border: 1px solid rgba(88, 166, 255, 0.2);
    }
    /* Floating glow effect */
    .glow-orb {
      position: absolute; width: 400px; height: 400px; background: radial-gradient(circle, rgba(88,166,255,0.1) 0%, rgba(0,0,0,0) 70%);
      top: -100px; left: -100px; z-index: -1; pointer-events: none;
    }
    /* 3D Isometric container */
    .iso-grid { perspective: 1000px; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 500; }
    .tag.function { background: rgba(31, 111, 235, 0.2); color: #58a6ff; border: 1px solid rgba(31, 111, 235, 0.3); }
    .tag.class { background: rgba(56, 139, 253, 0.2); color: #79c0ff; border: 1px solid rgba(56, 139, 253, 0.3); }
    .tag.file { background: rgba(86, 211, 100, 0.2); color: #7ee787; border: 1px solid rgba(86, 211, 100, 0.3); }
    .tag.import { background: rgba(110, 64, 201, 0.2); color: #d2a8ff; border: 1px solid rgba(110, 64, 201, 0.3); }
    .tag.variable { background: rgba(247, 129, 102, 0.2); color: #ffbba6; border: 1px solid rgba(247, 129, 102, 0.3); }
    
    /* Smooth Scrollbar */
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: #0f1117; }
    ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
  </style>
</head>
<body class="min-h-screen p-8 relative">
  <div class="glow-orb"></div>
  <div class="glow-orb" style="top: auto; bottom: -100px; right: -100px; left: auto; background: radial-gradient(circle, rgba(163,113,247,0.1) 0%, rgba(0,0,0,0) 70%);"></div>

  <div class="max-w-6xl mx-auto">
    <header class="flex justify-between items-center mb-12 animate-header">
      <div>
        <h1 class="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 tracking-tight">TokenOS Dashboard</h1>
        <p class="text-gray-400 mt-2">Spatial analysis of your codebase.</p>
      </div>
      <a href="/graph" class="glass-card px-6 py-3 font-medium text-blue-400 hover:text-blue-300">
        Open 3D Visualization &rarr;
      </a>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12 iso-grid" id="stats-grid"></div>

    <h2 class="text-2xl font-semibold mb-6 text-gray-200">Top Neural Nodes</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6" id="nodes-grid"></div>

    <h2 class="text-2xl font-semibold mt-16 mb-6 text-gray-200">Context Explorer</h2>
    <div class="glass-card overflow-hidden animate-table">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-black/20 text-gray-400 text-xs uppercase tracking-wider">
              <th class="py-4 px-6 font-semibold">Rank</th>
              <th class="py-4 px-6 font-semibold">Node Name</th>
              <th class="py-4 px-6 font-semibold">Type</th>
              <th class="py-4 px-6 font-semibold">File Source</th>
              <th class="py-4 px-6 font-semibold text-right">Importance Score</th>
            </tr>
          </thead>
          <tbody id="table-body">
            <!-- Table content here -->
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    async function loadData() {
      const res = await fetch('/api/stats');
      const data = await res.json();
      
      const statsGrid = document.getElementById('stats-grid');
      const stats = [
        { label: 'Total Nodes', value: data.totalNodes },
        { label: 'Files', value: data.files },
        { label: 'Classes', value: data.classes },
        { label: 'Functions', value: data.functions }
      ];
      
      statsGrid.innerHTML = stats.map(s => \`
        <div class="glass-card p-6 flex flex-col justify-center items-center stat-card relative overflow-hidden group">
          <div class="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <span class="text-4xl font-bold text-white mb-2">\${s.value.toLocaleString()}</span>
          <span class="text-sm font-medium text-gray-400 uppercase tracking-widest">\${s.label}</span>
        </div>
      \`).join('');

      const nodesGrid = document.getElementById('nodes-grid');
      nodesGrid.innerHTML = data.topNodes.map(n => \`
        <div class="glass-card p-6 node-card flex flex-col h-full relative overflow-hidden group">
          <div class="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-blue-400/20 transition-colors"></div>
          <div class="flex justify-between items-start mb-4 relative z-10">
            <h3 class="font-mono text-gray-200 truncate pr-4 text-sm font-semibold" title="\${n.name}">\${n.name}</h3>
            <span class="tag \${n.type}">\${n.type}</span>
          </div>
          <p class="text-xs text-gray-500 font-mono mb-4 truncate relative z-10" title="\${n.file_path}">\${n.file_path.split('/').pop()}</p>
          <div class="mt-auto pt-4 border-t border-gray-800 flex justify-between items-center relative z-10">
            <span class="text-xs text-gray-400">Importance Score</span>
            <span class="text-sm font-bold text-blue-400">\${Number(n.importance).toFixed(1)}</span>
          </div>
        </div>
      \`).join('');

      const tableBody = document.getElementById('table-body');
      tableBody.innerHTML = data.topNodes.slice(0, 100).map((n, i) => 
        '<tr class="border-b border-gray-800/50 hover:bg-white/5 transition-colors cursor-pointer group">' +
          '<td class="py-4 px-6 text-sm text-gray-500 font-mono">' + (i + 1) + '</td>' +
          '<td class="py-4 px-6 text-sm font-medium text-gray-200 group-hover:text-blue-400 transition-colors">' +
            '<div class="truncate max-w-[250px]" title="' + n.name + '">' + n.name + '</div>' +
          '</td>' +
          '<td class="py-4 px-6"><span class="tag ' + n.type + '">' + n.type + '</span></td>' +
          '<td class="py-4 px-6 text-sm text-gray-400">' +
            '<div class="truncate max-w-[250px]" title="' + n.file_path + '">' + n.file_path.split('/').pop() + '</div>' +
          '</td>' +
          '<td class="py-4 px-6 text-sm font-bold text-blue-400 text-right">' + Number(n.importance).toFixed(1) + '</td>' +
        '</tr>'
      ).join('');

      /* GSAP Antigravity Animations */
      gsap.from(".animate-header", { y: -30, opacity: 0, duration: 0.8, ease: "power3.out" });
      gsap.from(".stat-card", { y: 50, opacity: 0, duration: 0.8, stagger: 0.1, ease: "back.out(1.5)" });
      gsap.from(".node-card", { y: 40, opacity: 0, duration: 0.8, stagger: 0.05, ease: "power2.out", delay: 0.3 });
      gsap.from(".animate-table", { y: 30, opacity: 0, duration: 0.8, ease: "power2.out", delay: 0.6 });
      
      gsap.to(".stat-card", { y: -5, duration: 2, yoyo: true, repeat: -1, ease: "sine.inOut", stagger: 0.2, delay: 1 });
    }
    loadData();
  </script>
</body>
</html>`;

export async function startVisualizationServer(): Promise<void> {
  const server = createHttpServer((req, res) => {
    if (req.url === "/api/stats") {
      const nodes = getAllNodes();
      const stats = {
        totalNodes: nodes.length,
        files: nodes.filter(n => n.type === "file").length,
        functions: nodes.filter(n => n.type === "function").length,
        classes: nodes.filter(n => n.type === "class").length,
        topNodes: nodes.sort((a, b) => b.importance - a.importance).slice(0, 50)
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(stats));
      return;
    }

    if (req.url === "/api/graph-data") {
      let nodes = getAllNodes();
      // If the graph is massive, limit it to the top 1500 most important nodes 
      // to prevent vis-network from crashing the browser's rendering engine.
      if (nodes.length > 1500) {
        nodes = nodes.sort((a, b) => b.importance - a.importance).slice(0, 1500);
      }
      
      // Get only the edges that connect these filtered nodes
      const nodeIds = new Set(nodes.map(n => n.id));
      const edges = nodes.flatMap((n) => getNeighbors(n.id)).filter(e => nodeIds.has(e.to_node) && nodeIds.has(e.from_node));

      // Deduplicate edges
      const seen = new Set<number>();
      const uniqueEdges = edges.filter((e) => {
        if (e.id === undefined || seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ nodes, edges: uniqueEdges }));
      return;
    }

    if (req.url === "/graph") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(GRAPH_HTML);
      return;
    }

    // Default route: Dashboard
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(DASHBOARD_HTML);
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(PORT, () => {
      // UI URL is logged by the Vite-like header in main.ts
      resolve();
    });
    server.on("error", reject);
  });
}
