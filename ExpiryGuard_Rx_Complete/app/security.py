# app/security.py
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import UploadFile, HTTPException
from app.config import JWT_SECRET

# Password hashing using bcrypt cost factor 12
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

# Dummy hash so unknown usernames take the exact same verification time
DUMMY_HASH = hash_password("not-a-real-password")

# JWT tokens (30 minutes expiry)
def make_token(user_id: int, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=30)
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": exp
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def read_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"]) # raises PyJWTError if forged or expired

# File upload validation: magic byte check & size limit
ALLOWED_TYPES = {
    "application/pdf": (b"%PDF", "pdf"),
    "image/png": (b"\x89PNG", "png"),
    "image/jpeg": (b"\xff\xd8\xff", "jpg")
}
MAX_BYTES = 5 * 1024 * 1024  # 5 MB

async def validate_upload(f: UploadFile):
    data = await f.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File larger than 5 MB")
    rule = ALLOWED_TYPES.get(f.content_type)
    if not rule or not data.startswith(rule[0]):
        # Validate magic signature bytes to prevent disguise attacks
        raise HTTPException(status_code=400, detail="Only PDF, PNG or JPG files are accepted")
    return data, rule[1], f.content_type
