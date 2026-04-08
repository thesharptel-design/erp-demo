import type { Metadata } from 'next'
import './globals.css'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = {
  title: '교육용 ERP',
  description: 'ERP 실습용 데모 시스템',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body className="bg-gray-100 text-gray-900">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}