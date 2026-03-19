import os
import sqlite3
from datetime import datetime, timedelta



DB_NAME = os.path.join(os.path.dirname(__file__), "auth.db")



def get_connection():
    return sqlite3.connect(DB_NAME)

def create_users_table():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password_hash TEXT,
        name Text,
        role TEXT DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
    )
    """)

    conn.commit()
    conn.close()


def register_user(email, password_hash, name):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
        (email, password_hash, name)
    )

    conn.commit()
    conn.close()


def login_user(email):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT * FROM users WHERE email=?",
        (email,)
    )

    user = cursor.fetchone()
    conn.close()

    return user

def update_last_login(user_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
        (user_id,)
    )
    conn.commit()
    conn.close()
