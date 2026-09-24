const express = require('express');
const path = require('path');
const { fork } = require('child_process');

const DASHBOARD_PORT = process.env.PORT || 8080;

console.log('====================================================');
console.log(' 🚀  INICIANDO DEMOSTRACIÓN DEL PATRÓN SIDECAR ');
console.log('====================================================\n');

// 1. Iniciar Microservicio Principal (Lógica de Negocio)
const mainAppProcess = fork(path.join(__dirname, 'main-service', 'app.js'), [], {
  env: { ...process.env, PORT: 3000 }
});

// 2. Iniciar Microservicio Sidecar (Proxy, Métricas, Trazabilidad, Rate Limiter)
const sidecarProcess = fork(path.join(__dirname, 'sidecar-service', 'sidecar.js'), [], {
  env: { ...process.env, SIDECAR_PORT: 3001, MAIN_APP_PORT: 3000 }
});

// 3. Servidor Web del Dashboard Interactivo
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/info', (req, res) => {
  res.json({
    architecture: 'Sidecar Pattern Microservices',
    mainAppUrl: 'http://localhost:3000',
    sidecarUrl: 'http://localhost:3001',
    dashboardUrl: `http://localhost:${DASHBOARD_PORT}`
  });
});

app.listen(DASHBOARD_PORT, () => {
  console.log(`\n🌐 Dashboard Interactivo listo en: http://localhost:${DASHBOARD_PORT}`);
  console.log(`📌 App Principal (Negocio): http://localhost:3000`);
  console.log(`🛡️ Sidecar (Proxy/Seguridad/Métricas): http://localhost:3001\n`);
});

// Limpieza al cerrar procesos
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando servicios...');
  mainAppProcess.kill();
  sidecarProcess.kill();
  process.exit(0);
});
