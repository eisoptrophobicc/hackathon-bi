def format_value(value):

    if isinstance(value, (int, float)):
        return str(value)

    if isinstance(value, str):
        return f"'{value}'"

    return str(value)

def build_filter(filter_obj):

    col = filter_obj.get("column")
    op = filter_obj.get("op")
    value = filter_obj.get("value")

    if col is None or op is None:
        return None

    if op == "=":
        return f"{col} = {format_value(value)}"

    if op in [">", "<", ">=", "<="]:
        return f"{col} {op} {format_value(value)}"

    if op == "LIKE":
        return f"{col} LIKE '%{value}%'"

    if op == "IN":
        if not isinstance(value, list):
            return None
        values = ", ".join(format_value(v) for v in value)
        return f"{col} IN ({values})"

    if op == "BETWEEN":
        if not isinstance(value, list) or len(value) != 2:
            return None
        start, end = value
        return f"{col} BETWEEN {format_value(start)} AND {format_value(end)}"

    return None

def generate_select(metrics, aggregation, group_by):

    select_parts = []

    for g in group_by:
        select_parts.append(g)

    if aggregation and metrics:
        for m in metrics:
            alias = f"{aggregation.lower()}_{m}"
            select_parts.append(f"{aggregation}({m}) AS {alias}")

    elif aggregation == "COUNT" and not metrics:
        select_parts.append("COUNT(*) AS count")

    elif metrics:
        select_parts.extend(metrics)

    else:
        select_parts.append("*")

    return "SELECT " + ", ".join(select_parts)

def generate_where(filters):

    if not filters:
        return ""

    clauses = []

    for f in filters:

        clause = build_filter(f)

        if clause:
            clauses.append(clause)

    if not clauses:
        return ""

    return "WHERE " + " AND ".join(clauses)

def generate_group_by(group_by):

    if not group_by:
        return ""

    return "GROUP BY " + ", ".join(group_by)

def generate_order_by(order_by, order, aggregation, metrics):

    if not order_by:
        return ""

    order = order or "DESC"

    if aggregation and order_by in metrics:
        return f"ORDER BY {aggregation}({order_by}) {order}"

    return f"ORDER BY {order_by} {order}"

def generate_limit(limit):

    if limit is None:
        return ""

    return f"LIMIT {limit}"

def generate_percent_query(plan, table_name):

    metrics = plan.get("metrics", [])
    aggregation = plan.get("aggregation")
    group_by = plan.get("group_by", [])
    filters = plan.get("filters", [])
    order_by = plan.get("order_by")
    order = plan.get("order") or "DESC"
    limit = plan.get("limit")

    where_clause = generate_where(filters)

    if metrics:
        metric = metrics[0]
        base_metric = f"{aggregation}({metric})"
    else:
        base_metric = "COUNT(*)"

    select_cols = ", ".join(group_by)

    order_clause = ""
    if order_by == "percent":
        order_clause = f"ORDER BY percent {order}"
    elif order_by:
        order_clause = f"ORDER BY {order_by} {order}"

    limit_clause = ""
    if limit:
        limit_clause = f"LIMIT {limit}"

    sql = f"""
    SELECT
        {select_cols},
        {base_metric} * 100.0 / SUM({base_metric}) OVER() AS percent
    FROM {table_name}
    {where_clause}
    GROUP BY {select_cols}
    {order_clause}
    {limit_clause}
    """

    return " ".join(sql.split())

def generate_ratio_query(plan, table_name):

    aggregation = plan.get("aggregation") or "SUM"
    group_by = plan.get("group_by", [])
    filters = plan.get("filters", [])
    calc = plan.get("calculation")

    numerator = calc.get("numerator")
    denominator = calc.get("denominator")

    where_clause = generate_where(filters)

    num_sql = f"{aggregation}({numerator})"

    if denominator == "COUNT":
        den_sql = "COUNT(*)"
    else:
        den_sql = f"{aggregation}({denominator})"

    select_parts = []

    for g in group_by:
        select_parts.append(g)

    select_parts.append(
        f"{num_sql} * 1.0 / NULLIF({den_sql},0) AS ratio"
    )

    select_clause = "SELECT " + ", ".join(select_parts)

    group_clause = ""
    if group_by:
        group_clause = "GROUP BY " + ", ".join(group_by)

    sql = f"""
    {select_clause}
    FROM {table_name}
    {where_clause}
    {group_clause}
    """

    return " ".join(sql.split())

def generate_sql(plan, table_name="youtube_videos_staging"):

    calc = plan.get("calculation")

    if calc:

        calc_type = calc.get("type")

        if calc_type == "PERCENT_OF_TOTAL":
            return generate_percent_query(plan, table_name)

        if calc_type == "RATIO":
            return generate_ratio_query(plan, table_name)

    metrics = plan.get("metrics", [])
    aggregation = plan.get("aggregation")
    group_by = plan.get("group_by", [])
    filters = plan.get("filters", [])
    order_by = plan.get("order_by")
    order = plan.get("order")
    limit = plan.get("limit")

    select_clause = generate_select(metrics, aggregation, group_by)

    where_clause = generate_where(filters)

    group_clause = generate_group_by(group_by)

    order_clause = generate_order_by(order_by, order, aggregation, metrics)

    limit_clause = generate_limit(limit)

    parts = [
        select_clause,
        f"FROM {table_name}",
        where_clause,
        group_clause,
        order_clause,
        limit_clause
    ]

    sql = " ".join(part for part in parts if part)

    return sql