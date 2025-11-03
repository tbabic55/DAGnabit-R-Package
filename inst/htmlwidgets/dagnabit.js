HTMLWidgets.widget({

  name: 'dagnabit',
  type: 'output',

  factory: function(el, width, height) {

    return {
      renderValue: function(x) {
        el.innerHTML = "";

        const style = document.createElement("style");
        style.textContent = `
          body { margin:0; font-family:sans-serif; }
          #sidebar { width:220px; background:#f7f7f7; padding:12px; border-right:1px solid #ccc;
            box-sizing:border-box; display:flex; flex-direction:column; justify-content:flex-start; }
          label, button, input { display:block; width:100%; margin:6px 0; box-sizing:border-box; }
          #graph { flex:1; background:#fff; }
          svg { width:100%; height:100%; background:#fff; display:block; }
          .plate-rect { fill: rgba(200,200,255,0.14); stroke: rgba(80,80,200,0.8); stroke-width:1.5px; rx:8; ry:8; }
          .plate-label { font-size:12px; fill: rgba(40,40,100,0.9); pointer-events:none; }
          .node-ellipse { fill:#69b3a2; stroke:#333; stroke-width:1.5px; }
          .node-text { font-size:14px; fill:#000; pointer-events:none; text-anchor:middle; dominant-baseline:central; }
          .link-line { stroke-width:1.5px; marker-end:url(#arrow); }
        `;
        document.head.appendChild(style);

        // Sidebar layout
        const sidebar = document.createElement("div");
        sidebar.id = "sidebar";
        sidebar.innerHTML = `
          <button id="fitView">Fit to view</button>
          <label for="gridSpacing">Grid spacing</label>
          <input id="gridSpacing" type="number" value="5" min="1"/>
          <label for="nodeFile">Nodes CSV (Plates use semicolons)</label>
          <input id="nodeFile" type="file" accept=".csv"/>
          <label for="edgeFile">Edges CSV</label>
          <input id="edgeFile" type="file" accept=".csv"/>
          <button id="loadGraph">Load Graph</button>
        `;

        const graphDiv = document.createElement("div");
        graphDiv.id = "graph";
        graphDiv.style.flex = "1";

        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.height = "100%";
        container.appendChild(sidebar);
        container.appendChild(graphDiv);
        el.appendChild(container);

        if (typeof d3 === "undefined") {
          const script = document.createElement("script");
          script.src = "https://d3js.org/d3.v7.min.js";
          script.onload = () => initDagnabit(graphDiv, width, height);
          document.head.appendChild(script);
        } else {
          initDagnabit(graphDiv, width, height);
        }
      },

      resize: function(width, height) {}
    };
  }
});

// ---- D3 logic ----
function initDagnabit(graphDiv, width, height) {

  const svg = d3.select(graphDiv).append("svg").attr("width", width).attr("height", height);

  const defs = svg.append("defs");
  defs.append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 10)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#999");

  const mainGroup = svg.append("g");
  const platesGroup = mainGroup.append("g").attr("class", "plates");
  const linksGroup = mainGroup.append("g").attr("class", "links");
  const nodesGroup = mainGroup.append("g").attr("class", "nodes");

  const zoom = d3.zoom().on("zoom", (event) => mainGroup.attr("transform", event.transform));
  svg.call(zoom);

  let nodes = [], links = [], plates = [];

  const fitToView = () => {
    const bbox = mainGroup.node().getBBox();
    if (!bbox.width || !bbox.height) return;
    const pad = 40;
    const scale = Math.min((width - pad) / bbox.width, (height - pad) / bbox.height);
    const tx = (width / 2) - scale * (bbox.x + bbox.width / 2);
    const ty = (height / 2) - scale * (bbox.y + bbox.height / 2);
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  };

  d3.select("#fitView").on("click", fitToView);

  const linkColor = (t) => (t === "logical" ? "blue" : "red");

  function computeTextSizes(arr) {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = "14px sans-serif";
    arr.forEach(d => {
      const w = ctx.measureText(d.id).width;
      d.rx = Math.max(24, w / 2 + 12);
      d.ry = 16;
    });
  }

  function computePlatesFromNodes() {
    const map = new Map();
    nodes.forEach(n => {
      const raw = (n.plate || "").toString().trim();
      if (!raw) return;
      const list = raw.split(";").map(s => s.trim()).filter(Boolean);
      n.platesPaths = list;
      list.forEach(name => {
        if (!map.has(name)) map.set(name, []);
        map.get(name).push(n);
      });
    });
    plates = Array.from(map.entries()).map(([id, nodeList]) => ({ id, nodes: nodeList }));
    recomputePlateBounds();
  }

  function recomputePlateBounds() {
    plates.forEach(p => {
      const pad = 18;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      p.nodes.forEach(n => {
        minX = Math.min(minX, n.x - n.rx);
        minY = Math.min(minY, n.y - n.ry);
        maxX = Math.max(maxX, n.x + n.rx);
        maxY = Math.max(maxY, n.y + n.ry);
      });
      p.x = minX - pad; p.y = minY - pad; p.width = (maxX - minX) + pad * 2; p.height = (maxY - minY) + pad * 2;
    });
  }

  function drawPlates() {
    const sel = platesGroup.selectAll("g.plate").data(plates, d => d.id);
    const enter = sel.enter().append("g").attr("class", "plate");
    enter.append("rect").attr("class", "plate-rect");
    enter.append("text").attr("class", "plate-label").attr("x", 8).attr("y", 14);
    const all = enter.merge(sel);
    all.attr("transform", d => `translate(${d.x},${d.y})`);
    all.select("rect").attr("width", d => d.width).attr("height", d => d.height);
    all.select("text").text(d => d.id);
    sel.exit().remove();
  }

  function drawGraph() {
    computeTextSizes(nodes);
    computePlatesFromNodes();
    drawPlates();

    const nodeSel = nodesGroup.selectAll("g.node").data(nodes, d => d.id);
    const nodeEnter = nodeSel.enter().append("g").attr("class", "node")
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .call(d3.drag()
        .on("drag", function (event, d) {
          d.x = event.x;
          d.y = event.y;
          d3.select(this).attr("transform", `translate(${d.x},${d.y})`);
          recomputePlateBounds();
          drawPlates();
          updateLinks();
        })
      );

    nodeEnter.append("ellipse").attr("class", "node-ellipse");
    nodeEnter.append("text").attr("class", "node-text");
    const allNodes = nodeEnter.merge(nodeSel);
    allNodes.select("ellipse").attr("rx", d => d.rx).attr("ry", d => d.ry);
    allNodes.select("text").text(d => d.id);
    nodeSel.exit().remove();

    updateLinks();
  }

  function updateLinks() {
    const linkSel = linksGroup.selectAll("line").data(links);
    linkSel.enter().append("line")
      .attr("class", "link-line")
      .merge(linkSel)
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y)
      .attr("stroke", d => linkColor(d.type));
    linkSel.exit().remove();
  }

  // Load CSVs
  async function loadGraphFromFiles() {
    const nf = document.getElementById("nodeFile").files[0];
    const ef = document.getElementById("edgeFile").files[0];
    if (!nf || !ef) { alert("Please select both nodes and edges CSV files."); return; }
    const [nd, ed] = await Promise.all([d3.csv(await nf.text()), d3.csv(await ef.text())]);
    nodes = nd.map((r, i) => ({
      id: r.id || r.ID || r.name || `node${i}`,
      x: r.x ? +r.x : 100 + (i % 4) * 160,
      y: r.y ? +r.y : 100 + Math.floor(i / 4) * 120,
      plate: r.plate || r.Plate || r.Plates || ""
    }));
    links = ed.map(e => ({
      source: nodes.find(n => n.id === (e.source || e.Source)),
      target: nodes.find(n => n.id === (e.target || e.Target)),
      type: (e.type || e.Type || "").trim().toLowerCase()
    }));
    drawGraph();
    fitToView();
  }

  d3.select("#loadGraph").on("click", loadGraphFromFiles);

// Demo on load
nodes = [
  { id: "Alpha", plate: "GroupA", x: 200, y: 160 },
  { id: "Beta", plate: "GroupA;Big Boys", x: 380, y: 160 },
  { id: "Gamma", plate: "log[i];Big Boys", x: 380, y: 320 },
  { id: "Delta", plate: "log[i]", x: 200, y: 320 },
  { id: "Epsilon", plate: "log[i]", x: 560, y: 320 }
  ];

  links = [
    { source: nodes[0], target: nodes[1], type: "logical" },
    { source: nodes[1], target: nodes[2], type: "stochastic" },
    { source: nodes[2], target: nodes[3], type: "logical" },
    { source: nodes[2], target: nodes[4], type: "stochastic" }
    ];
    drawGraph();
    fitToView();

}
