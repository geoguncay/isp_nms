"""
Endpoints de configuración de la empresa.
"""
import os
import shutil
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, status

from app.core.deps import AdminOnly, CurrentUser, DBSession
from app.models.company import Company
from app.schemas.company import CompanyRead, CompanyUpdate

router = APIRouter(prefix="/company", tags=["company"])


@router.get("", response_model=CompanyRead)
def get_company(db: DBSession, current_user: CurrentUser) -> Company:
    """
    Obtiene los datos de la empresa.
    Si no existe ningún registro, crea uno por defecto.
    Cualquier usuario autenticado puede consultarlo.
    """
    company = db.query(Company).first()
    if not company:
        company = Company(
            nombre="Mi WISP",
            ruc="",
            direccion="",
            telefono="",
            email=None,
            sitio_web="",
            logo_url=None,
        )
        db.add(company)
        db.commit()
        db.refresh(company)
    return company


@router.put("", response_model=CompanyRead)
def update_company(
    payload: CompanyUpdate, db: DBSession, _: AdminOnly
) -> Company:
    """
    Actualiza los datos de la empresa. Solo permitido para administradores.
    """
    company = db.query(Company).first()
    if not company:
        company = Company(
            nombre="Mi WISP",
            ruc="",
            direccion="",
            telefono="",
            email=None,
            sitio_web="",
            logo_url=None,
        )
        db.add(company)
        db.commit()
        db.refresh(company)

    update_data = payload.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(company, field, value)

    db.commit()
    db.refresh(company)
    return company


@router.post("/logo", response_model=dict)
def upload_company_logo(
    db: DBSession,
    _: AdminOnly,
    file: UploadFile = File(...),
) -> dict:
    """
    Sube la imagen del logotipo de la empresa.
    Guarda el archivo en el directorio estático local y actualiza el campo logo_url de la empresa.
    """
    # Validar extensión del archivo
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp", ".svg"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de imagen no soportado. Use PNG, JPG, JPEG, WEBP o SVG."
        )

    # Crear directorio si no existe
    upload_dir = "static/uploads"
    os.makedirs(upload_dir, exist_ok=True)

    # Guardar archivo con un nombre único para evitar colisiones
    filename = f"logo_{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(upload_dir, filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"No se pudo guardar la imagen: {str(e)}"
        )

    logo_url = f"/static/uploads/{filename}"

    # Actualizar o crear registro de la empresa
    company = db.query(Company).first()
    if not company:
        company = Company(
            nombre="Mi WISP",
            ruc="",
            direccion="",
            telefono="",
            email=None,
            sitio_web="",
            logo_url=logo_url
        )
        db.add(company)
    else:
        company.logo_url = logo_url

    db.commit()
    db.refresh(company)

    return {"logo_url": logo_url}
