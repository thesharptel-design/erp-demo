'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SearchableCombobox from '@/components/SearchableCombobox'

/** Dev Strict Mode runs effects twice; a bad refresh token would otherwise trigger two failing getSession calls. */
let loginSessionProbeInFlight = false

export default function LoginPage() {
  const router = useRouter()

  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [userName, setUserName] = useState('')
  const [userKind, setUserKind] = useState<'staff' | 'teacher' | 'student'>('staff')
  const [department, setDepartment] = useState('')
  const [jobRank, setJobRank] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [trainingProgram, setTrainingProgram] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [major, setMajor] = useState('')
  const [teacherSubject, setTeacherSubject] = useState('')
  const [phone, setPhone] = useState('')
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [isPrivacyRead, setIsPrivacyRead] = useState(false)

  const [isLoading, setIsLoading] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const departmentOptions = [
    { value: '영업', label: '영업팀' },
    { value: '자재', label: '자재팀' },
    { value: '생산', label: '생산팀' },
    { value: '구매', label: '구매팀' },
    { value: 'QC', label: 'QC' },
    { value: '경영지원', label: '경영지원팀' },
    { value: '관리', label: '관리팀' },
  ]
  const rankOptions = [
    { value: '사원', label: '사원' },
    { value: '대리', label: '대리' },
    { value: '과장', label: '과장' },
    { value: '차장', label: '차장' },
    { value: '부장', label: '부장' },
    { value: '이사', label: '이사' },
    { value: '대표', label: '대표' },
  ]
  const userKindOptions = [
    { value: 'staff', label: '직원' },
    { value: 'teacher', label: '선생' },
    { value: 'student', label: '학생' },
  ]

  useEffect(() => {
    if (loginSessionProbeInFlight) {
      setIsChecking(false)
      return
    }
    loginSessionProbeInFlight = true

    async function syncSession() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (error) {
          await supabase.auth.signOut()
          setIsChecking(false)
          return
        }

        if (session?.user) {
          const { data: userData } = await supabase
            .from('app_users')
            .select('role_name, is_active')
            .eq('id', session.user.id)
            .single()

          if (userData?.role_name === 'pending' || userData?.is_active === false) {
            await supabase.auth.signOut()
            setIsChecking(false)
            return
          }
          router.replace('/dashboard')
          return
        }

        setIsChecking(false)
      } catch {
        try {
          await supabase.auth.signOut()
        } catch {
          // ignore
        }
        setIsChecking(false)
      } finally {
        loginSessionProbeInFlight = false
      }
    }
    void syncSession()
  }, [router])

  const handlePrivacyScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 2) {
      setIsPrivacyRead(true);
    }
  }

  async function handleAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage('')

    if (isSignUp) {
      if (password !== passwordConfirm) return setErrorMessage('비밀번호가 일치하지 않습니다.')
      if (!isPrivacyRead || !privacyAgreed) return setErrorMessage('약관을 끝까지 읽고 동의해 주세요.')
      if (userKind === 'staff' && (!department || !jobRank)) return setErrorMessage('직원은 부서와 직급이 필요합니다.')
      if (userKind === 'teacher' && (!schoolName || !trainingProgram || !teacherSubject)) {
        return setErrorMessage('선생은 학교, 교육프로그램, 과목이 필요합니다.')
      }
      if (userKind === 'student' && (!schoolName || !trainingProgram || !gradeLevel || !major)) {
        return setErrorMessage('학생은 학교, 교육프로그램, 학년, 전공이 필요합니다.')
      }
      
      setIsLoading(true)
      try {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: userName } },
        })
        if (authError) throw authError
        
        if (data.user) {
          const getDefaultPerms = (dept: string) => ({
            can_manage_master: ['관리', '경영지원', '관리팀', '경영지원팀'].includes(dept),
            can_sales_manage: ['영업', '구매', '영업팀', '구매팀'].includes(dept),
            can_material_manage: ['자재', '자재팀'].includes(dept),
            can_production_manage: ['생산', '생산팀'].includes(dept),
            can_qc_manage: ['QC', 'QC팀', '품질관리부'].includes(dept),
            can_admin_manage: ['관리', '경영지원', '관리팀', '경영지원팀'].includes(dept),
            // legacy fallback columns
            can_po_create: ['영업', '구매', '영업팀', '구매팀'].includes(dept),
            can_quote_create: ['영업', '영업팀'].includes(dept),
            can_receive_stock: ['자재', '자재팀'].includes(dept),
            can_prod_complete: ['생산', '생산팀'].includes(dept),
            can_approve: ['QC', 'QC팀', '품질관리부'].includes(dept),
            can_manage_permissions: false
          });

          const { error: dbError } = await supabase.from('app_users').upsert({
            id: data.user.id,
            email: email,
            user_name: userName,
            user_kind: userKind,
            department: userKind === 'staff' ? department : '',
            job_rank: userKind === 'staff' ? jobRank : '',
            school_name: userKind === 'staff' ? '' : schoolName,
            training_program: userKind === 'staff' ? '' : trainingProgram,
            teacher_subject: userKind === 'teacher' ? teacherSubject : '',
            grade_level: userKind === 'student' ? gradeLevel : '',
            major: userKind === 'student' ? major : '',
            phone: phone,
            privacy_consented: privacyAgreed,
            role_name: 'pending',
            is_active: true,
            ...getDefaultPerms(department)
          })
          if (dbError) throw dbError
        }
        
        await supabase.auth.signOut() 
        alert('신청이 완료되었습니다. 관리자 승인 후 시스템 이용이 가능합니다.')
        setIsSignUp(false)
        setEmail(''); setPassword('');
      } catch (err: any) {
        setErrorMessage(err.message)
      } finally {
        setIsLoading(false)
      }
    } else {
      // ========== 🛑 로그인 로직 (알림창 강화됨) ==========
      setIsLoading(true)
      try {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error

        if (signInData.user) {
          const { data: userData } = await supabase
            .from('app_users')
            .select('role_name, is_active, user_name')
            .eq('id', signInData.user.id)
            .single()
          
          // 1. 승인 대기 검사 (팝업 추가)
          if (userData?.role_name === 'pending') {
            await supabase.auth.signOut()
            const msg = '⚠️ 승인 대기 중\n\n아직 관리자의 승인이 완료되지 않았습니다.\n승인 후 다시 로그인해 주세요.';
            alert(msg);
            throw new Error(msg);
          }

          // 2. 퇴사 여부 검사 (팝업 추가)
          if (userData?.is_active === false) {
            await supabase.auth.signOut()
            const msg = `🚫 접속 차단\n\n[${userData.user_name}]님은 현재 퇴사(비활성) 처리되어 시스템 접속이 불가능합니다.\n관리자에게 문의하세요.`;
            alert(msg);
            throw new Error(msg);
          }
        }

        await fetch('/api/auth/login-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            success: true,
            sessionId: signInData.session?.access_token?.slice(0, 24) ?? null,
          }),
        })
        window.location.href = '/dashboard'
      } catch (err: any) {
        await fetch('/api/auth/login-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, success: false }),
        })
        setErrorMessage(err.message.includes('대기 중') || err.message.includes('퇴사') 
          ? err.message 
          : '이메일 또는 비밀번호가 올바르지 않습니다.')
      } finally {
        setIsLoading(false)
      }
    }
  }

  if (isChecking) return <div className="flex min-h-screen bg-gray-50 items-center justify-center"><div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gray-100 px-6 py-12 text-black">
      <div className={`w-full ${isSignUp ? 'max-w-2xl' : 'max-w-md'} rounded-[2.5rem] border border-gray-200 bg-white p-10 shadow-2xl transition-all duration-300`}>
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black tracking-tighter text-gray-900 italic">
            ERP-<span className="text-blue-600">BIOGTP</span>
          </h1>
          <p className="mt-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">
            {isSignUp ? 'New Employee Registration' : 'Integrated Management System'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {!isSignUp && (
            <div className="space-y-4">
              <input type="email" placeholder="이메일 입력" required className="w-full h-14 p-4 rounded-2xl bg-gray-50 border-none font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={email} onChange={e => setEmail(e.target.value)} />
              <input type="password" placeholder="비밀번호" required className="w-full h-14 p-4 rounded-2xl bg-gray-50 border-none font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
          )}

          {isSignUp && (
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest border-b pb-2">기본 로그인 정보</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="email" placeholder="이메일" required className="w-full h-14 p-4 rounded-2xl bg-gray-50 border-none font-bold md:col-span-2 focus:ring-2 focus:ring-blue-500 outline-none" value={email} onChange={e => setEmail(e.target.value)} />
                <input type="password" placeholder="비밀번호" required className="w-full h-14 p-4 rounded-2xl bg-gray-50 border-none font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={password} onChange={e => setPassword(e.target.value)} />
                <input type="password" placeholder="비밀번호 확인" required className="w-full h-14 p-4 rounded-2xl bg-gray-50 border-none font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} />
              </div>

              <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest border-b pb-2 mt-6">사용자 인적사항</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="성함 (예: 홍길동)" required className="w-full h-14 p-4 rounded-2xl bg-gray-50 border-none font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={userName} onChange={e => setUserName(e.target.value)} />
                <input type="text" placeholder="연락처 (예: 010-1234-5678)" required className="w-full h-14 p-4 rounded-2xl bg-gray-50 border-none font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={phone} onChange={e => setPhone(e.target.value)} />
                <SearchableCombobox
                  value={userKind}
                  onChange={(v) => setUserKind((v as 'staff' | 'teacher' | 'student') || 'staff')}
                  options={userKindOptions}
                  placeholder="유형 선택"
                  showClearOption={false}
                />
                {userKind === 'staff' ? (
                  <>
                    <SearchableCombobox value={department} onChange={setDepartment} options={departmentOptions} placeholder="부서 선택" />
                    <SearchableCombobox value={jobRank} onChange={setJobRank} options={rankOptions} placeholder="직급 선택" />
                  </>
                ) : (
                  <>
                    <input type="text" placeholder="학교명" className="w-full h-14 p-4 rounded-2xl bg-gray-50 border-none font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={schoolName} onChange={e => setSchoolName(e.target.value)} />
                    <input type="text" placeholder="교육프로그램" className="w-full h-14 p-4 rounded-2xl bg-gray-50 border-none font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={trainingProgram} onChange={e => setTrainingProgram(e.target.value)} />
                    {userKind === 'teacher' ? (
                      <input type="text" placeholder="과목" className="w-full h-14 p-4 rounded-2xl bg-gray-50 border-none font-bold focus:ring-2 focus:ring-blue-500 outline-none md:col-span-2" value={teacherSubject} onChange={e => setTeacherSubject(e.target.value)} />
                    ) : (
                      <>
                        <input type="text" placeholder="학년" className="w-full h-14 p-4 rounded-2xl bg-gray-50 border-none font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} />
                        <input type="text" placeholder="전공" className="w-full h-14 p-4 rounded-2xl bg-gray-50 border-none font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={major} onChange={e => setMajor(e.target.value)} />
                      </>
                    )}
                  </>
                )}
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">개인정보 처리방침</span>
                  <button type="button" onClick={() => setShowPrivacy(!showPrivacy)} className="text-[10px] font-black text-blue-500 underline uppercase tracking-tighter hover:text-blue-700">
                    {showPrivacy ? '닫기' : '(보기)'}
                  </button>
                </div>

                {showPrivacy && (
                  <div 
                    onScroll={handlePrivacyScroll}
                    className="h-32 p-4 bg-gray-50 rounded-2xl overflow-y-auto text-[11px] leading-relaxed text-gray-500 font-medium custom-scrollbar border border-gray-100"
                  >
                    [개인정보 수집 및 이용 동의]<br/><br/>
                    1. 수집 항목: 성명, 이메일, 연락처, 사용자유형, 분류정보(부서/직급 또는 학교/프로그램 등)<br/>
                    2. 수집 및 이용 목적: ERP 시스템 사용자 식별, 내부 보안 관리, 업무 소통 및 근태 기록 관리<br/>
                    3. 보유 및 이용 기간: 사용자 계정 삭제 전까지 또는 퇴사 후 법적 보존 기간까지<br/>
                    4. 거부 권리: 귀하는 동의를 거부할 권리가 있으나, 동의하지 않을 경우 시스템 계정 생성이 제한될 수 있습니다.<br/><br/>
                    ※ 아래 내용을 끝까지 읽어야 동의가 활성화됩니다.<br/>
                    ------------------------------------------------<br/>
                    내용을 확인 중입니다... 스크롤을 끝까지 내려주세요.<br/>
                    시스템 보안 및 개인정보 처리 방침을 준수합니다.<br/>
                    ------------------------------------------------<br/>
                    [방침 확인 완료]
                  </div>
                )}

                <div className={`p-4 rounded-2xl flex items-center gap-3 transition-all duration-300 ${isPrivacyRead ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 opacity-40'}`}>
                  <input 
                    type="checkbox" 
                    id="privacy" 
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed" 
                    required 
                    checked={privacyAgreed} 
                    onChange={e => setPrivacyAgreed(e.target.checked)}
                    disabled={!isPrivacyRead}
                  />
                  <label htmlFor="privacy" className={`text-xs font-bold cursor-pointer select-none ${isPrivacyRead ? 'text-blue-700' : 'text-gray-400'}`}>
                    개인정보 처리방침에 동의합니다. {!isPrivacyRead && "(내용 확인 필요)"}
                  </label>
                </div>
              </div>
            </div>
          )}

          {errorMessage && <div className="text-xs font-bold text-red-600 bg-red-50 p-4 rounded-xl border border-red-200 whitespace-pre-wrap">⚠️ {errorMessage}</div>}

          <button type="submit" disabled={isLoading} className="w-full h-16 mt-4 bg-blue-600 text-white rounded-3xl font-black text-lg shadow-xl hover:bg-blue-700 transition-all active:scale-95 disabled:bg-gray-400">
            {isLoading ? '처리 중...' : isSignUp ? '등록 신청하기' : '로그인'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button onClick={() => { setIsSignUp(!isSignUp); setErrorMessage(''); }} className="text-xs font-bold text-blue-500 hover:text-blue-700 underline underline-offset-4 tracking-tighter">
            {isSignUp ? '이미 계정이 있으신가요? 로그인' : '신규 입사자 계정 생성 신청'}
          </button>
        </div>
      </div>
    </div>
  )
}