"""
Tarea Celery: verificación diaria de mora y suspensión automática de clientes.
"""
import logging
from datetime import datetime, timedelta, timezone

from app.core import database
from app.core.security import decrypt_secret
from app.models.client import Client
from app.models.client_plan import ClientPlan
from app.models.payment import ClientPayment
from app.models.suspension_log import SuspensionLog
from app.services.mikrotik.address_list import suspend_ip_in_firewall, unsuspend_ip_in_firewall
from app.services.mikrotik.queue import toggle_client_queue
from app.services.mikrotik.pppoe import sync_pppoe_secret_in_router, disconnect_pppoe_session
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


@celery_app.task(name="app.workers.suspension.process_scheduled_suspensions")
def process_scheduled_suspensions():
    """
    Busca clientes activos con una suspensión aplazada (suspension_programada)
    cuya fecha ya se cumplió y los suspende automáticamente en la base de datos,
    en MikroTik y les envía una notificación.
    """
    logger.info("Verificando suspensiones aplazadas...")
    db = database.SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        pending_clients = (
            db.query(Client)
            .filter(Client.activo == True, Client.suspension_programada.isnot(None), Client.suspension_programada <= now)
            .all()
        )
        logger.info(f"Se encontraron {len(pending_clients)} clientes con suspensión aplazada vencida.")

        suspended_count = 0

        for client in pending_clients:
            motivo = client.suspension_programada_motivo or "Suspensión aplazada"
            try:
                client.activo = False
                client.suspension_programada = None
                client.suspension_programada_motivo = None

                active_plan = (
                    db.query(ClientPlan)
                    .filter(ClientPlan.cliente_id == client.id, ClientPlan.estado == "activo")
                    .first()
                )
                if active_plan:
                    active_plan.estado = "suspendido"

                if client.tipo == "static" and client.static_ip:
                    suspend_ip_in_firewall(client.router, client.static_ip.ip, client.nombre)
                    toggle_client_queue(client.router, client.static_ip.ip, disabled=True)
                elif client.tipo == "pppoe" and client.pppoe_secret:
                    password_dec = decrypt_secret(client.pppoe_secret.contraseña_ppp)
                    profile_name = client.pppoe_secret.perfil.nombre if client.pppoe_secret.perfil else "default"
                    sync_pppoe_secret_in_router(
                        router=client.router,
                        username=client.pppoe_secret.usuario_ppp,
                        password=password_dec,
                        profile_name=profile_name,
                        client_name=client.nombre,
                        disabled=True
                    )
                    disconnect_pppoe_session(client.router, client.pppoe_secret.usuario_ppp)

                log = SuspensionLog(
                    cliente_id=client.id,
                    motivo=motivo,
                    fecha_suspension=datetime.now(),
                    usuario_id=None  # Nulo indica acción del sistema (automático)
                )
                db.add(log)

                db.commit()
                suspended_count += 1
                logger.info(f"Cliente {client.nombre} suspendido automáticamente por aplazamiento vencido.")

                try:
                    send_suspension_notification(client.nombre, client.telefono, is_suspension=True)
                except Exception as e:
                    logger.warning(f"Error al enviar notificación de suspensión aplazada a {client.nombre}: {e}")

            except Exception as e:
                db.rollback()
                logger.error(f"Error al intentar suspender automáticamente al cliente {client.nombre} (aplazamiento): {e}", exc_info=True)

        logger.info(f"Tarea de suspensiones aplazadas completada. Clientes suspendidos: {suspended_count}")

    except Exception as exc:
        logger.error(f"Error general en la tarea process_scheduled_suspensions: {exc}", exc_info=True)
    finally:
        db.close()


@celery_app.task(name="app.workers.suspension.process_scheduled_reactivations")
def process_scheduled_reactivations():
    """
    Busca clientes suspendidos con una reactivación programada (reactivacion_programada)
    cuya fecha ya se cumplió y los reactiva automáticamente en la base de datos,
    en MikroTik y les envía una notificación.
    """
    logger.info("Verificando reactivaciones programadas...")
    db = database.SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        pending_clients = (
            db.query(Client)
            .filter(Client.activo == False, Client.reactivacion_programada.isnot(None), Client.reactivacion_programada <= now)
            .all()
        )
        logger.info(f"Se encontraron {len(pending_clients)} clientes con reactivación programada vencida.")

        reactivated_count = 0

        for client in pending_clients:
            try:
                client.activo = True
                client.reactivacion_programada = None

                suspended_plan = (
                    db.query(ClientPlan)
                    .filter(ClientPlan.cliente_id == client.id, ClientPlan.estado == "suspendido")
                    .first()
                )
                if suspended_plan:
                    suspended_plan.estado = "activo"

                if client.tipo == "static" and client.static_ip:
                    unsuspend_ip_in_firewall(client.router, client.static_ip.ip)
                    toggle_client_queue(client.router, client.static_ip.ip, disabled=False)
                elif client.tipo == "pppoe" and client.pppoe_secret:
                    password_dec = decrypt_secret(client.pppoe_secret.contraseña_ppp)
                    profile_name = client.pppoe_secret.perfil.nombre if client.pppoe_secret.perfil else "default"
                    sync_pppoe_secret_in_router(
                        router=client.router,
                        username=client.pppoe_secret.usuario_ppp,
                        password=password_dec,
                        profile_name=profile_name,
                        client_name=client.nombre,
                        disabled=False
                    )

                log = (
                    db.query(SuspensionLog)
                    .filter(SuspensionLog.cliente_id == client.id, SuspensionLog.fecha_reactivacion == None)
                    .order_by(SuspensionLog.fecha_suspension.desc())
                    .first()
                )
                if log:
                    log.fecha_reactivacion = datetime.now()

                db.commit()
                reactivated_count += 1
                logger.info(f"Cliente {client.nombre} reactivado automáticamente por reactivación programada.")

                try:
                    send_suspension_notification(client.nombre, client.telefono, is_suspension=False)
                except Exception as e:
                    logger.warning(f"Error al enviar notificación de reactivación automática a {client.nombre}: {e}")

            except Exception as e:
                db.rollback()
                logger.error(f"Error al intentar reactivar automáticamente al cliente {client.nombre}: {e}", exc_info=True)

        logger.info(f"Tarea de reactivaciones programadas completada. Clientes reactivados: {reactivated_count}")

    except Exception as exc:
        logger.error(f"Error general en la tarea process_scheduled_reactivations: {exc}", exc_info=True)
    finally:
        db.close()
