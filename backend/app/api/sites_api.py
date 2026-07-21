"""
Endpoints CRUD de Sitios (Sites).
"""
import uuid
from fastapi import APIRouter, HTTPException, status

from app.core.deps import AdminOrTechnician, DBSession
from app.models.site import Site
from app.schemas.site import SiteCreate, SiteRead, SiteUpdate
from app.services.audit_service import AuditAction, audit_detail, changed_fields, log_event

router = APIRouter(prefix="/sites", tags=["sites"])


@router.get("", response_model=list[SiteRead])
def list_sites(db: DBSession, _: AdminOrTechnician) -> list:
    return db.query(Site).order_by(Site.name).all()


@router.post("", response_model=SiteRead, status_code=status.HTTP_201_CREATED)
def create_site(payload: SiteCreate, db: DBSession, current_user: AdminOrTechnician) -> Site:
    existing = db.query(Site).filter(Site.name == payload.name.strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un sitio con ese nombre",
        )
    site = Site(
        name=payload.name.strip(),
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    db.add(site)
    db.commit()
    db.refresh(site)
    log_event(
        db, AuditAction.CREATE_SITE,
        entity_type="Site", entity_id=site.id, entity_name=site.name,
        user_id=current_user.id, user_name=current_user.name,
        detail=audit_detail("Sitio creado", latitude=site.latitude, longitude=site.longitude),
    )
    return site


@router.put("/{site_id}", response_model=SiteRead)
def update_site(site_id: uuid.UUID, payload: SiteUpdate, db: DBSession, current_user: AdminOrTechnician) -> Site:
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sitio no encontrado")
    new_name = payload.name.strip()
    if new_name != site.name:
        conflict = db.query(Site).filter(Site.name == new_name).first()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ya existe un sitio con ese nombre",
            )
    before = {"name": site.name, "latitude": site.latitude, "longitude": site.longitude}
    site.name = new_name
    site.latitude = payload.latitude
    site.longitude = payload.longitude
    db.commit()
    db.refresh(site)
    after = {"name": site.name, "latitude": site.latitude, "longitude": site.longitude}
    log_event(
        db, AuditAction.UPDATE_SITE,
        entity_type="Site", entity_id=site.id, entity_name=site.name,
        user_id=current_user.id, user_name=current_user.name,
        detail=audit_detail("Sitio actualizado", changes=changed_fields(before, after)),
    )
    return site


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_site(site_id: uuid.UUID, db: DBSession, current_user: AdminOrTechnician) -> None:
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sitio no encontrado")
    site_name = site.name
    detail = {"latitude": site.latitude, "longitude": site.longitude}
    db.delete(site)
    db.commit()
    log_event(
        db, AuditAction.DELETE_SITE,
        entity_type="Site", entity_id=site_id, entity_name=site_name,
        user_id=current_user.id, user_name=current_user.name,
        detail=audit_detail("Sitio eliminado", **detail),
    )
