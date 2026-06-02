import { createClient } from 'npm:@supabase/supabase-js@2'
import { evaluateAssessment } from '../_shared/assessment.ts'
import { createOptionsResponse } from '../_shared/cors.ts'
import {
  createErrorResponse,
  createJsonResponse,
  readJsonBody,
} from '../_shared/http.ts'
import { parseAssessmentBody } from '../_shared/validation.ts'

const getRequiredEnv = (key: string) => {
  const value = Deno.env.get(key)

  if (!value) {
    throw new Error(`${key} is not configured.`)
  }

  return value
}

const createUserClient = (authorization: string) => {
  return createClient(
    getRequiredEnv('SUPABASE_URL'),
    getRequiredEnv('SUPABASE_ANON_KEY'),
    { global: { headers: { Authorization: authorization } } },
  )
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return createOptionsResponse()
  }

  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed.', 405)
  }

  const authorization = request.headers.get('Authorization')

  if (!authorization) {
    return createErrorResponse('Authorization header is required.', 401)
  }

  const body = parseAssessmentBody(await readJsonBody(request))

  if (!body) {
    return createErrorResponse('Invalid assessment payload.')
  }

  const supabase = createUserClient(authorization)
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return createErrorResponse('Invalid session.', 401)
  }
  const result = evaluateAssessment(body)

  // comparison_score 컬럼은 단일 숫자 → 전기·가스·수도 평균을 대표값으로 저장.
  // 항목별 상세 점수와 유형 메타데이터는 응답(result)에만 포함된다.
  const { electricity, gas, water } = result.comparisonScores
  const averageScore = Math.round((electricity + gas + water) / 3)

  // result_type 컬럼은 text → 유형 id만 저장 (전체 메타는 응답으로 전달)
  const { data, error } = await supabase
    .from('assessment_results')
    .insert({
      user_id: userData.user.id,

      result_type: result.resultType.id,
      comparison_score: averageScore,

      input_snapshot: body.inputSnapshot,
      answer_snapshot: body.answerSnapshot,

      recommendation_snapshot: result.recommendationSnapshot,
    })
    .select()
    .single()

  if (error) {
    return createErrorResponse(error.message, 400)
  }

  return createJsonResponse({ result, savedResult: data }, 201)
})
