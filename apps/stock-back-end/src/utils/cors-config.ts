/**
 * CORS配置工具函数
 * 根据环境变量动态生成允许的源地址
 */

/**
 * 获取CORS允许的源地址配置
 * @returns 根据环境返回相应的源地址数组
 */
export function getCorsOrigins(): string[] {
  const isProduction = process.env.NODE_ENV === 'production';

  const prodOrigins = [
    'http://www.brooot.top', // 生产环境前端地址 (端口80)
    'https://www.brooot.top', // HTTPS前端地址 (端口443)
    'http://www.brooot.top:3000', // 生产环境前端地址 (备用端口)
    'https://www.brooot.top:3000', // HTTPS前端地址 (备用端口)
    'http://www.brooot.top:3001', // 生产环境后端地址
    'https://www.brooot.top:3001', // HTTPS后端地址
  ];

  const devOrigins = [
    // 本地开发地址
    'http://localhost:3000', // 开发环境前端地址
    'https://localhost:3000', // HTTPS开发环境前端地址
    'https://localhost:443', // HTTPS开发环境后端地址 (标准端口)
    'https://localhost', // HTTPS开发环境后端地址 (默认端口)
    'http://localhost:3001', // 开发环境后端地址
    'https://localhost:3001', // HTTPS开发环境后端地址
    'http://127.0.0.1:3000', // 本地回环地址
    'https://127.0.0.1:3000', // HTTPS本地回环地址
    'https://127.0.0.1:443', // HTTPS本地回环地址 (标准端口)
    'https://127.0.0.1', // HTTPS本地回环地址 (默认端口)
    'http://127.0.0.1:3001', // 本地回环地址
    'https://127.0.0.1:3001', // HTTPS本地回环地址
    // 开发环境使用正式域名的地址
    'https://www.brooot.top:3000', // 开发环境前端地址 (正式域名)
    'http://www.brooot.top:3000', // 开发环境前端地址 (正式域名，HTTP备用)
    'https://www.brooot.top:3001', // 开发环境后端地址 (正式域名)
    'http://www.brooot.top:3001', // 开发环境后端地址 (正式域名，HTTP备用)
  ];

  // 根据环境返回相应的源地址
  return isProduction ? prodOrigins : devOrigins;
}
