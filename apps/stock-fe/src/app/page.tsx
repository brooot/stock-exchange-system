'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function Index() {
  const router = useRouter();

  useEffect(() => {
    // 由于token现在存储在httpOnly cookie中，我们无法直接检查
    // 直接跳转到dashboard，让dashboard页面处理认证检查
    router.push('/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">正在加载股票交易系统...</p>
      </div>
    </div>
  );
}
