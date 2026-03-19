def adapt_result(result, question):

    chart = result.get("chart", {})
    data = result.get("data", [])

    title = question
    summary = result.get("insight")
    sql = result.get("sql")

    if not data:
        return {
            "title": title,
            "summary": "No data available for this query.",
            "sql": sql,
            "kpis": [],
            "charts": []
        }

    chart_type = chart.get("type")

    # KPI
    if chart_type == "kpi" and data:

        key = chart.get("value")
        value = data[0].get(key, 0)

        return {
            "title": title,
            "summary": summary,
            "sql": sql,
            "kpis": [
                {
                    "label": key.replace("_", " ").title(),
                    "value": round(value, 2) if isinstance(value, float) else value,
                    "delta": "",
                    "trend": "neutral",
                    "sub": ""
                }
            ],
            "charts": []
        }

    # PIE
    if chart_type == "pie":

        labels = chart.get("labels")
        values = chart.get("values")

        pie_data = [
            {
                "name": str(row.get(labels)).title(),
                "value": row.get(values)
            }
            for row in data
        ]

        return {
            "title": title,
            "summary": summary,
            "sql": sql,
            "kpis": [],
            "charts": [
                {
                    "id": "c1",
                    "type": "pie",
                    "title": title,
                    "data": pie_data
                }
            ]
        }

    # 🔥 RADAR (FIXED PROPERLY)
    if chart_type == "radar":

        metrics = chart.get("metrics", [])

        radar_data = [
            {
                "metric": m.replace("_", " ").title(),  # ✅ FIX label
                "value": data[0].get(m, 0)
            }
            for m in metrics
        ]

        return {
            "title": title,
            "summary": summary,
            "sql": sql,
            "kpis": [],
            "charts": [
                {
                    "id": "c1",
                    "type": "radar",
                    "title": title,
                    "data": radar_data,
                    "angleKey": "metric",   # ✅ IMPORTANT
                    "valueKey": "value"     # ✅ IMPORTANT
                }
            ]
        }

    # GROUPED BAR
    if chart_type == "grouped_bar":

        x = chart.get("x")
        ys = chart.get("y", [])

        colors = ["#D4A854", "#4F46E5", "#10B981", "#F59E0B"]

        return {
            "title": title,
            "summary": summary,
            "sql": sql,
            "kpis": [],
            "charts": [
                {
                    "id": "c1",
                    "type": "bar",
                    "title": title,
                    "data": data,
                    "xKey": x,
                    "yKeys": [
                        {
                            "key": y,
                            "label": y.replace("_", " ").title(),
                            "color": colors[i % len(colors)]
                        }
                        for i, y in enumerate(ys)
                    ]
                }
            ]
        }

    # SCATTER
    if chart_type == "scatter":

        return {
            "title": title,
            "summary": summary,
            "sql": sql,
            "kpis": [],
            "charts": [
                {
                    "id": "c1",
                    "type": "scatter",
                    "title": title,
                    "data": data,
                    "xKey": chart.get("x"),
                    "yKey": chart.get("y")
                }
            ]
        }

    # LINE
    if chart_type == "line":

        x = chart.get("x")
        y = chart.get("y")

        return {
            "title": title,
            "summary": summary,
            "sql": sql,
            "kpis": [],
            "charts": [
                {
                    "id": "c1",
                    "type": "line",
                    "title": title,
                    "data": data,
                    "xKey": x,
                    "yKeys": [
                        {
                            "key": y,
                            "label": y.replace("_", " ").title(),
                            "color": "#D4A854"
                        }
                    ]
                }
            ]
        }

    # BAR
    if chart_type == "bar":

        x = chart.get("x")
        y = chart.get("y")

        return {
            "title": title,
            "summary": summary,
            "sql": sql,
            "kpis": [],
            "charts": [
                {
                    "id": "c1",
                    "type": "bar",
                    "title": title,
                    "data": data,
                    "xKey": x,
                    "yKeys": [
                        {
                            "key": y,
                            "label": y.replace("_", " ").title(),
                            "color": "#D4A854"
                        }
                    ]
                }
            ]
        }

    return {
        "title": title,
        "summary": summary,
        "sql": sql,
        "kpis": [],
        "charts": []
    }