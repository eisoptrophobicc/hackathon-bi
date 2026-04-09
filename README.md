# Conversational BI Backend

AI-powered backend that converts natural language queries into executable SQL, enabling users to analyze datasets without writing queries manually.

Built during a hackathon — Top 2 project

---

## Overview

This system processes datasets and allows querying using plain English.

It dynamically:
- Interprets intent using LLMs
- Converts intent → SQL queries
- Executes queries on structured data
- Returns analytical results

---

## Key Features

- Natural language → SQL query conversion  
- Dataset processing (CSV → SQLite)  
- Modular backend design for flexible query handling  
- Support for dynamic analytical queries  
- Designed for extensibility across different datasets  

---

## Architecture

User Query  
↓  
Intent Extraction (LLM)  
↓  
SQL Generation  
↓  
Database Execution  
↓  
Result Output  

---

## Setup

Clone the repository

    git clone <repo-url>
    cd HACK-A-DON/backend

Install dependencies

    pip install pandas requests chardet numpy

---

## Dataset Setup

The dataset is not stored in the repository.

    python download_data.py

This downloads youtube_content.csv.

---

## Database Setup

    python setup_db.py

Creates youtube_content.db.

---

## Run

    python run_query.py

Example queries:

    Average views in US
    Likes by region
    Top performing categories

---

## Notes

- .csv and .db files are excluded from version control  
- Developed as a hackathon prototype  
