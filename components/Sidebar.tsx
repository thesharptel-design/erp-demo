'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    '기안/결재': true,
    '품질관리 (QC)': true,
    '생산/재고 관리': true,
  });

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

  const toggleGroup = (title: string) => {
    setOpenGroups(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const hasPermission = (permKey: string | null) => {
    if (loading) return false;
    if (!userData) return false;
    if (userData.role_name === 'admin') return true; 
    return permKey ? !!userData[permKey] : true; 
  };

  // 📂 이미지와 폴더 구조를 100% 매칭한 메뉴 구성
  const menuGroups = [
    {
      title: '기안/결재',
      items: [
        { name: '결재문서함', href: '/approvals', perm: null },
        { name: '출고요청서', href: '/outbound-requests', perm: 'can_po_create' },
      ]
    },
    {
      title: '영업/구매 관리',
      items: [
        { name: '견적서 관리', href: '/quotes', perm: 'can_quote_create' },
        { name: '발주서 관리', href: '/purchase-orders', perm: 'can_po_create' },
      ]
    },
    {
      title: '품질관리 (QC)',
      items: [
        { name: '검사 대기(Quarantine)', href: '/qc', perm: 'can_qc_manage' }, // 폴더가 qc 하나일 경우 대비
        { name: '품질 검사 내역', href: '/qc/history', perm: 'can_qc_manage' },
      ]
    },
    {
      title: '생산/재고 관리',
      items: [
        { name: '생산지시서', href: '/production-orders', perm: 'can_production_manage' },
        { name: 'BOM 관리', href: '/boms', perm: 'can_production_manage' },
        { name: '현재고 현황', href: '/inventory', perm: null },
        { name: '입출고 현황', href: '/inventory-transactions', perm: null },
        { name: '재고 실사/조정', href: '/inventory-adjustments', perm: 'can_manage_master' },
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
      title: 'ADMIN ONLY',
      items: [
        { name: '사용자 권한 설정', href: '/admin/user-permissions', perm: 'can_manage_permissions' },
      ]
    }
  ];

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col text-black shadow-sm font-sans">
      {/* 💡 로고 클릭 시 홈(대시보드)으로 이동 */}
      <div className="p-6 border-b border-gray-50 bg-gray-50/20">
        <Link href="/dashboard" className="group">
          <h1 className="text-2xl font-black tracking-tighter text-gray-900 group-hover:text-blue-600 transition-colors">
            BIO-ERP
          </h1>
        </Link>
        {userData && (
          <div className="mt-2 text-[11px] font-bold text-gray-400 uppercase tracking-tight">
            {userData.user_name} / {userData.role_name}
          </div>
        )}
      </div>

      {/* 대시보드 독립 버튼 */}
      <div className="px-4 pt-4 pb-2">
        <Link
          href="/dashboard"
          className={`flex items-center px-4 py-3 text-sm font-bold rounded-md transition-all ${
            pathname === '/dashboard' 
              ? 'bg-blue-600 text-white shadow-md' 
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          📊 DASHBOARD
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-4">
        {menuGroups.map((group) => {
          if (group.title === 'ADMIN ONLY' && userData?.role_name !== 'admin') return null;

          const isOpen = openGroups[group.title];
          return (
            <div key={group.title} className="space-y-1">
              <button 
                onClick={() => toggleGroup(group.title)}
                className={`w-full flex items-center justify-between px-2 py-2 text-[15px] font-black transition-colors uppercase tracking-tight ${
                  group.title === 'ADMIN ONLY' ? 'text-blue-600' : 'text-gray-900'
                }`}
              >
                {group.title}
                <span className="text-xl font-light">{isOpen ? '−' : '+'}</span>
              </button>

              {isOpen && (
                <div className="space-y-0.5 ml-1 border-l-2 border-gray-100">
                  {group.items.map((item) => {
                    const enabled = hasPermission(item.perm);
                    const isCurrent = pathname === item.href;

                    return (
                      <div key={item.href}>
                        {enabled ? (
                          <Link
                            href={item.href}
                            className={`block px-4 py-2 text-[13px] transition-all ${
                              isCurrent 
                                ? 'text-blue-600 font-bold border-l-2 border-blue-600 ml-[-2px]' 
                                : 'text-gray-500 hover:text-black'
                            }`}
                          >
                            {item.name}
                          </Link>
                        ) : (
                          <div className="flex justify-between items-center px-4 py-2 text-[13px] text-gray-300 italic select-none">
                            <span>{item.name}</span>
                            <span className="text-[8px] border border-gray-100 px-1 rounded">LOCKED</span>
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
      
      <div className="p-4 border-t border-gray-50">
        <button 
          onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
          className="w-full flex items-center gap-2 px-2 py-2 text-[11px] font-bold text-gray-400 hover:text-red-600 transition-colors uppercase"
        >
          Sign Out →
        </button>
      </div>
    </aside>
  );
}