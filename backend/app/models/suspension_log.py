"""
Modelo SQLAlchemy: SuspensionLog
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SuspensionLog(Base):
    __tablename__ = "suspension_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    cliente_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    motivo: Mapped[str] = mapped_column(String(255), nullable=False)
    fecha_suspension: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    fecha_reactivacion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relaciones
    client = relationship("Client")
    usuario = relationship("User")

    @property
    def usuario_nombre(self) -> str | None:
        return self.usuario.nombre if self.usuario else None

    def __repr__(self) -> str:
        return f"<SuspensionLog id={self.id} cliente_id={self.cliente_id} motivo={self.motivo}>"
