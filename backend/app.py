import sys
import os

sys.path.append(os.path.dirname(__file__))

from fastapi import FastAPI, UploadFile
from pydantic import BaseModel
from run_query import run_query
from adapter import adapt_result
from passlib.hash import bcrypt
import auth
import json
import tempfile
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware


from setup_db import load_dataframe, ingest_dataframe
from build_schema_memory import build_schema

app = FastAPI()
auth.create_users_table()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    question: str
    mode: str = "new"

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str

class LoginRequest(BaseModel):
    email: str
    password: str

@app.get("/")
def home():
    return {"message": "YouTube Analytics API running"}

@app.post("/query")
def query(req: QueryRequest):

    result = run_query(req.question, req.mode)

    # If error occurs just return it
    if result["status"] != "success":
        return result

    return adapt_result(result, req.question)

@app.post("/register")
def register(req: RegisterRequest):

    hashed_password = bcrypt.hash(req.password)
    auth.register_user(req.email, hashed_password, req.name)
    return {"status": "user created"}

@app.post("/login")
def login(req: LoginRequest):

    user = auth.login_user(req.email)

    if not user:
        return {"status": "error", "message": "user not found"}

    stored_hash = user[2]

    if not bcrypt.verify(req.password, stored_hash):
        return {"status": "error", "message": "invalid password"}

    auth.update_last_login(user[0])


    return {
    "status": "success",
    "message": "login successful",
    "email": user[1],
    "token_type": "bearer"
    }

@app.post("/upload_csv")
async def upload_csv(file: UploadFile):

    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:

        contents = await file.read()
        tmp.write(contents)
        tmp_path = tmp.name

    df = load_dataframe(tmp_path)

    ingest_dataframe(df)

    build_schema()

    return {
        "status": "success",
        "rows": len(df),
        "columns": list(df.columns)
    }

@app.get("/schema")
def get_schema():

    schema_path = Path(__file__).parent / "schema_memory.json"

    if not schema_path.exists():
        return {"status": "empty"}

    with open(schema_path) as f:
        schema = json.load(f)

    if not schema or not schema.get("columns"):
        return {"status": "empty"}

    return {
        "status": "success",
        "schema": schema
    }
