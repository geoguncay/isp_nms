"""
Schemas Pydantic v2 para la integración con ZeroTier Central (my.zerotier.com).
"""
from datetime import datetime

from pydantic import BaseModel, Field


class ZeroTierSettings(BaseModel):
    zt_network_id: str | None = Field(default=None, max_length=32)
    zt_api_token: str | None = Field(default=None, max_length=255)
    zt_enabled: bool | None = None


class ZeroTierSettingsRead(BaseModel):
    zt_network_id: str | None
    zt_api_token_set: bool
    zt_enabled: bool


class ZeroTierStatus(BaseModel):
    configured: bool
    reachable: bool
    network_id: str | None = None
    network_name: str | None = None
    member_count: int | None = None
    error: str | None = None


class ZeroTierMember(BaseModel):
    node_id: str
    name: str | None = None
    description: str | None = None
    authorized: bool
    online: bool
    ip_assignments: list[str] = []
    last_seen: datetime | None = None
    physical_address: str | None = None
    version: str | None = None
