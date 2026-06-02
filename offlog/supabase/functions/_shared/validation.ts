import type {
  Appliance,
  AssessmentAnswers,
  AssessmentInput,
  Season,
} from './assessment.ts'

type AssessmentBody = {
  inputSnapshot: AssessmentInput
  answerSnapshot: AssessmentAnswers
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isStringRecord = (value: unknown): value is Record<string, string> => {
  return isRecord(value) && Object.values(value).every((item) => {
    return typeof item === 'string'
  })
}

const isPositiveNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

const seasons: Season[] = ['summer', 'winter', 'other']
const appliances: Appliance[] = ['dryer', 'dishwasher', 'air_purifier', 'electric_heater']

const parseSeason = (value: unknown): Season | null => {
  return seasons.includes(value as Season) ? (value as Season) : null
}

const parseAppliances = (value: unknown): Appliance[] => {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Appliance => {
    return appliances.includes(item as Appliance)
  })
}

const parseInput = (value: unknown): AssessmentInput | null => {
  if (!isRecord(value)) return null

  const season = parseSeason(value.season)
  if (!season) return null

  if (
    !isPositiveNumber(value.electricityBill) ||
    !isPositiveNumber(value.gasBill) ||
    !isPositiveNumber(value.waterBill)
  ) {
    return null
  }

  const waterBillingMonths = isPositiveNumber(value.waterBillingMonths)
    ? value.waterBillingMonths
    : 1

  return {
    electricityBill: value.electricityBill,
    gasBill: value.gasBill,
    waterBill: value.waterBill,
    waterBillingMonths: waterBillingMonths > 0 ? waterBillingMonths : 1,
    season,
    appliances: parseAppliances(value.appliances),
  }
}

export const parseAssessmentBody = (
  value: unknown,
): AssessmentBody | null => {
  if (!isRecord(value) || !isStringRecord(value.answerSnapshot)) {
    return null
  }

  const inputSnapshot = parseInput(value.inputSnapshot)
  if (!inputSnapshot) return null

  return {
    inputSnapshot,
    answerSnapshot: value.answerSnapshot,
  }
}
