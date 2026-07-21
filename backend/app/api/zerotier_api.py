"""
Endpoints para la integración con ZeroTier Central (my.zerotier.com).
"""
from fastapi import APIRouter, HTTPException, status

from app.core.deps import AdminOnly, DBSession
from app.core.security import encrypt_secret
from app.models.system_settings import SystemSettings
from app.schemas.zerotier import (
    ZeroTierMember,
    ZeroTierSettings,
    ZeroTierSettingsRead,
    ZeroTierStatus,
)
from app.services.audit_service import AuditAction, audit_detail, log_event
from app.services.zerotier.zerotier_service import (
    ZeroTierError,
    get_network_status,
    list_members,
)

router = APIRouter(prefix="/zerotier", tags=["zerotier"])


def _get_or_create_settings(db) -> SystemSettings:
    cfg = db.query(SystemSettings).first()
    if not cfg:
        cfg = SystemSettings()
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _require_configured(db) -> SystemSettings:
    cfg = _get_or_create_settings(db)
    if not cfg.zt_network_id or not cfg.zt_api_token_encrypted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ZeroTier no está configurado: define el Network ID y el API Token primero.",
        )
    return cfg


def _to_settings_read(cfg: SystemSettings) -> ZeroTierSettingsRead:
    return ZeroTierSettingsRead(
        zt_network_id=cfg.zt_network_id,
        zt_api_token_set=bool(cfg.zt_api_token_encrypted),
        zt_enabled=cfg.zt_enabled,
    )


@router.get("/settings", response_model=ZeroTierSettingsRead)
def get_zerotier_settings(db: DBSession, _: AdminOnly) -> ZeroTierSettingsRead:
    return _to_settings_read(_get_or_create_settings(db))


@router.put("/settings", response_model=ZeroTierSettingsRead)
def update_zerotier_settings(
    payload: ZeroTierSettings, db: DBSession, current_user: AdminOnly
) -> ZeroTierSettingsRead:
    cfg = _get_or_create_settings(db)
    if "zt_network_id" in payload.model_fields_set:
        cfg.zt_network_id = payload.zt_network_id
    if "zt_enabled" in payload.model_fields_set and payload.zt_enabled is not None:
        cfg.zt_enabled = payload.zt_enabled
    if "zt_api_token" in payload.model_fields_set:
        cfg.zt_api_token_encrypted = (
            encrypt_secret(payload.zt_api_token) if payload.zt_api_token else None
        )
    db.commit()
    db.refresh(cfg)
    log_event(
        db, AuditAction.UPDATE_ZEROTIER_SETTINGS,
        entity_type="SystemSettings",
        user_id=current_user.id, user_name=current_user.name,
        detail=audit_detail(
            "Ajustes de ZeroTier actualizados",
            fields_changed=sorted(payload.model_fields_set),
        ),
    )
    return _to_settings_read(cfg)


@router.get("/status", response_model=ZeroTierStatus)
def get_zerotier_status(db: DBSession, _: AdminOnly) -> ZeroTierStatus:
    cfg = _get_or_create_settings(db)
    if not cfg.zt_network_id or not cfg.zt_api_token_encrypted:
        return ZeroTierStatus(configured=False, reachable=False)
    try:
        info = get_network_status(cfg)
    except ZeroTierError as exc:
        return ZeroTierStatus(
            configured=True, reachable=False, network_id=cfg.zt_network_id, error=str(exc)
        )
    return ZeroTierStatus(
        configured=True,
        reachable=True,
        network_id=cfg.zt_network_id,
        network_name=info.get("config", {}).get("name") or info.get("name"),
    )


# Deliberadamente de solo lectura: autorizar/revocar/renombrar miembros debe
# hacerse desde my.zerotier.com, nunca desde esta plataforma (decisión de
# seguridad — la gestión de acceso a la red vive fuera de la app).
@router.get("/members", response_model=list[ZeroTierMember])
def get_zerotier_members(db: DBSession, _: AdminOnly) -> list[ZeroTierMember]:
    cfg = _require_configured(db)
    try:
        return list_members(cfg)
    except ZeroTierError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
