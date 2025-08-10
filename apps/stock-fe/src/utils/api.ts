import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';

// 创建axios实例
const api: AxiosInstance = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL}/api`,
  timeout: 10000,
  withCredentials: true, // 自动发送cookie
  headers: {
    'Content-Type': 'application/json',
  },
});

// 响应拦截器
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error: AxiosError) => {
    // 统一处理401未认证错误
    if (error.response?.status === 401) {
      // 只有当用户不在登录页面时才跳转到登录页
      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/auth')
      ) {
        window.location.href = '/auth';
      }
    }
    return Promise.reject(error);
  }
);

// API接口定义
export const authAPI = {
  // 登录
  login: (data: { username: string; password: string }) =>
    api.post('/auth/login', data),

  // 注册
  register: (data: { username: string; password: string }) =>
    api.post('/auth/register', data),

  // 退出登录
  logout: () => api.post('/auth/logout'),
};

export const accountAPI = {
  // 获取账户信息
  getAccountInfo: () => api.get('/account'),
};

export const orderAPI = {
  // 创建订单
  createOrder: (data: {
    type: string;
    method?: string;
    price: number;
    quantity: number;
  }) => api.post('/orders/create-order', data),

  // 获取我的订单
  getMyOrders: () => api.get('/orders/my'),

  // 取消订单
  cancelOrder: (id: string) => api.delete(`/orders/${id}`),
};

export const tradeAPI = {
  // 获取所有交易记录
  getAllTrades: () => api.get('/trades'),

  // 获取我的交易记录
  getMyTrades: () => api.get('/trades/my'),

  // 获取特定交易详情
  getTradeById: (id: string) => api.get(`/trades/${id}`),

  // 获取市场数据
  getMarketData: () => api.get('/trades/market-data'),
};

export const positionAPI = {
  // 获取用户所有持仓
  getUserPositions: () => api.get('/positions'),

  // 获取用户特定股票持仓
  getUserPosition: (symbol: string) => api.get(`/positions/${symbol}`),
};

export const botAPI = {
  // 启动机器人交易
  startBotTrading: () => api.post('/bot/start'),

  // 停止机器人交易
  stopBotTrading: () => api.post('/bot/stop'),

  // 获取机器人状态
  getBotStatus: () => api.get('/bot/status'),
};

export const klineAPI = {
  // 获取K线数据
  getKlineData: (params: {
    symbol?: string;
    interval: string;
    limit?: number;
  }) => {
    const { symbol = 'AAPL', interval, limit = 100 } = params;
    return api.get(
      `/kline?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
  },

  // 获取可用的时间间隔
  getAvailableIntervals: () => api.get('/kline/intervals'),
};

// 导出axios实例，以备特殊需求
export default api;
