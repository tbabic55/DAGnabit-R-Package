#' Layout Editor Widget
#'
#' @param nodes list of node objects
#' @param edges list of edge objects
#' @param enableFileInputs logical
#' @param width widget width
#' @param height widget height
#'
#' @export
layoutWidget <- function(nodes = list(),
                         edges = list(),
                         enableFileInputs = FALSE,
                         width = NULL,
                         height = NULL) {

  htmlwidgets::createWidget(
    name = "layoutWidget",
    x = list(
      nodes = nodes,
      edges = edges,
      enableFileInputs = enableFileInputs
    ),
    width = width,
    height = height,
    package = "DAGnabit",

    # ✅ THIS IS THE MISSING PIECE
    sizingPolicy = htmlwidgets::sizingPolicy(
      defaultWidth  = "100%",
      defaultHeight = 600,
      viewer.defaultHeight = 600,
      viewer.fill = TRUE
    )
  )
}
