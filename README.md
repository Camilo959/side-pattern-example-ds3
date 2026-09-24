# 🛡️ Patrón Sidecar (Sidecar Pattern) en Microservicios

Este proyecto es una **demostración práctica, interactiva e ilustrativa** de la implementación del **Patrón Sidecar (Sidecar Pattern)** en una arquitectura de Microservicios usando Node.js y Express.

---

## 💡 ¿Qué es el Patrón Sidecar?

En la arquitectura de microservicios, el **Sidecar Pattern** consiste en desplegar un componente secundario (el *Sidecar* o "sidecar de la motocicleta") al lado del servicio principal (*Main Application*).

### Características Clave:
1. **Co-localización (Localhost / Mismo Pod)**: Ambos componentes residen en la misma máquina o grupo de contenedores (Pod en Kubernetes) y se comunican a través de `localhost`.
2. **Separación de Responsabilidades**: La **Aplicación Principal** se enfoca exclusivamente en la **lógica de negocio** (ej. catálogo de productos, procesamiento de compras). El **Sidecar** asume responsabilidades transversales (*Cross-Cutting Concerns*) como:
   - Proxy inverso y enrutamiento de tráfico.
   - Inyección de trazabilidad distribuida (`X-Trace-ID`).
   - Limitación de tasa (*Rate Limiting*).
   - Recolección de métricas y monitoreo de salud (*Health Checks*).
   - Inyección de encabezados de seguridad (*Security Headers*).
3. **Desacoplamiento y Reutilización**: El Sidecar puede actualizarse, reemplazarse o aplicarse a cualquier microservicio escrito en cualquier lenguaje (Node.js, Python, Java, Go) sin modificar una sola línea del código de negocio principal.

---

## 🏗️ Arquitectura del Proyecto

```
                         +-------------------------------------------------------+
                         |           MISMO HOST / POD (Localhost)                |
                         |                                                       |
  [ CLIENTE / WEB UI ] --+--> [ SIDECAR PROXY ] --(Loopback)--> [ MAIN SERVICE ] |
      (Port 8080)        |     (Puerto :3001)                   (Puerto :3000)   |
                         |                                                       |
                         |  - Inyecta X-Trace-ID                - Lógica Negocio |
                         |  - Rate Limiter (Max 10/10s)         - GET /products  |
                         |  - Monitoreo /health                 - POST /orders   |
                         |  - Headers de Seguridad                               |
                         +-------------------------------------------------------+
```

### Componentes:
- **`main-service/app.js` (Puerto 3000)**: Microservicio principal con la lógica pura de negocio.
- **`sidecar-service/sidecar.js` (Puerto 3001)**: Microservicio Sidecar que intercepta el tráfico, gestiona seguridad, métricas y trazabilidad.
- **`public/` & `server.js` (Puerto 8080)**: Dashboard web interactivo con diagrama de arquitectura animado en tiempo real.

---

## 💥 Efecto WOW: Simular la Caída del Main Service

La demo incluye un mecanismo para **simular la caída de la aplicación principal sin matar el proceso** (100% recuperable):

- **`POST /api/crash`** → pone al Main Service en estado `DOWN` (responde **HTTP 503** en todas sus rutas, incluido `/health`).
- **`POST /api/recover`** → restaura el servicio al instante, sin reiniciar nada ni perder datos.

### Flujo de demostración
1. Haz clic en **"💥 Simular Caída del Main Service"** en el dashboard.
2. Observa cómo el **Health Check del Sidecar cambia a `DOWN` en tiempo real** vía SSE, mientras el Sidecar sigue vivo respondiendo.
3. Ejecuta una petición: el Sidecar responde con un mensaje controlado (**HTTP 503**) e inyectando `X-Trace-ID` y headers de seguridad, en lugar de romper la conexión o colgar el navegador.
4. Haz clic en **"🔋 Recuperar Main Service"** → el servicio vuelve a `HEALTHY` automáticamente.

> **Argumento técnico para el profe:** *"Aunque la lógica de negocio colapsó, el Sidecar sigue respondiendo, registrando la latencia y notificando al sistema de monitoreo. La app principal no tiene que saber defenderse a sí misma."*

---

## 🚀 Instrucciones para Ejecutar

### 1. Instalar dependencias
```bash
npm install
```

### 2. Iniciar todos los servicios
```bash
npm start
```

### 3. Abrir en el navegador
Abre la siguiente URL en tu navegador:
👉 **[http://localhost:8080](http://localhost:8080)**

---

## 🧪 Pruebas Recomendadas en la Consola

1. **Petición con Sidecar (`GET /api/products` a puerto :3001)**:
   - Observa cómo el Sidecar intercepta la petición, genera un `X-Trace-ID` único, mide la latencia e inyecta encabezados de seguridad antes de entregar la respuesta al cliente.
2. **Petición Directa a la App Principal (`GET /api/products` a puerto :3000)**:
   - Nota que la petición funciona pero **NO contiene trazabilidad ni seguridad**, demostrando cómo la app de negocio está totalmente libre de ese código.
3. **Ráfaga de Tráfico (Probar Rate Limiter)**:
   - Haz clic en **"Ráfaga de Tráfico"**. El Sidecar bloqueará las peticiones adicionales con código HTTP 429 cuando superen el límite permitido, protegiendo a la App Principal de sobrecargas.
4. **Interruptores en Vivo**:
   - Activa/Desactiva en tiempo real la inyección de Trace ID o el Rate Limiter desde el panel y realiza nuevas peticiones.
5. **Simulación de Caída (Efecto WOW)**:
   - Haz clic en **"💥 Simular Caída del Main Service"**. El dashboard muestra el estado `DOWN` en vivo y las peticiones devuelven **HTTP 503** controlado con headers del Sidecar. Luego pulsa **"🔋 Recuperar Main Service"** y observa cómo vuelve a `HEALTHY`.

---

## 📄 Estructura de Archivos

- `server.js` - Script orquestador que inicia el Main Service, el Sidecar y el Dashboard.
- `main-service/app.js` - Código del Microservicio Principal (Lógica de Negocio).
- `sidecar-service/sidecar.js` - Código del Microservicio Sidecar (Proxy, Métricas, Trazabilidad).
- `public/index.html` - Interfaz gráfica del Dashboard.
- `public/styles.css` - Estilos visuales con estética futurista / dark mode.
- `public/app.js` - Lógica cliente, SSE (Server-Sent Events) y animaciones.
