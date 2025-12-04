# ================================================================
# 1) Self-contained BUGS/JAGS parser (helpers inside)
# ================================================================
parse_bugs_to_nodes_edges <- function(input, is_file = FALSE) {
  skip_edge_targets <- character()
  read_input <- function(x, is_file) {
    if (isTRUE(is_file)) {
      if (!file.exists(x)) stop(sprintf("File not found: %s", x), call. = FALSE)
      readLines(x, warn = FALSE, encoding = "UTF-8")
    } else if (length(x) == 1L) unlist(strsplit(x, "\n", fixed = TRUE)) else x
  }
  strip_comments <- function(lines) {
    strip_line_comment <- function(line) {
      if (is.na(line) || !nzchar(line)) return("")
      line <- gsub("\r", "", line, fixed = TRUE)
      if (!grepl("#", line, fixed = TRUE)) return(line)
      chars <- strsplit(line, "", fixed = TRUE)[[1]]
      in_single <- FALSE
      in_double <- FALSE
      escape_next <- FALSE
      for (idx in seq_along(chars)) {
        ch <- chars[[idx]]
        if (escape_next) {
          escape_next <- FALSE
          next
        }
        if (ch == "\\") {
          escape_next <- TRUE
          next
        }
        if (ch == "'" && !in_double) {
          in_single <- !in_single
          next
        }
        if (ch == "\"" && !in_single) {
          in_double <- !in_double
          next
        }
        if (ch == "#" && !in_single && !in_double) {
          if (idx == 1) return("")
          return(substr(line, 1, idx - 1))
        }
      }
      line
    }
    out <- vapply(lines, strip_line_comment, character(1), USE.NAMES = FALSE)
    trim <- trimws(out)
    trim[nzchar(trim)]
  }
  extract_model_block <- function(lines) {
    txt <- paste(lines, collapse = "\n")
    mstart <- regexpr("\\bmodel\\s*\\{", txt, perl = TRUE)
    if (mstart[1] == -1) stop("No 'model { ... }' block found.", call. = FALSE)
    start <- as.integer(mstart) + attr(mstart, "match.length")
    depth <- 1L; i <- start; end_pos <- NA_integer_
    while (i <= nchar(txt)) {
      ch <- substr(txt, i, i)
      if (ch == "{") depth <- depth + 1L
      if (ch == "}") { depth <- depth - 1L; if (depth == 0L) { end_pos <- i - 1L; break } }
      i <- i + 1L
    }
    if (is.na(end_pos)) stop("Unbalanced braces in model block.", call. = FALSE)
    substr(txt, start, end_pos)
  }
  is_numtok <- function(x) grepl("^[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$", x)
  bracket_func_names <- c("sign")
  function_node_names <- c("mean")
  make_logit_proxy_label <- function(label) {
    lab <- trimws(label)
    m <- regexec("^([A-Za-z][A-Za-z0-9_\\.]*)\\s*(\\[[^\\]]+\\])?$", lab, perl = TRUE)
    mm <- regmatches(lab, m)[[1]]
    idx <- if (length(mm) >= 3 && nzchar(mm[3])) mm[3] else ""
    paste0("eta", idx)
  }
  rewrite_bracket_tokens <- function(tokens) {
    if (!length(tokens)) return(tokens)
    for (i in seq_along(tokens)) {
      tok <- tokens[[i]]
      m <- regexec("^([A-Za-z][A-Za-z0-9_\\.]*)\\[(.*)\\]$", tok, perl = TRUE)
      mm <- regmatches(tok, m)[[1]]
      if (length(mm) == 3) {
        base <- trimws(mm[2])
        if (base %in% bracket_func_names) {
          inner <- trimws(mm[3])
          if (grepl("\\[", inner) && !grepl("\\]$", inner)) inner <- paste0(inner, "]")
          tokens[[i]] <- inner
        }
      }
    }
    tokens
  }
  tok_vars <- function(expr) {
    expr <- gsub("\"[^\"]*\"", "", expr)
    fun_tokens <- character()
    if (length(function_node_names)) {
      pattern <- sprintf("(%s)\\s*\\(([^()]*)\\)", paste(function_node_names, collapse = "|"))
      m_fun <- gregexpr(pattern, expr, perl = TRUE)
      if (m_fun[[1]][1] != -1) {
        fun_tokens <- trimws(regmatches(expr, m_fun)[[1]])
      }
    }
    m <- gregexpr("([A-Za-z][A-Za-z0-9_\\.]*\\[[^\\]]*\\])|([A-Za-z][A-Za-z0-9_\\.]*)", expr, perl = TRUE)
    if (m[[1]][1] == -1) {
      base_tokens <- character()
    } else {
      base_tokens <- unique(regmatches(expr, m)[[1]])
    }
    rewrite_bracket_tokens(unique(c(fun_tokens, base_tokens)))
  }
  has_slice_token <- function(tokens) grepl("\\[[^\\]]*:", tokens, perl = TRUE)
  drop_slice_tokens <- function(tokens) tokens[!has_slice_token(tokens)]
  slice_base_symbol <- function(token) trimws(sub("\\[.*$", "", token))
  slice_as_target_indices <- function(token, target_label) {
    if (!has_slice_token(token)) return(token)
    base <- slice_base_symbol(token)
    if (!nzchar(target_label) || !grepl("\\[", target_label)) return(base)
    idx <- sub("^[^\\[]*\\[", "", target_label)
    idx <- sub("\\]$", "", idx)
    sprintf("%s[%s]", base, idx)
  }
  normalize_slice_to_base <- function(tokens) {
    out <- tokens
    is_slice <- has_slice_token(tokens)
    out[is_slice] <- slice_base_symbol(tokens[is_slice])
    out
  }
  token_base <- function(tokens) trimws(gsub("\\[.*$", "", tokens))
  prettify_label <- function(label) {
    lab <- gsub("\\s+", " ", label)
    lab <- gsub("\\[\\s*", "[", lab)
    lab <- gsub("\\s*\\]", "]", lab)
    lab <- gsub("\\s*,\\s*", ",", lab)
    lab <- gsub("\\s*:\\s*", ":", lab)
    trimws(lab)
  }
  format_loop_range <- function(expr) {
    rng <- trimws(expr)
    if (!nzchar(rng)) return("")
    gsub("\\s+", "", rng, perl = TRUE)
  }
  make_loop_plate_label <- function(iterator, range_expr) {
    rng <- format_loop_range(range_expr)
    if (!nzchar(iterator) || !nzchar(rng)) return("")
    sprintf("for(%s in %s)", iterator, rng)
  }
  normalize_model_text <- function(txt) {
    txt <- gsub("(?<![;\\n])\\s+((?:[A-Za-z][A-Za-z0-9_\\.]*)(?:\\s*\\[[^\\]]+\\])?\\s*(?:<-|~))", "\n\\1", txt, perl = TRUE)
    txt <- gsub("([+\\-*/])\\s*\\n\\s*", "\\1 ", txt, perl = TRUE)
    gsub("\\n\\s*([+\\-*/])\\s*", " \\1 ", txt, perl = TRUE)
  }
  id_of <- function(label) {
    if (is.na(label) || !nzchar(label)) return("")
    if (grepl("^mean\\s*\\(\\s*([A-Za-z][A-Za-z0-9_\\.]*)\\s*\\[\\s*\\]\\s*\\)\\s*$", label, perl = TRUE)) {
      base <- sub("^mean\\s*\\(\\s*([A-Za-z][A-Za-z0-9_\\.]*)\\s*\\[.*$", "\\1", label, perl = TRUE)
      return(paste0(base, "_bar"))
    }
    lab <- gsub("\\s+", "", label)
    lab <- gsub("\\[\\s*([^\\]]*?)\\s*\\]", "_\\1", lab, perl = TRUE)  # [i,j] -> _i,j (allow empty)
    lab <- gsub(",", "", lab, perl = TRUE)                             # _i,j -> _ij
    gsub("\\.", "_", lab, perl = TRUE)                                 # tau.c -> tau_c
  }
  # ---- target for LHS, e.g. log(p[i,j]) -> p[i,j] ----
  lhs_main_var <- function(lhs) {
    lhs_clean <- trimws(lhs)
    m <- regexec("^([A-Za-z][A-Za-z0-9_\\.]*)\\s*\\((.*)\\)$", lhs_clean, perl = TRUE)
    mm <- regmatches(lhs_clean, m)[[1]]
    if (length(mm) == 3) {
      arg_str <- mm[3]
      tok <- tok_vars(arg_str)
      if (length(tok)) return(tok[1])
    }
    tok <- tok_vars(lhs_clean)
    if (length(tok)) tok[1] else NA_character_
  }
  detect_loops <- function(model_txt) {
    ms <- gregexpr("for\\s*\\(\\s*([A-Za-z][A-Za-z0-9_\\.]*)\\s+in\\s+([^\\)]*)\\)", model_txt, perl = TRUE)
    if (ms[[1]][1] == -1) return(list())
    spans <- regmatches(model_txt, ms)[[1]]
    out <- list()
    for (seg in spans) {
      it  <- sub("^for\\s*\\(\\s*([A-Za-z][A-Za-z0-9_\\.]*)\\s+in\\s+([^\\)]*)\\)$", "\\1", seg, perl = TRUE)
      rng <- sub("^for\\s*\\(\\s*([A-Za-z][A-Za-z0-9_\\.]*)\\s+in\\s+([^\\)]*)\\)$", "\\2", seg, perl = TRUE)
      bounds <- tok_vars(rng)
      plate_label <- make_loop_plate_label(it, rng)
      out[[length(out)+1L]] <- list(iterator=it, bounds=bounds, plate_label=plate_label)
    }
    out
  }
  edges_from_statements <- function(statements, type_lookup, parent_blacklist_ids, iterators, loop_bounds, logit_proxy_ids = NULL) {
    ef <- et <- ek <- character()
    for (s in statements) {
      if (!grepl("~|<-", s)) next
      op <- if (grepl("~", s)) "~" else "<-"
      parts <- strsplit(s, op)[[1]]
      lhs <- trimws(parts[1]); rhs <- paste(parts[-1], collapse = op)
      is_logit <- grepl("^logit\\s*\\(", lhs, perl = TRUE)
      target_label <- lhs_main_var(lhs)
      target_label <- canonicalize_token(target_label)
      if (!is.na(target_label) && target_label %in% skip_edge_targets) next
      if (is.na(target_label)) next
      original_target_id <- id_of(target_label)
      if (!nzchar(original_target_id)) next
      if (!original_target_id %in% names(type_lookup)) next
      target_type <- type_lookup[[original_target_id]]
      if (!is.null(target_type) && target_type == "stochastic" && op == "<-") next
      target_id <- original_target_id
      if (is_logit && length(logit_proxy_ids) && original_target_id %in% names(logit_proxy_ids)) {
        target_id <- logit_proxy_ids[[original_target_id]]
      }
      if (!target_id %in% names(type_lookup)) next
      rhs_tok <- tok_vars(rhs)
      if (length(rhs_tok)) {
        rhs_tok <- vapply(rhs_tok, slice_as_target_indices, character(1), target_label = target_label)
      }
      parents <- rhs_tok[rhs_tok != target_label]
      parents <- canonicalize_token(parents)
      parents <- parents[!is_numtok(parents)]
      parents <- parents[!(token_base(parents) %in% reserved)]
      parent_ids <- vapply(parents, id_of, "")
      drop_ids <- unique(c(
        parent_blacklist_ids,
        vapply(loop_bounds, id_of, ""),
        iterators,
        paste0("plate_", iterators)
      ))
      keep <- !(parent_ids %in% drop_ids)
      if (any(keep)) {
        ef <- c(ef, parent_ids[keep])
        et <- c(et, rep(target_id, sum(keep)))
        edge_kind <- if (op == "<-") "deterministic" else "stochastic"
        ek <- c(ek, rep(edge_kind, sum(keep)))
      }
    }
    if (!length(ef)) {
      data.frame(from=character(),to=character(),kind=character(),stringsAsFactors=FALSE)
    } else {
      edges_df <- data.frame(from=ef,to=et,kind=ek,stringsAsFactors=FALSE)
      edges_df[!duplicated(edges_df), , drop = FALSE]
    }
  }

  # -------- pipeline --------
  raw <- read_input(input, is_file)
  lines <- strip_comments(raw)
  model_txt <- extract_model_block(lines)
  model_txt <- normalize_model_text(model_txt)
  statements <- trimws(unlist(strsplit(model_txt, "[;\n]")))
  statements <- statements[nzchar(statements)]

  loops <- detect_loops(model_txt)
  iterators <- unique(vapply(loops, function(x)x$iterator,""))
  loop_bounds <- unique(unlist(lapply(loops, function(x)x$bounds)))
  loop_plate_map <- if (length(iterators)) setNames(rep("", length(iterators)), iterators) else character()
  if (length(loops)) {
    for (lp in loops) {
      if (!is.null(lp$iterator) && nzchar(lp$iterator) && !is.null(lp$plate_label)) {
        loop_plate_map[[lp$iterator]] <- lp$plate_label
      }
    }
  }

  all_tokens <- unique(unlist(lapply(statements, tok_vars)))
  reserved <- c("for","in","if","else","while","model","step","pow","log","sqrt","exp","abs","sign","E","e")
  fn_calls <- unique(unlist(lapply(statements,function(s){
    m<-gregexpr("\\b([A-Za-z][A-Za-z0-9_\\.]*)\\s*\\(",s,perl=TRUE)
    if(m[[1]][1]==-1)character()else sub("\\($","",regmatches(s,m)[[1]])
  })))
  logit_proxy_info <- data.frame(target = character(), proxy = character(), stringsAsFactors = FALSE)
  if (length(statements)) {
    for (s in statements) {
      if (!grepl("<-", s, fixed = TRUE)) next
      parts <- strsplit(s, "<-", fixed = TRUE)[[1]]
      if (length(parts) < 2) next
      lhs <- trimws(parts[1])
      if (!grepl("^logit\\s*\\(", lhs, perl = TRUE)) next
      target_label <- lhs_main_var(lhs)
      if (is.na(target_label)) next
      proxy_label <- make_logit_proxy_label(target_label)
      logit_proxy_info <- rbind(logit_proxy_info,
                                data.frame(target = target_label, proxy = proxy_label,
                                           stringsAsFactors = FALSE))
    }
    if (nrow(logit_proxy_info)) {
      logit_proxy_info <- unique(logit_proxy_info)
    }
  }

  # ---- base symbols BEFORE dropping constant init-only nodes ----
  base_syms <- setdiff(all_tokens, unique(c(fn_calls, reserved, loop_bounds)))
  base_syms <- drop_slice_tokens(base_syms)
  base_syms <- base_syms[!is_numtok(base_syms)]
  base_syms <- base_syms[!(token_base(base_syms) %in% reserved)]
  base_syms <- unique(c(base_syms, loop_bounds))
  if (nrow(logit_proxy_info)) {
    base_syms <- unique(c(base_syms, logit_proxy_info$proxy))
  }
  base_syms <- base_syms[!(token_base(base_syms) %in% reserved)]
  base_syms <- unique(c(base_syms, loop_bounds))
  mean_node_args <- character()
  if (length(base_syms)) {
    mean_tokens <- base_syms[grepl("^mean\\s*\\(", base_syms, perl = TRUE)]
    if (length(mean_tokens)) {
      mean_node_args <- setNames(
        trimws(sub("^mean\\s*\\((.*)\\)\\s*$", "\\1", mean_tokens, perl = TRUE)),
        mean_tokens
      )
    }
  }
  base_syms <- base_syms[!(token_base(base_syms) %in% reserved)]
  base_syms <- unique(c(base_syms, loop_bounds))
  if (nrow(logit_proxy_info)) {
    base_syms <- unique(c(base_syms, logit_proxy_info$proxy))
  }
  # keep all identifiers, including those defined only by constants

  manual_aliases <- c("a0" = "alpha0")
  score_token_variant <- function(tok) {
    if (!grepl("[", tok, fixed = TRUE)) return(1000L - nchar(tok))
    bracket <- sub("^[^\\[]*\\[", "", tok, perl = TRUE)
    bracket <- sub("\\]$", "", bracket, perl = TRUE)
    terms <- unlist(strsplit(bracket, ",", fixed = TRUE))
    if (!length(terms)) return(0L - nchar(tok))
    terms <- trimws(terms)
    simplified <- gsub("[^A-Za-z0-9_\\.]", "", terms, perl = TRUE)
    iterator_hits <- sum(simplified %in% iterators)
    simple_terms <- sum(terms == simplified & nzchar(terms))
    penalty_complex <- sum(terms != simplified)
    iterator_hits * 100 + simple_terms * 10 - penalty_complex * 5 - nchar(tok)
  }
  # ---- canonicalize bracket variants ----
  base_names <- sub("\\[.*$", "", base_syms)
  canon_lookup <- setNames(base_syms, base_syms)
  canonical_tokens <- character()
  unique_bases <- unique(base_names)
  base_canonical <- setNames(rep("", length(unique_bases)), unique_bases)
  for (bn in unique_bases) {
    candidates <- base_syms[base_names == bn]
    score <- sapply(candidates, score_token_variant)
    order_idx <- order(-score, -nchar(candidates))
    chosen <- candidates[order_idx[1L]]
    canonical_tokens <- c(canonical_tokens, chosen)
    canon_lookup[candidates] <- chosen
    base_canonical[[bn]] <- chosen
  }
  slice_tokens <- all_tokens[has_slice_token(all_tokens)]
  if (length(slice_tokens)) {
    for (tok in slice_tokens) {
      base <- sub("\\[.*$", "", tok)
      chosen <- base_canonical[[base]]
      if (!is.na(chosen) && nzchar(chosen)) {
        canon_lookup[[tok]] <- chosen
      }
    }
  }
  canonical_tokens <- unique(canonical_tokens)
  if (length(manual_aliases)) {
    for (nm in names(manual_aliases)) {
      tgt <- manual_aliases[[nm]]
      if (nm %in% names(canon_lookup) && tgt %in% canon_lookup) {
        canon_lookup[[nm]] <- tgt
      }
    }
  }
  canonical_tokens <- unique(unname(canon_lookup[canonical_tokens]))
  canonicalize_token <- function(tokens) {
    if (!length(tokens)) return(tokens)
    mapped <- canon_lookup[tokens]
    mapped[is.na(mapped)] <- tokens[is.na(mapped)]
    unname(mapped)
  }
  orig_tokens <- base_syms
  base_syms <- canonical_tokens
  logit_proxy_lookup <- data.frame(target = character(), proxy = character(), stringsAsFactors = FALSE)
  if (nrow(logit_proxy_info)) {
    canon_targets <- canonicalize_token(logit_proxy_info$target)
    canon_proxies <- canonicalize_token(logit_proxy_info$proxy)
    keep <- !(is.na(canon_targets) | is.na(canon_proxies))
    if (any(keep)) {
      logit_proxy_lookup <- unique(data.frame(
        target = canon_targets[keep],
        proxy = canon_proxies[keep],
        stringsAsFactors = FALSE
      ))
    }
  }
  mean_node_info <- list()
  if (length(mean_node_args)) {
    canon_mean_labels <- canonicalize_token(names(mean_node_args))
    names(mean_node_args) <- canon_mean_labels
    mean_node_info <- lapply(seq_along(mean_node_args), function(idx) {
      list(label = names(mean_node_args)[idx],
           args = mean_node_args[[idx]])
    })
  }

  # ---- classify nodes / build tables ----
  types <- setNames(rep("data", length(base_syms)), base_syms)
  for (s in statements) {
    if (grepl("~", s, fixed = TRUE)) {
      lhs <- trimws(strsplit(s, "~", fixed = TRUE)[[1]][1])
      target <- canonicalize_token(lhs_main_var(lhs))
      if (!is.na(target) && target %in% names(types)) {
        types[[target]] <- "stochastic"
      }
    } else if (grepl("<-", s, fixed = TRUE)) {
      lhs <- trimws(strsplit(s, "<-", fixed = TRUE)[[1]][1])
      target <- canonicalize_token(lhs_main_var(lhs))
      if (!is.na(target) && target %in% names(types) && types[[target]] != "stochastic") {
        types[[target]] <- "deterministic"
      }
    }
  }
  if (nrow(logit_proxy_lookup)) {
    proxy_lbls <- logit_proxy_lookup$proxy
    proxy_lbls <- proxy_lbls[proxy_lbls %in% names(types)]
    if (length(proxy_lbls)) types[proxy_lbls] <- "deterministic"
  }
  if (length(mean_node_info)) {
    mean_labels <- vapply(mean_node_info, function(x) x$label, "")
    mean_labels <- mean_labels[mean_labels %in% names(types)]
    if (length(mean_labels)) types[mean_labels] <- "deterministic"
  }
  if (nrow(logit_proxy_lookup)) {
    proxy_lbls <- logit_proxy_lookup$proxy
    proxy_lbls <- proxy_lbls[proxy_lbls %in% names(types)]
    if (length(proxy_lbls)) types[proxy_lbls] <- "deterministic"
  }
  if (length(mean_node_info)) {
    mean_labels <- vapply(mean_node_info, function(x) x$label, "")
    mean_labels <- mean_labels[mean_labels %in% names(types)]
    if (length(mean_labels)) types[mean_labels] <- "deterministic"
  }
  display_labels <- vapply(base_syms, prettify_label, character(1))
  plates_vec <- vapply(base_syms, function(x) {
    m <- regexec("^([A-Za-z][A-Za-z0-9_\\.]*)\\[([^\\]]+)\\]$", x, perl = TRUE)
    mm <- regmatches(x, m)[[1]]
    if (length(mm) != 3) return(NA_character_)
    idx <- strsplit(mm[3], ",", fixed = TRUE)[[1]]
    idx <- trimws(idx)
    idx <- gsub("^.*?:", "", idx)
    idx <- gsub("[^A-Za-z0-9_\\.]", "", idx)
    idx <- idx[!is_numtok(idx) & nzchar(idx)]
    if (!length(idx)) return(NA_character_)
    idx <- unique(idx)
    plate_labels <- loop_plate_map[idx]
    plate_labels <- plate_labels[!is.na(plate_labels) & nzchar(plate_labels)]
    if (!length(plate_labels)) return(NA_character_)
    paste(plate_labels, collapse = "/")
  }, character(1))
  plates_vec[plates_vec == ""] <- NA_character_
  ids <- vapply(base_syms, id_of, "")

  nodes_var <- data.frame(id=ids,label=display_labels,type=unname(types),
                          plates=plates_vec,stringsAsFactors=FALSE)
  nodes_index <- if(length(iterators))
    data.frame(id=iterators,label=iterators,type="index",plates=NA_character_,stringsAsFactors=FALSE)
  else data.frame(id=character(),label=character(),type=character(),plates=character(),stringsAsFactors=FALSE)
  nodes_plate <- if(length(iterators))
    data.frame(id=paste0("plate_",iterators),label=paste(iterators,"plate"),
               type="plate",plates=NA_character_,stringsAsFactors=FALSE)
  else data.frame(id=character(),label=character(),type=character(),plates=character(),stringsAsFactors=FALSE)

  nodes_all <- rbind(nodes_index, nodes_plate, nodes_var)
  rows_keep <- !duplicated(nodes_all$id)
  nodes_all <- nodes_all[rows_keep, , FALSE]
  type_lookup <- setNames(nodes_all$type, nodes_all$id)

  # Blacklist function names, reserved words, and loop bounds as parents
  parent_blacklist_ids <- vapply(unique(c(fn_calls, reserved, loop_bounds)), id_of, "")
  logit_proxy_ids <- NULL
  if (nrow(logit_proxy_lookup)) {
    tgt_ids <- vapply(logit_proxy_lookup$target, id_of, "")
    proxy_ids <- vapply(logit_proxy_lookup$proxy, id_of, "")
    keep <- tgt_ids %in% names(type_lookup) & proxy_ids %in% names(type_lookup)
    if (any(keep)) {
      logit_proxy_ids <- setNames(proxy_ids[keep], tgt_ids[keep])
    }
  }
  edges <- edges_from_statements(statements, type_lookup, parent_blacklist_ids, iterators, loop_bounds, logit_proxy_ids)
  if (length(logit_proxy_ids)) {
    proxy_ids <- unname(logit_proxy_ids)
    target_ids <- names(logit_proxy_ids)
    parents_map <- if (nrow(edges)) split(edges$from, edges$to) else list()
    collapse_edges <- data.frame(from=character(), to=character(), kind=character(), stringsAsFactors = FALSE)
    for (idx in seq_along(proxy_ids)) {
      proxy <- proxy_ids[[idx]]
      target <- target_ids[[idx]]
      parents <- parents_map[[proxy]]
      if (!is.null(parents) && length(parents)) {
        collapse_edges <- rbind(collapse_edges,
                                data.frame(from = parents,
                                           to = rep(target, length(parents)),
                                           kind = rep("deterministic", length(parents)),
                                           stringsAsFactors = FALSE))
      }
      if (nrow(edges)) {
        keep_rows <- edges$from != proxy & edges$to != proxy
        edges <- edges[keep_rows, , drop = FALSE]
      }
      if (nrow(nodes_all)) {
        nodes_all <- nodes_all[nodes_all$id != proxy, , drop = FALSE]
      }
    }
    if (nrow(collapse_edges)) {
      edges <- rbind(edges, collapse_edges)
    }
  }
  if(nrow(edges)) edges <- edges[order(edges$to,edges$from), , FALSE]
  if (length(mean_node_info)) {
    mean_edges <- data.frame(from=character(), to=character(), kind=character(), stringsAsFactors=FALSE)
    for (entry in mean_node_info) {
      if (is.null(entry$label) || !nzchar(entry$label)) next
      parent_tokens <- canonicalize_token(tok_vars(entry$args))
      parent_ids <- vapply(parent_tokens, id_of, "")
      parent_ids <- parent_ids[parent_ids %in% names(type_lookup)]
      if (!length(parent_ids)) next
      target_id <- id_of(entry$label)
      target_id <- target_id[target_id %in% names(type_lookup)]
      if (!length(target_id)) next
      mean_edges <- rbind(mean_edges,
                          data.frame(from = parent_ids,
                                     to = rep(target_id, length(parent_ids)),
                                     kind = rep("deterministic", length(parent_ids)),
                                     stringsAsFactors = FALSE))
    }
    if (nrow(mean_edges)) {
      edges <- rbind(edges, mean_edges)
    }
  }
  if (nrow(edges)) {
    edges <- edges[!duplicated(edges), , drop = FALSE]
  }

  if (nrow(nodes_all)) {
    nodes_all$type[!(nodes_all$type %in% c("index", "plate"))] <- "node"
  }

  if (nrow(nodes_all)) {
    internal_ids <- nodes_all$id
    final_ids <- internal_ids
    non_structural <- !(nodes_all$type %in% c("index", "plate"))
    final_ids[non_structural] <- nodes_all$label[non_structural]
    id_lookup_final <- setNames(final_ids, internal_ids)
    nodes_all$id <- final_ids
    if (nrow(edges)) {
      mapped_from <- id_lookup_final[edges$from]
      mapped_to <- id_lookup_final[edges$to]
      edges$from <- ifelse(is.na(mapped_from), edges$from, mapped_from)
      edges$to <- ifelse(is.na(mapped_to), edges$to, mapped_to)
    }
  }

  nodes_df <- data.frame(
    label = as.character(nodes_all$id),
    type = as.character(nodes_all$type),
    plates = ifelse(is.na(nodes_all$plates), "", as.character(nodes_all$plates)),
    x = rep(0, nrow(nodes_all)),
    y = rep(0, nrow(nodes_all)),
    stringsAsFactors = FALSE
  )

  edges_df <- if (nrow(edges)) {
    data.frame(
      from = as.character(edges$from),
      to = as.character(edges$to),
      kind = as.character(edges$kind),
      stringsAsFactors = FALSE
    )
  } else {
    data.frame(from = character(), to = character(), kind = character(), stringsAsFactors = FALSE)
  }

  return(list(nodes = nodes_df, edges = edges_df))
}

#' Parse a BUGS/JAGS model into DAG nodes and edges
#'
#' @param model Character string or file path
#' @param is_file Logical, TRUE if model is a file path
#' @return A list with elements: nodes and edges
#' @export
parse_bugs_model <- function(model, is_file = FALSE) {
  parse_bugs_to_nodes_edges(model, is_file = is_file)
}


