'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useToast } from '../hooks/useToast';
import { ToastManager } from './Toast';
import { useLogout } from '../hooks/useApiQueries';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const { toasts, removeToast, showSuccess } = useToast();

  const logoutMutation = useLogout();

  useEffect(() => {
    // 由于token现在存储在httpOnly cookie中，我们无法直接检查认证状态
    // 对于需要认证的页面，让各个页面组件自己处理认证检查
    setLoading(false);

    // 兜底跳转逻辑：如果访问的不是已知页面，跳转到dashboard
    const knownPaths = ['/auth', '/', '/dashboard', '/history'];
    if (!knownPaths.includes(pathname)) {
      router.push('/dashboard');
    }
  }, [pathname, router]);

  const handleLogout = async () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem('username');
        showSuccess('已成功退出登录');
        router.push('/auth');
      },
      onError: (err) => {
        console.error('退出登录失败:', err);
        // 即使退出失败，也清除本地状态
        localStorage.removeItem('username');
        showSuccess('已成功退出登录');
        router.push('/auth');
      }
    });
  };

  const navigation = [
    { name: '仪表板', href: '/dashboard', icon: '📊' },
    { name: '交易历史', href: '/history', icon: '📈' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">正在加载...</p>
        </div>
      </div>
    );
  }

  // 如果在认证页面或主页，不显示导航
  if (pathname === '/auth' || pathname === '/') {
    return <>{children}</>;
  }

  // 移除认证检查，让各个页面组件自己处理

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">股票交易系统</h1>
            </div>

            <div className="flex items-center space-x-4">
              {navigation.map((item) => (
                <button
                  key={item.name}
                  onClick={() => router.push(item.href)}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${pathname === item.href
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.name}
                </button>
              ))}

              <div className="flex items-center space-x-2 ml-4 pl-4 border-l">
                <span className="text-sm text-gray-600">
                  {localStorage.getItem('username') || '用户'}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                >
                  退出
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* 主要内容区域 */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {children}
      </main>

      {/* Toast 通知 */}
      <ToastManager toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
