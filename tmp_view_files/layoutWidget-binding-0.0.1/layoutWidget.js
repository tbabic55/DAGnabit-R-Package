HTMLWidgets.widget({

  name: 'layoutWidget',
  type: 'output',

  factory: function(el, width, height) {

    let editor = null;

    return {

      renderValue: function(x) {

        el.innerHTML = "";

        // Ensure the container has dimensions; fall back when width/height are not provided.
        const w = (typeof width === "number" && width > 0) ? width + "px" : "100%";
        const h = (typeof height === "number" && height > 0) ? height + "px" : "600px";
        el.style.width  = w;
        el.style.height = h;

        editor = window.initLayoutEditor(el, {
          nodes: x.nodes || [],
          edges: x.edges || [],
          enableFileInputs: x.enableFileInputs ?? false,
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
