"""
Tarea Celery: verificación diaria de mora y suspensión automática de clientes.
"""
import logging
from datetime import datetime, timedelta, timezone

from app.core import database
from app.models.client import Client
from app.models.client_plan import ClientPlan
from app.models.payment import ClientPayment
from app.models.suspension_log import SuspensionLog
from app.services.mikrotik.address_list import suspend_ip_in_firewall
from app.services.mikrotik.queue import toggle_client_queue
from app.services.notifications.twilio_service import send_suspension_notification
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def is_older_than_30_days(dt: datetime) -> bool:
    """
    Retorna True si la fecha proporcionada es de hace más de 30 días.
    Soporta fechas con y sin zona horaria de forma segura.
    """
    if dt.tzinfo is not None:
        now = datetime.now(timezone.utc)
        return (now - dt) > timedelta(days=30)
    else:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        return (now - dt) > timedelta(days=30)


@celery_app.task(name="app.workers.suspension.daily_suspension_check")
def daily_suspension_check():
    """
    Busca clientes activos que tengan una mora superior a 30 días
    (sin pagos completados en los últimos 30 días, o creados hace más de 30 días sin pagos).
    Los suspende de forma automática en la base de datos, en MikroTik y les envía una notificación.
    """
    logger.info("Iniciando tarea diaria de verificación de suspensiones...")
    db = database.SessionLocal()
    try:
        # Buscar todos los clientes marcados como activos
        active_clients = db.query(Client).filter(Client.activo == True).all()
        logger.info(f"Se encontraron {len(active_clients)} clientes activos para revisar.")

        suspended_count = 0

        for client in active_clients:
            # Obtener el último pago completado del cliente
            last_payment = (
                db.query(ClientPayment)
                .filter(ClientPayment.cliente_id == client.id, ClientPayment.estado == "completado")
                .order_by(ClientPayment.fecha_pago.desc())
                .first()
            )

            should_suspend = False
            reason = ""

            if last_payment:
                if is_older_than_30_days(last_payment.fecha_pago):
                    should_suspend = True
                    reason = f"Mora de pago: Último pago completado hace más de 30 días ({last_payment.fecha_pago.strftime('%Y-%m-%d')})"
            else:
                # No tiene pagos, verificar fecha de creación
                if is_older_than_30_days(client.created_at):
                    should_suspend = True
                    reason = f"Mora de pago: Cliente creado hace más de 30 días ({client.created_at.strftime('%Y-%m-%d')}) sin pagos completados"

            if should_suspend:
                logger.info(f"Cliente {client.nombre} ({client.id}) califica para suspensión. Razón: {reason}")
                try:
                    # 1. Desactivar cliente
                    client.activo = False

                    # 2. Desactivar plan activo
                    active_plan = (
                        db.query(ClientPlan)
                        .filter(ClientPlan.cliente_id == client.id, ClientPlan.estado == "activo")
                        .first()
                    )
                    if active_plan:
                        active_plan.estado = "suspendido"

                    # 3. Aplicar suspensión en MikroTik (si aplica)
                    if client.tipo == "static" and client.static_ip:
                        suspend_ip_in_firewall(client.router, client.static_ip.ip, client.nombre)
                        toggle_client_queue(client.router, client.static_ip.ip, disabled=True)

                    # 4. Crear log de suspensión
                    log = SuspensionLog(
                        cliente_id=client.id,
                        motivo=reason,
                        fecha_suspension=datetime.now(),
                        usuario_id=None  # Nulo indica acción del sistema (automático)
                    )
                    db.add(log)

                    # Guardar cambios del cliente actual
                    db.commit()
                    suspended_count += 1
                    logger.info(f"Cliente {client.nombre} suspendido exitosamente por el sistema.")

                    # 5. Enviar notificación por Twilio (no bloqueante)
                    try:
                        send_suspension_notification(client.nombre, client.telefono, is_suspension=True)
                    except Exception as e:
                        logger.warning(f"Error al enviar notificación de suspensión automática a {client.nombre}: {e}")

                except Exception as e:
                    db.rollback()
                    logger.error(f"Error al intentar suspender automáticamente al cliente {client.nombre}: {e}", exc_info=True)

        logger.info(f"Tarea de verificación completada. Clientes suspendidos en esta ejecución: {suspended_count}")

    except Exception as exc:
        logger.error(f"Error general en la tarea daily_suspension_check: {exc}", exc_info=True)
    finally:
        db.close()
