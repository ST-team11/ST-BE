import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

// .env 의 VITE_SUPABASE_URL 로 로컬/원격 전환 (env 없으면 로컬 기본값)
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`

type Season = 'summer' | 'winter' | 'other'
type Appliance = 'dryer' | 'dishwasher' | 'air_purifier' | 'electric_heater'

type InputSnapshot = {
  electricityBill: number
  gasBill: number
  waterBill: number
  waterBillingMonths: number
  season: Season
  appliances: Appliance[]
}

type AnswerSnapshot = Record<string, string>

type SelectField = {
  key: string
  label: string
  options: { value: string; label: string }[]
}

// Q1~Q12 단일 선택 질문 (Q13 보유 가전은 appliances 체크박스로 분리)
const answerFields: SelectField[] = [
  {
    key: 'household_size',
    label: 'Q1 가구원 수',
    options: [
      { value: '1', label: '1명' },
      { value: '2', label: '2명' },
      { value: '3-4', label: '3~4명' },
      { value: '5+', label: '5명 이상' },
    ],
  },
  {
    key: 'home_type',
    label: 'Q2 거주 형태',
    options: [
      { value: 'apartment', label: '아파트' },
      { value: 'oneroom', label: '원룸' },
      { value: 'villa', label: '빌라' },
      { value: 'officetel', label: '오피스텔' },
      { value: 'etc', label: '기타' },
    ],
  },
  {
    key: 'area',
    label: 'Q3 주거 면적',
    options: [
      { value: 'under10', label: '10평 이하' },
      { value: '10-20', label: '10~20평' },
      { value: '20-30', label: '20~30평' },
      { value: 'over30', label: '30평 이상' },
    ],
  },
  {
    key: 'region',
    label: 'Q4 거주 지역',
    options: [
      { value: 'seoul', label: '서울' },
      { value: 'metro', label: '수도권' },
      { value: 'south', label: '남부 지역' },
      { value: 'jeju', label: '제주' },
      { value: 'etc', label: '기타' },
    ],
  },
  {
    key: 'ac_hours',
    label: 'Q5 에어컨 사용 시간 (여름)',
    options: [
      { value: 'none', label: '거의 안 함' },
      { value: '1-2', label: '1~2시간' },
      { value: '3-5', label: '3~5시간' },
      { value: '6+', label: '6시간 이상' },
    ],
  },
  {
    key: 'ac_temp',
    label: 'Q6 에어컨 설정 온도 (여름)',
    options: [
      { value: 'over26', label: '26도 이상' },
      { value: '24-26', label: '24~26도' },
      { value: 'under23', label: '23도 이하' },
    ],
  },
  {
    key: 'heating_pattern',
    label: 'Q7 겨울 난방 패턴 (겨울)',
    options: [
      { value: 'rarely', label: '거의 사용 안 함' },
      { value: 'off_when_out', label: '외출 시 끔' },
      { value: 'mostly_on', label: '하루 대부분 켬' },
    ],
  },
  {
    key: 'standby_power',
    label: 'Q8 대기전력 관리',
    options: [
      { value: 'unplug', label: '멀티탭 꺼둔다' },
      { value: 'plugged', label: '그냥 꽂아둔다' },
      { value: 'unknown', label: '잘 모르겠다' },
    ],
  },
  {
    key: 'lighting',
    label: 'Q9 조명 사용 패턴',
    options: [
      { value: 'necessary', label: '필요한 곳만' },
      { value: 'most', label: '대부분 켜둔다' },
      { value: 'allday', label: '하루 종일' },
    ],
  },
  {
    key: 'cooking',
    label: 'Q10 요리 빈도',
    options: [
      { value: 'rarely', label: '거의 안 함' },
      { value: 'once', label: '하루 1번' },
      { value: 'twice+', label: '하루 2번 이상' },
    ],
  },
  {
    key: 'home_time',
    label: 'Q11 평일 낮 재택 시간',
    options: [
      { value: 'rarely', label: '거의 없음' },
      { value: '3-6', label: '3~6시간' },
      { value: 'mostly', label: '하루 대부분' },
    ],
  },
  {
    key: 'building_age',
    label: 'Q12 건물 연식',
    options: [
      { value: 'under5', label: '5년 이하' },
      { value: '5-15', label: '5~15년' },
      { value: 'over15', label: '15년 이상' },
    ],
  },
]

const applianceOptions: { value: Appliance; label: string }[] = [
  { value: 'dryer', label: '건조기' },
  { value: 'dishwasher', label: '식기세척기' },
  { value: 'air_purifier', label: '공기청정기' },
  { value: 'electric_heater', label: '전기난방' },
]

const defaultInput: InputSnapshot = {
  electricityBill: 35000,
  gasBill: 100000,
  waterBill: 15000,
  waterBillingMonths: 1,
  season: 'winter',
  appliances: [],
}

const defaultAnswers: AnswerSnapshot = {
  household_size: '2',
  home_type: 'apartment',
  area: '10-20',
  region: 'seoul',
  ac_hours: 'none',
  ac_temp: '24-26',
  heating_pattern: 'off_when_out',
  standby_power: 'unplug',
  lighting: 'necessary',
  cooking: 'once',
  home_time: '3-6',
  building_age: '5-15',
}

export default function TestPage() {
  const [input, setInput] = useState<InputSnapshot>(defaultInput)
  const [answers, setAnswers] = useState<AnswerSnapshot>(defaultAnswers)
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [output, setOutput] = useState('결과 없음')
  const [loading, setLoading] = useState(false)

  // 세션 복원 + 로그인/로그아웃 변화 구독
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const updateInputNumber = (key: keyof InputSnapshot, value: string) => {
    setInput((prev) => ({ ...prev, [key]: Number(value) }))
  }

  const updateAnswer = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }))
  }

  const toggleAppliance = (appliance: Appliance) => {
    setInput((prev) => {
      const has = prev.appliances.includes(appliance)
      const next = has
        ? prev.appliances.filter((item) => item !== appliance)
        : [...prev.appliances, appliance]
      return { ...prev, appliances: next }
    })
  }

  const signIn = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setOutput(`로그인 실패: ${error.message}`)
    setLoading(false)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setOutput('로그아웃됨')
  }

  // save 호출은 로그인 세션 토큰, 그 외에는 publishable key 로 인증
  const buildHeaders = (withToken: boolean): HeadersInit => {
    const bearer = withToken && session ? session.access_token : PUBLISHABLE_KEY
    return {
      'Content-Type': 'application/json',
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${bearer}`,
    }
  }

  const callFunction = async (
    path: string,
    init: RequestInit,
  ) => {
    setLoading(true)
    try {
      const response = await fetch(`${FUNCTIONS_BASE}/${path}`, init)
      const data = await response.json()
      setOutput(`[${response.status}] ${JSON.stringify(data, null, 2)}`)
    } catch (error) {
      setOutput(`요청 실패: ${String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  const submitAssessment = () => {
    return callFunction('submit-assessment', {
      method: 'POST',
      headers: buildHeaders(false),
      body: JSON.stringify({ inputSnapshot: input, answerSnapshot: answers }),
    })
  }

  const saveAssessmentResult = () => {
    return callFunction('save-assessment-result', {
      method: 'POST',
      headers: buildHeaders(true),
      body: JSON.stringify({ inputSnapshot: input, answerSnapshot: answers }),
    })
  }

  const listResultTypes = () => {
    return callFunction('result-type-detail', {
      method: 'GET',
      headers: buildHeaders(false),
    })
  }

  const getResultType = (typeId: string) => {
    return callFunction(`result-type-detail?type=${typeId}`, {
      method: 'GET',
      headers: buildHeaders(false),
    })
  }

  return (
    <div style={{ padding: '24px', display: 'grid', gap: '16px', maxWidth: '720px' }}>
      <h1>Edge Function 테스트</h1>

      <p style={{ margin: 0, color: '#555' }}>
        연결 대상: <code>{SUPABASE_URL}</code>
        {SUPABASE_URL.includes('127.0.0.1') ? ' (로컬)' : ' (원격)'}
      </p>

      <fieldset style={{ display: 'grid', gap: '8px' }}>
        <legend>로그인 (save-assessment-result 용)</legend>
        {session ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span>
              로그인됨: <strong>{session.user.email}</strong>
            </span>
            <button type="button" onClick={signOut} disabled={loading}>
              로그아웃
            </button>
          </div>
        ) : (
          <>
            <label>
              이메일
              <input
                style={{ width: '100%' }}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="user-a@test.com"
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                style={{ width: '100%' }}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button type="button" onClick={signIn} disabled={loading}>
              로그인
            </button>
          </>
        )}
      </fieldset>

      <fieldset style={{ display: 'grid', gap: '8px' }}>
        <legend>요금 입력 (inputSnapshot)</legend>
        <label>
          전기 요금(원)
          <input
            type="number"
            value={input.electricityBill}
            onChange={(event) => updateInputNumber('electricityBill', event.target.value)}
          />
        </label>
        <label>
          가스 요금(원)
          <input
            type="number"
            value={input.gasBill}
            onChange={(event) => updateInputNumber('gasBill', event.target.value)}
          />
        </label>
        <label>
          수도 요금(원)
          <input
            type="number"
            value={input.waterBill}
            onChange={(event) => updateInputNumber('waterBill', event.target.value)}
          />
        </label>
        <label>
          수도 검침 개월 수
          <input
            type="number"
            value={input.waterBillingMonths}
            onChange={(event) => updateInputNumber('waterBillingMonths', event.target.value)}
          />
        </label>
        <label>
          계절
          <select
            value={input.season}
            onChange={(event) =>
              setInput((prev) => ({ ...prev, season: event.target.value as Season }))
            }
          >
            <option value="summer">여름 (7~8월)</option>
            <option value="winter">겨울 (12~3월)</option>
            <option value="other">그 외</option>
          </select>
        </label>
        <div>
          <span>Q13 보유 가전</span>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {applianceOptions.map((option) => (
              <label key={option.value}>
                <input
                  type="checkbox"
                  checked={input.appliances.includes(option.value)}
                  onChange={() => toggleAppliance(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset style={{ display: 'grid', gap: '8px' }}>
        <legend>설문 응답 (answerSnapshot)</legend>
        {answerFields.map((field) => (
          <label key={field.key}>
            {field.label}
            <select
              value={answers[field.key] ?? ''}
              onChange={(event) => updateAnswer(field.key, event.target.value)}
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={submitAssessment} disabled={loading}>
          submit-assessment
        </button>
        <button
          type="button"
          onClick={saveAssessmentResult}
          disabled={loading || !session}
          title={session ? '' : '로그인 후 사용 가능'}
        >
          save-assessment-result
        </button>
        <button type="button" onClick={listResultTypes} disabled={loading}>
          유형 전체 목록
        </button>
        <button type="button" onClick={() => getResultType('type-3')} disabled={loading}>
          유형 단건(type-3)
        </button>
      </div>

      <pre style={{ background: '#f4f4f4', padding: '12px', overflow: 'auto' }}>
        {loading ? '요청 중...' : output}
      </pre>
    </div>
  )
}
