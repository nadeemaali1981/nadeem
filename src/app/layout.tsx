import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'نديم للحسابات - نظام ERP لإدارة محلات الألبسة ودفتر اليومية',
  description: 'نظام محاسبي متكامل لإدارة محلات الألبسة ودفتر اليومية والمبيعات والمخزون'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
