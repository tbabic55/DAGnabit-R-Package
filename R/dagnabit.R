#' DAGnabit Graph Layout Editor
#'
#' This function creates an interactive DAG layout editor widget in R
#' using htmlwidgets and D3.js.
#'
#' @param width,height Dimensions of the widget (optional)
#' @param elementId Optional HTML id for the widget
#'
#' @import htmlwidgets
#'
#' @export
dagnabit <- function(width = NULL, height = NULL, elementId = NULL) {

  # Nothing to pass to JavaScript yet, but we could add settings later
  x <- list()

  # create the widget
  htmlwidgets::createWidget(
    name = 'dagnabit',
    x,
    width = width,
    height = height,
    package = 'DAGnabit',
    elementId = elementId
  )
}

#' Shiny bindings for DAGnabit
#'
#' Output and render functions for using DAGnabit within Shiny
#' applications and interactive R Markdown documents.
#'
#' @param outputId Output variable to read from.
#' @param width,height Must be a valid CSS unit (like '100%' or '400px')
#'   or a number that will be coerced to a string and have 'px' appended.
#' @param expr An expression that generates a DAGnabit widget.
#' @param env The environment in which to evaluate `expr`.
#' @param quoted Is `expr` a quoted expression (with `quote()`)? This
#'   is useful if you want to save an expression in a variable.
#'
#' @name dagnabit-shiny
#'
#' @export
dagnabitOutput <- function(outputId, width = '100%', height = '600px') {
  htmlwidgets::shinyWidgetOutput(outputId, 'dagnabit', width, height, package = 'DAGnabit')
}

#' @rdname dagnabit-shiny
#' @export
renderDagnabit <- function(expr, env = parent.frame(), quoted = FALSE) {
  if (!quoted) expr <- substitute(expr)
  htmlwidgets::shinyRenderWidget(expr, dagnabitOutput, env, quoted = TRUE)
}
