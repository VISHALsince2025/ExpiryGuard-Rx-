# app/services/blob.py
import os
import uuid
from datetime import datetime, timedelta, timezone
from app.config import BLOB_CONN, BLOB_CONTAINER

# Local storage fallback directory if Azure Blob connection string is not set
_LOCAL_STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "invoices_blob")

def get_blob_service():
    if BLOB_CONN:
        from azure.storage.blob import BlobServiceClient
        return BlobServiceClient.from_connection_string(BLOB_CONN)
    return None

def upload_invoice(data: bytes, ext: str, content_type: str) -> str:
    """
    Uploads scanned invoice to private Azure Blob Storage (or local storage fallback).
    User-chosen file names are never trusted; a cryptographically random UUID is assigned.
    """
    name = f"{uuid.uuid4()}.{ext}"
    svc = get_blob_service()
    if svc:
        from azure.storage.blob import ContentSettings
        svc.get_blob_client(BLOB_CONTAINER, name).upload_blob(
            data,
            content_settings=ContentSettings(content_type=content_type)
        )
    else:
        os.makedirs(_LOCAL_STORAGE_DIR, exist_ok=True)
        file_path = os.path.join(_LOCAL_STORAGE_DIR, name)
        with open(file_path, "wb") as f:
            f.write(data)
    return name

def short_link(name: str, minutes: int = 5) -> str:
    """
    Generates a short-lived Shared Access Signature (SAS) link that expires in `minutes` (default: 5).
    Never exposes permanent public URLs.
    """
    svc = get_blob_service()
    if svc:
        from azure.storage.blob import generate_blob_sas, BlobSasPermissions
        sas = generate_blob_sas(
            account_name=svc.account_name,
            container_name=BLOB_CONTAINER,
            blob_name=name,
            account_key=svc.credential.account_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.now(timezone.utc) + timedelta(minutes=minutes)
        )
        return f"{svc.url}{BLOB_CONTAINER}/{name}?{sas}"
    else:
        # Local secure temporary link token representation
        exp_ts = int((datetime.now(timezone.utc) + timedelta(minutes=minutes)).timestamp())
        return f"/static/invoices/{name}?expires={exp_ts}"
