"""
Tareas Celery para facturación mensual automatizada y control de vencimientos.
"""
import calendar
import logging
from datetime import datetime, timedelta, timezone

from app.core import database
from app.models.client import Client
from app.models.client_plan import ClientPlan
from app.models.invoice import Invoice
from app.models.system_settings import SystemSettings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _get_settings(db) -> SystemSettings:
    cfg = db.query(SystemSettings).first()
    if not cfg:
        cfg = SystemSettings()
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _dia_generacion_para(client: Client, cfg: SystemSettings) -> int:
    """
    Día del mes en que corresponde generar la factura del cliente, según
    la configuración de Ajustes: "dia_fijo" (billing_default_dia_pago, igual
    para todos), "fecha_corte" (día de corte propio del cliente, dia_inicio_periodo)
    o "inicio_facturacion" (día del mes en que inició la facturación del cliente,
    usando su fecha de alta si no tiene inicio_facturacion definido).
    """
    if cfg.billing_generacion_modo == "fecha_corte":
        return client.dia_inicio_periodo or 1
    if cfg.billing_generacion_modo == "inicio_facturacion":
        fecha_inicio = client.inicio_facturacion or client.created_at
        return fecha_inicio.day if fecha_inicio else 1
    return cfg.billing_default_dia_pago or 1


def _debe_generar_hoy(now: datetime, client: Client, cfg: SystemSettings) -> bool:
    """
    True si hoy es el día configurado para generar la factura del cliente y ya
    se alcanzó la hora de generación configurada (billing_hora_generacion).
    Ajusta al último día del mes cuando el día objetivo no existe (ej. 31 en febrero).
    """
    dia_objetivo = _dia_generacion_para(client, cfg)
    last_day = calendar.monthrange(now.year, now.month)[1]
    if now.day != min(dia_objetivo, last_day):
        return False

    try:
        hora_cfg, minuto_cfg = (int(x) for x in (cfg.billing_hora_generacion or "08:00").split(":"))
    except ValueError:
        hora_cfg, minuto_cfg = 8, 0
    return (now.hour, now.minute) >= (hora_cfg, minuto_cfg)


def _resolve_fecha_vencimiento(fecha_emision: datetime, client: Client, cfg: SystemSettings) -> datetime:
    """
    Calcula la fecha de vencimiento de una factura según la configuración de Ajustes:
    - modo "plazo_fijo": fecha_emision + billing_default_dias_gracia días.
    - modo "fecha_corte": coincide con el día de corte del cliente (dia_inicio_periodo),
      usando el próximo día de corte a partir de la emisión.
    - hora "inicio_dia"/"fin_dia": fija la hora del resultado a 00:00:00 o 23:59:59.
    """
    if cfg.billing_vencimiento_modo == "fecha_corte":
        dia_corte = client.dia_inicio_periodo or fecha_emision.day
        last_day = calendar.monthrange(fecha_emision.year, fecha_emision.month)[1]
        fecha_vencimiento = fecha_emision.replace(day=min(dia_corte, last_day))
        if fecha_vencimiento.date() < fecha_emision.date():
            next_month = fecha_emision.month % 12 + 1
            next_year = fecha_emision.year + (1 if fecha_emision.month == 12 else 0)
            last_day_next = calendar.monthrange(next_year, next_month)[1]
            fecha_vencimiento = fecha_emision.replace(
                year=next_year, month=next_month, day=min(dia_corte, last_day_next)
            )
    else:
        dias = cfg.billing_default_dias_gracia if cfg.billing_default_dias_gracia is not None else 10
        fecha_vencimiento = fecha_emision + timedelta(days=dias)

    if cfg.billing_vencimiento_hora == "inicio_dia":
        return fecha_vencimiento.replace(hour=0, minute=0, second=0, microsecond=0)
    return fecha_vencimiento.replace(hour=23, minute=59, second=59, microsecond=0)


@celery_app.task(name="app.workers.billing.generate_monthly_invoices")
def generate_monthly_invoices(force: bool = False):
    """
    Busca todos los clientes activos con un plan activo y les genera
    su factura correspondiente al periodo del mes actual (formato MM/AAAA),
    evitando generar facturas duplicadas para el mismo periodo.

    Por defecto solo genera la factura de un cliente si hoy coincide con su día
    de generación configurado (Ajustes > Facturación) y ya se alcanzó la hora
    configurada. `force=True` (usado por el disparo manual) ignora ese filtro.
    """
    logger.info("Iniciando generación automática de facturas mensuales...")
    db = database.SessionLocal()
    
    try:
        # Obtener fecha actual en zona local
        now = datetime.now()
        periodo_actual = now.strftime("%m/%Y")
        cfg = _get_settings(db)

        # Obtener todos los clientes activos
        active_clients = db.query(Client).filter(Client.activo == True).all()
        logger.info(f"Se encontraron {len(active_clients)} clientes activos para facturar.")
        
        invoices_created = 0
        
        for client in active_clients:
            if not force and not _debe_generar_hoy(now, client, cfg):
                continue

            # Buscar el plan activo del cliente
            active_client_plan = (
                db.query(ClientPlan)
                .filter(ClientPlan.cliente_id == client.id, ClientPlan.estado == "activo")
                .first()
            )
            
            if not active_client_plan or not active_client_plan.plan:
                logger.warning(f"El cliente {client.nombre} ({client.id}) está activo pero no tiene un plan activo asignado.")
                continue
                
            plan = active_client_plan.plan
            
            # Verificar si ya existe factura para este cliente en el periodo actual
            existing_invoice = (
                db.query(Invoice)
                .filter(Invoice.cliente_id == client.id, Invoice.periodo == periodo_actual)
                .first()
            )
            
            if existing_invoice:
                logger.info(f"El cliente {client.nombre} ya tiene una factura para el periodo {periodo_actual}.")
                continue
                
            # Crear factura
            fecha_emision = now
            fecha_vencimiento = _resolve_fecha_vencimiento(fecha_emision, client, cfg)
            
            # Calcular monto total: plan base + servicios personalizados
            active_custom_services = list(client.custom_services)
            monto_total = plan.precio + sum(cs.precio for cs in active_custom_services)
            
            new_invoice = Invoice(
                cliente_id=client.id,
                plan_id=plan.id,
                periodo=periodo_actual,
                monto=monto_total,
                fecha_emision=fecha_emision,
                fecha_vencimiento=fecha_vencimiento,
                estado="pendiente",
                custom_services=active_custom_services
            )
            
            # Remover servicios no recurrentes del cliente
            for cs in active_custom_services:
                if not cs.recurrente:
                    client.custom_services.remove(cs)
            
            db.add(new_invoice)
            invoices_created += 1
            logger.info(f"Factura generada para {client.nombre} — Periodo: {periodo_actual}, Monto: ${monto_total:.2f}")
            
        db.commit()
        logger.info(f"Generación de facturas completada. Facturas creadas: {invoices_created}")
        return {"status": "success", "invoices_created": invoices_created}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error en generate_monthly_invoices: {str(e)}", exc_info=True)
        return {"status": "error", "detail": str(e)}
    finally:
        db.close()


@celery_app.task(name="app.workers.billing.check_overdue_invoices")
def check_overdue_invoices():
    """
    Tarea diaria que busca facturas en estado 'pendiente' cuyo vencimiento
    ya pasó y las actualiza a estado 'vencido'.
    """
    logger.info("Iniciando verificación diaria de facturas vencidas...")
    db = database.SessionLocal()
    
    try:
        now = datetime.now()
        
        # Buscar facturas pendientes cuya fecha_vencimiento sea menor que ahora
        overdue_invoices = (
            db.query(Invoice)
            .filter(Invoice.estado == "pendiente", Invoice.fecha_vencimiento < now)
            .all()
        )
        
        updated_count = 0
        for invoice in overdue_invoices:
            invoice.estado = "vencido"
            updated_count += 1
            logger.info(f"Factura {invoice.id} del cliente {invoice.cliente_id} marcada como VENCIDA.")
            
        db.commit()
        logger.info(f"Verificación de vencimientos completada. Facturas marcadas como vencidas: {updated_count}")
        return {"status": "success", "updated_count": updated_count}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error en check_overdue_invoices: {str(e)}", exc_info=True)
        return {"status": "error", "detail": str(e)}
    finally:
        db.close()
