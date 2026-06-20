"""
Schemas Pydantic v2 para Planes de ancho de banda.
"""
import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class PlanBase(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    velocidad_down_kbps: int = Field(ge=1, le=10000000)
    velocidad_up_kbps: int = Field(ge=1, le=10000000)
    precio: float = Field(gt=0.0)
    velocidad_down_mbps: int = Field(default=0)
    velocidad_up_mbps: int = Field(default=0)
    descripcion: str | None = Field(default=None, max_length=255)
    impuestos: float = Field(default=0.0, ge=0.0)
    limit_at_up_kbps: int | None = Field(default=None, ge=1)
    limit_at_down_kbps: int | None = Field(default=None, ge=1)
    burst_threshold_up_kbps: int | None = Field(default=None, ge=1)
    burst_threshold_down_kbps: int | None = Field(default=None, ge=1)
    prioridad: int | None = Field(default=8, ge=1, le=8)
    address_list: str | None = Field(default=None, max_length=100)
    parent: str | None = Field(default=None, max_length=100)


class PlanCreate(PlanBase):
    pass


class PlanUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    velocidad_down_kbps: int | None = Field(default=None, ge=1)
    velocidad_up_kbps: int | None = Field(default=None, ge=1)
    precio: float | None = Field(default=None, gt=0.0)
    descripcion: str | None = Field(default=None, max_length=255)
    impuestos: float | None = Field(default=None, ge=0.0)
    limit_at_up_kbps: int | None = Field(default=None, ge=1)
    limit_at_down_kbps: int | None = Field(default=None, ge=1)
    burst_threshold_up_kbps: int | None = Field(default=None, ge=1)
    burst_threshold_down_kbps: int | None = Field(default=None, ge=1)
    prioridad: int | None = Field(default=None, ge=1, le=8)
    address_list: str | None = Field(default=None, max_length=100)
    parent: str | None = Field(default=None, max_length=100)


class PlanResponse(PlanBase):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    clientes_activos: int
    clientes_suspendidos: int
    created_at: datetime
    updated_at: datetime
