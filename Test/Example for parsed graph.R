nodes_txt <- "label|plates
A|none
B|none
C|none
D|none"

edges_txt <- "from,to
A,B
A,C
B,D
C,D"

graph_data <- parse_graph(nodes_txt, edges_txt)
plot_dag(graph_data$nodes, graph_data$edges)
