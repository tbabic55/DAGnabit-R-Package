#' Shiny output binding
#' @export
DAGnabitWidgetOutput <- function(outputId, width = "100%", height = "400px") {
  htmlwidgets::shinyWidgetOutput(outputId, "DAGnabitWidget", width, height, package = "DAGnabit")
}

#' Shiny render function
#' @export
renderDAGnabitWidget <- function(expr, env = parent.frame(), quoted = FALSE) {
  if (!quoted) expr <- substitute(expr)
  htmlwidgets::shinyRenderWidget(expr, DAGnabitWidgetOutput, env, quoted = TRUE)
}

