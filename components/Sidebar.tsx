'use client'

import Link from 'next/link'
import { useEffect, useState, type MouseEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  hasManagePermission,
  hasOutboundPermission,
  isSystemAdminUser,
  type CurrentUserPermissions,
  type ManagePermissionKey,
  type OutboundPermissionKey,
} from '@/lib/permissions'

type SidebarUser = CurrentUserPermissions
type MenuItem = {
  name: string
  href: string
  perm: ManagePermissionKey | null
  /**
   * When set, gates this item with `hasOutboundPermission` (관리자 예외는 출고요청 조회와 동일).
   * `perm`은 이 경우 무시됩니다.
   */
  outboundPerm?: OutboundPermissionKey
  /** When true, item stays active for nested routes (e.g. /groupware/board/…). */
  nestedActive?: boolean
}
type MenuGroup = {
  title: string
  items: MenuItem[]
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleMenuLinkClick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (pathname !== href) return
    e.preventDefault()
    // 같은 메뉴 재클릭 시에도 "재진입(새로고침 체감)"이 나도록 강제 이동
    window.location.assign(href)
  }
  
  const [userData, setUserData] = useState<SidebarUser | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    '그룹웨어': true,
    '기초 조회': true,
    '영업/구매 관리': true,
    '품질관리 (QC)': true,
    '생산 관리': true,
    '자재 관리': true,
    '기준정보 (기초)': true,
    '시스템 관리': true,
  });
  const [inboundMissingCount, setInboundMissingCount] = useState(0)

  useEffect(() => {
    async function getUserData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from('app_users')
          .select('*')
          .eq('id', session.user.id)
          .single();
        setUserData(data);
      }
      setLoading(false);
    }
    getUserData();
  }, []);

  useEffect(() => {
    async function loadCompanyLogo() {
      const { data } = await supabase
        .from('my_company_settings')
        .select('logo_url')
        .eq('id', 1)
        .maybeSingle()
      const logoUrl = typeof data?.logo_url === 'string' ? data.logo_url.trim() : ''
      setCompanyLogoUrl(logoUrl)
    }
    loadCompanyLogo()
  }, [])

  useEffect(() => {
    async function loadInboundMissingCount() {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token ?? ''
      if (!accessToken) {
        setInboundMissingCount(0)
        return
      }
      try {
        const response = await fetch('/api/inbound/tracking-missing?only_missing=true&count_only=true', {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) {
          setInboundMissingCount(0)
          return
        }
        const nextCount = Number(result?.count ?? 0)
        setInboundMissingCount(Number.isFinite(nextCount) && nextCount > 0 ? nextCount : 0)
      } catch {
        setInboundMissingCount(0)
      }
    }
    void loadInboundMissingCount()
  }, [pathname])

  const toggleGroup = (title: string) => {
    setOpenGroups(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const hasPermission = (permKey: ManagePermissionKey | null) => {
    if (loading) return false;
    if (!userData) return false;
    if (!permKey) return true;
    return hasManagePermission(userData, permKey)
  };

  const itemEnabled = (item: MenuItem) => {
    if (loading || !userData) return false
    if (item.outboundPerm) {
      return hasOutboundPermission(userData, item.outboundPerm)
    }
    return hasPermission(item.perm)
  }

  const menuGroups: MenuGroup[] = [
    {
      title: '그룹웨어',
      items: [
        { name: '통합결재문서함', href: '/approvals', perm: null },
        { name: '게시판', href: '/groupware/board', perm: null, nestedActive: true },
      ]
    },
    {
      title: '기초 조회',
      items: [
        { name: '현재고 현황', href: '/inventory', perm: null },
        { name: '입출고 현황', href: '/inventory-transactions', perm: null },
      ]
    },
    {
      title: '영업/구매 관리',
      items: [
        { name: '견적서 관리', href: '/quotes', perm: 'can_sales_manage' },
        { name: '수주 등록 (발주 수신)', href: '/sales-orders', perm: 'can_sales_manage' },
        { name: '발주서 관리', href: '/purchase-orders', perm: 'can_sales_manage' },
      ]
    },
    {
      title: '품질관리 (QC)',
      items: [
        { name: '검사 대기(Quarantine)', href: '/qc', perm: 'can_qc_manage' },
        { name: '품질 검사 내역', href: '/qc/history', perm: 'can_qc_manage' },
      ]
    },
    {
      title: '생산 관리',
      items: [
        { name: '생산지시서', href: '/production-orders', perm: 'can_production_manage' },
        { name: 'BOM 관리', href: '/boms', perm: 'can_production_manage' },
      ]
    },
    {
      title: '자재 관리',
      items: [
        { name: '입고 등록', href: '/inbound/new', perm: 'can_material_manage' }, 
        { name: '입고 보완 입력', href: '/inbound/complete-tracking', perm: 'can_material_manage' },
        { name: '자재 이동', href: '/inventory-transfers/new', perm: 'can_material_manage' },
        {
          name: '출고 요청 현황',
          href: '/outbound-instructions',
          perm: null,
          outboundPerm: 'can_outbound_view',
        },
        { name: '재고 실사/조정', href: '/inventory-adjustments', perm: 'can_material_manage' },
      ]
    },
    {
      title: '기준정보 (기초)',
      items: [
        { name: '고객사(거래처) 관리', href: '/customers', perm: 'can_manage_master' },
        { name: '품목 마스터 관리', href: '/items', perm: 'can_manage_master' },
      ]
    },
    {
      title: '시스템 관리',
      items: [
        { name: '사용자 가입 설정', href: '/admin/user-approvals', perm: 'can_manage_permissions'},
        { name: '사용자 조회 및 설정', href: '/admin/user-permissions', perm: 'can_manage_permissions' },
        { name: '사용자 권한 관리', href: '/admin/user-access-control', perm: 'can_manage_permissions' },
        { name: '로그인 모니터', href: '/admin/login-audit', perm: 'can_manage_permissions' },
        { name: '입고 로그 조회', href: '/admin/inbound-logs', perm: 'can_manage_permissions' },
        { name: '창고 관리', href: '/admin/warehouses', perm: 'can_manage_permissions' },
        { name: 'CoA 파일 관리', href: '/admin/coa-files', perm: 'can_manage_permissions' },
        { name: '기업정보 설정', href: '/admin/company-settings', perm: 'can_manage_permissions' },
      ]
    }
  ];

  return (
    <aside className="sticky top-0 z-50 flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm font-sans">
      <div className="shrink-0 border-b border-sidebar-border bg-sidebar-accent/30 px-4 py-[19px]">
        <Link href="/dashboard" className="group block">
          {companyLogoUrl ? (
            <div className="flex h-[66px] w-full items-center justify-center">
              <img
                src={companyLogoUrl}
                alt="기업 로고"
                className="max-h-14 max-w-full object-contain object-center"
              />
            </div>
          ) : (
            <h1 className="text-center text-[28px] font-black tracking-tight text-foreground group-hover:text-primary transition-colors uppercase leading-none py-2">
              ERP-<span className="text-blue-600">BIOGTP</span>
            </h1>
          )}
        </Link>
        {userData && (
          <div className="mt-1 text-[11px] font-medium text-muted-foreground uppercase tracking-tight truncate">
            {userData.user_name} / {isSystemAdminUser(userData) ? 'ADMIN' : 'STAFF'} / {userData.employee_no ?? '-'}
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3 pt-2.5 space-y-3 custom-scrollbar">
        
        {/* 대시보드 (HOME) — 동일 높이·패딩 유지, 살짝만 다듬음 */}
        <div className="mb-1 space-y-1">
          <Link
            href="/dashboard"
            onClick={(e) => handleMenuLinkClick(e, '/dashboard')}
            className={`group flex h-10 w-full items-center gap-2 rounded-lg border px-2.5 text-[14px] font-semibold uppercase tracking-tight transition-colors ${
              pathname === '/dashboard'
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-transparent text-foreground hover:border-sidebar-border hover:bg-sidebar-accent/60 hover:text-primary'
            }`}
          >
            <LayoutDashboard
              className={`h-4 w-4 shrink-0 transition-colors ${
                pathname === '/dashboard' ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'
              }`}
              strokeWidth={2.25}
              aria-hidden
            />
            <span className="min-w-0 flex-1 leading-none">Dashboard</span>
            <span
              className={`shrink-0 text-[9px] font-extrabold tracking-widest ${
                pathname === '/dashboard' ? 'text-primary/90' : 'text-muted-foreground group-hover:text-primary'
              }`}
            >
              HOME
            </span>
          </Link>
        </div>

        {/* 기존 메뉴 그룹 렌더링 */}
        {menuGroups.map((group) => {
          if (group.title === '시스템 관리' && !isSystemAdminUser(userData ?? null)) {
            return null;
          }

          const isOpen = openGroups[group.title];
          return (
            <div key={group.title} className="space-y-1">
              <button 
                onClick={() => toggleGroup(group.title)}
                className={`w-full flex items-center justify-between px-2 py-2 text-[14px] font-semibold transition-colors uppercase tracking-tight ${
                  group.title === '시스템 관리' ? 'text-primary' : 'text-foreground'
                }`}
              >
                {group.title}
                <span className="text-xl font-light text-muted-foreground">{isOpen ? '−' : '+'}</span>
              </button>

              {isOpen && (
                <div className="space-y-0.5 ml-1 border-l border-sidebar-border">
                  {group.items.map((item) => {
                    const enabled = itemEnabled(item)
                    const isCurrent =
                      pathname === item.href ||
                      (item.nestedActive === true &&
                        pathname.startsWith(`${item.href}/`));

                    return (
                      <div key={item.href}>
                        {enabled ? (
                          <Link
                            href={item.href}
                            onClick={(e) => handleMenuLinkClick(e, item.href)}
                            className={`block px-4 py-2 text-[13px] transition-all ${
                              isCurrent 
                                ? 'text-primary font-semibold border-l-2 border-primary ml-[-1px] bg-primary/10' 
                                : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60'
                            }`}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <span>{item.name}</span>
                              {item.href === '/inbound/complete-tracking' && inboundMissingCount > 0 ? (
                                <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                                  {inboundMissingCount}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        ) : (
                          <div className="flex justify-between items-center px-4 py-2 text-[13px] text-muted-foreground/60 italic select-none">
                            <span>{item.name}</span>
                            <span className="text-[8px] border border-sidebar-border px-1 rounded">LOCKED</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="p-4 border-t border-sidebar-border shrink-0">
        <button 
          onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
          className="w-full flex items-center gap-2 px-2 py-2 text-[11px] font-semibold text-muted-foreground hover:text-red-600 transition-colors uppercase"
        >
          Sign Out →
        </button>
      </div>
    </aside>
  );
}