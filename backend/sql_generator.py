def generate_sql(intent, table_name="youtube_videos_staging"):

    metrics = intent["metrics"]
    aggregation = intent["aggregation"]
    group_by = intent["group_by"]
    filters = intent["filters"]
    order_by = intent["order_by"]
    order = intent["order"]
    limit = intent["limit"]

    agg_columns = [f"{aggregation}({m})" for m in metrics]

    # SELECT
    if group_by:
        if isinstance(group_by, list):
            group_cols = ", ".join(group_by)
        else:
            group_cols = group_by
        select_clause = f"{group_cols}, " + ", ".join(agg_columns)
    else:
        select_clause = ", ".join(agg_columns)

    query = f"SELECT {select_clause} FROM {table_name}"

    # WHERE
    if filters:
        conditions = []

        for col, value in filters.items():
            if isinstance(value, str):
                conditions.append(f"LOWER({col}) = LOWER('{value}')")
            else:
                conditions.append(f"{col} = {value}")

        where_clause = " AND ".join(conditions)
        query += f" WHERE {where_clause}"

    # GROUP BY
    if group_by:
        if isinstance(group_by, list):
            query += f" GROUP BY {','.join(group_by)}"
        else:
            query += f" GROUP BY {group_by}"

    # ORDER BY
    if order_by and metrics:

        metric_for_order = metrics[0]

        if group_by:
            query += f" ORDER BY {aggregation}({metric_for_order}) {order}"
        else:
            query += f" ORDER BY {metric_for_order} {order}"

    # LIMIT
    if limit:
        query += f" LIMIT {limit}"

    return query