/**
 * BramsStore API Manager Enterprise
 * Sistema de gestión de datos profesional con GitHub como backend
 * @version 1.0.0
 * @author BramsStore Development Team
 */

class BramsStoreAPI {
  constructor(config = {}) {
    this.config = {
      baseURL: 'https://raw.githubusercontent.com/Lex-Salas/bramsstore-data/main',
      updateURL: 'https://api.github.com/repos/Lex-Salas/bramsstore-data/contents',
      token: config.githubToken || null,
      autoSync: config.autoSync !== false,
      syncInterval: config.syncInterval || 30000, // 30 segundos
      retryAttempts: config.retryAttempts || 3,
      timeout: config.timeout || 10000,
      debug: config.debug || false,
      cacheTTL: config.cacheTTL || 300000, // 5 minutos
      ...config
    };

    this.cache = new Map();
    this.eventListeners = new Map();
    this.syncInterval = null;
    this.isOnline = navigator.onLine;
    this.lastSync = null;
    this.failedRequests = [];

    this.init();
  }

  /**
   * Inicializar el sistema API
   */
  init() {
    this.log('🚀 Inicializando BramsStore API Manager...');
    
    // Configurar eventos de conectividad
    window.addEventListener('online', () => this.handleOnlineStatus(true));
    window.addEventListener('offline', () => this.handleOnlineStatus(false));
    
    // Iniciar sincronización automática
    if (this.config.autoSync) {
      this.startAutoSync();
    }

    this.log('✅ API Manager inicializado correctamente');
  }

  /**
   * Sistema de logging profesional
   */
  log(message, type = 'info', data = null) {
    if (!this.config.debug) return;

    const timestamp = new Date().toISOString();
    const prefix = `[BramsAPI ${timestamp}]`;
    
    switch (type) {
      case 'error':
        console.error(`${prefix} ❌`, message, data);
        break;
      case 'warn':
        console.warn(`${prefix} ⚠️`, message, data);
        break;
      case 'success':
        console.log(`${prefix} ✅`, message, data);
        break;
      default:
        console.log(`${prefix} ℹ️`, message, data);
    }
  }

  /**
   * Gestión de estado de conectividad
   */
  handleOnlineStatus(isOnline) {
    this.isOnline = isOnline;
    this.log(`🌐 Estado de conexión: ${isOnline ? 'Online' : 'Offline'}`);
    
    if (isOnline) {
      this.emit('connection-restored');
      this.retryFailedRequests();
    } else {
      this.emit('connection-lost');
    }
  }

  /**
   * Sistema de eventos
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  emit(event, data = null) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          this.log(`Error en evento ${event}:`, 'error', error);
        }
      });
    }
  }

  /**
   * Obtener productos con cache inteligente
   */
  async getProducts(forceRefresh = false) {
    const cacheKey = 'products';
    
    if (!forceRefresh && this.isCacheValid(cacheKey)) {
      this.log('📦 Productos obtenidos desde cache');
      return this.cache.get(cacheKey).data;
    }

    try {
      this.log('🔄 Obteniendo productos desde servidor...');
      const data = await this.fetchWithRetry(`${this.config.baseURL}/products.json`);
      
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl: this.config.cacheTTL
      });

      this.emit('products-updated', data);
      this.log('✅ Productos actualizados correctamente');
      return data;

    } catch (error) {
      this.log('Error obteniendo productos:', 'error', error);
      
      // Intentar retornar cache expirado como fallback
      if (this.cache.has(cacheKey)) {
        this.log('⚠️ Retornando productos desde cache expirado');
        return this.cache.get(cacheKey).data;
      }
      
      throw new Error('No se pudieron obtener los productos');
    }
  }

  /**
   * Obtener pedidos con filtros avanzados
   */
  async getOrders(filters = {}) {
    const cacheKey = `orders_${JSON.stringify(filters)}`;
    
    if (this.isCacheValid(cacheKey)) {
      this.log('📋 Pedidos obtenidos desde cache');
      return this.cache.get(cacheKey).data;
    }

    try {
      this.log('🔄 Obteniendo pedidos desde servidor...');
      const data = await this.fetchWithRetry(`${this.config.baseURL}/orders.json`);
      
      // Aplicar filtros
      let filteredOrders = data.orders;
      
      if (filters.status) {
        filteredOrders = filteredOrders.filter(order => order.status === filters.status);
      }
      
      if (filters.dateFrom) {
        filteredOrders = filteredOrders.filter(order => 
          new Date(order.timestamps.created) >= new Date(filters.dateFrom)
        );
      }

      if (filters.dateTo) {
        filteredOrders = filteredOrders.filter(order => 
          new Date(order.timestamps.created) <= new Date(filters.dateTo)
        );
      }

      const result = {
        ...data,
        orders: filteredOrders
      };
      
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
        ttl: this.config.cacheTTL
      });

      this.emit('orders-updated', result);
      this.log('✅ Pedidos actualizados correctamente');
      return result;

    } catch (error) {
      this.log('Error obteniendo pedidos:', 'error', error);
      throw new Error('No se pudieron obtener los pedidos');
    }
  }

  /**
   * Crear nuevo pedido
   */
  async createOrder(orderData) {
    try {
      this.log('📝 Creando nuevo pedido...', 'info', orderData);
      
      // Validar datos del pedido
      this.validateOrderData(orderData);
      
      // Generar ID único
      const orderId = this.generateOrderId();
      const orderNumber = this.generateOrderNumber();
      
      const newOrder = {
        id: orderId,
        orderNumber: orderNumber,
        status: 'pending',
        paymentStatus: 'pending',
        shippingStatus: 'not_shipped',
        ...orderData,
        timestamps: {
          created: new Date().toISOString(),
          updated: new Date().toISOString()
        }
      };

      // En un sistema real, aquí haríamos POST al servidor
      // Por ahora, emitimos evento para que el admin lo maneje
      this.emit('new-order-created', newOrder);
      this.emit('order-notification', {
        type: 'new_order',
        message: `Nuevo pedido ${orderNumber} recibido`,
        data: newOrder
      });
      
      this.log('✅ Pedido creado exitosamente:', 'success', orderId);
      
      // Invalidar cache de pedidos
      this.invalidateCache('orders');
      
      return {
        success: true,
        orderId: orderId,
        orderNumber: orderNumber,
        order: newOrder
      };

    } catch (error) {
      this.log('Error creando pedido:', 'error', error);
      throw error;
    }
  }

  /**
   * Actualizar producto
   */
  async updateProduct(productId, updates) {
    try {
      this.log(`🔄 Actualizando producto ${productId}...`, 'info', updates);
      
      // En un sistema real, haríamos PUT al servidor
      // Por ahora, emitimos evento para sincronización
      this.emit('product-updated', { productId, updates });
      this.emit('inventory-changed', { productId, updates });
      
      // Verificar stock bajo
      if (updates.inventory && updates.inventory.stock < updates.inventory.reorderLevel) {
        this.emit('low-stock-alert', {
          productId,
          currentStock: updates.inventory.stock,
          reorderLevel: updates.inventory.reorderLevel
        });
      }
      
      // Invalidar cache
      this.invalidateCache('products');
      
      this.log('✅ Producto actualizado exitosamente');
      
      return { success: true, productId, updates };

    } catch (error) {
      this.log('Error actualizando producto:', 'error', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas en tiempo real
   */
  async getAnalytics(period = '30d') {
    try {
      this.log(`📊 Obteniendo analytics para período: ${period}`);
      
      const orders = await this.getOrders();
      const products = await this.getProducts();
      
      const analytics = this.calculateAnalytics(orders, products, period);
      
      this.emit('analytics-updated', analytics);
      return analytics;

    } catch (error) {
      this.log('Error obteniendo analytics:', 'error', error);
      throw error;
    }
  }

  /**
   * Calcular métricas analíticas
   */
  calculateAnalytics(ordersData, productsData, period) {
    const now = new Date();
    const periodMs = this.getPeriodInMs(period);
    const startDate = new Date(now.getTime() - periodMs);
    
    const recentOrders = ordersData.orders.filter(order => 
      new Date(order.timestamps.created) >= startDate
    );

    const totalRevenue = recentOrders.reduce((sum, order) => 
      sum + order.pricing.total, 0
    );

    const totalCost = recentOrders.reduce((sum, order) => 
      sum + order.pricing.totalCost, 0
    );

    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    const lowStockProducts = productsData.products.filter(product => 
      product.inventory.stock <= product.inventory.reorderLevel
    );

    return {
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      totalOrders: recentOrders.length,
      totalRevenue,
      totalCost,
      totalProfit,
      profitMargin: Math.round(profitMargin * 100) / 100,
      averageOrderValue: recentOrders.length > 0 ? Math.round(totalRevenue / recentOrders.length) : 0,
      lowStockProducts: lowStockProducts.length,
      topSellingProducts: this.getTopSellingProducts(recentOrders),
      ordersByStatus: this.getOrdersByStatus(recentOrders),
      dailyRevenue: this.getDailyRevenue(recentOrders),
      lastUpdated: now.toISOString()
    };
  }

  /**
   * Iniciar sincronización automática
   */
  startAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      if (this.isOnline) {
        try {
          await this.syncData();
        } catch (error) {
          this.log('Error en sincronización automática:', 'error', error);
        }
      }
    }, this.config.syncInterval);

    this.log(`🔄 Auto-sync iniciado cada ${this.config.syncInterval / 1000} segundos`);
  }

  /**
   * Sincronizar datos
   */
  async syncData() {
    const syncStart = Date.now();
    this.log('🔄 Iniciando sincronización de datos...');

    try {
      // Sincronizar productos y pedidos en paralelo
      const [products, orders] = await Promise.all([
        this.getProducts(true),
        this.getOrders({})
      ]);

      this.lastSync = new Date().toISOString();
      const syncDuration = Date.now() - syncStart;
      
      this.emit('sync-completed', {
        timestamp: this.lastSync,
        duration: syncDuration,
        products: products.metadata,
        orders: orders.metadata
      });

      this.log(`✅ Sincronización completada en ${syncDuration}ms`);

    } catch (error) {
      this.log('Error en sincronización:', 'error', error);
      this.emit('sync-failed', error);
    }
  }

  /**
   * Utilidades y helpers
   */
  async fetchWithRetry(url, options = {}, attempts = 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();

    } catch (error) {
      if (attempts < this.config.retryAttempts) {
        this.log(`Reintentando request (${attempts + 1}/${this.config.retryAttempts})...`, 'warn');
        await this.delay(1000 * Math.pow(2, attempts)); // Backoff exponencial
        return this.fetchWithRetry(url, options, attempts + 1);
      }

      // Guardar request fallido para retry posterior
      this.failedRequests.push({ url, options, timestamp: Date.now() });
      throw error;
    }
  }

  isCacheValid(key) {
    if (!this.cache.has(key)) return false;
    
    const cached = this.cache.get(key);
    return (Date.now() - cached.timestamp) < cached.ttl;
  }

  invalidateCache(pattern = null) {
    if (pattern) {
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  generateOrderId() {
    return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  generateOrderNumber() {
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    return `BS-${year}-${timestamp}`;
  }

  validateOrderData(orderData) {
    const required = ['customer', 'items', 'billing', 'shipping'];
    for (const field of required) {
      if (!orderData[field]) {
        throw new Error(`Campo requerido faltante: ${field}`);
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getPeriodInMs(period) {
    const periods = {
      '1d': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000
    };
    return periods[period] || periods['30d'];
  }

  getTopSellingProducts(orders) {
    const productSales = {};
    
    orders.forEach(order => {
      order.items.forEach(item => {
        if (!productSales[item.productId]) {
          productSales[item.productId] = {
            productId: item.productId,
            name: item.name,
            totalQuantity: 0,
            totalRevenue: 0
          };
        }
        productSales[item.productId].totalQuantity += item.quantity;
        productSales[item.productId].totalRevenue += item.totalPrice;
      });
    });

    return Object.values(productSales)
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 5);
  }

  getOrdersByStatus(orders) {
    return orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});
  }

  getDailyRevenue(orders) {
    const dailyRevenue = {};
    
    orders.forEach(order => {
      const date = new Date(order.timestamps.created).toISOString().split('T')[0];
      dailyRevenue[date] = (dailyRevenue[date] || 0) + order.pricing.total;
    });

    return Object.entries(dailyRevenue)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  async retryFailedRequests() {
    if (this.failedRequests.length === 0) return;

    this.log(`🔄 Reintentando ${this.failedRequests.length} requests fallidos...`);
    
    const requests = [...this.failedRequests];
    this.failedRequests = [];

    for (const request of requests) {
      try {
        await this.fetchWithRetry(request.url, request.options);
      } catch (error) {
        // Si falla de nuevo, se volverá a agregar a failedRequests
        this.log('Request falló nuevamente:', 'error', request.url);
      }
    }
  }

  /**
   * Destructor - limpiar recursos
   */
  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    this.cache.clear();
    this.eventListeners.clear();
    
    window.removeEventListener('online', this.handleOnlineStatus);
    window.removeEventListener('offline', this.handleOnlineStatus);
    
    this.log('🔄 API Manager destruido');
  }

  /**
   * Estado del sistema
   */
  getStatus() {
    return {
      isOnline: this.isOnline,
      lastSync: this.lastSync,
      cacheSize: this.cache.size,
      failedRequests: this.failedRequests.length,
      autoSync: !!this.syncInterval,
      uptime: Date.now() - (this.initTime || Date.now())
    };
  }
}

// Instancia global para uso en toda la aplicación
window.BramsStoreAPI = BramsStoreAPI;

export default BramsStoreAPI;
