# app/routers/audit_view.py
from typing import Optional
from fastapi import APIRouter, Depends, Query
from app.db import db
from app.deps import require_roles

router = APIRouter(prefix="/audit", tags=["Audit Log"])

@router.get("")
def search_audit_log(
    user_id: Optional[int] = Query(default=None),
    table: Optional[str] = Query(default=None),
    action: Optional[str] = Query(default=None),
    from_date: Optional[str] = Query(default=None),
    to_date: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user=Depends(require_roles("Admin", "Auditor")),
    conn=Depends(db)
):
    cur = conn.cursor()
    cur.execute("""
        SELECT a.audit_id, a.event_time, a.user_id, u.username, u.full_name,
               a.action, a.table_name, a.record_id, a.old_value, a.new_value, a.ip_address
        FROM dbo.audit_log a
        LEFT JOIN dbo.users u ON u.user_id = a.user_id
        WHERE (? IS NULL OR a.user_id = ?)
          AND (? IS NULL OR a.table_name = ?)
          AND (? IS NULL OR a.action = ?)
          AND (? IS NULL OR date(a.event_time) >= ?)
          AND (? IS NULL OR date(a.event_time) <= ?)
        ORDER BY a.audit_id DESC
        LIMIT ? OFFSET ?
    """, user_id, user_id, table, table, action, action, from_date, from_date, to_date, to_date, limit, offset)
    rows = cur.fetchall()

    return [{
        "audit_id": r.audit_id,
        "event_time": str(r.event_time),
        "user_id": r.user_id,
        "username": r.username or "SYSTEM/ANONYMOUS",
        "full_name": r.full_name or "System Process",
        "action": r.action,
        "table_name": r.table_name,
        "record_id": r.record_id,
        "old_value": r.old_value,
        "new_value": r.new_value,
        "ip_address": r.ip_address
    } for r in rows]
