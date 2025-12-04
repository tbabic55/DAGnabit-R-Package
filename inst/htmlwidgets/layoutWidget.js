HTMLWidgets.widget({

  name: 'layoutWidget',
  type: 'output',

  factory: function(el, width, height) {

    let editor = null;

    return {

      renderValue: function(x) {

        el.innerHTML = "";

        // ✅ CRITICAL: force real pixel size for RStudio Viewer
        el.style.width  = width  + "px";
        el.style.height = height + "px";

        editor = window.initLayoutEditor(el, {
          nodes: x.nodes || [],
          edges: x.edges || [],
          enableFileInputs: x.enableFileInputs ?? false,
          fitOnDataLoad: true,
          width: width,
          height: height
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
