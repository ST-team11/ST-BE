import {
  getResultTypeById,
  resultTypes,
} from '../_shared/assessment.ts'
import { createOptionsResponse } from '../_shared/cors.ts'
import {
  createErrorResponse,
  createJsonResponse,
  readJsonBody,
} from '../_shared/http.ts'

const getResultTypeId = async (request: Request) => {
  if (request.method === 'GET') {
    return new URL(request.url).searchParams.get('type')
  }

  const body = await readJsonBody(request)

  if (typeof body === 'object' && body !== null && 'resultType' in body) {
    const resultType = body.resultType
    return typeof resultType === 'string' ? resultType : null
  }

  return null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return createOptionsResponse()
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return createErrorResponse('Method not allowed.', 405)
  }

  const resultTypeId = await getResultTypeId(request)

  if (!resultTypeId) {
    return createJsonResponse({ resultTypes })
  }

  const resultType = getResultTypeById(resultTypeId)

  if (!resultType) {
    return createErrorResponse('Result type not found.', 404)
  }

  return createJsonResponse({ resultType })
})
