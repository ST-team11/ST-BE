import { evaluateAssessment } from '../_shared/assessment.ts'
import { createOptionsResponse } from '../_shared/cors.ts'
import {
  createErrorResponse,
  createJsonResponse,
  readJsonBody,
} from '../_shared/http.ts'
import { parseAssessmentBody } from '../_shared/validation.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return createOptionsResponse()
  }

  if (request.method !== 'POST') {
    return createErrorResponse(
      'Method not allowed.',
      405
    )
  }

  try {
    const body = parseAssessmentBody(
      await readJsonBody(request)
    )

    if (!body) {
      return createErrorResponse(
        'Invalid assessment payload.',
        400
      )
    }

    const result = evaluateAssessment(body)

    return createJsonResponse({
      success: true,
      result,
    })
  } catch {
    return createErrorResponse(
      'Bad request.',
      400
    )
  }
})