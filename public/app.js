const SIDECAR_URL = 'http://localhost:3001';
const MAIN_APP_URL = 'http://localhost:3000';

// Elementos DOM
const btnGetProducts = document.getElementById('btnGetProducts');
const btnCreateOrder = document.getElementById('btnCreateOrder');
const btnDirectMain = document.getElementById('btnDirectMain');
const btnBurstTraffic = document.getElementById('btnBurstTraffic');
const btnClearLogs = document.getElementById('btnClearLogs');
const btnCrashMain = document.getElementById('btnCrashMain');
const btnRecoverMain = document.getElementById('btnRecoverMain');

const toggleTracing = document.getElementById('toggleTracing');
const toggleRateLimit = document.getElementById('toggleRateLimit');
const toggleSecurity = document.getElementById('toggleSecurity');

const mTotal = document.getElementById('mTotal');
const mSuccess = document.getElementById('mSuccess');
const mRateLimited = document.getElementById('mRateLimited');
const mAvgLatency = document.getElementById('mAvgLatency');
const mainHealthStatus = document.getElementById('mainHealthStatus');
const appStatus = document.getElementById('appStatus');

const logsContainer = document.getElementById('logsContainer');
const responseHeadersContainer = document.getElementById('responseHeadersContainer');
const responseJson = document.getElementById('responseJson');
const responseStatus = document.getElementById('responseStatus');

const packet1 = document.getElementById('packet1');
const packet2 = document.getElementById('packet2');

// ==========================================
// ANIMACIÓN VISUAL DE PAQUETES DE DATOS
// ==========================================
function triggerPacketAnimation(isDirectToMain = false) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  packet1.classList.remove('packet-active');
  packet2.classList.remove('packet-active');

  void packet1.offsetWidth; // Force reflow

  if (isDirectToMain) {
    // Si va directo a Main, no pasa visualmente por Sidecar
    packet2.classList.add('packet-active');
  } else {
    // Flujo normal por Sidecar: Cliente -> Sidecar -> Main Service
    packet1.classList.add('packet-active');
    setTimeout(() => {
      packet2.classList.add('packet-active');
    }, 300);
  }
}

// ==========================================
// REAL-TIME STREAM SSE DESDE EL SIDECAR
// ==========================================
function initSidecarEventStream() {
  const eventSource = new EventSource(`${SIDECAR_URL}/sidecar/stream`);

  eventSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      updateMetricsUI(payload.metrics);
      renderLogEntry(payload);
    } catch (e) {
      console.error('Error parseando SSE', e);
    }
  };

  eventSource.onerror = () => {
    console.warn('Reconectando SSE con Sidecar...');
  };
}

function updateMetricsUI(metrics) {
  if (!metrics) return;
  mTotal.textContent = metrics.total;
  mSuccess.textContent = metrics.success;
  mRateLimited.textContent = metrics.rateLimited;
  mAvgLatency.textContent = `${metrics.avgLatency} ms`;

  if (metrics.mainStatus === 'HEALTHY') {
    mainHealthStatus.className = 'badge badge-success';
    mainHealthStatus.textContent = 'HEALTHY (100%)';
  } else if (metrics.mainStatus === 'DOWN') {
    mainHealthStatus.className = 'badge badge-danger';
    mainHealthStatus.textContent = 'DOWN 😵';
  } else {
    mainHealthStatus.className = 'badge badge-danger';
    mainHealthStatus.textContent = metrics.mainStatus;
  }
}

function renderLogEntry(payload) {
  const div = document.createElement('div');
  const timeStr = new Date(payload.timestamp).toLocaleTimeString();
  
  let entryClass = 'system-log';
  let message = '';

  switch (payload.type) {
    case 'REQUEST_INTERCEPTED':
      entryClass = 'intercepted';
      message = `🛡️ [SIDECAR INTERCEPTÓ] ${payload.data.method} ${payload.data.url} (Trace-ID: ${payload.data.traceId})`;
      break;
    case 'RESPONSE_PROXIED':
      entryClass = 'proxied';
      message = `✅ [SIDECAR PROXIED] ${payload.data.path} -> ${payload.data.statusCode} (${payload.data.durationMs}ms)`;
      break;
    case 'RATE_LIMIT_BLOCKED':
      entryClass = 'blocked';
      message = `⛔ [SIDECAR RATE-LIMITER] Petición a ${payload.data.path} BLOQUEADA (Excedió ${payload.data.limit} req/10s)`;
      break;
    case 'HEALTH_CHECK':
      message = `🩺 [SIDECAR MONITOR] Health Check -> App Principal estado: ${payload.data.status} (${payload.data.pingMs}ms)`;
      break;
    case 'CONFIG_UPDATED':
      message = `⚙️ [SIDECAR CONFIG] Características actualizadas: Tracing: ${payload.data.tracingEnabled}, RateLimit: ${payload.data.rateLimitingEnabled}`;
      break;
    default:
      message = `ℹ️ [SIDECAR LOG] ${JSON.stringify(payload.data)}`;
  }

  div.className = `log-entry ${entryClass}`;
  div.innerHTML = `<span class="time">[${timeStr}]</span> <span class="msg">${message}</span>`;
  
  logsContainer.appendChild(div);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

// ==========================================
// REALIZAR PETICIONES HTTP
// ==========================================
async function makeRequest(url, method = 'GET', body = null, isDirect = false) {
  triggerPacketAnimation(isDirect);

  try {
    const options = { method, headers: {} };
    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const data = await res.json();

    // Extraer headers de respuesta
    const headersList = [];
    res.headers.forEach((val, key) => {
      headersList.push({ key, val });
    });

    renderResponseUI(res.status, headersList, data, isDirect);
  } catch (err) {
    renderResponseUI(500, [], { error: err.message, note: 'Asegúrate de que los microservicios estén iniciados.' }, isDirect);
  }
}

function renderResponseUI(status, headers, jsonBody, isDirect) {
  responseStatus.textContent = `HTTP ${status}`;
  responseStatus.style.background = status < 400 ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 82, 82, 0.2)';
  responseStatus.style.color = status < 400 ? 'var(--accent-green)' : 'var(--accent-red)';

  let headersHtml = isDirect 
    ? `<div style="color: var(--accent-orange)">⚠️ Petición enviada DIRECTAMENTE a la App Principal (:3000). El Sidecar NO intervino. NO hay Trace-ID ni Headers de Seguridad inyectados.</div>`
    : `<strong>Encabezados Inyectados/Devueltos por el Sidecar:</strong><br>`;

  headers.forEach(h => {
    if (h.key.toLowerCase().startsWith('x-sidecar') || h.key.toLowerCase() === 'x-trace-id') {
      headersHtml += `<span class="header-tag"><strong class="header-key">${h.key}:</strong> ${h.val} 🔥</span>`;
    } else {
      headersHtml += `<span class="header-tag"><span class="header-key">${h.key}:</span> ${h.val}</span>`;
    }
  });

  responseHeadersContainer.innerHTML = headersHtml;
  responseJson.textContent = JSON.stringify(jsonBody, null, 2);
}

// ==========================================
// ACTUALIZAR CONFIGURACIÓN DEL SIDECAR
// ==========================================
async function updateSidecarConfig() {
  try {
    await fetch(`${SIDECAR_URL}/sidecar/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tracingEnabled: toggleTracing.checked,
        rateLimitingEnabled: toggleRateLimit.checked,
        securityHeadersEnabled: toggleSecurity.checked
      })
    });
  } catch (e) {
    console.error('Error actualizando config del Sidecar', e);
  }
}

// ==========================================
// EVENT LISTENERS
// ==========================================
btnGetProducts.addEventListener('click', () => {
  makeRequest(`${SIDECAR_URL}/api/products`);
});

btnCreateOrder.addEventListener('click', () => {
  makeRequest(`${SIDECAR_URL}/api/orders`, 'POST', { productId: 101, quantity: 1 });
});

btnDirectMain.addEventListener('click', () => {
  makeRequest(`${MAIN_APP_URL}/api/products`, 'GET', null, true);
});

btnBurstTraffic.addEventListener('click', async () => {
  // Disparar 12 peticiones seguidas rápidamente para provocar Rate Limiter
  for (let i = 1; i <= 12; i++) {
    makeRequest(`${SIDECAR_URL}/api/products`);
    await new Promise(r => setTimeout(r, 80));
  }
});

toggleTracing.addEventListener('change', updateSidecarConfig);
toggleRateLimit.addEventListener('change', updateSidecarConfig);
toggleSecurity.addEventListener('change', updateSidecarConfig);

// ==========================================
// SIMULACIÓN DE CAÍDA DEL MAIN SERVICE (EFECTO WOW)
// ==========================================
function appendLocalLog(message, entryClass = 'system-log') {
  const div = document.createElement('div');
  const timeStr = new Date().toLocaleTimeString();
  div.className = `log-entry ${entryClass}`;
  div.innerHTML = `<span class="time">[${timeStr}]</span> <span class="msg">${message}</span>`;
  logsContainer.appendChild(div);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

async function triggerMainCrash(recovered) {
  try {
    const endpoint = recovered ? '/api/recover' : '/api/crash';
    const res = await fetch(`${MAIN_APP_URL}${endpoint}`, { method: 'POST' });
    const data = await res.json();

    if (recovered) {
      appStatus.classList.remove('is-down');
      appStatus.innerHTML = '<span class="dot"></span><span>En línea</span>';
      appendLocalLog(`🔋 ${data.message || 'Main Service recuperado'}`, 'proxied');
    } else {
      appStatus.classList.add('is-down');
      appStatus.innerHTML = '<span class="dot" aria-hidden="true"></span><span>App caída</span>';
      appendLocalLog(`💥 ${data.message || 'Main Service caído'}`, 'blocked');
    }

    renderResponseUI(res.status, [], data, true);
  } catch (e) {
    console.error('Error simulando caída/recuperación', e);
    renderResponseUI(500, [], { error: e.message }, true);
  }
}

btnCrashMain.addEventListener('click', () => triggerMainCrash(false));
btnRecoverMain.addEventListener('click', () => triggerMainCrash(true));

btnClearLogs.addEventListener('click', () => {
  logsContainer.innerHTML = '';
});

// Inicialización
initSidecarEventStream();
