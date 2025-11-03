#' Parse nodes and edges from text input
#'
#' @param nodes_txt Character string describing nodes, e.g. "A|none\nB|none"
#' @param edges_txt Character string describing edges, e.g. "from,to\nA,B\nB,C"
#' @return A list with elements `nodes` and `edges` as data frames
#' @export
parse_graph <- function(nodes_txt, edges_txt) {
  # Read nodes
  nodes <- read.delim(
    textConnection(nodes_txt),
    sep = "|",
    stringsAsFactors = FALSE,
    header = FALSE
  )

  # Keep only first column as label
  nodes <- data.frame(label = nodes[[1]], stringsAsFactors = FALSE)

  # Add igraph-compatible "name" column
  nodes$name <- nodes$label

  # Read edges
  edges <- read.csv(
    textConnection(edges_txt),
    stringsAsFactors = FALSE
  )

  list(nodes = nodes, edges = edges)
}

