import type { Metadata } from 'next';
import { FORTRESS_700, SOVEREIGN_REGION_NAME } from '@lexops/shared';
import './globals.css';

export const metadata: Metadata = {
  title: 'LexOps SSC — Sovereign State Console',
  description: 'لوحة الدولة السيادية لنظام التشغيل القانوني السعودي',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        {children}
        <footer className="footer">
          {FORTRESS_700.name} — {SOVEREIGN_REGION_NAME}
        </footer>
      </body>
    </html>
  );
}
