"""
Endpoints de configuración de la empresa.
"""
import os
import shutil
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, status

from app.core.deps import AdminOnly, CurrentUser, DBSession
from app.models.company import Company
from app.schemas.company import CompanyPublic, CompanyRead, CompanyUpdate
from app.services.audit_service import AuditAction, audit_detail, changed_fields, log_event

router = APIRouter(prefix="/company", tags=["company"])

_DEFAULT_COMPANY_FIELDS = dict(
    name="Mi ISP",
    ruc="",
    address="",
    phone="",
    email=None,
    website="",
    logo_url=None,
)


def _get_or_create_company(db) -> Company:
    company = db.query(Company).first()
    if not company:
        company = Company(**_DEFAULT_COMPANY_FIELDS)
        db.add(company)
        db.commit()
        db.refresh(company)
    return company


@router.get("/public", response_model=CompanyPublic)
def get_company_public(db: DBSession) -> Company:
    """
    Devuelve los datos públicos de la empresa para la página de login (sin autenticación).
    """
    return _get_or_create_company(db)


@router.get("", response_model=CompanyRead)
def get_company(db: DBSession, current_user: CurrentUser) -> Company:
    """
    Obtiene los datos de la empresa. Cualquier usuario autenticado puede consultarlo.
    """
    return _get_or_create_company(db)


@router.put("", response_model=CompanyRead)
def update_company(
    payload: CompanyUpdate, db: DBSession, current_user: AdminOnly
) -> Company:
    """
    Actualiza los datos de la empresa. Solo administradores.
    """
    company = _get_or_create_company(db)
    update_data = payload.model_dump(exclude_unset=True)
    before = {key: getattr(company, key, None) for key in update_data}
    for field, value in update_data.items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    log_event(
        db, AuditAction.UPDATE_COMPANY,
        entity_type="Company", entity_id=company.id, entity_name=company.name,
        user_id=current_user.id, user_name=current_user.name,
        detail=audit_detail(
            "Datos de empresa actualizados",
            changes=changed_fields(before, {key: getattr(company, key, None) for key in update_data}),
        ),
    )
    return company


def _upload_image(file: UploadFile, prefix: str) -> str:
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".svg"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de imagen no soportado. Use PNG, JPG, JPEG, WEBP o SVG."
        )
    upload_dir = "static/uploads"
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"{prefix}_{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(upload_dir, filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"No se pudo guardar la imagen: {str(e)}"
        )
    return f"/static/uploads/{filename}"


@router.post("/logo", response_model=dict)
def upload_company_logo(
    db: DBSession,
    current_user: AdminOnly,
    file: UploadFile = File(...),
) -> dict:
    """
    Sube el logotipo de la empresa.
    """
    logo_url = _upload_image(file, "logo")
    company = _get_or_create_company(db)
    company.logo_url = logo_url
    db.commit()
    db.refresh(company)
    log_event(
        db, AuditAction.UPDATE_COMPANY_LOGO,
        entity_type="Company", entity_id=company.id, entity_name=company.name,
        user_id=current_user.id, user_name=current_user.name,
        detail=audit_detail("Logo de empresa actualizado", file_type=os.path.splitext(logo_url)[1].lstrip(".")),
    )
    return {"logo_url": logo_url}


@router.post("/login-bg", response_model=dict)
def upload_login_background(
    db: DBSession,
    current_user: AdminOnly,
    file: UploadFile = File(...),
) -> dict:
    """
    Sube la imagen de fondo para la página de inicio de sesión.
    """
    login_bg_url = _upload_image(file, "login_bg")
    company = _get_or_create_company(db)
    company.login_bg_url = login_bg_url
    db.commit()
    db.refresh(company)
    log_event(
        db, AuditAction.UPDATE_LOGIN_BACKGROUND,
        entity_type="Company", entity_id=company.id, entity_name=company.name,
        user_id=current_user.id, user_name=current_user.name,
        detail=audit_detail("Fondo de inicio de sesión actualizado", file_type=os.path.splitext(login_bg_url)[1].lstrip(".")),
    )
    return {"login_bg_url": login_bg_url}
