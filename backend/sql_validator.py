from query_parser import load_schema

def validate_intent(intent):

    schema = load_schema()

    metrics = intent["metrics"]
    aggregation = intent["aggregation"]
    group_by = intent["group_by"]
    filters = intent["filters"]
    order_by = intent["order_by"]
    order = intent["order"]
    limit = intent["limit"]

    valid_aggs = ["AVG", "SUM", "COUNT", "MAX", "MIN"]
    valid_orders = ["ASC", "DESC"]

    # metric validation
    for metric in metrics:
        if metric not in schema["metrics"]:
            raise ValueError(f"Invalid metric: {metric}")

    # aggregation validation
    if aggregation not in valid_aggs:
        raise ValueError(f"Invalid aggregation: {aggregation}")

    # group_by validation
    if isinstance(group_by, list):
        for g in group_by:
            if g not in schema["dimensions"]:
                raise ValueError(f"Invalid group_by: {group_by}")
    elif group_by:
        if group_by not in schema["dimensions"]:
            raise ValueError(f"Invalid group_by: {group_by}")

    # filters validation
    for col in filters.keys():
        if col not in schema["dimensions"]:
            raise ValueError(f"Invalid filter column: {col}")

    # order_by validation
    valid_order_columns = schema["metrics"] + schema["dimensions"]

    if order_by and order_by not in valid_order_columns:
        raise ValueError(f"Invalid order_by: {order_by}")

    # order validation
    if order and order not in valid_orders:
        raise ValueError(f"Invalid order: {order}")

    # limit validation
    if intent["limit"] and not intent["order_by"]:
        raise ValueError("LIMIT requires ORDER BY")

    if limit is not None:
        if not isinstance(limit, int) or limit <= 0:
            raise ValueError("Limit must be a positive integer")

    return True