# app/config.py
import os
from dotenv import load_dotenv

load_dotenv() # Reads .env locally; on Azure the App Settings are environment variables

def need(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing environment variable: {name}")
    return value

ENV = os.environ.get("ENV", "dev")
JWT_SECRET = os.environ.get("JWT_SECRET") or need("JWT_SECRET")
SQL_CONN = os.environ.get("AZURE_SQL_CONNECTIONSTRING", "")
BLOB_CONN = os.environ.get("BLOB_CONNECTION_STRING", "")
BLOB_CONTAINER = os.environ.get("BLOB_CONTAINER", "invoices")
COSMOS_ENDPOINT = os.environ.get("COSMOS_ENDPOINT", "")
COSMOS_KEY = os.environ.get("COSMOS_KEY", "")
