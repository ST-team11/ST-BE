// 공과금 절약 서비스 평가 알고리즘
// 근거 문서: offlog/algorithm.md (수치 출처는 문서 7·9장 참고)

export type Season = 'summer' | 'winter' | 'other'

// 여름: 7~8월 (Q5·Q6 에어컨), 겨울: 12~3월 (Q7 난방)
export const resolveSeason = (month: number): Season => {
  if (month === 7 || month === 8) return 'summer'
  if (month === 12 || month <= 3) return 'winter'
  return 'other'
}

export type HouseholdSize = '1' | '2' | '3-4' | '5+'
export type HomeType = 'apartment' | 'oneroom' | 'villa' | 'officetel' | 'etc'
export type AreaTier = 'under10' | '10-20' | '20-30' | 'over30'
export type Region = 'seoul' | 'metro' | 'south' | 'jeju' | 'etc'
export type Appliance = 'dryer' | 'dishwasher' | 'air_purifier' | 'electric_heater'

export type AssessmentInput = {
  electricityBill: number
  gasBill: number
  waterBill: number
  waterBillingMonths: number
  season: Season
  appliances: Appliance[]
}

// Q1~Q12 단일 선택 답변 (Q13 보유 가전은 inputSnapshot.appliances)
export type AssessmentAnswers = Record<string, string>

export type Recommendation = {
  id: string
  title: string
  description: string
}

export type ResultType = {
  id: string
  emoji: string
  title: string
  tagline: string
  summary: string
  tipDirection: string
}

export type CategoryScores = {
  electricity: number
  gas: number
  water: number
}

export type AssessmentPayload = {
  inputSnapshot: AssessmentInput
  answerSnapshot: AssessmentAnswers
}

export type AssessmentEvaluation = {
  resultType: ResultType
  comparisonScores: CategoryScores
  estimatedUsage: CategoryScores
  baseline: CategoryScores
  savingScore: number
  inputSnapshot: AssessmentInput
  answerSnapshot: AssessmentAnswers
  recommendationSnapshot: Recommendation[]
}

// ── 비교점수 구간 (문서 1) ─────────────────────────────
type ScoreBand = 'saving' | 'average' | 'caution' | 'overuse'

const getScoreBand = (score: number): ScoreBand => {
  if (score <= 85) return 'saving'
  if (score <= 115) return 'average'
  if (score <= 150) return 'caution'
  return 'overuse'
}

// ── 전기 누진제 역산 (문서 7-1, 2025년 요금표) ──────────
type ProgressiveTier = { baseFee: number; limit: number; unitPrice: number }

const electricityTiers: Record<'summer' | 'other', ProgressiveTier[]> = {
  // 하계(7~8월): 경계 300 / 450 kWh
  summer: [
    { baseFee: 910, limit: 300, unitPrice: 120.0 },
    { baseFee: 1600, limit: 450, unitPrice: 214.6 },
    { baseFee: 7300, limit: Infinity, unitPrice: 307.3 },
  ],
  // 그 외(1~6·9~12월): 경계 200 / 400 kWh
  other: [
    { baseFee: 910, limit: 200, unitPrice: 120.0 },
    { baseFee: 1600, limit: 400, unitPrice: 214.6 },
    { baseFee: 7300, limit: Infinity, unitPrice: 307.3 },
  ],
}

// 청구금액 → 사용량(kWh) 역산: 구간을 순차로 채우며 경계 요금과 비교
const estimateElectricityUsage = (bill: number, season: Season): number => {
  const tiers = season === 'summer'
    ? electricityTiers.summer
    : electricityTiers.other

  let lowerLimit = 0

  for (const tier of tiers) {
    const tierUsage = tier.limit - lowerLimit
    const maxBillForTier = tier.baseFee
      + lowerLimit * 120.0
      + (tier.limit === Infinity ? Infinity : tierUsage * tier.unitPrice)

    if (bill <= maxBillForTier || tier.limit === Infinity) {
      const usageCharge = bill - tier.baseFee - lowerLimit * 120.0
      return Math.max(0, lowerLimit + usageCharge / tier.unitPrice)
    }

    lowerLimit = tier.limit
  }

  return 0
}

// ── 가스 역산 (문서 7-2): 소비자요금 20.8854원/MJ, 기본 1,250원, 부가세 1.1
const GAS_BASE_FEE = 1250
const GAS_UNIT_PRICE = 20.8854
const GAS_VAT = 1.1

const estimateGasUsage = (bill: number): number => {
  const usageCharge = bill / GAS_VAT - GAS_BASE_FEE
  return Math.max(0, usageCharge / GAS_UNIT_PRICE)
}

// ── 수도 역산 (문서 7-3): 합산단가 1,145.83원/㎥, 기본 1,080원/월
const WATER_BASE_FEE = 1080
const WATER_UNIT_PRICE = 1145.83

const estimateWaterUsage = (bill: number, billingMonths: number): number => {
  const months = billingMonths > 0 ? billingMonths : 1
  const monthlyBill = bill / months
  return Math.max(0, (monthlyBill - WATER_BASE_FEE) / WATER_UNIT_PRICE)
}

// ── 보정계수 (문서 3·4·5) ──────────────────────────────
const householdElectricityFactor: Record<HouseholdSize, number> = {
  '1': 1.5,
  '2': 1.0,
  '3-4': 0.85,
  '5+': 0.75,
}

const areaElectricityFactor: Record<AreaTier, number> = {
  under10: 0.7,
  '10-20': 1.0,
  '20-30': 1.25,
  over30: 1.55,
}

const homeTimeFactor: Record<string, number> = {
  rarely: 0.85,
  '3-6': 1.0,
  mostly: 1.25,
}

// 보유 가전 월 소비 추정(kWh), 전기난방은 겨울 한정 (문서 5 Q13)
const applianceUsage: Record<Appliance, number> = {
  dryer: 40,
  dishwasher: 12,
  air_purifier: 7,
  electric_heater: 90,
}

const SEOUL_AVG_ELECTRICITY = 275 // kWh/월 (문서 7-1)

const getElectricityBaseline = (
  answers: AssessmentAnswers,
  input: AssessmentInput,
): number => {
  const household = householdElectricityFactor[answers.household_size as HouseholdSize] ?? 1.0
  const area = areaElectricityFactor[answers.area as AreaTier] ?? 1.0
  const homeTime = homeTimeFactor[answers.home_time] ?? 1.0

  const applianceBonus = input.appliances.reduce((sum, item) => {
    if (item === 'electric_heater' && input.season !== 'winter') return sum
    return sum + (applianceUsage[item] ?? 0)
  }, 0)

  return SEOUL_AVG_ELECTRICITY * area * household * homeTime + applianceBonus
}

// 가스 기준값(원): 면적별 동절기 기대값 중앙값 × 보정 (문서 3 Q3·4 Q12·5 Q7)
const gasWinterExpectation: Record<AreaTier, number> = {
  under10: 65000,
  '10-20': 100000,
  '20-30': 150000,
  over30: 200000,
}

const householdGasFactor: Record<HouseholdSize, number> = {
  '1': 0.8,
  '2': 1.0,
  '3-4': 1.15,
  '5+': 1.3,
}

const buildingAgeGasFactor: Record<string, number> = {
  under5: 0.85,
  '5-15': 1.0,
  over15: 1.2,
}

const heatingPatternFactor: Record<string, number> = {
  rarely: 0.4,
  off_when_out: 0.8,
  mostly_on: 1.2,
}

// 비동절기는 난방이 빠지고 취사 위주 → 동절기 기대값의 30%로 추정 (문서 미수록, 근사)
const NON_WINTER_GAS_RATIO = 0.3

const getGasBaseline = (
  answers: AssessmentAnswers,
  input: AssessmentInput,
): number => {
  const area = answers.area as AreaTier
  const expectation = gasWinterExpectation[area] ?? gasWinterExpectation['10-20']
  const seasonalBase = input.season === 'winter'
    ? expectation
    : expectation * NON_WINTER_GAS_RATIO

  const household = householdGasFactor[answers.household_size as HouseholdSize] ?? 1.0
  const buildingAge = buildingAgeGasFactor[answers.building_age] ?? 1.0
  const heating = input.season === 'winter'
    ? heatingPatternFactor[answers.heating_pattern] ?? 1.0
    : 1.0

  return seasonalBase * household * buildingAge * heating
}

// 가구원수별 서울 평균 수도 사용량(톤/월) (문서 7-3)
const waterBaselineByHousehold: Record<HouseholdSize, number> = {
  '1': 8,
  '2': 13,
  '3-4': 17,
  '5+': 21,
}

const getWaterBaseline = (answers: AssessmentAnswers): number => {
  return waterBaselineByHousehold[answers.household_size as HouseholdSize] ?? 13
}

// ── 비교점수 계산 (문서 6) ─────────────────────────────
const toComparisonScore = (actual: number, baseline: number): number => {
  if (baseline <= 0) return 100
  return Math.round((actual / baseline) * 100)
}

const computeScores = (
  payload: AssessmentPayload,
): { scores: CategoryScores; usage: CategoryScores; baseline: CategoryScores } => {
  const { inputSnapshot: input, answerSnapshot: answers } = payload

  const electricityUsage = estimateElectricityUsage(input.electricityBill, input.season)
  const gasUsage = estimateGasUsage(input.gasBill)
  const waterUsage = estimateWaterUsage(input.waterBill, input.waterBillingMonths)

  const electricityBaseline = getElectricityBaseline(answers, input)
  const gasBaseline = getGasBaseline(answers, input)
  const waterBaseline = getWaterBaseline(answers)

  // 가스는 금액 기준 비교가 현실적 (문서 11 주의 1·3) → 실제 가스비 vs 기준 금액
  return {
    usage: {
      electricity: Math.round(electricityUsage),
      gas: Math.round(gasUsage),
      water: Math.round(waterUsage),
    },
    baseline: {
      electricity: Math.round(electricityBaseline),
      gas: Math.round(gasBaseline),
      water: Math.round(waterBaseline),
    },
    scores: {
      electricity: toComparisonScore(electricityUsage, electricityBaseline),
      gas: toComparisonScore(input.gasBill, gasBaseline),
      water: toComparisonScore(waterUsage, waterBaseline),
    },
  }
}

// ── 절약 잠재점수 (문서 5 최종) ────────────────────────
// 각 항목 0~25점, 계절에 따라 비활성 항목 제외 후 100점 만점 정규화
const standbyScore: Record<string, number> = {
  plugged: 25,
  unknown: 15,
  unplug: 5,
}

const lightingScore: Record<string, number> = {
  allday: 25,
  most: 15,
  necessary: 5,
}

const heatingScore: Record<string, number> = {
  mostly_on: 25,
  off_when_out: 12,
  rarely: 5,
}

const acHoursScore: Record<string, number> = {
  none: 0,
  '1-2': 8,
  '3-5': 16,
  '6+': 22,
}

const acTempFactor: Record<string, number> = {
  over26: 0.8,
  '24-26': 1.0,
  under23: 1.3,
}

const getAcScore = (answers: AssessmentAnswers): number => {
  const hours = acHoursScore[answers.ac_hours] ?? 0
  const temp = acTempFactor[answers.ac_temp] ?? 1.0
  return Math.min(25, Math.round(hours * temp))
}

const computeSavingScore = (
  answers: AssessmentAnswers,
  season: Season,
): number => {
  const parts: number[] = [
    standbyScore[answers.standby_power] ?? 0,
    lightingScore[answers.lighting] ?? 0,
  ]

  if (season === 'summer') parts.push(getAcScore(answers))
  if (season === 'winter') parts.push(heatingScore[answers.heating_pattern] ?? 0)

  const total = parts.reduce((sum, value) => sum + value, 0)
  const maxTotal = parts.length * 25
  return maxTotal === 0 ? 0 : Math.round((total / maxTotal) * 100)
}

// ── 10개 유형 분류 (문서 10 우선순위) ──────────────────
const isPracticingSaving = (answers: AssessmentAnswers): boolean => {
  return answers.standby_power === 'unplug' || answers.lighting === 'necessary'
}

const classifyResultType = (
  scores: CategoryScores,
  savingScore: number,
  answers: AssessmentAnswers,
  season: Season,
): string => {
  const { electricity: e, gas: g, water: w } = scores
  const band = {
    e: getScoreBand(e),
    g: getScoreBand(g),
    w: getScoreBand(w),
  }

  // 1순위 TYPE1: 모두 85↓ AND 절약점수 40 미만
  if (band.e === 'saving' && band.g === 'saving' && band.w === 'saving' && savingScore < 40) {
    return 'type-1'
  }

  // 2순위 TYPE9: 전기·가스 모두 130+
  if (e > 130 && g > 130) return 'type-9'

  // 3순위 TYPE2/3/4: 단일 항목 150+ 극단값
  if (e > 150 && g <= 115 && w <= 115) return 'type-2'
  if (g > 150 && e <= 115 && w <= 115 && season === 'winter') return 'type-3'
  if (w > 150 && e <= 115 && g <= 115) return 'type-4'

  // 4순위 TYPE5: 하계 전기 130+ AND 가스 85↓ AND 에어컨 과소비
  const acOveruse = (answers.ac_hours === '3-5' || answers.ac_hours === '6+')
    && answers.ac_temp === 'under23'
  if (season === 'summer' && e > 130 && g <= 85 && acOveruse) return 'type-5'

  // 5순위 TYPE7: 전기 115~150 AND 재택 거의 없음 AND 대기전력 관리 안 함
  if (e > 115 && e <= 150 && answers.home_time === 'rarely' && answers.standby_power !== 'unplug') {
    return 'type-7'
  }

  // 6순위 TYPE6: 가스 115~150 AND 요리 빈도 높음
  if (g > 115 && g <= 150 && answers.cooking === 'twice+') return 'type-6'

  // 7순위 TYPE10 vs TYPE8: 모두 평균 구간 → 절약 습관 실천 여부로 분기
  if (band.e === 'average' && band.g === 'average' && band.w === 'average') {
    return isPracticingSaving(answers) ? 'type-10' : 'type-8'
  }

  // 매칭 실패 시 절약 습관 실천 여부로 평균형 분류 (fallback)
  return isPracticingSaving(answers) ? 'type-10' : 'type-8'
}

// ── 유형 메타데이터 (문서 10) ──────────────────────────
export const resultTypes: ResultType[] = [
  {
    id: 'type-1',
    emoji: '🏅',
    title: '절약의 신',
    tagline: '공과금 고지서가 와도 두렵지 않은 당신',
    summary: '전기·가스·수도 모두 서울 평균보다 효율적으로 사용하고 있어요.',
    tipDirection: '현재 습관을 칭찬하고 태양광·절수 샤워기 등 심화 팁을 제안해요.',
  },
  {
    id: 'type-2',
    emoji: '💡',
    title: '전기 먹는 하마',
    tagline: '집에 작은 발전소라도 있는 건가요?',
    summary: '가스와 수도는 평균 수준인데, 전기 사용량이 유독 높아요.',
    tipDirection: '대기전력 차단(월 최대 6,800원)과 고효율 가전 교체를 안내해요.',
  },
  {
    id: 'type-3',
    emoji: '🔥',
    title: '난방 중독자',
    tagline: '겨울이 오면 가스회사가 웃는다',
    summary: '전기와 수도는 평균 수준이지만, 가스비가 크게 높아요.',
    tipDirection: '외출 시 난방 끄기(월 최대 20% 절감)와 단열 점검을 권장해요.',
  },
  {
    id: 'type-4',
    emoji: '🚿',
    title: '물의 민족',
    tagline: '수도꼭지를 틀면 한강이 흐른다',
    summary: '전기와 가스는 잘 관리되고 있지만, 수도 사용량이 훨씬 높아요.',
    tipDirection: '절수 샤워기 교체와 누수 점검을 제안해요.',
  },
  {
    id: 'type-5',
    emoji: '🌡️',
    title: '냉장고 방장',
    tagline: '여름엔 집이 편의점보다 시원하다',
    summary: '가스는 절약형인데, 여름 에어컨으로 전기비가 올라가고 있어요.',
    tipDirection: '에어컨 설정온도 26도 유지와 선풍기 병행을 제안해요.',
  },
  {
    id: 'type-6',
    emoji: '🍳',
    title: '요리사의 가스비',
    tagline: '매일 3끼, 집밥의 진심',
    summary: '요리 빈도를 감안하면 취사 비중이 큰 경우예요. 나쁜 상태는 아닙니다.',
    tipDirection: '뚜껑 덮고 요리하기와 인덕션·전기레인지 혼용을 제안해요.',
  },
  {
    id: 'type-7',
    emoji: '👻',
    title: '대기전력 귀신',
    tagline: '끄지 않은 플러그가 매달 돈을 먹는다',
    summary: '집에 거의 없는데도 전기요금이 높다면 대기전력이 주범입니다.',
    tipDirection: '멀티탭 전원 차단 습관과 대기전력 큰 가전 목록을 제공해요.',
  },
  {
    id: 'type-8',
    emoji: '⚖️',
    title: '평균의 수호자',
    tagline: '나쁘지도, 특별히 잘하지도 않는 딱 평균',
    summary: '전기·가스·수도 모두 서울 평균 수준이에요.',
    tipDirection: '절약 잠재점수가 가장 높은 항목 한 가지에 집중해요.',
  },
  {
    id: 'type-9',
    emoji: '🌪️',
    title: '에너지 블랙홀',
    tagline: '공과금 고지서를 보면 심호흡부터',
    summary: '전기와 가스 모두 평균을 크게 웃돌고 있어요.',
    tipDirection: '절약 예상 금액을 강조하고 즉시 실천 가능한 액션 3가지를 우선 제시해요.',
  },
  {
    id: 'type-10',
    emoji: '🌿',
    title: '친환경 루키',
    tagline: '절약을 시작했지만 아직 갈 길이 남은 당신',
    summary: '이미 절약을 시작하고 있어요! 나머지 습관 하나씩 바꿔가면 절약의 신까지 멀지 않습니다.',
    tipDirection: '잘하고 있는 점을 칭찬하고 효과 큰 습관 한 가지를 집중 제안해요.',
  },
]

const resultTypeById = new Map(resultTypes.map((type) => [type.id, type]))

// ── 유형별 추천 팁 (문서 10 절약 팁 방향) ──────────────
const recommendationsByType: Record<string, Recommendation[]> = {
  'type-1': [
    { id: 'solar-deepen', title: '심화 절약 도전', description: '태양광 미니발전소나 절수 샤워기 등 한 단계 높은 절약을 시도해보세요.' },
  ],
  'type-2': [
    { id: 'cut-standby', title: '대기전력 차단', description: '멀티탭 스위치로 대기전력을 줄이면 월 최대 6,800원까지 절약할 수 있어요.' },
    { id: 'efficient-appliance', title: '고효율 가전 교체', description: '소비전력이 큰 가전부터 1등급 제품으로 교체를 검토해보세요.' },
  ],
  'type-3': [
    { id: 'heating-off', title: '외출 시 난방 끄기', description: '외출할 때 난방을 끄면 월 최대 20%까지 가스비를 줄일 수 있어요.' },
    { id: 'insulation', title: '단열 점검', description: '창문 틈새 단열재와 문풍지로 난방 효율을 높여보세요.' },
  ],
  'type-4': [
    { id: 'water-saver', title: '절수 샤워기 교체', description: '절수형 샤워기와 절수 페달로 수도 사용량을 줄여보세요.' },
    { id: 'leak-check', title: '누수 점검', description: '아무도 물을 쓰지 않을 때 계량기가 도는지 확인해 누수를 점검하세요.' },
  ],
  'type-5': [
    { id: 'ac-temp', title: '에어컨 26도 유지', description: '설정온도를 1도만 올려도 전기비가 눈에 띄게 줄어요. 선풍기를 함께 쓰세요.' },
  ],
  'type-6': [
    { id: 'cooking-lid', title: '뚜껑 덮고 요리', description: '조리 시 뚜껑을 덮으면 가스 사용을 줄일 수 있어요.' },
    { id: 'induction-mix', title: '인덕션 혼용', description: '간단한 조리는 전기레인지를 병행해 가스 부담을 나눠보세요.' },
  ],
  'type-7': [
    { id: 'multitap-habit', title: '멀티탭 차단 습관', description: '외출 전 멀티탭을 끄는 습관만으로 대기전력을 크게 줄일 수 있어요.' },
  ],
  'type-8': [
    { id: 'focus-top', title: '한 항목 집중 절약', description: '절약 잠재점수가 가장 높은 항목 하나를 골라 집중적으로 개선해보세요.' },
  ],
  'type-9': [
    { id: 'instant-actions', title: '즉시 실천 액션 3가지', description: '대기전력 차단·난방 시간 줄이기·고소비 가전 점검을 바로 시작해보세요.' },
  ],
  'type-10': [
    { id: 'next-habit', title: '다음 절약 습관', description: '잘하고 있어요! 아직 실천하지 않은 습관 중 효과 큰 것 하나를 더 시작해보세요.' },
  ],
}

export const getResultTypeById = (resultTypeId: string): ResultType | null => {
  return resultTypeById.get(resultTypeId) ?? null
}

export const evaluateAssessment = (
  payload: AssessmentPayload,
): AssessmentEvaluation => {
  const { scores, usage, baseline } = computeScores(payload)
  const savingScore = computeSavingScore(
    payload.answerSnapshot,
    payload.inputSnapshot.season,
  )

  const resultTypeId = classifyResultType(
    scores,
    savingScore,
    payload.answerSnapshot,
    payload.inputSnapshot.season,
  )
  const resultType = resultTypeById.get(resultTypeId) ?? resultTypes[7]

  return {
    resultType,
    comparisonScores: scores,
    estimatedUsage: usage,
    baseline,
    savingScore,
    inputSnapshot: payload.inputSnapshot,
    answerSnapshot: payload.answerSnapshot,
    recommendationSnapshot: recommendationsByType[resultType.id] ?? [],
  }
}
