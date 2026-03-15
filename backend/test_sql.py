from run_query import run_query

question = "Show me the monthly sales revenue for Q3 broken down by region and highlight the top-performing product category"

df = run_query(question)

print(df)