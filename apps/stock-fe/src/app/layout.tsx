import './global.css';
import Layout from '../components/Layout';

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
        <Layout>{children}</Layout>
      </body>
    </html>
  );
}
