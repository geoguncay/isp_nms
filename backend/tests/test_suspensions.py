import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from unittest.mock import ANY, AsyncMock, patch
from datetime import datetime, timedelta, timezone

from app.core import database as db_module
from app.core.database import Base
from app.core.deps import get_db
from app.core.security import hash_password
from app.main import app
from app.models.user import User
from app.models.plan import Plan
from app.models.router import Router
from app.models.client import Client
from app.models.client_plan import ClientPlan
from app.models.static_ip import StaticIP
from app.models.payment import ClientPayment
from app.models.suspension_log import SuspensionLog
from app.workers.suspension import daily_suspension_check

engine_test = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def make_redis_mock() -> AsyncMock:
    mock = AsyncMock()
    mock.setex = AsyncMock(return_value=True)
    mock.get = AsyncMock(return_value=None)
    mock.delete = AsyncMock(return_value=True)
    return mock


@pytest.fixture(autouse=True)
def setup_db(monkeypatch):
    monkeypatch.setattr(db_module, "engine", engine_test)
    monkeypatch.setattr(db_module, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr("app.api.auth.redis_client", make_redis_mock())

    Base.metadata.create_all(bind=engine_test)

    db = TestingSessionLocal()
    # Agregar un administrador
    db.add(User(
        nombre="Test Admin",
        email="admin@test.com",
        hashed_password=hash_password("adminpass123"),
        rol="admin",
        activo=True,
    ))
    # Agregar un técnico
    db.add(User(
        nombre="Test Tecnico",
        email="tecnico@test.com",
        hashed_password=hash_password("tecnicopass123"),
        rol="tecnico",
        activo=True,
    ))
    # Agregar un router
    r = Router(
        nombre="Router Central",
        ip="10.0.0.1",
        puerto_api=8728,
        usuario_api="admin",
        password_enc="enc_pass",
        activo=True,
    )
    db.add(r)
    # Agregar un plan
    p = Plan(
        nombre="Plan Fibra 20M",
        velocidad_down_mbps=20,
        velocidad_up_mbps=10,
        velocidad_down_kbps=20000,
        velocidad_up_kbps=10000,
        precio=22.40,
    )
    db.add(p)
    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=engine_test)


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@patch("app.api.clients.suspend_ip_in_firewall")
@patch("app.api.clients.toggle_client_queue")
@patch("app.api.clients.send_suspension_notification")
def test_suspend_client_flow(mock_send_notif, mock_toggle_queue, mock_suspend_fw, client: TestClient):
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "adminpass123"},
    )
    token = login.json()["access_token"]

    db = TestingSessionLocal()
    router = db.query(Router).first()
    plan = db.query(Plan).first()
    
    # Crear cliente activo con plan e IP estática
    c = Client(
        nombre="Juan Suspendido",
        cedula="1724024888",
        telefono="0999999999",
        direccion="Quito",
        router_id=router.id,
        tipo="static",
        activo=True
    )
    db.add(c)
    db.flush()
    db.add(StaticIP(cliente_id=c.id, ip="192.168.10.15", router_id=router.id))
    db.add(ClientPlan(cliente_id=c.id, plan_id=plan.id, estado="activo"))
    db.commit()
    client_uuid = c.id
    client_id = str(c.id)
    db.close()

    # Suspender al cliente
    response = client.post(
        f"/api/clients/{client_id}/suspend",
        headers={"Authorization": f"Bearer {token}"},
        params={"motivo": "Falta de pago"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["motivo"] == "Falta de pago"
    assert data["fecha_reactivacion"] is None

    # Verificar estado en DB
    db = TestingSessionLocal()
    db_client = db.get(Client, client_uuid)
    assert db_client.activo is False
    active_plan = db.query(ClientPlan).filter(ClientPlan.cliente_id == db_client.id).first()
    assert active_plan.estado == "suspendido"

    # Verificar logs de suspensión
    logs = db.query(SuspensionLog).filter(SuspensionLog.cliente_id == db_client.id).all()
    assert len(logs) == 1
    assert logs[0].motivo == "Falta de pago"
    assert logs[0].fecha_reactivacion is None
    db.close()

    # Verificar llamadas a MikroTik y notificaciones
    mock_suspend_fw.assert_called_once()
    mock_toggle_queue.assert_called_once_with(ANY, "192.168.10.15", disabled=True)
    mock_send_notif.assert_called_once_with("Juan Suspendido", "0999999999", is_suspension=True)


@patch("app.api.clients.unsuspend_ip_in_firewall")
@patch("app.api.clients.toggle_client_queue")
@patch("app.api.clients.send_suspension_notification")
def test_reactivate_client_flow(mock_send_notif, mock_toggle_queue, mock_unsuspend_fw, client: TestClient):
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "adminpass123"},
    )
    token = login.json()["access_token"]

    db = TestingSessionLocal()
    router = db.query(Router).first()
    plan = db.query(Plan).first()
    admin_user = db.query(User).filter(User.rol == "admin").first()

    # Crear cliente suspendido con plan suspendido e IP estática y log de suspensión activo
    c = Client(
        nombre="Pedro Reactivado",
        cedula="1724024888",
        telefono="0999999999",
        direccion="Quito",
        router_id=router.id,
        tipo="static",
        activo=False
    )
    db.add(c)
    db.flush()
    db.add(StaticIP(cliente_id=c.id, ip="192.168.10.16", router_id=router.id))
    db.add(ClientPlan(cliente_id=c.id, plan_id=plan.id, estado="suspendido"))
    
    log = SuspensionLog(
        cliente_id=c.id,
        motivo="Mora de pago",
        fecha_suspension=datetime.now() - timedelta(days=2),
        usuario_id=admin_user.id
    )
    db.add(log)
    db.commit()
    client_uuid = c.id
    client_id = str(c.id)
    db.close()

    # Reactivar al cliente
    response = client.post(
        f"/api/clients/{client_id}/reactivate",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["fecha_reactivacion"] is not None

    # Verificar estado en DB
    db = TestingSessionLocal()
    db_client = db.get(Client, client_uuid)
    assert db_client.activo is True
    active_plan = db.query(ClientPlan).filter(ClientPlan.cliente_id == db_client.id).first()
    assert active_plan.estado == "activo"

    # Verificar logs de suspensión cerrado
    logs = db.query(SuspensionLog).filter(SuspensionLog.cliente_id == db_client.id).all()
    assert len(logs) == 1
    assert logs[0].fecha_reactivacion is not None
    db.close()

    # Verificar llamadas a MikroTik y notificaciones
    mock_unsuspend_fw.assert_called_once()
    mock_toggle_queue.assert_called_once_with(ANY, "192.168.10.16", disabled=False)
    mock_send_notif.assert_called_once_with("Pedro Reactivado", "0999999999", is_suspension=False)


@patch("app.workers.suspension.suspend_ip_in_firewall")
@patch("app.workers.suspension.toggle_client_queue")
@patch("app.workers.suspension.send_suspension_notification")
def test_daily_suspension_check_task(mock_send_notif, mock_toggle_queue, mock_suspend_fw):
    db = TestingSessionLocal()
    router = db.query(Router).first()
    plan = db.query(Plan).first()

    # 1. Cliente al día (pago hace 10 días) -> No suspender
    c1 = Client(nombre="Cliente Al Dia", cedula="1724024888", telefono="0991111111", direccion="Direccion", router_id=router.id, tipo="static", activo=True)
    db.add(c1)
    db.flush()
    db.add(StaticIP(cliente_id=c1.id, ip="192.168.10.101", router_id=router.id))
    db.add(ClientPlan(cliente_id=c1.id, plan_id=plan.id, estado="activo"))
    db.add(ClientPayment(cliente_id=c1.id, monto=22.40, fecha_pago=datetime.now() - timedelta(days=10), metodo="efectivo", estado="completado"))

    # 2. Cliente en mora (pago hace 35 días) -> Suspender
    c2 = Client(nombre="Cliente En Mora", cedula="0926079971", telefono="0992222222", direccion="Direccion", router_id=router.id, tipo="static", activo=True)
    db.add(c2)
    db.flush()
    db.add(StaticIP(cliente_id=c2.id, ip="192.168.10.102", router_id=router.id))
    db.add(ClientPlan(cliente_id=c2.id, plan_id=plan.id, estado="activo"))
    db.add(ClientPayment(cliente_id=c2.id, monto=22.40, fecha_pago=datetime.now() - timedelta(days=35), metodo="transferencia", estado="completado"))

    # 3. Cliente nuevo sin pagos, creado hace 15 días -> No suspender
    c3 = Client(nombre="Cliente Nuevo Ok", cedula="1790011674001", telefono="0993333333", direccion="Direccion", router_id=router.id, tipo="static", activo=True, created_at=datetime.now() - timedelta(days=15))
    db.add(c3)
    db.flush()
    db.add(StaticIP(cliente_id=c3.id, ip="192.168.10.103", router_id=router.id))
    db.add(ClientPlan(cliente_id=c3.id, plan_id=plan.id, estado="activo"))

    # 4. Cliente nuevo sin pagos, creado hace 40 días -> Suspender
    c4 = Client(nombre="Cliente Nuevo Mora", cedula="1760001550001", telefono="0994444444", direccion="Direccion", router_id=router.id, tipo="static", activo=True, created_at=datetime.now() - timedelta(days=40))
    db.add(c4)
    db.flush()
    db.add(StaticIP(cliente_id=c4.id, ip="192.168.10.104", router_id=router.id))
    db.add(ClientPlan(cliente_id=c4.id, plan_id=plan.id, estado="activo"))

    db.commit()
    c1_id = c1.id
    c2_id = c2.id
    c3_id = c3.id
    c4_id = c4.id
    db.close()

    # Ejecutar la tarea de Celery
    daily_suspension_check()

    # Verificar base de datos después de la tarea
    db = TestingSessionLocal()
    
    # Cliente 1 sigue activo
    db_c1 = db.get(Client, c1_id)
    assert db_c1.activo is True
    p1 = db.query(ClientPlan).filter(ClientPlan.cliente_id == c1_id).first()
    assert p1.estado == "activo"
    
    # Cliente 2 suspendido
    db_c2 = db.get(Client, c2_id)
    assert db_c2.activo is False
    p2 = db.query(ClientPlan).filter(ClientPlan.cliente_id == c2_id).first()
    assert p2.estado == "suspendido"
    logs_c2 = db.query(SuspensionLog).filter(SuspensionLog.cliente_id == c2_id).all()
    assert len(logs_c2) == 1
    assert "Último pago completado hace más de 30 días" in logs_c2[0].motivo

    # Cliente 3 sigue activo
    db_c3 = db.get(Client, c3_id)
    assert db_c3.activo is True
    p3 = db.query(ClientPlan).filter(ClientPlan.cliente_id == c3_id).first()
    assert p3.estado == "activo"

    # Cliente 4 suspendido
    db_c4 = db.get(Client, c4_id)
    assert db_c4.activo is False
    p4 = db.query(ClientPlan).filter(ClientPlan.cliente_id == c4_id).first()
    assert p4.estado == "suspendido"
    logs_c4 = db.query(SuspensionLog).filter(SuspensionLog.cliente_id == c4_id).all()
    assert len(logs_c4) == 1
    assert "Cliente creado hace más de 30 días" in logs_c4[0].motivo

    db.close()

    # Verificar que se llamaron a las notificaciones y a MikroTik 2 veces (para c2 y c4)
    assert mock_suspend_fw.call_count == 2
    assert mock_toggle_queue.call_count == 2
    assert mock_send_notif.call_count == 2
