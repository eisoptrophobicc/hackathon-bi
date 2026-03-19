def detect_chart(data):

    if not data:
        return {"type": "table"}

    row = data[0]

    numeric = []
    categorical = []

    # 🔥 FIX: proper type detection (handles bool + binary)
    for col, val in row.items():

        unique_vals = set(r[col] for r in data if col in r)

        if isinstance(val, bool) or unique_vals <= {0, 1}:
            categorical.append(col)
        elif isinstance(val, (int, float)):
            numeric.append(col)
        else:
            categorical.append(col)

    # KPI (single metric)
    if len(data) == 1 and len(numeric) == 1:
        return {
            "type": "kpi",
            "value": numeric[0]
        }

    # Time series
    if "timestamp" in row or "date" in row:
        x = "timestamp" if "timestamp" in row else "date"
        if numeric:
            return {
                "type": "line",
                "x": x,
                "y": numeric[0]
            }

    # PIE detection (distribution)
    if len(categorical) == 1 and len(numeric) == 1:

        num_col = numeric[0]

        name = num_col.lower()

        # if column name suggests percent/share
        if any(k in name for k in ["percent", "ratio", "share", "distribution"]):
            return {
                "type": "pie",
                "labels": categorical[0],
                "values": num_col
            }

        # if numbers sum roughly to 100
        total = sum(
            r[num_col] for r in data
            if isinstance(r[num_col], (int, float))
        )

        if 95 <= total <= 105:
            return {
                "type": "pie",
                "labels": categorical[0],
                "values": num_col
            }

    # Radar
    if len(data) == 1 and len(numeric) >= 3:
        return {
            "type": "radar",
            "metrics": numeric
        }

    # Grouped bar
    if len(categorical) == 1 and len(numeric) > 1:
        return {
            "type": "grouped_bar",
            "x": categorical[0],
            "y": numeric
        }

    # Bar chart
    if len(categorical) == 1 and len(numeric) == 1:
        return {
            "type": "bar",
            "x": categorical[0],
            "y": numeric[0]
        }

    # 🔥 FIX: scatter should be LAST (lowest priority)
    if len(numeric) >= 2:
        return {
            "type": "scatter",
            "x": numeric[0],
            "y": numeric[1]
        }

    return {"type": "table"}