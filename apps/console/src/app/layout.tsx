import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LexOps Founder Console',
  description: 'لوحة المؤسس — تجاوز سيادي مشروع داخل نطاق منشأته',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
