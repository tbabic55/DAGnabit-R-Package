// Layout Editor engine (htmlwidgets-ready) – based on Liam's latest version
(function(){
  const STYLE = `
    .le-root { display:flex; height:100%; width:100%; font-family:sans-serif; box-sizing:border-box; }
    .le-sidebar { width:220px; background:#f7f7f7; padding:12px; border-right:1px solid #ccc;
      box-sizing:border-box; display:flex; flex-direction:column; justify-content:space-between; }
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
    .le-export-menu { position:absolute; left:0; top:36px; background:#fff; border:1px solid #ccc;
      box-shadow:0 2px 6px rgba(0,0,0,0.15); width:100%; z-index:1000; pointer-events:auto; }
    .le-export-menu button { border:none; background:none; padding:8px; text-align:left; width:100%; display:block; }
  `;

  function initLayoutEditor(el, opts){
    const cfg = Object.assign({ enableFileInputs:true, fitOnDataLoad:true }, opts||{});
    el.innerHTML = '';

    // Scoped styles
    const styleTag = document.createElement('style');
    styleTag.textContent = STYLE;
    el.appendChild(styleTag);

    // Layout skeleton
    const root = document.createElement('div'); root.className='le-root'; el.appendChild(root);
    const sidebar = document.createElement('div'); sidebar.className='le-sidebar'; root.appendChild(sidebar);
    const controls = document.createElement('div'); controls.className='le-controls'; sidebar.appendChild(controls);
    const legend = document.createElement('div'); legend.className='le-legend'; legend.style.marginTop='10px';
    legend.style.borderTop='1px solid #ddd'; legend.style.paddingTop='8px'; sidebar.appendChild(legend);
    const graphWrap = document.createElement('div'); graphWrap.className='le-graph'; root.appendChild(graphWrap);

    // Controls
    const fitBtn = document.createElement('button'); fitBtn.textContent='Fit to view'; controls.appendChild(fitBtn);
    const refreshBtn = document.createElement('button'); refreshBtn.title='Reload from selected CSV';
    refreshBtn.textContent='↻'; refreshBtn.style.width='48px'; refreshBtn.style.display='inline-block'; controls.appendChild(refreshBtn);
    const graphLabel = document.createElement('label'); graphLabel.textContent='Graph CSV (nodes + edges)'; controls.appendChild(graphLabel);
    const graphInput = document.createElement('input'); graphInput.type='file'; graphInput.accept='.csv'; controls.appendChild(graphInput);
    if(!cfg.enableFileInputs){ graphInput.disabled = true; refreshBtn.disabled = true; }

    // Export menu
    const exportWrap = document.createElement('div'); exportWrap.style.marginTop='8px'; exportWrap.style.position='relative'; controls.appendChild(exportWrap);
    const exportBtn = document.createElement('button'); exportBtn.textContent='Export ▼'; exportWrap.appendChild(exportBtn);
    const exportMenu = document.createElement('div'); exportMenu.className='le-export-menu'; exportMenu.style.display='none'; exportWrap.appendChild(exportMenu);
    const exportSVG = document.createElement('button'); exportSVG.textContent='Export SVG'; exportMenu.appendChild(exportSVG);
    const exportPNG = document.createElement('button'); exportPNG.textContent='Export PNG'; exportMenu.appendChild(exportPNG);
    const divider = document.createElement('div'); divider.style.borderTop='1px solid #eee'; divider.style.margin='4px 0'; exportMenu.appendChild(divider);
    const exportGraphCSV = document.createElement('button'); exportGraphCSV.textContent='Export Graph CSV'; exportMenu.appendChild(exportGraphCSV);

    // Legend
    const legendTitle = document.createElement('div'); legendTitle.style.fontWeight='600'; legendTitle.style.textAlign='center'; legendTitle.style.marginBottom='6px'; legendTitle.textContent='Legend'; legend.appendChild(legendTitle);
    const legDet = document.createElement('div'); legDet.className='legend-item'; legDet.innerHTML='<div class="legend-color" style="background:#0072B2"></div> Deterministic'; legend.appendChild(legDet);
    const legSto = document.createElement('div'); legSto.className='legend-item'; legSto.innerHTML='<div class="legend-color" style="background:#E69F00"></div> Stochastic'; legend.appendChild(legSto);
    const legHint = document.createElement('div'); legHint.style.fontSize='12px'; legHint.style.color='#555'; legHint.style.marginTop='6px';
    legHint.textContent='Plates: use ";" for shared (e.g. "A;B") and "/" for nesting (e.g. "Outer/Inner/Innermost").'; legend.appendChild(legHint);
    const legPlateTitle = document.createElement('div'); legPlateTitle.style.fontWeight='600'; legPlateTitle.style.marginTop='10px'; legPlateTitle.textContent='Plate Colors'; legend.appendChild(legPlateTitle);
    const plateLegend = document.createElement('div'); plateLegend.className='le-plate-legend'; legend.appendChild(plateLegend);

    // SVG
    const svg = d3.select(graphWrap).append('svg');
    const defs = svg.append('defs');
    function addArrow(id,color){
      const m = defs.append('marker')
        .attr('id',id).attr('viewBox','0 -5 10 10').attr('refX',10).attr('refY',0)
        .attr('markerWidth',6).attr('markerHeight',6).attr('orient','auto');
      m.append('path').attr('d','M0,-5L10,0L0,5').attr('fill',color);
    }
    addArrow('arrow-blue','#0072B2'); addArrow('arrow-orange','#E69F00'); addArrow('arrow-default','#666666');

    const mainGroup = svg.append('g');
    const platesGroup = mainGroup.append('g').attr('class','plates');
    const linksGroup = mainGroup.append('g').attr('class','links');
    const nodesGroup = mainGroup.append('g').attr('class','nodes');

    let width=0, height=0;
    function computeSize(){
      const rect = graphWrap.getBoundingClientRect();
      width = rect.width || cfg.width || 640;
      height = rect.height || cfg.height || 480;
      svg.attr('width', width).attr('height', height);
    }
    computeSize();

    const zoom = d3.zoom().on('zoom',(event)=>mainGroup.attr('transform',event.transform));
    svg.call(zoom);

    // Data
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
    function isAncestorPlate(ancestorId, childId){ return ancestorId && childId && ancestorId!==childId && childId.startsWith(ancestorId + '/'); }
    function plateDisplayName(id){ if(!id) return id; const parts=id.split('/').filter(Boolean); return parts[parts.length-1]||id; }
    function updatePlateLegend(){
      const depthByRoot = new Map();
      plates.forEach(p=>{
        const parts = p.id.split('/'); const root = parts[0]; const depth = Math.max(0, parts.length-1);
        if(!depthByRoot.has(root)) depthByRoot.set(root, new Set());
        depthByRoot.get(root).add(depth);
      });
      const roots = Array.from(depthByRoot.keys()).sort();
      plateLegend.innerHTML = '';
      roots.forEach(root=>{
        const depths = Array.from(depthByRoot.get(root)).sort((a,b)=>a-b);
        const row = document.createElement('div'); row.className='legend-item';
        const label = document.createElement('div'); label.textContent=root; row.appendChild(label);
        const swatchWrap = document.createElement('div'); swatchWrap.style.display='flex'; swatchWrap.style.gap='6px'; swatchWrap.style.marginLeft='8px';
        depths.forEach(d=>{
          const sw = document.createElement('div'); sw.className='legend-color';
          const base = d3.color(plateRootColor(root)); const fill = d3.color(base).darker(d*0.6);
          sw.title = d===0 ? `${root}` : `${root} (level ${d})`; sw.style.background = fill.formatRgb(); swatchWrap.appendChild(sw);
        });
        row.appendChild(swatchWrap); plateLegend.appendChild(row);
      });
    }

    const getEdgeColor = t => t==='deterministic'?'#0072B2':t==='stochastic'?'#E69F00':'#666666';
    const getEdgeMarkerId = t => t==='deterministic'?'url(#arrow-blue)':t==='stochastic'?'url(#arrow-orange)':'url(#arrow-default)';
    function normalizeEdgeType(s){
      const t = (s||'').toString().trim().toLowerCase();
      if(t==='logical') return 'deterministic';
      if(t==='deterministic') return 'deterministic';
      if(t==='stochastic') return 'stochastic';
      return t || 'default';
    }
    function shouldIgnoreNodeType(typeStr){
      const t = (typeStr||'').toString().toLowerCase();
      return t.includes('plate') || t.includes('index');
    }

    function computeTextSizes(arr){
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font='14px sans-serif';
      arr.forEach(d=>{ const w = ctx.measureText(d.id).width; d.rx = Math.max(24,w/2+12); d.ry=16; });
    }
    function mapNodesById(arr){ const m=new Map(); arr.forEach(n=>m.set(n.id,n)); return m; }
    function spreadOverlappingNodes(arr){
      const groups = new Map();
      arr.forEach(n=>{
        const key = `${Number(n.x)||0}|${Number(n.y)||0}`;
        if(!groups.has(key)) groups.set(key, []);
        groups.get(key).push(n);
      });
      groups.forEach(nodesAtSpot=>{
        if(nodesAtSpot.length<=1) return;
        const maxRx=Math.max(...nodesAtSpot.map(n=>n.rx||24));
        const maxRy=Math.max(...nodesAtSpot.map(n=>n.ry||16));
        const spacingX=Math.max(120,(maxRx*2)+40);
        const spacingY=Math.max(100,(maxRy*2)+40);
        const cols=Math.ceil(Math.sqrt(nodesAtSpot.length));
        const rows=Math.ceil(nodesAtSpot.length/cols);
        const baseX=Number(nodesAtSpot[0].x)||0; const baseY=Number(nodesAtSpot[0].y)||0;
        nodesAtSpot.forEach((n,i)=>{
          const row=Math.floor(i/cols); const col=i%cols;
          const offsetX=(col-(cols-1)/2)*spacingX; const offsetY=(row-(rows-1)/2)*spacingY;
          n.x=baseX+offsetX; n.y=baseY+offsetY;
        });
      });
    }

    const pointInPlate = (x,y,p)=> x>p.x && x<p.x+p.width && y>p.y && y<p.y+p.height;
    const rectsOverlap = (a,b)=> !(a.x+a.width<b.x || b.x+b.width<a.x || a.y+a.height<b.y || b.y+b.height<a.y);
    const nodeRect = n => ({ x:n.x-n.rx, y:n.y-n.ry, width:n.rx*2, height:n.ry*2 });
    const nodeOverlapsPlate = (n,p)=> rectsOverlap(nodeRect(n), p);

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
          const acc=[]; parts.forEach(part=>{ acc.push(part); pathSet.add(acc.join('/')); });
        });
        const plateIds = Array.from(pathSet);
        n.platesPaths = plateIds;
        plateIds.forEach(id=>{
          if(!map.has(id)) map.set(id,[]);
          const arr = map.get(id); if(arr[arr.length-1]!==n) arr.push(n);
        });
      });
      plates = Array.from(map.entries()).map(([id,nodeList])=>({id,nodes:nodeList,x:0,y:0,width:0,height:0,padding:18}));
      plates.sort((a,b)=>{ const da=a.id.split('/').length, db=b.id.split('/').length; return da===db ? a.id.localeCompare(b.id) : da-db; });
      recomputePlateBounds(); updatePlateLegend();
    }
    function recomputePlateBounds(){
      plates.forEach(p=>{
        if(!p.nodes || p.nodes.length===0) return;
        const pad=p.padding||18; let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        p.nodes.forEach(n=>{ minX=Math.min(minX,n.x-n.rx); minY=Math.min(minY,n.y-n.ry); maxX=Math.max(maxX,n.x+n.rx); maxY=Math.max(maxY,n.y+n.ry); });
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
            const spacing=5;
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
    fitBtn.addEventListener('click', fitToView);

    // CSV parsing (combined graph CSV)
    function parseCombinedGraphCSV(text){
      const rows = d3.csvParseRows(text);
      const nodesSection=[], edgesSection=[];
      const nodeHeader=['label','type','plates','x','y'];
      const edgeHeader=['from','to','kind'];
      const edgeHeaderAlt=['from','to','type'];
      let mode=null;
      const matchesHeader=(row, header)=> row.length>=header.length && header.every((h,i)=> (row[i]||'').trim().toLowerCase()===h);
      rows.forEach(row=>{
        if(!row || row.length===0 || row.every(c=>c.trim()==="")) return;
        if(matchesHeader(row,nodeHeader)){ mode='nodes'; return; }
        if(matchesHeader(row,edgeHeader) || matchesHeader(row,edgeHeaderAlt)){ mode='edges'; return; }
        if(mode==='nodes'){
          const [label='', type='', plates='', x='', y='']=row;
          nodesSection.push({label, type, plates, x, y});
        }else if(mode==='edges'){
          const [from='', to='', kind='']=row;
          edgesSection.push({from, to, kind});
        }
      });
      return { nodesSection, edgesSection };
    }

    function loadGraphFromParsedData(nodeRows, edgeRows){
      const parsedNodes=(nodeRows||[]).map((r,i)=>{
        const id=(r.label||r.Label||r.id||r.ID||r.name||(`node${i}`)).toString();
        const type=(r.type||r.Type||'').toString();
        const xRaw = r.x!==undefined ? r.x : r.X;
        const yRaw = r.y!==undefined ? r.y : r.Y;
        const x = xRaw!==undefined && xRaw!=='' ? +xRaw : 100+(i%4)*160;
        const y = yRaw!==undefined && yRaw!=='' ? +yRaw : 100+Math.floor(i/4)*120;
        const plateRaw=r.plates||r.Plates||r.Plate||'';
        return {id,type,x,y,plate:plateRaw.toString()};
      });
      const ignoredIds=new Set();
      nodes=parsedNodes.filter(n=>{
        const ignore = shouldIgnoreNodeType(n.type);
        if(ignore) ignoredIds.add(n.id);
        return !ignore;
      });
      computeTextSizes(nodes);
      spreadOverlappingNodes(nodes);
      const nodeById = mapNodesById(nodes);
      links=(edgeRows||[]).map(e=>{
        const src=(e.from||e.From||e.source||e.Source||'').toString();
        const tgt=(e.to||e.To||e.target||e.Target||'').toString();
        const type=normalizeEdgeType(e.kind||e.Kind||e.type||e.Type||'');
        return {source:src,target:tgt,type};
      });
      links = links.filter(l=> !ignoredIds.has(l.source) && !ignoredIds.has(l.target));
      links.forEach(l=>{
        if(!nodeById.has(l.source)) nodeById.set(l.source,{id:l.source,x:0,y:0,rx:10,ry:10});
        if(!nodeById.has(l.target)) nodeById.set(l.target,{id:l.target,x:0,y:0,rx:10,ry:10});
        l.source=nodeById.get(l.source);
        l.target=nodeById.get(l.target);
      });

      computePlatesFromNodes();
      enforceNodePlateExclusion();
      recomputePlateBounds(); updatePlatesSelection(); drawNodes(); updateLinksPositions();
      if(cfg.fitOnDataLoad) fitToView();
    }

    function loadGraphFromTables(nodesTable, edgesTable){
      const nArr = Array.isArray(nodesTable) ? nodesTable : [];
      const eArr = Array.isArray(edgesTable) ? edgesTable : [];
      if(!Array.isArray(nodesTable) || !Array.isArray(edgesTable)){
        console.warn('loadGraphFromTables expects two arrays (nodes, edges). Falling back to empty arrays.');
      }
      loadGraphFromParsedData(nArr, eArr);
    }
    function loadGraphFromDataObject(obj){
      const nodesTable = obj && Array.isArray(obj.nodes) ? obj.nodes : [];
      const edgesTable = obj && Array.isArray(obj.edges) ? obj.edges : [];
      loadGraphFromTables(nodesTable, edgesTable);
    }
    function loadGraphFromParseResult(parsed){
      if(!parsed) return;
      const nodesTable = Array.isArray(parsed.nodes) ? parsed.nodes : parsed.Nodes || [];
      const edgesTable = Array.isArray(parsed.edges) ? parsed.edges : parsed.Edges || [];
      loadGraphFromTables(nodesTable, edgesTable);
    }

    function hydrateFromWidgetPayload(){
      const hasNodes = Array.isArray(cfg.nodes) && cfg.nodes.length > 0;
      const hasEdges = Array.isArray(cfg.edges) && cfg.edges.length > 0;
      if(hasNodes || hasEdges){
        loadGraphFromDataObject(cfg);
        return true;
      }
      if(cfg.parsed || cfg.bugs || cfg.jags){
        loadGraphFromParseResult(cfg.parsed || cfg.bugs || cfg.jags);
        return true;
      }
      return false;
    }

    async function attemptAutoLoad(){
      if(!cfg.enableFileInputs || !graphInput) return;
      const gf=graphInput.files[0];
      if(!gf) return;
      try{
        const text = await gf.text();
        const {nodesSection, edgesSection} = parseCombinedGraphCSV(text);
        if(nodesSection.length===0 && edgesSection.length===0){
          alert('Selected CSV is empty or missing required headers.');
          return;
        }
        loadGraphFromParsedData(nodesSection, edgesSection);
      }catch(err){
        console.error('Auto-load failed:', err);
        alert('Failed to load graph from CSV file. See console for details.');
      }
    }
    if(cfg.enableFileInputs){
      graphInput.addEventListener('change', attemptAutoLoad);
      refreshBtn.addEventListener('click', attemptAutoLoad);
    }

    // Export menu wiring
    exportBtn.addEventListener('click',(e)=>{ e.stopPropagation(); exportMenu.style.display=exportMenu.style.display==='block'?'none':'block'; });
    exportMenu.addEventListener('click',(e)=>{ e.stopPropagation(); });
    root.addEventListener('click',e=>{ if(!exportBtn.contains(e.target) && !exportMenu.contains(e.target)) exportMenu.style.display='none'; });

    function serializeSVG(){
      const clone=svg.node().cloneNode(true);
      clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
      clone.setAttribute('width', width);
      clone.setAttribute('height', height);
      if(!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const cssText = Array.from(el.querySelectorAll('style')).map(s=>s.textContent||'').join('\n');
      if(cssText.trim().length){
        const defs = clone.querySelector('defs') || clone.insertBefore(document.createElementNS('http://www.w3.org/2000/svg','defs'), clone.firstChild);
        const styleEl = document.createElementNS('http://www.w3.org/2000/svg','style');
        styleEl.setAttribute('type','text/css');
        styleEl.textContent = cssText;
        defs.appendChild(styleEl);
      }
      return new XMLSerializer().serializeToString(clone);
    }
    exportSVG.addEventListener('click',()=>{
      try{
        const s=serializeSVG(); const blob=new Blob([s],{type:'image/svg+xml;charset=utf-8'});
        const url=URL.createObjectURL(blob); const a=document.createElement('a');
        a.href=url; a.download='graph.svg'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      }catch(err){ console.error('SVG export failed:', err); alert('SVG export failed. See console for details.'); }
      exportMenu.style.display='none';
    });
    exportPNG.addEventListener('click',()=>{
      try{
        const s=serializeSVG(); const blob=new Blob([s],{type:'image/svg+xml;charset=utf-8'});
        const url=URL.createObjectURL(blob); const img=new Image();
        img.onload=()=>{ const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
          const ctx=canvas.getContext('2d'); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.drawImage(img,0,0);
          const pngUrl=canvas.toDataURL('image/png');
          const a=document.createElement('a'); a.href=pngUrl; a.download='graph.png'; document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        }; img.src=url;
      }catch(err){ console.error('PNG export failed:', err); alert('PNG export failed. See console for details.'); }
      exportMenu.style.display='none';
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
    exportGraphCSV.addEventListener('click', ()=>{
      try{
        const lines = [];
        lines.push(csvLine(['label','type','plates','x','y']));
        nodes.forEach(n=> lines.push(csvLine([n.id, n.type||'', platesStringForNode(n), n.x, n.y])));
        lines.push('');
        lines.push(csvLine(['from','to','kind']));
        links.forEach(l=> lines.push(csvLine([l.source?.id||'', l.target?.id||'', l.type||''])));
        downloadCSV(lines.join('\r\n'), 'graph.csv');
      }catch(err){
        console.error('Graph CSV export failed:', err);
        alert('Graph CSV export failed. See console for details.');
      }
      exportMenu.style.display='none';
    });

    function loadDemo(){
      nodes=[
        {id:'Root',   plate:'Outer',                      x:220,y:160},
        {id:'Inner',  plate:'Outer/Inner',               x:380,y:160},
        {id:'Deep',   plate:'Outer/Inner/Innermost',     x:540,y:160},
        {id:'Shared', plate:'Outer/Inner;Shared',        x:380,y:320},
        {id:'Solo',   plate:'Shared',                    x:560,y:320}
      ];
      computeTextSizes(nodes);
      links=[
        {source:'Root', target:'Inner',  type:'deterministic'},
        {source:'Inner',target:'Deep',   type:'stochastic'},
        {source:'Deep', target:'Shared', type:'deterministic'},
        {source:'Inner',target:'Solo',   type:'stochastic'}
      ];
      links.forEach(l=>{ l.source=nodes.find(n=>n.id===l.source); l.target=nodes.find(n=>n.id===l.target); });
      computePlatesFromNodes(); enforceNodePlateExclusion(); updatePlatesSelection(); drawNodes(); updateLinksPositions(); fitToView();
    }

    if(!hydrateFromWidgetPayload()) loadDemo();

    return {
      resize: ()=>{ computeSize(); fitToView(); },
      setData: (nodesArr, edgesArr)=> loadGraphFromTables(nodesArr, edgesArr),
      loadGraphFromTables,
      loadGraphFromDataObject,
      loadGraphFromParseResult
    };
  }

  window.initLayoutEditor = initLayoutEditor;
})();
