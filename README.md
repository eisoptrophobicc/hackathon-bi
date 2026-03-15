# Conversational BI Backend

Python backend that converts **natural language questions into SQL queries** and executes them on a dataset.

---

## Setup

Clone the repository

```
git clone <repo-url>
cd HACK-A-DON/backend
```

Install dependencies

```
pip install pandas requests chardet numpy
```

---

## Download Dataset

The dataset is not stored in the repository.

```
python download_data.py
```

This downloads `youtube_content.csv` into the backend folder.

---

## Create Database

```
python setup_db.py
```

This creates `youtube_content.db`.

---

## Run

```
python run_query.py
```

Then enter queries like:

```
Average views in US
Likes by region
```

---

## Notes

* `.csv` and `.db` files are ignored in Git.
* Private hackathon prototype.
