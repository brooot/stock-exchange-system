import 'antd/dist/reset.css';
import './global.css';
import Layout from '../components/Layout';
import QueryProvider from '../components/QueryProvider';

export const metadata = {
  title: '股票交易系统',
  description: '专业的股票交易平台',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <QueryProvider>
          <Layout>{children}</Layout>
        </QueryProvider>
      </body>
    </html>
  );
}
