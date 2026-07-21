"""
API de logs de auditoría del sistema ISP.
"""
# ruff: noqa: B008 -- FastAPI usa Query como marcador declarativo de parámetros.
from datetime import datetime

from fastapi import APIRouter, Query
from sqlalchemy import desc

from app.core.deps import AdminOnly, DBSession
from app.models.audit_log import AuditLog
from app.schemas.audit_log import (
    AuditLogGroup,
    AuditLogGroupedResponse,
    AuditLogListResponse,
    AuditLogRead,
)

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


def _filtered_query(
    db: DBSession,
    *,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    user_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action == action)
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        q = q.filter(AuditLog.entity_id == entity_id)
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if date_from:
        q = q.filter(AuditLog.created_at >= date_from)
    if date_to:
        q = q.filter(AuditLog.created_at <= date_to)
    return q


@router.get("/grouped", response_model=AuditLogGroupedResponse)
def list_grouped_audit_logs(
    db: DBSession,
    _: AdminOnly,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    action: str | None = Query(None, description="Filtrar por tipo de acción"),  # noqa: B008
    entity_type: str | None = Query(None, description="Filtrar por tipo de entidad"),  # noqa: B008
    entity_id: str | None = Query(None, description="Filtrar por ID de entidad"),
    user_id: str | None = Query(None, description="Filtrar por usuario"),
    date_from: datetime | None = Query(None, description="Desde fecha (ISO 8601)"),
    date_to: datetime | None = Query(None, description="Hasta fecha (ISO 8601)"),
) -> AuditLogGroupedResponse:
    """Agrupa únicamente acciones iguales y consecutivas; pagina por grupos completos."""
    # Las fronteras se calculan antes de aplicar filtros. Así dos acciones iguales
    # separadas por otra acción nunca se fusionan accidentalmente al filtrar.
    q = _filtered_query(
        db,
        date_from=date_from,
        date_to=date_to,
    )
    ordered = q.order_by(desc(AuditLog.created_at), desc(AuditLog.id)).yield_per(500)

    groups: list[AuditLogGroup] = []
    current_action: str | None = None
    current_first: AuditLog | None = None
    current_last: AuditLog | None = None
    current_count = 0
    current_items: list[AuditLogRead] | None = None
    total_groups = 0
    event_total = 0

    def finish_group() -> None:
        nonlocal event_total, total_groups
        if current_count == 0 or current_first is None or current_last is None:
            return
        event_total += current_count
        if current_items is not None:
            groups.append(
                AuditLogGroup(
                    id=current_first.id,
                    action=current_first.action,
                    count=current_count,
                    latest_at=current_first.created_at,
                    earliest_at=current_last.created_at,
                    items=current_items,
                )
            )
        total_groups += 1

    def matches_filters(entry: AuditLog) -> bool:
        return bool(
            (not action or entry.action == action)
            and (not entity_type or entry.entity_type == entity_type)
            and (not entity_id or entry.entity_id == entity_id)
            and (not user_id or str(entry.user_id) == user_id)
        )

    for entry in ordered:
        if entry.action != current_action:
            finish_group()
            current_action = entry.action
            current_first = None
            current_last = None
            current_count = 0
            current_items = None
        if not matches_filters(entry):
            continue
        if current_first is None:
            current_first = entry
            current_items = [] if skip <= total_groups < skip + limit else None
        current_last = entry
        current_count += 1
        if current_items is not None:
            current_items.append(AuditLogRead.model_validate(entry))

    finish_group()
    return AuditLogGroupedResponse(items=groups, total=total_groups, event_total=event_total)


@router.get("", response_model=AuditLogListResponse)
def list_audit_logs(
    db: DBSession,
    _: AdminOnly,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    action: str | None = Query(None, description="Filtrar por tipo de acción"),  # noqa: B008
    entity_type: str | None = Query(None, description="Filtrar por tipo de entidad"),  # noqa: B008
    entity_id: str | None = Query(None, description="Filtrar por ID de entidad"),
    user_id: str | None = Query(None, description="Filtrar por usuario"),
    date_from: datetime | None = Query(None, description="Desde fecha (ISO 8601)"),
    date_to: datetime | None = Query(None, description="Hasta fecha (ISO 8601)"),
) -> AuditLogListResponse:
    """
    Lista los eventos de auditoría con filtros opcionales. Solo accesible por admins.
    """
    q = _filtered_query(
        db,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
    )

    total = q.count()
    items = q.order_by(desc(AuditLog.created_at)).offset(skip).limit(limit).all()

    return AuditLogListResponse(
        items=[AuditLogRead.model_validate(item) for item in items],
        total=total,
    )
