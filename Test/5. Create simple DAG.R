devtools::load_all()

nodes <- data.frame(id = 1:3, label = c("A","B","C"))
edges <- data.frame(from = c(1,2), to = c(2,3))

# must name the arguments!
DAGnabitWidget(nodes = nodes, edges = edges)

