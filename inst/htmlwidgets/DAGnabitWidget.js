HTMLWidgets.widget({
  name: "DAGnabitWidget",
  type: "output",

  factory: function(el, width, height) {
    return {
      renderValue: function(x) {
        el.innerHTML = "";

        const svg = d3.select(el).append("svg")
          .attr("width", width)
          .attr("height", height);

     const nodes = JSON.parse(x.nodes_json || "[]");
     const edges = JSON.parse(x.edges_json || "[]");

        const simulation = d3.forceSimulation(nodes)
          .force("link", d3.forceLink(edges).id(d => d.id).distance(100))
          .force("charge", d3.forceManyBody().strength(-200))
          .force("center", d3.forceCenter(width/2, height/2));

        const link = svg.append("g")
          .attr("stroke", "#aaa")
          .selectAll("line")
          .data(edges)
          .enter().append("line");

        const node = svg.append("g")
          .attr("stroke", "#fff")
          .attr("stroke-width", 1.5)
          .selectAll("circle")
          .data(nodes)
          .enter().append("circle")
          .attr("r", 10)
          .attr("fill", "steelblue")
          .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

        node.append("title").text(d => d.label);

        simulation.on("tick", () => {
          link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

          node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);
        });

        function dragstarted(event, d) {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        }
        function dragged(event, d) {
          d.fx = event.x; d.fy = event.y;
        }
        function dragended(event, d) {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        }
      },
      resize: function(width, height) {}
    };
  }
});


