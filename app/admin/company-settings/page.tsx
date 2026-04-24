'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';
import { getCurrentUserPermissions, isSystemAdminUser } from '@/lib/permissions'

export default function CompanySettingsPage() {
  const [allowed, setAllowed] = useState(false)
  const [permissionChecked, setPermissionChecked] = useState(false)
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    company_name: '',
    business_no: '',
    ceo_name: '',
    tel: '',
    fax: '',
    mobile: '',
    email: '',
    website: '',
    address: '',
    industry_type: '',
    logo_url: '',
    stamp_url: ''
  });

  useEffect(() => {
    void (async () => {
      const user = await getCurrentUserPermissions()
      setAllowed(isSystemAdminUser(user))
      setPermissionChecked(true)
    })()
  }, [])

  useEffect(() => {
    if (!permissionChecked || !allowed) return
    fetchCompanyInfo();
  }, [allowed, permissionChecked]);

  const fetchCompanyInfo = async () => {
    setLoading(true);
    const { data } = await supabase.from('my_company_settings').select('*').eq('id', 1).single();
    if (data) setFormData(data);
    setLoading(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // 🌟 파일 업로드 핸들러
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logo_url' | 'stamp_url') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSaving(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${field}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      // 1. Storage 업로드
      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. 공개 URL 가져오기
      const { data: { publicUrl } } = supabase.storage.from('company-assets').getPublicUrl(filePath);

      // 3. 상태 업데이트 (화면에 즉시 반영)
      setFormData(prev => ({ ...prev, [field]: publicUrl }));
      alert(`${field === 'logo_url' ? '로고' : '인감'} 업로드 성공! (저장 버튼을 눌러야 최종 완료됩니다)`);
    } catch (error: any) {
      alert('업로드 실패: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    // 🌟 저장 후 상태를 초기화하지 않고 그대로 유지합니다.
    const { error } = await supabase
      .from('my_company_settings')
      .update({ ...formData, updated_at: new Date().toISOString() })
      .eq('id', 1);

    if (error) {
      alert('저장 실패: ' + error.message);
    } else {
      alert('✅ 모든 기업 정보가 안전하게 저장되었습니다.');
      // 갱신된 데이터를 다시 불러와서 화면 유지
      fetchCompanyInfo();
    }
    setIsSaving(false);
  };

  if (!permissionChecked) {
    return <div className="p-10 text-center font-bold text-gray-400">권한 확인 중...</div>
  }

  if (!allowed) {
    return <div className="p-10 text-center font-bold text-red-600">시스템 관리자만 기업정보 설정 화면을 볼 수 있습니다.</div>
  }

  if (loading) return <div className="p-10 text-center font-bold text-gray-400">기업 정보를 불러오는 중...</div>;

  return (
    <div className="p-8 max-w-[1200px] mx-auto font-sans bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Company <span className="text-blue-600">Settings</span></h1>
          <p className="text-sm font-bold text-gray-400 mt-1">기업정보 설정 메뉴입니다.</p>
        </div>
        <button 
          onClick={handleSave} 
          disabled={isSaving}
          className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg hover:shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
        >
          {isSaving ? '처리 중...' : '정보 저장하기'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 로고 & 인감 업로드 */}
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
            <h2 className="text-xs font-black text-gray-400 uppercase mb-8 tracking-widest text-center">Identity</h2>
            
            <div className="space-y-12">
              {/* 로고 업로드 */}
              <div className="flex flex-col items-center">
                <p className="text-[11px] font-black text-gray-500 mb-4 uppercase">Company Logo</p>
                <div className="relative w-full aspect-video bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl flex items-center justify-center overflow-hidden group">
                  {formData.logo_url ? (
                    <Image src={formData.logo_url} className="max-h-24 object-contain w-auto" alt="Logo" width={192} height={96} unoptimized />
                  ) : (
                    <div className="text-center">
                      <span className="text-3xl">🖼️</span>
                      <p className="text-[10px] text-gray-300 mt-2 font-bold uppercase">No Logo</p>
                    </div>
                  )}
                  <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white text-xs font-bold">
                    로고 교체
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'logo_url')} />
                  </label>
                </div>
              </div>

              {/* 인감 업로드 */}
              <div className="flex flex-col items-center">
                <p className="text-[11px] font-black text-gray-500 mb-4 uppercase">Official Stamp</p>
                <div className="relative w-32 h-32 bg-gray-50 border-2 border-dashed border-gray-200 rounded-full flex items-center justify-center overflow-hidden group">
                  {formData.stamp_url ? (
                    <Image src={formData.stamp_url} className="w-20 h-20 object-contain" alt="Stamp" width={80} height={80} unoptimized />
                  ) : (
                    <div className="text-center">
                      <span className="text-2xl">💮</span>
                    </div>
                  )}
                  <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white text-[10px] font-bold">
                    인감 교체
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'stamp_url')} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 텍스트 정보 입력 (기존 스타일 유지) */}
        <div className="lg:col-span-2 bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { label: '회사명', name: 'company_name' },
            { label: '사업자번호', name: 'business_no' },
            { label: '대표자명', name: 'ceo_name' },
            { label: '공식 이메일', name: 'email' },
            { label: '회사 전화', name: 'tel' },
            { label: 'FAX 번호', name: 'fax' },
            { label: '모바일', name: 'mobile' },
            { label: '홈페이지', name: 'website' }
          ].map((field) => (
            <div key={field.name} className="flex flex-col gap-2">
              <label className="text-xs font-black text-gray-400 uppercase ml-1">{field.label}</label>
              <input 
                name={field.name} 
                value={formData[field.name as keyof typeof formData] || ''} 
                onChange={handleChange} 
                className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 focus:bg-white transition-all font-bold text-gray-700 shadow-sm" 
              />
            </div>
          ))}
          <div className="flex flex-col gap-2 md:col-span-2">
            <label className="text-xs font-black text-gray-400 uppercase ml-1">업태 / 종목</label>
            <input name="industry_type" value={formData.industry_type} onChange={handleChange} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 focus:bg-white transition-all font-bold text-gray-700 shadow-sm" />
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <label className="text-xs font-black text-gray-400 uppercase ml-1">회사 주소</label>
            <input name="address" value={formData.address} onChange={handleChange} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 focus:bg-white transition-all font-bold text-gray-700 shadow-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}