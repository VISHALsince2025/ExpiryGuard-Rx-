import os
import sys

# Ensure project root is in sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from app.main import app

class VercelPathFixMiddleware:
    """
    ASGI middleware for Vercel Serverless deployments.
    Restores the real client request path from Vercel's x-matched-path header,
    preventing 404 {"detail": "Not Found"} caused by internal URL rewrites.
    """
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            headers = dict(scope.get("headers", []))
            # Vercel attaches the original matched path in x-matched-path
            orig_path = headers.get(b"x-matched-path") or headers.get(b"x-invoke-path")
            if orig_path:
                decoded = orig_path.decode("latin1")
                scope["path"] = decoded.split("?")[0]
            else:
                p = scope.get("path", "")
                for prefix in ("/api/index.py", "/api/index", "/api"):
                    if p == prefix:
                        scope["path"] = "/"
                        break
                    elif p.startswith(prefix + "/"):
                        scope["path"] = p[len(prefix):]
                        break
        await self.app(scope, receive, send)

# Both 'app' and 'handler' exposed for maximum Vercel runtime compatibility
handler = VercelPathFixMiddleware(app)
app = handler
