import { Message } from '@/features/messages/messages'
import { NextRequest } from 'next/server'
import { handleCustomApi } from '@/lib/api-services/customApi'

export const config = {
  runtime: 'edge',
}

export default async function handler(req: NextRequest) {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({
        error: 'Method Not Allowed',
        errorCode: 'METHOD_NOT_ALLOWED',
      }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  const {
    messages,
    stream,
    customApiUrl = '',
    customApiHeaders = '{}',
    customApiBody = '{}',
    customApiIncludeMimeType = false,
  } = await req.json()

  // クライアントから送られたBodyが無効なJSONの場合、サーバー側の環境変数にフォールバック
  const resolveBody = (clientValue: string): string => {
    const candidate = clientValue === '' ? '{}' : clientValue
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      return process.env.NEXT_PUBLIC_CUSTOM_API_BODY || '{}'
    }
  }

  try {
    return await handleCustomApi(
      messages,
      customApiUrl,
      customApiHeaders === '' ? '{}' : customApiHeaders,
      resolveBody(customApiBody),
      stream,
      customApiIncludeMimeType
    )
  } catch (error) {
    console.error('Error in Custom API call:', error)

    if (error instanceof Response) {
      return error
    }

    if (error instanceof Error) {
      const isClientError =
        error instanceof TypeError ||
        error.message.includes('Invalid URL') ||
        error.message.includes('customApiUrl')
      return new Response(
        JSON.stringify({
          error: error.message,
          errorCode: isClientError
            ? 'CustomAPIInvalidRequest'
            : 'CustomAPIError',
        }),
        {
          status: isClientError ? 400 : 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({
        error: 'Unexpected Error',
        errorCode: 'CustomAPIError',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
