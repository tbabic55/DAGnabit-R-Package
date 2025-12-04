console.log("✅ ENGINE FILE LOADED:", window.location.href);
  (function(){
    const STYLE = `
      .le-root { display:flex; height:100%; width:100%; font-family:sans-serif; box-sizing:border-box; }
      .le-sidebar { width:220px; background:#f7f7f7; padding:12px; border-right:1px solid #ccc; box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; }
      .le-controls label, .le-controls button, .le-controls input { display:block; width:100%; margin:6px 0; box-sizing:border-box; }
      .le-graph { flex:1; }
      .le-graph svg { width:100%; height:100%; background:#fff; display:block; }
      .plate-rect { fill: rgba(200,200,255,0.14); stroke: rgba(80,80,200,0.8); stroke-width:1.5px; rx:8; ry:8; }
      .plate-label { font-size:12px; fill: rgba(40,40,100,0.9); pointer-events:none; }
      .node-ellipse { fill:#F2F2F2; stroke:#333; stroke-width:1.5px; }
      .node-text { font-size:14px; fill:#000; pointer-events:none; text-anchor:middle; dominant-baseline:central; }
      .link-line { stroke-width:1.5px; }
      .legend-item { display:flex; align-items:center; gap:8px; font-size:13px; margin:6px 0; }
      .legend-color { width:20px; height:8px; }
      .le-export-menu { position:absolute; left:0; top:36px; background:#fff; border:1px solid #ccc; box-shadow:0 2px 6px rgba(0,0,0,0.15); width:100%; z-index:1000; pointer-events:auto; }
      .le-export-menu button { border:none; background:none; padding:8px; text-align:left; width:100%; display:block; }
    `;

    function shouldIgnoreNodeType(typeStr){
      const t = (typeStr||"").toString().toLowerCase();
      return t.includes("plate") || t.includes("index");
    }

    function initLayoutEditor(el, opts){
      const cfg = Object.assign({ fitOnDataLoad:true, enableFileInputs:true }, opts||{});
      el.innerHTML = '';

      // Inject scoped styles
      const styleTag = document.createElement('style');
      styleTag.textContent = STYLE;
      el.appendChild(styleTag);

      const root = d3.select(el).append('div').attr('class','le-root');
      const sidebar = root.append('div').attr('class','le-sidebar');
      const controls = sidebar.append('div').attr('class','le-controls');
      const legend = sidebar.append('div').attr('class','le-legend');
      const graphWrap = root.append('div').attr('class','le-graph');

      const fitBtn = controls.append('button').attr('type','button').text('Fit to view');
      const refreshBtn = controls.append('button').attr('type','button').attr('title','Reload from selected CSVs').text('Reload files');
      controls.append('label').text('Nodes CSV');
      const nodeInput = controls.append('input').attr('type','file').attr('accept','.csv');
      controls.append('label').text('Edges CSV');
      const edgeInput = controls.append('input').attr('type','file').attr('accept','.csv');

      const exportWrap = controls.append('div').style('margin-top','8px').style('position','relative');
      const exportBtn = exportWrap.append('button').attr('type','button').text('Export');
      const exportMenu = exportWrap.append('div').attr('class','le-export-menu').style('display','none');
      const exportSVG = exportMenu.append('button').attr('type','button').text('Export SVG');
      const exportPNG = exportMenu.append('button').attr('type','button').text('Export PNG');
      exportMenu.append('div').style('border-top','1px solid #eee').style('margin','4px 0');
      const exportNodesCSV = exportMenu.append('button').attr('type','button').text('Export Nodes CSV');
      const exportEdgesCSV = exportMenu.append('button').attr('type','button').text('Export Edges CSV');

      legend.append('div').style('font-weight','600').style('text-align','center').style('margin-bottom','6px').text('Legend');
      legend.append('div').attr('class','legend-item').html('<div class="legend-color" style="background:#0072B2"></div> Deterministic');
      legend.append('div').attr('class','legend-item').html('<div class="legend-color" style="background:#E69F00"></div> Stochastic');
      legend.append('div').style('font-size','12px').style('color','#555').style('margin-top','6px')
        .text('Plates: use ";" for shared (e.g. "A;B") and "/" for nesting (e.g. "Outer/Inner/Innermost").');
      legend.append('div').style('font-weight','600').style('margin-top','10px').text('Plate Colors');
      const plateLegend = legend.append('div').attr('class','le-plate-legend').node();

      const svg = graphWrap.append('svg');
      const defs = svg.append('defs');
      function addArrow(id,color){
        const m = defs.append('marker')
          .attr('id',id).attr('viewBox','0 -5 10 10').attr('refX',10).attr('refY',0)
          .attr('markerWidth',6).attr('markerHeight',6).attr('orient','auto');
        m.append('path').attr('d','M0,-5L10,0L0,5').attr('fill',color);
      }
      addArrow('arrow-blue','#0072B2');
      addArrow('arrow-orange','#E69F00');
      addArrow('arrow-default','#666666');

      const mainGroup = svg.append('g');
      const platesGroup = mainGroup.append('g').attr('class','plates');
      const linksGroup = mainGroup.append('g').attr('class','links');
      const nodesGroup = mainGroup.append('g').attr('class','nodes');

      let width = 0, height = 0;
      function computeSize(){
        const rect = graphWrap.node().getBoundingClientRect();
        width = rect.width || cfg.width || 640;
        height = rect.height || cfg.height || 480;
        svg.attr('width', width).attr('height', height);
      }
      computeSize();

      const zoom = d3.zoom().on('zoom',(event)=>mainGroup.attr('transform',event.transform));
      svg.call(zoom);

      let nodes=[], links=[], plates=[];
      const plateRootColor = d3.scaleOrdinal(['#0072B2','#E69F00','#CC79A7','#56B4E9','#9467BD']);

      function plateColorsForId(id){
        const parts = id.split('/');
        const root = parts[0];
        const depth = Math.max(0, parts.length - 1);
        const base = d3.color(plateRootColor(root));
        const stroke = d3.color(base).darker(depth*0.6); stroke.opacity = 0.8;
        const fill = d3.color(base).darker(depth*0.6); fill.opacity = 0.14;
        return { stroke: stroke.formatRgb(), fill: fill.formatRgb() };
      }
      function isAncestorPlate(ancestorId, childId){
        if(!ancestorId || !childId) return false;
        if(ancestorId===childId) return false;
        return childId.startsWith(ancestorId + '/');
      }
      function plateDisplayName(id){
        if(!id) return id;
        const parts = id.split('/').filter(Boolean);
        return parts[parts.length-1] || id;
      }
      function updatePlateLegend(){
        if(!plateLegend) return;
        const depthByRoot = new Map();
        plates.forEach(p=>{
          const parts = p.id.split('/');
          const root = parts[0];
          const depth = Math.max(0, parts.length-1);
          if(!depthByRoot.has(root)) depthByRoot.set(root, new Set());
          depthByRoot.get(root).add(depth);
        });
        const roots = Array.from(depthByRoot.keys()).sort();
        plateLegend.innerHTML = '';
        roots.forEach(root=>{
          const depths = Array.from(depthByRoot.get(root)).sort((a,b)=>a-b);
          const row = document.createElement('div');
          row.className = 'legend-item';
          const label = document.createElement('div');
          label.textContent = root;
          row.appendChild(label);
          const swatchWrap = document.createElement('div');
          swatchWrap.style.display = 'flex';
          swatchWrap.style.gap = '6px';
          swatchWrap.style.marginLeft = '8px';
          depths.forEach(d=>{
            const sw = document.createElement('div');
            sw.className = 'legend-color';
            const base = d3.color(plateRootColor(root));
            const fill = d3.color(base).darker(d*0.6);
            sw.title = d===0 ? `${root}` : `${root} (level ${d})`;
            sw.style.background = fill.formatRgb();
            swatchWrap.appendChild(sw);
          });
          row.appendChild(swatchWrap);
          plateLegend.appendChild(row);
        });
      }

      function getEdgeColor(type){ return type==='deterministic'?'#0072B2':type==='stochastic'?'#E69F00':'#666666'; }
      function getEdgeMarkerId(type){ return type==='deterministic'?'url(#arrow-blue)':type==='stochastic'?'url(#arrow-orange)':'url(#arrow-default)'; }
      function normalizeEdgeType(s){
        const t = (s||'').toString().trim().toLowerCase();
        if(t==='logical'||t==='deterministic') return 'deterministic';
        if(t==='stochastic') return 'stochastic';
        return t || 'default';
      }

      function computeTextSizes(arr){
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font='14px sans-serif';
        arr.forEach(d=>{
          const w = ctx.measureText(d.id).width;
          d.rx = Math.max(24,w/2+12); d.ry=16;
        });
      }
      function mapNodesById(arr){
        const m = new Map(); arr.forEach(n=>m.set(n.id,n)); return m;
      }
      function spreadOverlappingNodes(arr){
        const groups = new Map();
        arr.forEach(n=>{
          const key = `${Number(n.x)||0}|${Number(n.y)||0}`;
          if(!groups.has(key)) groups.set(key, []);
          groups.get(key).push(n);
        });
        groups.forEach(nodesAtSpot=>{
          if(nodesAtSpot.length<=1) return;
          const maxRx = Math.max(...nodesAtSpot.map(n => n.rx||24));
          const maxRy = Math.max(...nodesAtSpot.map(n => n.ry||16));
          const spacingX = Math.max(120, (maxRx*2) + 40);
          const spacingY = Math.max(100, (maxRy*2) + 40);
          const cols = Math.ceil(Math.sqrt(nodesAtSpot.length));
          const rows = Math.ceil(nodesAtSpot.length / cols);
          const baseX = Number(nodesAtSpot[0].x)||0;
          const baseY = Number(nodesAtSpot[0].y)||0;
          nodesAtSpot.forEach((n,i)=>{
            const row = Math.floor(i/cols);
            const col = i % cols;
            const offsetX = (col - (cols-1)/2) * spacingX;
            const offsetY = (row - (rows-1)/2) * spacingY;
            n.x = baseX + offsetX;
            n.y = baseY + offsetY;
          });
        });
      }

      function pointInPlate(x,y,p){ return x>p.x && x<p.x+p.width && y>p.y && y<p.y+p.height; }
      function computePlatesFromNodes(){
        const map = new Map();
        nodes.forEach(n=>{
          const raw=(n.plate||'').toString().trim();
          if(!raw || raw.toLowerCase()==='none'){ n.platesPaths=[]; return; }
          const entries = raw.split(';').map(s=>s.trim()).filter(Boolean);
          const pathSet = new Set();
          entries.forEach(pathStr=>{
            const parts = pathStr.split('/').map(s=>s.trim()).filter(Boolean);
            if(parts.length===0) return;
            const acc=[];
            parts.forEach(part=>{ acc.push(part); pathSet.add(acc.join('/')); });
          });
          const plateIds = Array.from(pathSet);
          n.platesPaths = plateIds;
          plateIds.forEach(id=>{
            if(!map.has(id)) map.set(id,[]);
            const arr = map.get(id);
            if(arr[arr.length-1]!==n) arr.push(n);
          });
        });
        plates = Array.from(map.entries()).map(([id,nodeList])=>({id,nodes:nodeList,x:0,y:0,width:0,height:0,padding:18}));
        plates.sort((a,b)=>{
          const da=a.id.split('/').length, db=b.id.split('/').length;
          return da===db ? a.id.localeCompare(b.id) : da-db;
        });
        recomputePlateBounds();
        updatePlateLegend();
      }
      function recomputePlateBounds(){
        plates.forEach(p=>{
          if(!p.nodes || p.nodes.length===0) return;
          const pad = p.padding||18;
          let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
          p.nodes.forEach(n=>{
            minX = Math.min(minX, n.x-n.rx); minY = Math.min(minY,n.y-n.ry);
            maxX = Math.max(maxX, n.x+n.rx); maxY = Math.max(maxY,n.y+n.ry);
          });
          p.x=minX-pad; p.y=minY-pad; p.width=(maxX-minX)+pad*2; p.height=(maxY-minY)+pad*2;
        });
      }

      function updatePlatesSelection(){
        const sel=platesGroup.selectAll('g.plate').data(plates,d=>d.id);
        sel.exit().remove();
        const enter = sel.enter().append('g').attr('class','plate')
          .call(d3.drag()
            .on('start',(e,d)=>{ d.__start={x:d.x,y:d.y}; })
            .on('drag',(e,d)=>{
              const dx=e.dx,dy=e.dy;
              const newBounds={x:d.x+dx,y:d.y+dy,width:d.width,height:d.height};
              const dSet = new Set(d.nodes);
              const overlapPlate=plates.some(p=>p!==d && !p.nodes.some(n=>dSet.has(n)) && rectsOverlap(newBounds,p));
              if(overlapPlate) return;
              const overlapNode = nodes.some(n=> !dSet.has(n) && rectsOverlap(newBounds, nodeRect(n)) );
              if(overlapNode) return;
              d.nodes.forEach(n=>{ n.x+=dx; n.y+=dy; });
              recomputePlateBounds(); updatePlatesTransform();
              nodesGroup.selectAll('g.node').attr('transform',n=>`translate(${n.x},${n.y})`);
              updateLinksPositions();
            })
            .on('end',(e,d)=>{
              const spacing = 5;
              d.nodes.forEach(n=>{ n.x=Math.round(n.x/spacing)*spacing; n.y=Math.round(n.y/spacing)*spacing; });
              recomputePlateBounds(); updatePlatesTransform();
              nodesGroup.selectAll('g.node').attr('transform',n=>`translate(${n.x},${n.y})`);
              updateLinksPositions(); delete d.__start;
            })
          );
        enter.append('rect').attr('class','plate-rect');
        enter.append('text').attr('class','plate-label').attr('x',8).attr('y',14);
        platesGroup.selectAll('g.plate').each(function(p){
          const colors = plateColorsForId(p.id);
          const g = d3.select(this);
          g.select('text').text(plateDisplayName(p.id));
          g.select('rect').style('fill', colors.fill).style('stroke', colors.stroke);
        });
        updatePlatesTransform();
      }

      function updatePlatesTransform(){
        platesGroup.selectAll('g.plate')
          .attr('transform',d=>`translate(${d.x},${d.y})`)
          .each(function(d){
            const colors = plateColorsForId(d.id);
            const g = d3.select(this);
            g.select('rect').attr('width',d.width).attr('height',d.height)
              .style('fill', colors.fill).style('stroke', colors.stroke);
            const padX=8, padTop=14, padBot=8;
            const candidates=[
              { x: padX, y: padTop, anchor:'start' },
              { x: Math.max(padX, d.width - padX), y: padTop, anchor:'end' },
              { x: padX, y: Math.max(padTop, d.height - padBot), anchor:'start' },
              { x: Math.max(padX, d.width - padX), y: Math.max(padTop, d.height - padBot), anchor:'end' }
            ];
            let chosen=candidates[0];
            for(const c of candidates){
              const wx=d.x + c.x, wy=d.y + c.y;
              const blocked = plates.some(p=> p!==d && !isAncestorPlate(p.id, d.id) && pointInPlate(wx,wy,p));
              if(!blocked){ chosen=c; break; }
            }
            g.select('text').text(plateDisplayName(d.id))
              .attr('x', chosen.x).attr('y', chosen.y)
              .attr('text-anchor', chosen.anchor);
          });
      }

      function updateLinksPositions(){
        linksGroup.selectAll('line')
          .data(links, d => `${d.source.id}->${d.target.id}`)
          .join(
            enter=>enter.append('line')
              .attr('class','link-line')
              .attr('stroke',d=>getEdgeColor(d.type))
              .attr('marker-end',d=>getEdgeMarkerId(d.type)),
            update=>update,
            exit=>exit.remove()
          ).each(function(d){
            const [xt,yt]=computeEdgeEndpoint(d.source,d.target);
            d3.select(this).attr('x1',d.source.x).attr('y1',d.source.y).attr('x2',xt).attr('y2',yt);
          });
      }
      function computeEdgeEndpoint(src,tgt){
        const dx=tgt.x-src.x,dy=tgt.y-src.y;
        const angle=Math.atan2(dy,dx);
        return [tgt.x-tgt.rx*Math.cos(angle), tgt.y-tgt.ry*Math.sin(angle)];
      }

      function drawNodes(){
        const sel = nodesGroup.selectAll('g.node').data(nodes,d=>d.id);
        sel.exit().remove();
        const enter = sel.enter().append('g').attr('class','node').attr('transform',d=>`translate(${d.x},${d.y})`)
          .call(d3.drag()
            .on('start',(e,d)=>{ d.__orig={x:d.x,y:d.y}; })
            .on('drag',function(e,d){
              const old={x:d.x,y:d.y}; d.x=e.x; d.y=e.y;
              const collidesForeign = plates.some(p=>{
                const member = d.platesPaths && d.platesPaths.includes(p.id);
                return !member && nodeOverlapsPlate(d,p);
              });
              if(collidesForeign){ d.x=old.x; d.y=old.y; return; }
              const violatesPlateForeignNode = plates.some(p=>{
                const member = d.platesPaths && d.platesPaths.includes(p.id);
                if(!member) return false;
                const pad = p.padding||18;
                let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
                p.nodes.forEach(n2=>{
                  const nx = (n2===d)? d.x : n2.x;
                  const ny = (n2===d)? d.y : n2.y;
                  minX = Math.min(minX, nx - n2.rx); minY = Math.min(minY, ny - n2.ry);
                  maxX = Math.max(maxX, nx + n2.rx); maxY = Math.max(maxY, ny + n2.ry);
                });
                const newB={x:minX-pad,y:minY-pad,width:(maxX-minX)+pad*2,height:(maxY-minY)+pad*2};
                return nodes.some(other=> !p.nodes.includes(other) && rectsOverlap(newB, nodeRect(other)) );
              });
              if(violatesPlateForeignNode){ d.x=old.x; d.y=old.y; return; }
              d3.select(this).attr('transform',`translate(${d.x},${d.y})`);
              updateLinksPositions(); recomputePlateBounds(); updatePlatesTransform();
            })
            .on('end',function(e,d){
              const spacing=5;
              d.x=Math.round(d.x/spacing)*spacing; d.y=Math.round(d.y/spacing)*spacing;
              d3.select(this).attr('transform',`translate(${d.x},${d.y})`);
              recomputePlateBounds(); updatePlatesTransform(); updateLinksPositions();
            })
          );
        enter.append('ellipse').attr('class','node-ellipse');
        enter.append('text').attr('class','node-text');
        nodesGroup.selectAll('g.node').each(function(d){
          d3.select(this).select('ellipse').attr('rx',d.rx).attr('ry',d.ry);
          d3.select(this).select('text').text(d.id);
          d3.select(this).attr('transform',`translate(${d.x},${d.y})`);
        });
        updateLinksPositions();
      }

      function rectsOverlap(a,b){ return !(a.x+a.width<b.x || b.x+b.width<a.x || a.y+a.height<b.y || b.y+b.height<a.y); }
      function nodeRect(n){ return { x: n.x - n.rx, y: n.y - n.ry, width: n.rx*2, height: n.ry*2 }; }
      function nodeOverlapsPlate(n,p){ return rectsOverlap(nodeRect(n), p); }

      function pushNodeOutsidePlate(n,p,margin=10){
        const L = (n.x + n.rx) - (p.x - margin);
        const R = (p.x + p.width + margin) - (n.x - n.rx);
        const U = (n.y + n.ry) - (p.y - margin);
        const D = (p.y + p.height + margin) - (n.y - n.ry);
        const candidates = [
          {dir:'left', delta:L},
          {dir:'right',delta:R},
          {dir:'up',   delta:U},
          {dir:'down', delta:D}
        ].filter(c=>c.delta>0);
        if(candidates.length===0) return;
        const best=candidates.reduce((a,b)=>a.delta<b.delta?a:b);
        if(best.dir==='left') n.x -= best.delta;
        else if(best.dir==='right') n.x += best.delta;
        else if(best.dir==='up') n.y -= best.delta;
        else if(best.dir==='down') n.y += best.delta;
      }
      function enforceNodePlateExclusion(){
        for(let iter=0; iter<5; iter++){
          let moved=false;
          nodes.forEach(n=>{
            const set=new Set(n.platesPaths||[]);
            plates.forEach(p=>{
              if(set.has(p.id)) return;
              if(nodeOverlapsPlate(n,p)){
                pushNodeOutsidePlate(n,p,10);
                moved=true;
              }
            });
          });
          if(!moved) break;
          recomputePlateBounds();
        }
      }

      function fitToView(){
        const bbox=mainGroup.node().getBBox();
        if(!bbox||bbox.width===0||bbox.height===0) return;
        const pad=40;
        const scale=Math.min((width-pad)/bbox.width,(height-pad)/bbox.height);
        const tx=(width/2)-scale*(bbox.x+bbox.width/2);
        const ty=(height/2)-scale*(bbox.y+bbox.height/2);
        svg.transition().duration(500).call(zoom.transform,d3.zoomIdentity.translate(tx,ty).scale(scale));
      }

      fitBtn.on('click', fitToView);

      function parseCSVFile(file){
        return new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=e=>resolve(d3.csvParse(e.target.result));
          reader.onerror=reject;
          reader.readAsText(file);
        });
      }

      async function attemptAutoLoad(){
        const nf=nodeInput.node().files[0];
        const ef=edgeInput.node().files[0];
        if(!nf || !ef) return;
        try{
          const [nd,ed]=await Promise.all([parseCSVFile(nf),parseCSVFile(ef)]);
          const converted = csvDataToGraph(nd, ed);
          setGraphData(converted.nodes, converted.edges, true);
        }catch(err){
          console.error('Auto-load failed:', err);
          alert('Failed to load graph from CSV files. See console for details.');
        }
      }
      if(cfg.enableFileInputs){
        nodeInput.on('change', attemptAutoLoad);
        edgeInput.on('change', attemptAutoLoad);
        refreshBtn.on('click', attemptAutoLoad);
      } else {
        nodeInput.attr('disabled', true); edgeInput.attr('disabled', true); refreshBtn.attr('disabled', true);
      }

      exportBtn.on('click',(event)=>{
        event.stopPropagation();
        const show = exportMenu.style('display') === 'block' ? 'none' : 'block';
        exportMenu.style('display', show);
      });
      exportMenu.on('click', e=> e.stopPropagation());
      root.on('click', ()=> exportMenu.style('display','none'));

      function serializeSVG(){
        const clone=svg.node().cloneNode(true);
        clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
        clone.setAttribute('width', width);
        clone.setAttribute('height', height);
        if(!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
        const defsNode = clone.querySelector('defs') || clone.insertBefore(document.createElementNS('http://www.w3.org/2000/svg','defs'), clone.firstChild);
        const styleElSVG = document.createElementNS('http://www.w3.org/2000/svg','style');
        styleElSVG.setAttribute('type','text/css');
        styleElSVG.textContent = STYLE;
        defsNode.appendChild(styleElSVG);
        return new XMLSerializer().serializeToString(clone);
      }
      exportSVG.on('click',()=>{
        try{
          const s=serializeSVG(); const blob=new Blob([s],{type:'image/svg+xml;charset=utf-8'});
          const url=URL.createObjectURL(blob); const a=document.createElement('a');
          a.href=url; a.download='graph.svg'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        }catch(err){ console.error('SVG export failed:', err); alert('SVG export failed. See console for details.'); }
        exportMenu.style('display','none');
      });
      exportPNG.on('click',()=>{
        try{
          const s=serializeSVG(); const blob=new Blob([s],{type:'image/svg+xml;charset=utf-8'});
          const url=URL.createObjectURL(blob); const img=new Image();
          img.onload=()=>{ const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
            const ctx=canvas.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
            ctx.drawImage(img,0,0);
            const pngUrl=canvas.toDataURL('image/png');
            const a=document.createElement('a'); a.href=pngUrl; a.download='graph.png'; document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
          }; img.src=url;
        }catch(err){ console.error('PNG export failed:', err); alert('PNG export failed. See console for details.'); }
        exportMenu.style('display','none');
      });

      function csvLine(fields){
        return fields.map(v=>{
          let s = v==null ? '' : String(v);
          if(/[",\n]/.test(s)) s = '"' + s.replace(/"/g,'""') + '"';
          return s;
        }).join(',');
      }
      function downloadCSV(content, filename){
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      }
      function platesStringForNode(n){
        const raw = (n.plate||'').toString();
        if(raw.trim().length) return raw;
        const paths = Array.isArray(n.platesPaths) ? n.platesPaths.slice() : [];
        if(paths.length===0) return '';
        const deepest = paths.filter(p=> !paths.some(other=> other!==p && other.startsWith(p + '/')) );
        deepest.sort((a,b)=>{
          const da=a.split('/').length, db=b.split('/').length;
          return da===db ? a.localeCompare(b) : da-db;
        });
        return deepest.join(';');
      }
      exportNodesCSV.on('click', ()=>{
        try{
          const lines = [ csvLine(['label','type','plates','x','y']) ];
          nodes.forEach(n=> lines.push(csvLine([n.id, n.type||'', platesStringForNode(n), n.x, n.y])) );
          downloadCSV(lines.join('\r\n'), 'nodes.csv');
        }catch(err){ console.error('Nodes CSV export failed:', err); alert('Nodes CSV export failed. See console for details.'); }
        exportMenu.style('display','none');
      });
      exportEdgesCSV.on('click', ()=>{
        try{
          const lines = [ csvLine(['from','to','type']) ];
          links.forEach(l=> lines.push(csvLine([l.source?.id||'', l.target?.id||'', l.type||''])) );
          downloadCSV(lines.join('\r\n'), 'edges.csv');
        }catch(err){ console.error('Edges CSV export failed:', err); alert('Edges CSV export failed. See console for details.'); }
        exportMenu.style('display','none');
      });

      function csvDataToGraph(nd, ed){
        const mappedNodes = nd.map((r,i)=>{
          const id=(r.label||r.Label||r.id||r.ID||r.name||(`node${i}`)).toString();
          const type=(r.type||r.Type||'').toString();
          const xVal = r.x!==undefined && r.x!=='' ? +r.x : r.X!==undefined && r.X!=='' ? +r.X : null;
          const yVal = r.y!==undefined && r.y!=='' ? +r.y : r.Y!==undefined && r.Y!=='' ? +r.Y : null;
          return { id, type, x:xVal, y:yVal, plate:(r.plates||r.Plates||r.Plate||'').toString() };
        });
        const ignoredIds=new Set();
        const keptNodes = mappedNodes.filter(n=>{
          const ignore = shouldIgnoreNodeType(n.type);
          if(ignore) ignoredIds.add(n.id);
          return !ignore;
        });
        computeTextSizes(keptNodes);
        assignDefaultCoords(keptNodes);
        spreadOverlappingNodes(keptNodes);
        const nodeById = mapNodesById(keptNodes);
        const mappedEdges = ed.map(e=>{
          const src=(e.from||e.From||e.source||e.Source||'').toString();
          const tgt=(e.to||e.To||e.target||e.Target||'').toString();
          const type=normalizeEdgeType(e.type||e.Type||'');
          return {source:src,target:tgt,type};
        }).filter(l=> !ignoredIds.has(l.source) && !ignoredIds.has(l.target));
        mappedEdges.forEach(l=>{
          if(!nodeById.has(l.source)) nodeById.set(l.source,{id:l.source,x:0,y:0,rx:10,ry:10});
          if(!nodeById.has(l.target)) nodeById.set(l.target,{id:l.target,x:0,y:0,rx:10,ry:10});
          l.source=nodeById.get(l.source);
          l.target=nodeById.get(l.target);
        });
        return { nodes: Array.from(nodeById.values()), edges: mappedEdges };
      }

      function assignDefaultCoords(arr){
        arr.forEach((d,i)=>{
          if(d.x==null || isNaN(d.x)) d.x = 120 + (i%4)*160;
          if(d.y==null || isNaN(d.y)) d.y = 120 + Math.floor(i/4)*120;
        });
      }

      function setGraphData(newNodes, newEdges, skipFit){
        nodes = Array.isArray(newNodes) ? newNodes : [];
        links = Array.isArray(newEdges) ? newEdges : [];
        computeTextSizes(nodes);
        assignDefaultCoords(nodes);
        spreadOverlappingNodes(nodes);
        if(links.length){
          const nodeById = mapNodesById(nodes);
          links.forEach(l=>{
            if(typeof l.source === 'string') l.source = nodeById.get(l.source) || nodeById.set(l.source,{id:l.source,x:0,y:0,rx:10,ry:10}) && nodeById.get(l.source);
            if(typeof l.target === 'string') l.target = nodeById.get(l.target) || nodeById.set(l.target,{id:l.target,x:0,y:0,rx:10,ry:10}) && nodeById.get(l.target);
            l.type = normalizeEdgeType(l.type||'');
          });
          nodes = Array.from(nodeById.values());
        }
        computePlatesFromNodes();
        enforceNodePlateExclusion();
        recomputePlateBounds(); updatePlatesSelection(); drawNodes(); updateLinksPositions();
        if(cfg.fitOnDataLoad && !skipFit) fitToView();
      }

      function loadDemo(){
        const demoNodes=[
          {id:'Root',   plate:'Outer',                      x:220,y:160},
          {id:'Inner',  plate:'Outer/Inner',               x:380,y:160},
          {id:'Deep',   plate:'Outer/Inner/Innermost',     x:540,y:160},
          {id:'Shared', plate:'Outer/Inner;Shared',        x:380,y:320},
          {id:'Solo',   plate:'Shared',                    x:560,y:320}
        ];
        computeTextSizes(demoNodes);
        const demoEdges=[
          {source:'Root', target:'Inner',  type:'deterministic'},
          {source:'Inner',target:'Deep',   type:'stochastic'},
          {source:'Deep', target:'Shared', type:'deterministic'},
          {source:'Inner',target:'Solo',   type:'stochastic'}
        ];
        const mapped = csvDataToGraph(demoNodes, demoEdges.map(e=>({from:e.source,to:e.target,type:e.type})));
        setGraphData(mapped.nodes, mapped.edges);
      }

      function hydrateFromProps(){
        const hasData = Array.isArray(cfg.nodes) && cfg.nodes.length;
        if(hasData){
          const normalizedNodes = cfg.nodes.map((n,i)=>({
            id: (n.id||n.label||`node${i}`).toString(),
            x: n.x!=null ? +n.x : n.X!=null ? +n.X : null,
            y: n.y!=null ? +n.y : n.Y!=null ? +n.Y : null,
            plate: (n.plate||n.Plate||n.plates||n.Plates||'').toString(),
            type: (n.type||n.Type||'').toString()
          }));
          const normalizedEdges = Array.isArray(cfg.edges) ? cfg.edges.map(e=>({
            source: (e.source||e.from||e.Source||e.From||'').toString(),
            target: (e.target||e.to||e.Target||e.To||'').toString(),
            type: normalizeEdgeType(e.type||e.Type||'')
          })) : [];
          const filteredNodes = normalizedNodes.filter(n=> !shouldIgnoreNodeType(n.type));
          setGraphData(filteredNodes, normalizedEdges);
        } else {
          loadDemo();
        }
      }

      hydrateFromProps();

      return {
        resize: ()=>{ computeSize(); fitToView(); },
        setData: (nodes, edges)=> setGraphData(nodes, edges)
      };
    }

    // Expose for widget bindings
    window.initLayoutEditor = initLayoutEditor;
  })();
