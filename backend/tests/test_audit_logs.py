from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import database as db_module
from app.core.database import Base
from app.core.deps import get_db
from app.core.security import hash_password
from app.main import app
from app.models.audit_log import AuditLog
from app.models.user import User
from app.services.audit_service import ACTION_DEFAULTS, AuditAction, log_event

engine_test = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db(monkeypatch):
    monkeypatch.setattr(db_module, "engine", engine_test)
    monkeypatch.setattr(db_module, "SessionLocal", TestingSessionLocal)
    redis_mock = AsyncMock()
    redis_mock.setex = AsyncMock(return_value=True)
    monkeypatch.setattr("app.api.auth.redis_client", redis_mock)
    Base.metadata.create_all(bind=engine_test)
    db = TestingSessionLocal()
    db.add(
        User(
            name="Test Admin",
            email="admin@test.com",
            hashed_password=hash_password("adminpass123"),
            role="admin",
            active=True,
        )
    )
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine_test)


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _admin_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "adminpass123"},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_every_declared_action_has_complete_defaults():
    actions = {
        value
        for key, value in vars(AuditAction).items()
        if key.isupper() and isinstance(value, str)
    }
    assert actions == set(ACTION_DEFAULTS)
    assert all(entity_type and entity_name and summary for entity_type, entity_name, summary in ACTION_DEFAULTS.values())


def test_log_event_fills_required_fields_and_redacts_secrets():
    db = TestingSessionLocal()
    try:
        log_event(
            db,
            AuditAction.UPDATE_SMTP_SETTINGS,
            detail={
                "smtp_password": "never-store-this",
                "nested": {"api_token": "also-secret", "host": "smtp.example.com"},
            },
        )
        entry = db.query(AuditLog).one()
        assert entry.entity_type == "SystemSettings"
        assert entry.entity_id
        assert entry.entity_name == "Ajustes de notificaciones"
        assert entry.detail["summary"]
        assert entry.detail["smtp_password"] == "[PROTEGIDO]"
        assert entry.detail["nested"]["api_token"] == "[PROTEGIDO]"
        assert entry.detail["nested"]["host"] == "smtp.example.com"
    finally:
        db.close()


def test_mutation_creates_a_complete_audit_record(client: TestClient):
    headers = _admin_headers(client)
    response = client.put(
        "/api/company",
        headers=headers,
        json={"name": "ISP Auditado", "phone": "0999999999"},
    )
    assert response.status_code == 200

    db = TestingSessionLocal()
    try:
        entry = (
            db.query(AuditLog)
            .filter(AuditLog.action == AuditAction.UPDATE_COMPANY)
            .order_by(AuditLog.created_at.desc())
            .first()
        )
        assert entry is not None
        assert entry.entity_type == "Company"
        assert entry.entity_id
        assert entry.entity_name == "ISP Auditado"
        assert entry.detail["summary"] == "Datos de empresa actualizados"
        assert set(entry.detail["changes"]) == {"name", "phone"}
    finally:
        db.close()


def test_grouped_endpoint_only_merges_consecutive_actions(client: TestClient):
    headers = _admin_headers(client)
    db = TestingSessionLocal()
    base_time = datetime.now(UTC) + timedelta(minutes=1)
    actions = [
        AuditAction.USER_UPDATE,
        AuditAction.USER_UPDATE,
        AuditAction.UPDATE_COMPANY,
        AuditAction.USER_UPDATE,
    ]
    try:
        for index, action in enumerate(actions):
            db.add(
                AuditLog(
                    action=action,
                    entity_type="User" if action == AuditAction.USER_UPDATE else "Company",
                    entity_id=f"entity-{index}",
                    entity_name=f"Entidad {index}",
                    detail={"summary": f"Evento {index}"},
                    created_at=base_time - timedelta(seconds=index),
                )
            )
        db.commit()
    finally:
        db.close()

    response = client.get("/api/audit-logs/grouped", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert [group["count"] for group in data["items"][:3]] == [2, 1, 1]

    filtered = client.get(
        "/api/audit-logs/grouped",
        headers=headers,
        params={"action": AuditAction.USER_UPDATE},
    ).json()
    assert filtered["total"] == 2
    assert filtered["event_total"] == 3
    assert [group["count"] for group in filtered["items"]] == [2, 1]

    second_page = client.get(
        "/api/audit-logs/grouped", headers=headers, params={"skip": 1, "limit": 1}
    ).json()
    assert second_page["items"][0]["action"] == AuditAction.UPDATE_COMPANY
