# app/services/cosmos.py
import os
import uuid
import json
from app.config import COSMOS_ENDPOINT, COSMOS_KEY

# Local storage fallback directory for semi-structured JSON documents if Cosmos DB is not configured
_LOCAL_COSMOS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "cosmos_documents")

def get_cosmos_container():
    if COSMOS_ENDPOINT and COSMOS_KEY:
        from azure.cosmos import CosmosClient
        c = CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY)
        return c.get_database_client("expiryguard").get_container_client("invoices")
    return None

def save_invoice_doc(doc: dict) -> str:
    """
    Saves semi-structured invoice JSON document to Cosmos DB.
    Partition key is /supplier_id.
    """
    doc["id"] = str(uuid.uuid4())
    container = get_cosmos_container()
    if container:
        container.upsert_item(doc)
    else:
        os.makedirs(_LOCAL_COSMOS_DIR, exist_ok=True)
        file_path = os.path.join(_LOCAL_COSMOS_DIR, f"{doc['id']}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(doc, f, indent=2)
    return doc["id"]

def save_forecast_run_doc(summary_doc: dict) -> str:
    """
    Saves forecast run summary JSON document to Cosmos DB or semi-structured storage.
    """
    summary_doc["id"] = str(uuid.uuid4())
    summary_doc["type"] = "forecast_run"
    container = get_cosmos_container()
    if container:
        container.upsert_item(summary_doc)
    else:
        os.makedirs(_LOCAL_COSMOS_DIR, exist_ok=True)
        file_path = os.path.join(_LOCAL_COSMOS_DIR, f"forecast_{summary_doc['id']}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(summary_doc, f, indent=2)
    return summary_doc["id"]
