#' Parse a BUGS/JAGS model and open it in the layout editor
#'
#' Convenience wrapper: parse the model text (or file) and render directly
#' in the interactive layout editor widget.
#'
#' @param model Character string with BUGS/JAGS model text, or a file path if \code{is_file = TRUE}.
#' @param is_file Logical; set TRUE when \code{model} is a file path.
#' @param enableFileInputs Logical; allow CSV upload controls in the widget.
#' @param width,height Optional widget dimensions passed to \code{layoutWidget()}.
#'
#' @return An htmlwidget object that renders the layout editor.
#' @export
view_bugs_layout <- function(model,
                             is_file = FALSE,
                             enableFileInputs = FALSE,
                             width = NULL,
                             height = NULL) {

  parsed <- parse_bugs_model(model, is_file = is_file)

  # Normalize edge column name to the engine's expectation
  edges <- parsed$edges
  if (!is.null(edges) && is.data.frame(edges) && "kind" %in% names(edges) && !"type" %in% names(edges)) {
    edges$type <- edges$kind
  }

  layoutWidget(
    nodes = parsed$nodes,
    edges = edges,
    enableFileInputs = enableFileInputs,
    width = width,
    height = height
  )
}
