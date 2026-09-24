const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Base de datos simulada en memoria
const products = [
  { id: 101, name: 'Laptop Pro 16"', price: 1499.99, stock: 15 },
  { id: 102, name: 'Monitor 4K 27"', price: 399.50, stock: 30 },
  { id: 103, name: 'Teclado Mecánico RGB', price: 89.90, stock: 50 },
  { id: 104, name: 'Mouse Ergonómico', price: 45.00, stock: 100 }
];

const orders = [];

// ==========================================
// RUTAS DE NEGOCIO (MAIN APPLICATION LOGIC)
// ==========================================

// 1. Obtener catálogo de productos
app.get('/api/products', (req, res) => {
  // Simular pequeña latencia de procesamiento de negocio
  setTimeout(() => {
    res.json({
      success: true,
      service: 'Main Business App',
      timestamp: new Date().toISOString(),
      data: products
    });
  }, 40);
});

// 2. Crear una nueva orden de compra
app.post('/api/orders', (req, res) => {
  const { productId, quantity } = req.body || {};
  
  if (!productId || !quantity) {
    return res.status(400).json({
      success: false,
      error: 'Se requiere productId y quantity'
    });
  }

  const product = products.find(p => p.id === Number(productId));
  if (!product) {
    return res.status(404).json({
      success: false,
      error: 'Producto no encontrado'
    });
  }

  if (product.stock < quantity) {
    return res.status(400).json({
      success: false,
      error: 'Stock insuficiente'
    });
  }

  // Reducir stock y registrar orden
  product.stock -= quantity;
  const newOrder = {
    id: `ORD-${Date.now()}`,
    productId: product.id,
    productName: product.name,
    quantity,
    total: product.price * quantity,
    createdAt: new Date().toISOString()
  };
  orders.push(newOrder);

  res.status(201).json({
    success: true,
    message: 'Orden procesada con éxito por la Aplicación Principal',
    order: newOrder
  });
});

// 3. Endpoint de Salud de la Aplicación (Salud interna)
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.json({
    status: 'UP',
    service: 'Main-Service',
    uptimeSeconds: Math.floor(process.uptime()),
    memoryMB: {
      rss: (memoryUsage.rss / 1024 / 1024).toFixed(2),
      heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
      heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2)
    }
  });
});

app.listen(PORT, () => {
  console.log(`[MAIN APP SERVICE] 🚀 Ejecutándose en puerto http://localhost:${PORT}`);
  console.log(`[MAIN APP SERVICE] ℹ️ Esta aplicación solo contiene lógica de negocio.`);
});
