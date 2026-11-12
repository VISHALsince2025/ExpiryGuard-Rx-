# app/deps.py
import jwt
from fastapi import Depends, HTTPException, Request
from app.security import read_token

def current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        # Also check Authorization header for bearer tokens
        auth_hdr = request.headers.get("Authorization")
        if auth_hdr and auth_hdr.startswith("Bearer "):
            token = auth_hdr.split(" ", 1)[1]
    if not token:
        raise HTTPException(status_code=401, detail="Not logged in")
    try:
        data = read_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Session invalid or expired")
    return {"id": int(data["sub"]), "role": data["role"]}

def require_roles(*allowed: str):
    def checker(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in allowed:
            raise HTTPException(status_code=403, detail="You do not have permission for this action")
        return user
    return checker
