import os
import sys
import urllib.parse

# Ensure project root is in sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from app.main import app

class VercelPathMiddleware:
    """
    ASGI middleware for Vercel Serverless deployments.
    Extracts the original requested route from the rewrite '__path' query parameter,
    or x-matched-path header, ensuring that both GET and POST requests are dispatched
    to the correct FastAPI routes without 404 or 405 Method Not Allowed errors.
    """
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            qs = scope.get("query_string", b"").decode("latin1", errors="ignore")
            params = urllib.parse.parse_qs(qs)
            
            # 1. Primary: Extract route from Vercel rewrite parameter ':path*'
            if "__path" in params and params["__path"] and params["__path"][0] != "$1":
                target_route = params["__path"][0]
                scope["path"] = "/" + target_route.lstrip("/")
                scope["raw_path"] = scope["path"].encode("latin1")
                # Remove internal __path parameter so it doesn't pollute user queries
                cleaned_params = {k: v for k, v in params.items() if k != "__path"}
                scope["query_string"] = urllib.parse.urlencode(cleaned_params, doseq=True).encode("latin1")
            elif scope.get("path", "") in ("/api/index", "/api/index.py", "/api"):
                # 2. Fallback: Check x-matched-path or x-invoke-path
                headers = dict(scope.get("headers", []))
                matched = headers.get(b"x-matched-path") or headers.get(b"x-invoke-path")
                if matched:
                    scope["path"] = matched.decode("latin1").split("?")[0]
                else:
                    scope["path"] = "/"
                scope["raw_path"] = scope["path"].encode("latin1")

        await self.app(scope, receive, send)

handler = VercelPathMiddleware(app)
app = handler
