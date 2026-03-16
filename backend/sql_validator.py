from query_parser import load_schema


def validate_intent(intent):

    if not isinstance(intent, dict):
        raise ValueError("Intent must be a dictionary")

    schema = load_schema()

    columns = schema["columns"]

    metrics = intent.get("metrics", [])
    aggregation = intent.get("aggregation")
    group_by = intent.get("group_by", [])
    filters = intent.get("filters", [])
    order_by = intent.get("order_by")
    order = intent.get("order")
    limit = intent.get("limit")

    valid_aggs = ["AVG", "SUM", "COUNT", "MAX", "MIN"]
    valid_orders = ["ASC", "DESC"]

    # extract schema roles
    metric_columns = [
        c for c, m in columns.items() if m["role"] == "metric"
    ]

    dimension_columns = [
        c for c, m in columns.items() if m["role"] == "dimension"
    ]

    datetime_columns = [
        c for c, m in columns.items() if m["role"] == "datetime"
    ]

    valid_columns = metric_columns + dimension_columns + datetime_columns

    # metric validation
    for metric in metrics:

        if aggregation == "COUNT":
            # allow id columns for counting
            if metric not in metric_columns and metric not in columns:
                raise ValueError(f"Invalid metric: {metric}")

        else:
            if metric not in metric_columns:
                raise ValueError(f"Invalid metric: {metric}")

    # aggregation validation
    if aggregation and aggregation not in valid_aggs:
        raise ValueError(f"Invalid aggregation: {aggregation}")

    # group_by validation
    for g in group_by:
        if g not in dimension_columns:
            raise ValueError(f"Invalid group_by column: {g}")

    # filter validation
    for f in filters:

        col = f.get("column")
        op = f.get("op")

        if col not in valid_columns:
            raise ValueError(f"Invalid filter column: {col}")

        if op not in ["=", "IN", ">", "<", ">=", "<=", "BETWEEN", "LIKE"]:
            raise ValueError(f"Invalid filter operator: {op}")

    # order_by validation
    if order_by and order_by not in valid_columns:
        raise ValueError(f"Invalid order_by column: {order_by}")

    # order validation
    if order and order not in valid_orders:
        raise ValueError(f"Invalid order direction: {order}")

    # limit validation
    if limit is not None:

        if not isinstance(limit, int) or limit <= 0:
            raise ValueError("Limit must be positive integer")

        if not order_by:
            raise ValueError("LIMIT requires ORDER BY")

    return True