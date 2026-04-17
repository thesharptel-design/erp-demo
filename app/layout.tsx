'use client';

import { usePathname } from 'next/navigation'
import './globals.css'
import AppShell from '@/components/AppShell'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // 🌟 '/print'라는 단어가 포함된 모든 경로는 AppShell(사이드바)을 아예 그리지 않음
  const isPrintPage = pathname && pathname.includes('/print');

  return (
    <html lang="ko">
      <head><title>BIO-ERP 시스템</title></head>
      <body className="bg-gray-100 text-gray-900">
        {isPrintPage ? (
          // 인쇄 페이지일 때는 사이드바/헤더 없이 순수 내용만!
          <div className="bg-white min-h-screen">
            {children}
          </div>
        ) : (
          <AppShell>{children}</AppShell>
        )}
      </body>
    </html>
  )
}