'use client';

import { usePathname } from 'next/navigation'
import './globals.css'
import AppShell from '@/components/AppShell'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});


export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // 🌟 '/print'라는 단어가 포함된 모든 경로는 AppShell(사이드바)을 아예 그리지 않음
  const isPrintPage = pathname && pathname.includes('/print');

  return (
    <html lang="ko" className={cn("font-sans", geist.variable)}>
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
        <Toaster />
      </body>
    </html>
  )
}