HTMLWidgets.widget({

  name: 'layoutWidget',
  type: 'output',

  factory: function(el, width, height) {

    let editor = null;

    return {

      renderValue: function(x) {

        el.innerHTML = "";

        const dfToArray = (df) => {
          if (!df) return [];
          if (Array.isArray(df)) return df;
          if (typeof HTMLWidgets !== "undefined" && typeof HTMLWidgets.dataframeToD3 === "function") {
            try {
              return HTMLWidgets.dataframeToD3(df);
            } catch (err) {
              console.warn("Failed to convert data frame to array:", err);
            }
          }
          return df;
        };

        const payload = x || {};
        const nodes = dfToArray(payload.nodes);
        const edges = dfToArray(payload.edges);

        // Ensure the container has dimensions; fall back when width/height are not provided.
        const w = (typeof width === "number" && width > 0) ? width + "px" : "100%";
        const h = (typeof height === "number" && height > 0) ? height + "px" : "600px";
        el.style.width  = w;
        el.style.height = h;

        editor = window.initLayoutEditor(el, {
          nodes: nodes || [],
          edges: edges || [],
          enableFileInputs: payload.enableFileInputs ?? false,
          fitOnDataLoad: true
        });

      },

      resize: function(width, height) {
        if (editor && editor.resize) {
          editor.resize();
        }
      }
    };
  }
});
