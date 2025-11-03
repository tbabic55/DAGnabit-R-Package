#' Build and plot a DAG
#'
#' Takes a list of nodes and edges, builds a DAG using igraph, and plots it.
#'
#' @param nodes A data.frame with column `label` for node names.
#' @param edges A data.frame with columns `from` and `to`.
#' @param layout_func An igraph layout function (default: layout_with_kk)
#' @return The igraph graph object (invisibly)
#' @import igraph
#' @export
plot_dag <- function(nodes, edges, layout_func = igraph::layout_with_kk) {
  stopifnot("label" %in% names(nodes))
  stopifnot(all(c("from", "to") %in% names(edges)))

  # Build igraph object
  g <- igraph::graph_from_data_frame(d = edges, vertices = nodes, directed = TRUE)

  # Compute layout
  layout_mat <- layout_func(g)

  # Plot DAG
  igraph::plot.igraph(
    g,
    layout = layout_mat,
    vertex.label.color = "black",
    vertex.color = "lightblue",
    vertex.size = 30,
    edge.arrow.size = 0.3,
    vertex.label.cex = 0.8
  )

  invisible(g)
}

