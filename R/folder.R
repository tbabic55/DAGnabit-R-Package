visDependency <- function() {
  htmltools::htmlDependency(
    name = "visNetwork",
    version = "9.1.9",
    src = system.file("htmlwidgets/lib/vis", package = "DAGnabit"),
    script = "vis-network.min.js"
  )
}

