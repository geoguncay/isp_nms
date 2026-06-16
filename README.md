# ISP Platform 🌐

> **Sistema de gestión centralizada para ISPs / WISPs** con integración MikroTik RouterOS API, túneles VPN ZeroTier, facturación electrónica ecuatoriana (SRI) y monitoreo en tiempo real.

---

## 🗺️ Arquitectura del Sistema

El sistema está diseñado para interactuar de forma segura y eficiente con múltiples MikroTik RouterOS remotos a través de una red privada ZeroTier VPN. A continuación se detallan los diagramas de arquitectura:

### 1. Vista General de la Arquitectura
![Vista General](architecture/isp_arch_overview.svg)

### 2. Flujo de Comunicación de Red
![Flujo de Red](architecture/isp_arch_network_flow.svg)

### 3. Lógica Interna del Backend
![Lógica del Backend](architecture/isp_arch_backend_internals.svg)

---

## 🛠️ Stack Tecnológico

El proyecto está estructurado como un monorepo para facilitar la gestión conjunta de todos los servicios.

### Backend (API & Workers)
* **Lenguaje:** Python 3.12+
* **Framework:** FastAPI (REST + WebSockets)
* **Base de Datos:** PostgreSQL 16 (con particionado mensual para muestras de tráfico)
* **Caché y Mensajería:** Redis 7 (broker de Celery y almacén de sesiones activas)
* **Tareas Asíncronas:** Celery & Celery Beat (health check periódico, recolección de tráfico, suspensiones automáticas)
* **Conectividad MikroTik:** `librouteros` (Pool de conexiones persistentes con reconexión automática)
* **ORM & Migraciones:** SQLAlchemy 2.0+ & Alembic 1.13+
* **Seguridad:** Cifrado Fernet para credenciales de routers y hashes de contraseñas de usuarios con bcrypt directo.

### Frontend (Panel Administrativo Web)
* **Framework:** React 18+ (Vite 5+ & TypeScript 5+)
* **Estilos:** Tailwind CSS 3.4+ & Componentes interactivos de **shadcn/ui**
* **Manejo de Estado:** Zustand (estado global) & TanStack Query v5 (caché e interactividad con el servidor)
* **Gráficos:** Recharts (tráfico en tiempo real y consumo de datos)
* **Mapas:** Leaflet (georreferenciación de clientes)
* **Formularios:** React Hook Form + validaciones estructuradas con Zod

### Aplicación Móvil (Técnicos de Campo)
* **Framework:** React Native + Expo (Expo Router para navegación orientada a archivos)
* **Estilos:** NativeWind (Tailwind CSS para componentes nativos)
* **Seguridad:** Almacenamiento local seguro con Expo SecureStore

---

## 📁 Estructura del Proyecto

```text
isp_platform/
├── backend/                  # Código fuente del backend (FastAPI)
│   ├── app/
│   │   ├── api/              # Routers FastAPI por módulo
│   │   ├── models/           # Modelos de base de datos SQLAlchemy
│   │   ├── schemas/          # Esquemas de validación Pydantic
│   │   ├── services/         # Lógica de negocio (MikroTik, SRI, etc.)
│   │   ├── core/             # Configuración del sistema, auth y seguridad
│   │   └── workers/          # Tareas asíncronas de Celery
│   ├── tests/                # Pruebas unitarias e integración (Pytest)
│   ├── alembic/              # Scripts de migración de base de datos
│   └── requirements.txt      # Dependencias del backend
├── frontend/                 # Panel web de administración (React)
│   ├── src/
│   │   ├── components/       # Componentes visuales comunes
│   │   ├── pages/            # Vistas por módulo de la plataforma
│   │   ├── stores/           # Almacenes de estado global (Zustand)
│   │   └── services/         # Clientes de consumo de API REST/WebSockets
├── architecture/             # Recursos visuales y diagramas SVG
├── nginx/                    # Archivos de configuración para proxy inverso
└── docker-compose.yml        # Orquestación de infraestructura en desarrollo
```

