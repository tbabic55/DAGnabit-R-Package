#' Say hello
#'
#' A simple test function for the DAGnabit package.
#' @param name A character string containing your name.
#' @return Prints a friendly message.
#' @export
hello <- function(name = "world") {
  message(paste("DAGnabit,", name, "!"))
}

