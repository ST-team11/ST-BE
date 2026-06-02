import { corsHeaders } from './cors.ts'

export const createJsonResponse = (body: unknown, status = 200) => {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  })
}

export const createErrorResponse = (message: string, status = 400) => {
  return createJsonResponse({ error: message }, status)
}

export const readJsonBody = async (request: Request) => {
  try {
    return await request.json()
  } catch {
    return null
  }
}
