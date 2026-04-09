# Conversational BI Backend

AI-powered backend that converts natural language queries into executable SQL, enabling users to analyze datasets without writing queries manually.

Built during a hackathon — Top 2 project

---

## Overview

This system processes user-uploaded datasets and allows querying using plain English.

It is designed to be dataset-agnostic, dynamically adapting to different data structures without requiring predefined schemas.

It dynamically:
- Interprets intent using LLMs
- Converts intent → SQL queries
- Executes queries on structured data
- Returns analytical results

---

## Key Features

- Natural language → SQL query conversion  
- Automatic dataset ingestion (CSV → SQLite)  
- Dataset-agnostic querying (works across arbitrary datasets)  
- Modular backend design for flexible query handling  
- LLM-assisted data retrieval pipeline  
- Support for dynamic analytical queries  

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

## Usage

Simply upload a dataset (CSV), and the system will automatically:

- Process and clean the data  
- Convert it into a database  
- Enable natural language querying  

Run:

    python run_query.py

Example queries:

    Average views in US
    Likes by region
    Top performing categories

---

## Notes

- CSV data is automatically processed and stored internally  
- Database setup is handled dynamically  
- Dataset-agnostic design enables reuse across different datasets  
- Developed as a hackathon prototype  
