#' DAGnabit HTML Widget
#'
#' @param nodes Data frame of nodes (must contain column `label`)
#' @param edges Data frame of edges (must contain columns `from`, `to`)
#' @param width Widget width
#' @param height Widget height
#' @param elementId optional HTML id
#' @export
DAGnabitWidget <- function(nodes, edges, width = NULL, height = NULL, elementId = NULL) {
  stopifnot(is.data.frame(nodes), is.data.frame(edges))
  stopifnot("label" %in% names(nodes))
  stopifnot(all(c("from","to") %in% names(edges)))

  x <- list(
    nodes = split(nodes, seq_len(nrow(nodes))),
    edges = split(edges, seq_len(nrow(edges)))
  )

  htmlwidgets::createWidget(
    name = "DAGnabitWidget",
    x = x,
    width = width,
    height = height,
    package = "DAGnabit",
    elementId = elementId
  )
}

