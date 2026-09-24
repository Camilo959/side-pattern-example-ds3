# Documentación de la aplicación: Sidecar Pattern en Microservicios

## 1. Visión general

Esta aplicación es una demostración interactiva del patrón Sidecar en arquitectura de microservicios, implementada con Node.js y Express. Su objetivo es mostrar cómo un servicio auxiliar (el Sidecar) puede interceptar, controlar y mejorar el tráfico de una aplicación principal sin tocar la lógica de negocio del servicio central.

La idea principal es separar responsabilidades:

- La aplicación principal se enfoca en la lógica de negocio.
- El Sidecar se encarga de preocupaciones transversales como trazabilidad, seguridad, limitación de tráfico, monitoreo y métricas.

Esto permite un diseño más desacoplado, reusable y mantenible.

---

## 2. Objetivo del proyecto

El proyecto pretende ilustrar de forma práctica los siguientes conceptos:

- arquitectura de microservicios
- patrón Sidecar
- separación de responsabilidades
- proxy inverso simple
- trazabilidad distribuida
- rate limiting
- headers de seguridad
- monitoreo de salud
- dashboard en tiempo real con Server-Sent Events (SSE)

El proyecto no pretende ser un sistema productivo completo, sino una representación clara y didáctica de cómo se puede aplicar el patrón Sidecar.

---

## 3. Arquitectura general

La aplicación está dividida en tres capas principales:

1. Cliente / navegador
2. Sidecar o proxy lateral
3. Microservicio principal

### Diagrama conceptual

```text
Cliente Web
   |
   v
Puerto 8080
   |
   v
Dashboard / UI
   |
   v
[ Sidecar Service ]  :3001
   |  - intercepta tráfico
   |  - agrega X-Trace-ID
   |  - rate limiting
   |  - headers de seguridad
   |  - métricas y monitoreo
   v
[ Main Service ]     :3000
   |  - lógica de negocio
   |  - catálogo de productos
   |  - creación de órdenes
   v
Respuestas y eventos en tiempo real
```

### Comportamiento real

Cuando el cliente hace una petición a través del Sidecar:

- el Sidecar recibe la solicitud
- valida si debe bloquearla por rate limiting
- genera un identificador único de trazabilidad
- inyecta encabezados adicionales
- reenvía la petición a la aplicación principal
- captura la respuesta
- agrega más headers de seguridad y métricas
- responde al cliente

La lógica de negocio no tiene que preocuparse por esos aspectos.

---

## 4. Componentes del proyecto

### 4.1. `server.js`

Es el orquestador general del sistema. Su responsabilidad es iniciar los procesos de:

- servicio principal en puerto 3000
- sidecar en puerto 3001
- dashboard web en puerto 8080

Además, expone un endpoint de información general:

- `GET /api/info`

Este endpoint devuelve la configuración general de la arquitectura, como:

- URL del servicio principal
- URL del sidecar
- URL del dashboard

También gestiona la limpieza de procesos al cerrar la aplicación con `SIGINT`.

### 4.2. `main-service/app.js`

Es la capa de negocio del sistema. Aquí se implementa la lógica real del negocio con Express.

#### Funcionalidades de negocio

- `GET /api/products`: devuelve un catálogo fijo de productos en memoria
- `POST /api/orders`: crea una orden y descuenta stock
- `GET /health`: responde el estado de salud del servicio

#### Datos internos

Mantiene en memoria dos colecciones:

- `products`: listado de productos
- `orders`: historial de órdenes creadas

Aunque es una demo, esta estructura permite simular perfectamente una lógica de negocio real y validar el flujo del Sidecar sobre un servicio funcional.

#### Observación importante

La aplicación principal no agrega trazabilidad ni seguridad. Su objetivo es ser un servicio “limpio”, con solo negocio.

### 4.3. `sidecar-service/sidecar.js`

Este es el componente central de la demostración. El sidecar actúa como una capa de control situada entre el cliente y la app principal.

#### Responsabilidades principales

- interceptar todas las peticiones
- aplicar rate limiting
- generar `X-Trace-ID`
- inyectar headers de seguridad
- medir latencia y tiempos de respuesta
- hacer health checks periódicos del servicio principal
- publicar eventos en tiempo real al dashboard
- servir endpoints de control para cambiar configuración dinámicamente

### 4.4. `public/`

Contiene la interfaz web del dashboard:

- `public/index.html`: estructura visual
- `public/styles.css`: estilos y tema oscuro
- `public/app.js`: lógica del cliente y conectividad con el sidecar

El dashboard permite:

- invocar endpoints a través del sidecar
- invocar llamada directa al servicio principal
- activar o desactivar opciones del Sidecar en tiempo real
- disparar ráfagas de tráfico para probar el rate limiter
- ver logs de eventos, headers y respuestas JSON

---

## 5. Servicios y puertos

| Componente | Puerto | Propósito |
|---|---:|---|
| Dashboard web | 8080 | Interfaz de visualización y pruebas |
| Main Service | 3000 | Lógica de negocio |
| Sidecar | 3001 | Proxy, seguridad, trazabilidad y métricas |

---

## 6. Endpoints principales

### 6.1. Main Service

#### `GET /api/products`

Devuelve el catálogo de productos con información como:

- id
- nombre
- precio
- stock

#### `POST /api/orders`

Recibe un body con:

```json
{
  "productId": 101,
  "quantity": 2
}
```

Valida:

- que el producto exista
- que la cantidad sea válida
- que haya stock suficiente

Si todo es correcto, descuenta el stock y crea una orden.

#### `GET /health`

Retorna el estado del servicio principal con:

- status
- uptime
- uso de memoria

### 6.2. Sidecar

#### `GET /sidecar/status`

Devuelve el estado interno del sidecar y sus métricas.

#### `POST /sidecar/config`

Permite activar/desactivar en tiempo real:

- tracingEnabled
- rateLimitingEnabled
- securityHeadersEnabled

#### `GET /sidecar/stream`

Genera un flujo SSE para que el frontend reciba notificaciones en vivo sobre:

- peticiones interceptadas
- respuestas proxy
- bloqueos por límite de tasa
- health checks
- cambios de configuración

#### Proxy general

El sidecar captura cualquier ruta con `app.all('*', ...)` y la reenvía al servicio principal usando `http.request`.

---

## 7. Funcionalidades del Sidecar

### 7.1. Trazabilidad

El sidecar genera un identificador único por cada solicitud:

```text
trace-<valor-aleatorio>
```

Ese identificador se inyecta en:

- header `x-trace-id` hacia la app principal
- header `X-Trace-ID` en la respuesta al cliente

Esto permite correlacionar la petición a través de distintos componentes del sistema.

### 7.2. Rate limiting

El sidecar mantiene un contador por IP y valida el número de peticiones dentro de una ventana de 10 segundos.

Configuración actual:

- ventana: 10000 ms
- máximo: 10 peticiones por ventana

Si se excede el límite,

- se incrementa la métrica de `rateLimitedRequests`
- se emite un evento de bloqueo
- se responde con HTTP 429

Es una demostración clara de cómo un Sidecar puede proteger al servicio principal de abuso o sobrecarga.

### 7.3. Seguridad

El sidecar agrega headers de respuesta como:

- `X-Sidecar-Protected: true`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`

Esto hace visible la capa de defensa transversal sin alterar la lógica del negocio.

### 7.4. Métricas y monitoreo

El sidecar lleva métricas internas como:

- peticiones totalizadas
- peticiones exitosas
- peticiones fallidas
- peticiones rate-limited
- latencia promedio
- estado de salud del servicio principal
- última verificación de salud

Estas métricas se envían al frontend a través de SSE.

### 7.5. Health checks

Cada 5 segundos, el Sidecar hace un `http.get` a `localhost:3000/health` para verificar si la aplicación principal está viva.

Si la app está arriba, marca el estado como `HEALTHY`; si falla, lo marca como `DOWN` o `DEGRADED`.

---

## 8. Manejo de estado y datos

### Datos en memoria

La app usa datos locales y transitorios en memoria:

- `products` en Main Service
- `orders` en Main Service
- `requestCounts` en Sidecar para rate limiting
- `metrics` en Sidecar para observabilidad

### Ventaja

Esto hace que la demo sea simple, visual y fácil de ejecutar.

### Limitación

Los datos se pierden cuando se reinicia el proceso. Para producción sería necesario:

- base de datos persistente
- almacenamiento externo para órdenes
- historial de trazas
- métricas persistentes o exportables

---

## 9. Flujo de una petición completa

### Caso normal: llamada a través del Sidecar

1. El cliente envía una solicitud a `http://localhost:3001/...`
2. El Sidecar recibe la petición
3. Se valida el rate limit
4. Se crea un `traceId`
5. Se agregan headers de trazabilidad
6. Se reenvía la petición a la aplicación principal en `localhost:3000`
7. La app principal procesa la lógica de negocio
8. El Sidecar recibe la respuesta
9. Inyecta headers adicionales de seguridad y métricas
10. Envía la respuesta al cliente
11. Emite eventos SSE para que el dashboard muestre métricas y logs

### Caso directo a la app principal

1. El cliente llama a `http://localhost:3000/...`
2. La app principal responde sin pasar por el Sidecar
3. No hay trazabilidad, no hay security headers ni rate limit
4. El dashboard marca claramente que la petición fue directa

Esto cumple un objetivo clave del ejemplo: demostrar que la lógica de negocio es independiente del sidecar y que el sidecar añade capacidades sin alterar el código principal.

---

## 10. Interfaz del dashboard

La UI del proyecto se encarga de:

- invocar peticiones HTTP
- mostrar el flujo de tráfico visualmente
- documentar el resultado de cada llamada con status y JSON
- mostrar encabezados de respuesta
- listar eventos del sidecar en tiempo real
- permitir activar/desactivar capacidades de monitoreo y bloqueo

### Controles disponibles

- Obtener productos vía Sidecar
- Crear orden vía Sidecar
- Llamada directa a la app principal
- Ráfaga de tráfico
- Limpiar logs
- Toggles para:
  - tracing
  - rate limiting
  - security headers

---

## 11. Dependencias del proyecto

El proyecto usa las siguientes dependencias principales:

- `express`: framework web para Node.js
- `cors`: habilita CORS para pruebas desde distintos orígenes

### Dependencias de desarrollo o ejecución

No hay una capa de build compleja ni compilación. La solución es ejecutada directamente con Node.js.

---

## 12. Cómo ejecutar la aplicación

### Instalación

```bash
npm install
```

### Ejecución

```bash
npm start
```

### Acceso

Abrir en el navegador:

```text
http://localhost:8080
```

---

## 13. Fortalezas de la aplicación

- clara demostración del patrón Sidecar
- separación de responsabilidades muy visible
- fácil de entender y ejecutar
- buen ejemplo para educación y presentaciones
- permite realizar pruebas interactivas de rate limit y trazabilidad
- usa SSE para mostrar eventos en tiempo real

---

## 14. Limitaciones actuales

Aunque es excelente como demo educativa, la aplicación tiene limitaciones:

- los datos están en memoria
- no hay persistencia real
- no hay base de datos ni transacciones
- no hay autenticación ni autorización
- no hay contenedores ni orquestación de microservicios
- no hay almacenamiento de logs ni trazas a largo plazo
- no hay pruebas automatizadas
- no hay manejo avanzado de errores ni recuperación ante fallos
- no hay despliegue real en nube ni balanceo de carga

---

## 15. Cómo hacerla más robusta

Para convertir esta demo en una implementación más sólida y cercana a producción, se recomienda:

### 15.1. Persistencia

- migrar productos y órdenes a una base de datos (MongoDB, PostgreSQL, MySQL)
- usar un modelo de datos real con entidades y relaciones

### 15.2. Mejor control de configuración

- usar variables de entorno con `dotenv`
- extraer puertos, límites y configuraciones a archivos de entorno

### 15.3. Mejores patrones de observabilidad

- integrar logs estructurados
- agregar OpenTelemetry
- enviar métricas a Prometheus o Grafana
- centralizar trazas con Jaeger o Zipkin

### 15.4. Seguridad real

- validación de entrada más estricta
- rate limiting por usuario, no solo por IP
- CORS configurable
- helmet para headers HTTP
- manejo de tokens o autenticación JWT

### 15.5. Testing

- pruebas unitarias para lógica de negocio
- pruebas de integración para sidecar y servicio principal
- pruebas de regresión para rate limiting
- pruebas de health checks

### 15.6. Contenedorización

- Dockerfile para cada servicio
- docker-compose para orquestar app principal, sidecar y dashboard

### 15.7. CI/CD

- automatizar lint, tests y despliegues
- validar calidad de código en cada commit

### 15.8. Estrategia de resiliencia

- retries en llamadas entre sidecar y app principal
- circuit breakers
- timeouts más robustos
- manejo de fallos graceful degradation

---

## 16. Conclusión

Esta aplicación demuestra de manera práctica y visual cómo un Sidecar puede actuar como una capa transversal que complementa un microservicio principal. El ejemplo es muy útil para entender que la lógica de negocio puede mantenerse simple, mientras el servicio auxiliar se encarga de problemas comunes en sistemas distribuidos.

El proyecto funciona muy bien como base pedagógica, y puede evolucionar hacia una arquitectura más robusta incorporando persistencia, observabilidad real, seguridad avanzada y automatización de despliegue.

---

## 17. Resumen técnico rápido

- Stack: Node.js + Express
- Arquitectura: Sidecar Pattern
- Puerto principal: 3000
- Puerto sidecar: 3001
- Puerto dashboard: 8080
- Tipo de datos: memoria local
- Propósito: demostración didáctica y visual
- Fortalezas: claridad, separación de responsabilidades, interacción en tiempo real
- Mejoras sugeridas: persistencia, configuración externa, pruebas, logs, seguridad, contenedores
