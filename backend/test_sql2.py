from run_query import run_query

# First query
print("\n--- QUERY 1 ---")
res1 = run_query("average views by region", mode="new")
print(res1)

# Follow-up query
print("\n--- FOLLOWUP ---")
res2 = run_query("show only india", mode="continue")
print(res2)

# Another follow-up
print("\n--- FOLLOWUP 2 ---")
res3 = run_query("top 3", mode="continue")
print(res3)

# New query again
print("\n--- NEW QUERY ---")
res4 = run_query("total likes by category", mode="new")
print(res4)