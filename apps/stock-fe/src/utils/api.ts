import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';

// 创建axios实例
const api: AxiosInstance = axios.create({
  baseURL: 'http://localhost:3001/api',
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
      // 跳转到登录页
      if (typeof window !== 'undefined') {
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
  createOrder: (data: { type: string; price: number; quantity: number }) =>
    api.post('/orders', data),

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
  getMarketData: () => api.get('/trades/market/data'),
};

// 导出axios实例，以备特殊需求
export default api;
