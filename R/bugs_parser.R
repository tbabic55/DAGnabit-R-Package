# ------------------------------------------------------------
# BUGS/JAGS -> Nodes & Edges Tables (plates kept only in nodes table)
# Returns/exports ONLY nodes & edges
# Demo/CLI result variable is NodesandEdgesTable
# ------------------------------------------------------------
suppressWarnings(suppressMessages({
  library(utils)
  library(tools)
}))

# ---------- Helpers ----------
.strip_comments <- function(model_lines) {
  model_lines <- gsub("#.*$", "", model_lines)
  trimws(model_lines)
}

.extract_model_block <- function(model_lines) {
  txt <- paste(model_lines, collapse = "\n")
  mstart <- regexpr("\\bmodel\\s*\\{", txt, perl = TRUE)
  if (mstart[1] == -1) stop("No 'model { ... }' block found.")
  start <- as.integer(mstart) + attr(mstart, "match.length")
  depth <- 1L; i <- start; end_pos <- NA_integer_
  while (i <= nchar(txt)) {
    ch <- substr(txt, i, i)
    if (ch == "{") depth <- depth + 1L
    if (ch == "}") { depth <- depth - 1L; if (depth == 0L) { end_pos <- i; break } }
    i <- i + 1L
  }
  if (is.na(end_pos)) stop("Could not find closing '}' for model block.")
  block <- substr(txt, start, end_pos - 1L)
  blines <- unlist(strsplit(block, "\n", fixed = TRUE))
  blines <- blines[nzchar(trimws(blines))]
  blines
}

.normalize_index <- function(name) gsub("\\[[^\\]]*\\]", "[]", name, perl = TRUE)
.strip_all_brackets <- function(name) gsub("\\[\\]", "", .normalize_index(name), perl = TRUE)

.tokenize_symbols <- function(expr) {
  m <- gregexpr("\\b[A-Za-z_][A-Za-z0-9_.]*\\b(?:\\[[^\\]]+\\])?", expr, perl = TRUE)
  if (length(m) == 0L || m[[1]][1] == -1) return(character(0))
  unique(regmatches(expr, m)[[1]])
}

.is_numeric_like <- function(tok) {
  grepl("^([0-9]+(\\.[0-9]*)?|\\.[0-9]+)([eE][+-]?[0-9]+)?$", tok)
}

.ignore_set <- c(
  "model","for","in","if","else","T","F","NA","TRUE","FALSE",
  "I","log","log10","exp","sqrt","pow","abs","step","ceil","floor","round","phi",
  "cos","sin","tan","acos","asin","atan","max","min","mean","sd","sum","prod","length",
  # distributions
  "dbern","dbin","dcat","ddirch","ddexp","dgamma","dlnorm","dlogis","dnorm",
  "dpar","dpois","dunif","dweib","dmulti","dmnorm","dmvnorm","dwish","dinvgamma",
  "dhyper","dnbinom","dt","dchisqr","dexp","dbeta",
  # link/helpers
  "cloglog","logit","probit","ilogit","equals","inprod"
)

# Merge wrapped lines using a heuristic
.coalesce_lines <- function(model_lines) {
  out <- character(0); buf <- ""
  for (ln in model_lines) {
    s <- trimws(ln); if (!nzchar(s)) next
    buf <- paste0(buf, " ", s)
    last_char <- if (nzchar(s)) substr(s, nchar(s), nchar(s)) else ""
    if (last_char %in% c(",", "+", "-", "*", "/", "^", "=")) next
    out <- c(out, trimws(buf)); buf <- ""
  }
  if (nzchar(trimws(buf))) out <- c(out, trimws(buf))
  out
}

.extract_loops <- function(model_lines) {
  if (is.null(model_lines) || length(model_lines) == 0) {
    return(data.frame(var=character(), range=character(), label=character(), stringsAsFactors=FALSE))
  }
  if (!is.character(model_lines)) model_lines <- as.character(model_lines)

  vars <- c(); ranges <- c(); labels <- c()
  for (ln in model_lines) {
    if (!nzchar(trimws(ln))) next
    m <- regexec("for\\s*\\(\\s*([A-Za-z_][A-Za-z0-9_]*)\\s+in\\s+([^\\)]*)\\)", ln, perl = TRUE)
    hit <- regmatches(ln, m)[[1]]
    if (length(hit) >= 3) {
      v <- trimws(hit[2]); r <- trimws(hit[3])
      vars   <- c(vars, v)
      ranges <- c(ranges, r)
      labels <- c(labels, paste0(v, " in ", r))
    }
  }
  if (!length(vars))
    return(data.frame(var=character(), range=character(), label=character(), stringsAsFactors=FALSE))
  data.frame(var=vars, range=ranges, label=labels, stringsAsFactors=FALSE)
}

.index_vars_in_token <- function(tok) {
  m <- regexpr("\\[([^\\]]+)\\]", tok, perl = TRUE)
  if (m[1] == -1) return(character(0))
  inner <- regmatches(tok, m)
  inner <- sub("^\\[", "", sub("\\]$", "", inner))
  syms <- gregexpr("\\b[A-Za-z_][A-Za-z0-9_]*\\b", inner, perl = TRUE)
  if (length(syms) == 0L || syms[[1]][1] == -1) return(character(0))
  unique(regmatches(inner, syms)[[1]])
}

.extract_edges_from_lines <- function(model_lines) {
  model_lines <- .coalesce_lines(model_lines)
  from_vec <- character(); to_vec <- character()

  for (line in model_lines) {
    LHS <- RHS <- NULL
    if (grepl("~", line, fixed = TRUE)) {
      parts <- strsplit(line, "~", fixed = TRUE)[[1]]
      if (length(parts) >= 2) { LHS <- trimws(parts[1]); RHS <- paste(parts[-1], collapse = "~") }
    }
    if (is.null(LHS) && grepl("<-", line, fixed = TRUE)) {
      parts <- strsplit(line, "<-", fixed = TRUE)[[1]]
      if (length(parts) >= 2) { LHS <- trimws(parts[1]); RHS <- paste(parts[-1], collapse = "<-") }
    }
    if (is.null(LHS) || is.null(RHS)) next

    LHS <- sub("\\s+.*$", "", LHS)
    LHSn <- .normalize_index(LHS)

    toks <- .tokenize_symbols(RHS)
    parents <- toks[!toks %in% .ignore_set & !.is_numeric_like(toks)]
    parents <- parents[parents != LHS]
    parents <- unique(.normalize_index(parents))

    if (length(parents)) {
      from_vec <- c(from_vec, rep(LHSn, length(parents)))
      to_vec   <- c(to_vec, parents)
    }
  }

  if (!length(from_vec)) {
    return(data.frame(from=character(0), to=character(0), stringsAsFactors=FALSE))
  }
  unique(data.frame(from = from_vec, to = to_vec, stringsAsFactors = FALSE))
}

.classify_nodes <- function(model_lines, node_names) {
  stoch_lhs <- unique(sub("\\s+.*$","", trimws(gsub("^\\s*([^~]+)~.*$","\\1",
                                                    grep("~", model_lines, value=TRUE, perl=TRUE)))))
  det_lhs   <- unique(sub("\\s+.*$","", trimws(gsub("^\\s*([^<]+)<-.*$","\\1",
                                                    grep("<-", model_lines, value=TRUE, fixed=TRUE)))))

  norm <- function(v) unique(gsub("\\[[^\\]]*\\]", "[]", v, perl=TRUE))
  stoch_set <- norm(stoch_lhs)
  det_set   <- norm(det_lhs)
  ifelse(node_names %in% stoch_set, "stochastic",
         ifelse(node_names %in% det_set, "deterministic", "data/derived"))
}

# Helper: return default if NULL
`%||%` <- function(x, y) if (is.null(x)) y else x

# ---------- Core: build tables ----------
build_bugs_tables <- function(model_text, collapse_lists = TRUE, drop_index_brackets_in_label = TRUE) {
  raw <- unlist(strsplit(model_text, "\n", fixed=TRUE))
  raw <- .strip_comments(raw)
  model_lines <- .extract_model_block(raw)

  loop_df <- .extract_loops(model_lines)
  edges   <- .extract_edges_from_lines(model_lines)

  # Drop edges from loop index vars (e.g., i, t, tmt)
  if (nrow(edges) && nrow(loop_df)) {
    loop_vars <- unique(loop_df$var)
    edges <- edges[!(edges$from %in% loop_vars), , drop = FALSE]
  }

  nodes <- sort(unique(c(edges$from, edges$to)))
  if (!length(nodes)) {
    return(list(
      nodes = data.frame(name=character(), label=character(), type=character(),
                         index_vars=I(list()), parents=I(list()), children=I(list()),
                         n_parents=integer(), n_children=integer(), plates=I(list()),
                         stringsAsFactors=FALSE),
      edges = data.frame(from=character(), to=character(), stringsAsFactors=FALSE)
    ))
  }

  # Index membership map from tokens
  tokens <- .tokenize_symbols(paste(model_lines, collapse=" "))
  tokens <- unique(tokens[!tokens %in% .ignore_set])
  index_map <- setNames(replicate(length(nodes), character(0), simplify = FALSE), nodes)
  for (t in tokens) {
    base <- .normalize_index(t)
    iv   <- .index_vars_in_token(t)
    if (base %in% names(index_map) && length(iv)) {
      index_map[[base]] <- unique(c(index_map[[base]], iv))
    }
  }

  # Node types
  node_types <- .classify_nodes(model_lines, nodes)

  # Parents & children maps
  parents_map  <- tapply(edges$from, edges$to, c, simplify = FALSE) %||% list()
  children_map <- tapply(edges$to, edges$from, c, simplify = FALSE) %||% list()

  # Plate membership per node (labels only; no separate table)
  # Compose human-friendly plate labels like "i in 1:4"
  plate_lookup <- if (nrow(loop_df)) setNames(as.list(loop_df$label), loop_df$var) else list()

  plate_membership <- lapply(nodes, function(vn){
    labs <- character(0)
    if (length(index_map[[vn]])) {
      for (iv in index_map[[vn]]) {
        if (!is.null(plate_lookup[[iv]])) labs <- c(labs, plate_lookup[[iv]])
      }
    }
    unique(labs)
  })

  # Nodes table
  nodes_tbl <- data.frame(
    name  = nodes,                                   # normalized name with []
    label = if (drop_index_brackets_in_label) .strip_all_brackets(nodes) else nodes,
    type  = node_types,
    stringsAsFactors = FALSE
  )
  nodes_tbl$index_vars <- I(index_map[nodes_tbl$name])
  nodes_tbl$parents    <- I(lapply(nodes_tbl$name, function(nm) if (!is.null(parents_map[[nm]])) parents_map[[nm]]  %||%  character(0)))
  nodes_tbl$children   <- I(lapply(nodes_tbl$name, function(nm) if (!is.null(children_map[[nm]])) children_map[[nm]]  %||%  character(0)))
  nodes_tbl$n_parents  <- vapply(nodes_tbl$parents, length, integer(1))
  nodes_tbl$n_children <- vapply(nodes_tbl$children, length, integer(1))
  nodes_tbl$plates     <- I(plate_membership)

  if (isTRUE(collapse_lists)) {
    collapse <- function(x) if (length(x)) paste(x, collapse = ",") else ""
    nodes_tbl$index_vars_chr <- vapply(nodes_tbl$index_vars, collapse, character(1))
    nodes_tbl$parents_chr    <- vapply(nodes_tbl$parents,    collapse, character(1))
    nodes_tbl$children_chr   <- vapply(nodes_tbl$children,   collapse, character(1))
    nodes_tbl$plates_chr     <- vapply(nodes_tbl$plates,     collapse, character(1))
  }

  list(
    nodes = nodes_tbl,
    edges = edges
  )
}

# ---------- Export (nodes & edges ONLY) ----------
export_tables_csv <- function(NodesandEdgesTable, out_prefix = "bugs_graph") {
  dir_to_make <- dirname(out_prefix)
  if (!dir.exists(dir_to_make)) dir.create(dir_to_make, recursive = TRUE, showWarnings = FALSE)

  nodes_csv <- paste0(out_prefix, "_nodes.csv")
  edges_csv <- paste0(out_prefix, "_edges.csv")

  nodes_df <- NodesandEdgesTable$nodes
  if (!all(c("index_vars_chr","parents_chr","children_chr","plates_chr") %in% names(nodes_df))) {
    to_chr <- function(x) vapply(x, function(v) paste(v, collapse=","), character(1))
    nodes_df$index_vars_chr <- to_chr(nodes_df$index_vars)
    nodes_df$parents_chr    <- to_chr(nodes_df$parents)
    nodes_df$children_chr   <- to_chr(nodes_df$children)
    nodes_df$plates_chr     <- to_chr(nodes_df$plates)
  }

  write.csv(
    nodes_df[, c("name","label","type","index_vars_chr","parents_chr","children_chr",
                 "n_parents","n_children","plates_chr")],
    file = nodes_csv, row.names = FALSE
  )
  write.csv(NodesandEdgesTable$edges, file = edges_csv, row.names = FALSE)

  message("Wrote:\n  ", nodes_csv, "\n  ", edges_csv)
  invisible(list(nodes_csv = nodes_csv, edges_csv = edges_csv))
}

# ---------- Robust input ----------
safe_read_model_text <- function(arg) {
  if (identical(arg, "-")) {
    con <- file("stdin", "r")
    on.exit(try(close(con), silent = TRUE))
    txt <- readLines(con, warn = FALSE, encoding = "UTF-8")
    txt <- paste(txt, collapse = "\n")
    if (!grepl("\\bmodel\\s*\\{", txt)) stop("STDIN did not contain a 'model { ... }' block.")
    return(txt)
  }
  if (file.exists(arg)) {
    p <- normalizePath(arg, winslash = "/", mustWork = TRUE)
    txt <- readLines(p, warn = FALSE, encoding = "UTF-8")
    txt <- paste(txt, collapse = "\n")
    if (!grepl("\\bmodel\\s*\\{", txt)) stop("File exists but has no 'model { ... }' block: ", p)
    return(txt)
  }
  if (!grepl("\\bmodel\\s*\\{", arg)) {
    stop("Input '", arg, "' is neither an existing file nor a literal BUGS/JAGS model string containing 'model{'.")
  }
  arg
}

# ---------- Public API ----------
bugs_to_nodes_and_edges <- function(model_text, export_csv = FALSE, out_prefix = "bugs_graph") {
  NodesandEdgesTable <- build_bugs_tables(model_text, collapse_lists = TRUE, drop_index_brackets_in_label = TRUE)
  if (export_csv) export_tables_csv(NodesandEdgesTable, out_prefix = out_prefix)
  NodesandEdgesTable
}

# ---------- Example model (for quick test) ----------
.example_model <- "
model{
  for (tmt in 1:2){
    for (i in 1:4){
      r[tmt,i,1:5] ~ dmulti(pi[tmt,i,1:5], n[tmt,i])
      pi[tmt,i,1:5] ~ ddirch(prior[tmt,i,1:5])
    }
  }
  for (tmt in 1:2){
    for (i in 1:5){ s[tmt,i,1] <- equals(i,1) }
    for (i in 1:4){
      for (t in 2:13){
        s[tmt,i,t] <- inprod(s[tmt,1:4,t-1], pi[tmt,1:4,i])
      }
      E[tmt,i] <- sum(s[tmt,i,2:13])
    }
    E[tmt,5] <- 12 - sum(E[tmt,1:4])
  }
  for (i in 1:5){
    D[i] <- E[1,i] - E[2,i]
    prob[i] <- step(D[i])
  }
}
"

# ---------- CLI ----------
# Usage:
#   Rscript bugs_tables_nodesandedges.R <model_path | '-' | 'literal model text'> [out_prefix]
# Examples:
#   Rscript bugs_tables_nodesandedges.R path/to/model.bug out/my_graph
#   cat path/to/model.bug | Rscript bugs_tables_nodesandedges.R - out/my_graph
#   Rscript bugs_tables_nodesandedges.R "model{ x ~ dnorm(0,1) }" my_graph

#' Parse a BUGS/JAGS model into nodes & edges tables
#'
#' Given a BUGS/JAGS model string, returns two data frames:
#' \code{$nodes} and \code{$edges}. Helpers and plate info are included
#' in \code{$nodes}.
#'
#' @param model_text Character string containing a BUGS/JAGS model
#'   (must include the outer \code{model \{ ... \}} block).
#' @return A list with elements \code{nodes} and \code{edges}.
#' @examples
#' model_txt <- "model{ X ~ dnorm(0,1); Y <- X + 1 }"
#' out <- parse_bugs_model(model_txt)
#' head(out$nodes); head(out$edges)
#' @export
parse_bugs_model <- function(model_text) {
  # Use Shayla's core builder
  bugs_to_nodes_and_edges(model_text, export_csv = FALSE)
}

