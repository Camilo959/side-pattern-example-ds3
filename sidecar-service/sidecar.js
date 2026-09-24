const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
const SIDECAR_PORT = process.env.SIDECAR_PORT || 3001;
const MAIN_APP_PORT = process.env.MAIN_APP_PORT || 3000;
const MAIN_APP_URL = `http://localhost:${MAIN_APP_PORT}`;

app.use(cors());
app.use(express.json());

// ==========================================
// ESTADO INTERNO Y MÉTRICAS DEL SIDECAR
// ==========================================
const sidecarState = {
  features: {
    tracingEnabled: true,
    rateLimitingEnabled: true,
    securityHeadersEnabled: true,
    metricsCollectionEnabled: true
  },
  metrics: {
    totalRequestsProxied: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitedRequests: 0,
    avgLatencyMs: 0,
    totalLatencyMs: 0,
    mainAppStatus: 'UNKNOWN',
    lastHealthCheck: null
  },
  rateLimitWindowMs: 10000, // 10 segundos
  maxRequestsPerWindow: 10,
  requestCounts: new Map(),
  sseClients: []
};

// ==========================================
// UTILIDAD: EMITIR EVENTOS REAL-TIME (SSE)
// ==========================================
function broadcastSidecarEvent(eventType, payload) {
  const data = JSON.stringify({
    timestamp: new Date().toISOString(),
    type: eventType,
    data: payload,
    metrics: {
      total: sidecarState.metrics.totalRequestsProxied,
      success: sidecarState.metrics.successfulRequests,
      failed: sidecarState.metrics.failedRequests,
      rateLimited: sidecarState.metrics.rateLimitedRequests,
      avgLatency: Math.round(sidecarState.metrics.avgLatencyMs),
      mainStatus: sidecarState.metrics.mainAppStatus
    }
  });

  sidecarState.sseClients.forEach(client => {
    client.res.write(`data: ${data}\n\n`);
  });
}

// ==========================================
// MONITOR DE SALUD DE LA APP PRINCIPAL
// ==========================================
function checkMainAppHealth() {
  const start = Date.now();
  const req = http.get(`${MAIN_APP_URL}/health`, { timeout: 2000 }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        sidecarState.metrics.mainAppStatus = 'HEALTHY';
      } else {
        sidecarState.metrics.mainAppStatus = 'DEGRADED';
      }
      sidecarState.metrics.lastHealthCheck = new Date().toISOString();
      broadcastSidecarEvent('HEALTH_CHECK', {
        status: sidecarState.metrics.mainAppStatus,
        pingMs: Date.now() - start
      });
    });
  });

  req.on('error', (err) => {
    sidecarState.metrics.mainAppStatus = 'DOWN';
    sidecarState.metrics.lastHealthCheck = new Date().toISOString();
    broadcastSidecarEvent('HEALTH_CHECK', {
      status: 'DOWN',
      error: err.message
    });
  });
}

// Health check periodic cada 5 segundos
setInterval(checkMainAppHealth, 5000);
setTimeout(checkMainAppHealth, 1000); // Check inicial

// ==========================================
// MIDDLEWARE DEL SIDECAR: RATE LIMITING
// ==========================================
function sidecarRateLimiter(req, res, next) {
  if (!sidecarState.features.rateLimitingEnabled) return next();

  const clientIp = req.ip || '127.0.0.1';
  const now = Date.now();
  
  if (!sidecarState.requestCounts.has(clientIp)) {
    sidecarState.requestCounts.set(clientIp, []);
  }

  const timestamps = sidecarState.requestCounts.get(clientIp)
    .filter(ts => now - ts < sidecarState.rateLimitWindowMs);
  
  timestamps.push(now);
  sidecarState.requestCounts.set(clientIp, timestamps);

  if (timestamps.length > sidecarState.maxRequestsPerWindow) {
    sidecarState.metrics.rateLimitedRequests++;
    
    broadcastSidecarEvent('RATE_LIMIT_BLOCKED', {
      ip: clientIp,
      path: req.url,
      method: req.method,
      limit: sidecarState.maxRequestsPerWindow,
      count: timestamps.length
    });

    return res.status(429).json({
      error: 'Too Many Requests',
      message: '[SIDECAR PROXY] Límite de peticiones alcanzado (Rate Limiter activo en el Sidecar).',
      sidecarNotice: 'Esta regla fue aplicada por el Sidecar sin modificar la App Principal.'
    });
  }

  next();
}

// ==========================================
// ENDPOINTS DE CONTROL DEL SIDECAR
// ==========================================

// Endpoint SSE para métricas en vivo
app.get('/sidecar/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sidecarState.sseClients.push(newClient);

  broadcastSidecarEvent('CLIENT_CONNECTED', { clientId });

  req.on('close', () => {
    sidecarState.sseClients = sidecarState.sseClients.filter(c => c.id !== clientId);
  });
});

// Obtener estado y métricas del Sidecar
app.get('/sidecar/status', (req, res) => {
  res.json({
    sidecar: 'Sidecar Proxy & Telemetry Agent',
    port: SIDECAR_PORT,
    targetMainApp: MAIN_APP_URL,
    features: sidecarState.features,
    metrics: sidecarState.metrics
  });
});

// Alternar características del Sidecar dinámicamente
app.post('/sidecar/config', (req, res) => {
  const { tracingEnabled, rateLimitingEnabled, securityHeadersEnabled } = req.body || {};
  
  if (typeof tracingEnabled === 'boolean') sidecarState.features.tracingEnabled = tracingEnabled;
  if (typeof rateLimitingEnabled === 'boolean') sidecarState.features.rateLimitingEnabled = rateLimitingEnabled;
  if (typeof securityHeadersEnabled === 'boolean') sidecarState.features.securityHeadersEnabled = securityHeadersEnabled;

  broadcastSidecarEvent('CONFIG_UPDATED', sidecarState.features);

  res.json({
    message: 'Configuración del Sidecar actualizada exitosamente',
    features: sidecarState.features
  });
});

// ==========================================
// PROXY REVERSO DEL SIDECAR (HACIA LA APP PRINCIPAL)
// ==========================================
app.use(sidecarRateLimiter);

app.all('*', (req, res) => {
  const startTime = Date.now();
  const traceId = `trace-${Math.random().toString(36).substring(2, 9)}`;

  sidecarState.metrics.totalRequestsProxied++;

  // Log de entrada interceptado por el Sidecar
  broadcastSidecarEvent('REQUEST_INTERCEPTED', {
    traceId,
    method: req.method,
    url: req.url,
    headers: req.headers
  });

  // Preparar headers enriquecidos por el Sidecar
  const proxyHeaders = { ...req.headers };
  if (sidecarState.features.tracingEnabled) {
    proxyHeaders['x-trace-id'] = traceId;
    proxyHeaders['x-sidecar-received-at'] = new Date().toISOString();
  }

  // Configuración de la petición HTTP hacia la Aplicación Principal
  const options = {
    hostname: 'localhost',
    port: MAIN_APP_PORT,
    path: req.url,
    method: req.method,
    headers: proxyHeaders
  };

  const proxyReq = http.request(options, (proxyRes) => {
    let responseBody = '';

    proxyRes.on('data', (chunk) => {
      responseBody += chunk;
    });

    proxyRes.on('end', () => {
      const durationMs = Date.now() - startTime;
      
      // Actualizar métricas
      sidecarState.metrics.totalLatencyMs += durationMs;
      sidecarState.metrics.avgLatencyMs = sidecarState.metrics.totalLatencyMs / sidecarState.metrics.totalRequestsProxied;

      if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 400) {
        sidecarState.metrics.successfulRequests++;
      } else {
        sidecarState.metrics.failedRequests++;
      }

      // Inyección de headers de respuesta por parte del Sidecar
      if (sidecarState.features.securityHeadersEnabled) {
        res.setHeader('X-Sidecar-Protected', 'true');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      }

      if (sidecarState.features.tracingEnabled) {
        res.setHeader('X-Trace-ID', traceId);
        res.setHeader('X-Sidecar-Latency-Ms', durationMs.toString());
      }

      res.setHeader('X-Sidecar-Proxy', `Node-Sidecar-Port-${SIDECAR_PORT}`);
      res.status(proxyRes.statusCode);

      // Reenviar tipo de contenido original
      if (proxyRes.headers['content-type']) {
        res.setHeader('Content-Type', proxyRes.headers['content-type']);
      }

      // Emitir evento de respuesta completada
      broadcastSidecarEvent('RESPONSE_PROXIED', {
        traceId,
        statusCode: proxyRes.statusCode,
        durationMs,
        path: req.url
      });

      res.send(responseBody);
    });
  });

  proxyReq.on('error', (err) => {
    const durationMs = Date.now() - startTime;
    sidecarState.metrics.failedRequests++;

    broadcastSidecarEvent('PROXY_ERROR', {
      traceId,
      error: err.message,
      durationMs
    });

    res.status(502).json({
      error: 'Bad Gateway (Sidecar Proxy Error)',
      message: `El Sidecar no pudo comunicarse con la App Principal en ${MAIN_APP_URL}`,
      details: err.message
    });
  });

  // Si hay cuerpo de la petición (ej. POST), escribirlo en el proxyReq
  if (req.body && Object.keys(req.body).length > 0) {
    const bodyData = JSON.stringify(req.body);
    proxyReq.setHeader('Content-Type', 'application/json');
    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
    proxyReq.write(bodyData);
  }

  proxyReq.end();
});

app.listen(SIDECAR_PORT, () => {
  console.log(`[SIDECAR SERVICE] 🛡️  Ejecutándose en puerto http://localhost:${SIDECAR_PORT}`);
  console.log(`[SIDECAR SERVICE] 🔄 Reenviando tráfico a App Principal en http://localhost:${MAIN_APP_PORT}`);
});
