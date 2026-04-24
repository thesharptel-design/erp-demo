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
  const isApprovalViewPopup = Boolean(pathname?.startsWith('/approvals/view/'))
  const isOutboundViewPopup = Boolean(pathname?.startsWith('/outbound-requests/view/'))
  const useBareShell = Boolean(
    isPrintPage ||
      pathname === '/approvals/new' ||
      pathname === '/outbound-requests/new' ||
      isApprovalViewPopup ||
      isOutboundViewPopup
  )

  return (
    <html lang="ko" className={cn("font-sans", geist.variable)}>
      <head><title>ERP-BIOGTP</title></head>
      <body className="bg-gray-100 text-gray-900">
        {useBareShell ? (
          <div className="min-h-screen bg-white">
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