import os
# app/main.py
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.config import ENV
from app.routers import (
    auth, users, medicines, suppliers, grn, sales,
    returns, alerts, reports, audit_view, pages
)

# Rate limiter setup (protects login from brute-force attempts)
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="ExpiryGuard Rx",
    description="Batch-Level Inventory and Expiry-Loss Prevention System for Independent Pharmacies",
    docs_url=None if ENV == "prod" else "/docs", # Hide interactive docs in production
    redoc_url=None,
    openapi_url=None if ENV == "prod" else "/openapi.json"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Mount static directory for CSS and JS assets
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR if os.path.isdir(STATIC_DIR) else "app/static"), name="static")

# Security headers middleware
@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "img-src 'self' data:; frame-ancestors 'none'; form-action 'self'"
    )
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "same-origin"
    resp.headers["Strict-Transport-Security"] = "max-age=31536000"
    return resp

# Register application routers
for r in (auth, users, medicines, suppliers, grn, sales, returns, alerts, reports, audit_view, pages):
    app.include_router(r.router)

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}
