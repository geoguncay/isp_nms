"""
Servicio para enviar notificaciones mediante Twilio.
"""
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)


def send_suspension_notification(client_name: str, client_phone: str, is_suspension: bool) -> None:
    """
    Envía una notificación al cliente mediante Twilio (SMS).
    Si las credenciales no están configuradas, simula el envío escribiendo un log local.
    """
    if is_suspension:
        msg = f"Estimado/a {client_name}, le informamos que su servicio de internet ha sido suspendido por falta de pago. Por favor, regularice su saldo."
    else:
        msg = f"Estimado/a {client_name}, su servicio de internet ha sido reactivado con éxito. ¡Gracias por su pago!"

    # Log de auditoría local
    logger.info(f"[NOTIFICACIÓN SMS] Destinatario: {client_phone} | Mensaje: {msg}")

    # Verificar si Twilio está configurado
    if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_PHONE:
        try:
            # Importación tardía para evitar requerir el paquete si no está instalado
            from twilio.rest import Client as TwilioClient
            client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            message = client.messages.create(
                body=msg,
                from_=settings.TWILIO_FROM_PHONE,
                to=client_phone
            )
            logger.info(f"Notificación Twilio enviada exitosamente. SID: {message.sid}")
        except Exception as e:
            logger.error(f"Error al enviar notificación con Twilio: {e}")
    else:
        logger.info("Notificación Twilio omitida (credenciales no configuradas).")
