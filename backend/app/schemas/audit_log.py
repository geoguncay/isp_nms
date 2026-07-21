import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None = None
    user_name: str | None = None
    action: str
    entity_type: str
    entity_id: str
    entity_name: str
    detail: dict
    ip_address: str | None = None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogRead]
    total: int


class AuditLogGroup(BaseModel):
    """Secuencia ininterrumpida de registros con la misma acción."""

    id: uuid.UUID
    action: str
    count: int
    latest_at: datetime
    earliest_at: datetime
    items: list[AuditLogRead]


class AuditLogGroupedResponse(BaseModel):
    items: list[AuditLogGroup]
    total: int
    event_total: int
