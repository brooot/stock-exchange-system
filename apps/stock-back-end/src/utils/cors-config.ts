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
  
  return isProduction
    ? [
        'http://www.brooot.top:3000',  // 生产环境前端地址
        'https://www.brooot.top:3000', // HTTPS前端地址
        'http://www.brooot.top:3001',  // 生产环境后端地址
        'https://www.brooot.top:3001', // HTTPS后端地址
      ]
    : [
        'http://localhost:3000',       // 开发环境前端地址
        'http://localhost:3001',       // 开发环境后端地址
        'http://127.0.0.1:3000',       // 本地回环地址
        'http://127.0.0.1:3001',       // 本地回环地址
      ];
}