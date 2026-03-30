import { Message } from '@/features/messages/messages'
import { NextResponse } from 'next/server'

/**
 * HTMLレスポンスからテキストを抽出する（CGI向け）
 */
function extractTextFromHtml(html: string): string {
  // style/scriptブロックを除去
  let text = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    // FrameBotナビゲーションパネル（ボタン類）を除去
    .replace(/<div[^>]*class="[^"]*FrameBot[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')

  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * base64データURLからMIMEタイプを抽出する
 * @param dataUrl base64データURL (例: "data:image/png;base64,...")
 * @returns MIMEタイプ (例: "image/png") または null
 */
function extractMimeTypeFromDataUrl(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:([^;]+);base64,/)
  const mimeType = match ? match[1] : null

  // MIMEタイプが画像形式であることを検証
  if (mimeType && !mimeType.startsWith('image/')) {
    return null
  }

  return mimeType
}

/**
 * メッセージ内の画像オブジェクトにmimeTypeを追加する
 * @param messages 処理するメッセージ配列
 * @returns mimeTypeが追加されたメッセージ配列
 */
function processMessagesWithMimeType(messages: Message[]): any[] {
  return messages.map((message) => {
    if (
      message.content &&
      Array.isArray(message.content) &&
      message.content.some((content: any) => content.type === 'image')
    ) {
      return {
        ...message,
        content: message.content.map((content: any) => {
          if (content.type === 'image' && content.image) {
            const mimeType = extractMimeTypeFromDataUrl(content.image)
            return mimeType
              ? {
                  ...content,
                  mimeType,
                }
              : content
          }
          return content
        }),
      }
    }
    return message
  })
}

/**
 * カスタムAPIを使用して応答を取得する
 * @param messages メッセージ
 * @param customApiUrl カスタムAPIのURL
 * @param customApiHeaders カスタムAPIのヘッダー (JSON文字列)
 * @param customApiBody カスタムAPIのボディ (JSON文字列)
 * @param stream ストリーミングするかどうか
 * @param customApiIncludeMimeType 画像にmimeTypeを含めるかどうか
 */
export async function handleCustomApi(
  messages: Message[],
  customApiUrl: string,
  customApiHeaders: string,
  customApiBody: string,
  stream: boolean,
  customApiIncludeMimeType: boolean = false
) {
  // 強制的にストリーミングを有効にする
  stream = true

  let parsedHeaders: Record<string, string> = {}
  let parsedBody: Record<string, any> = {}

  try {
    parsedHeaders = JSON.parse(customApiHeaders)
    parsedBody = JSON.parse(customApiBody)
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Invalid Headers or Body JSON',
        errorCode: 'InvalidJSON',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  // CGIエンドポイントの場合はフォームエンコーディングを使用
  const isCgiEndpoint = customApiUrl.toLowerCase().endsWith('.cgi')

  let apiHeaders: Record<string, string>
  let apiBody: string

  if (isCgiEndpoint) {
    // 最後のユーザーメッセージを取得
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
    const topic =
      typeof lastUserMsg?.content === 'string'
        ? lastUserMsg.content
        : Array.isArray(lastUserMsg?.content)
          ? (
              lastUserMsg.content.find((c: any) => c.type === 'text') as any
            )?.text || ''
          : ''

    // 最後のアシスタントメッセージを取得
    const lastAssistantMsg = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant')
    const lastTarStr =
      typeof lastAssistantMsg?.content === 'string'
        ? lastAssistantMsg.content
        : ''

    // AgentはbodyのAgent/agentフィールド、またはAuthorizationヘッダーから取得
    const agent =
      parsedBody.Agent ||
      parsedBody.agent ||
      parsedHeaders.Authorization?.replace('Bearer ', '') ||
      ''

    const formData = new URLSearchParams({
      Agent: agent,
      Topic: topic,
      LastTarStr: lastTarStr,
    })

    apiHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' }
    apiBody = formData.toString()
  } else {
    apiHeaders = {
      'Content-Type': 'application/json',
      ...parsedHeaders,
    }

    // customApiIncludeMimeTypeが有効な場合は画像にmimeTypeを追加
    const processedMessages = customApiIncludeMimeType
      ? processMessagesWithMimeType(messages)
      : messages

    apiBody = JSON.stringify({
      ...parsedBody,
      messages: processedMessages,
    })
  }

  const apiResponse = await fetch(customApiUrl, {
    method: 'POST',
    headers: apiHeaders,
    body: apiBody,
    signal: AbortSignal.timeout(180000), // 3分でタイムアウト
  })

  if (!apiResponse.ok) {
    console.error(
      `Custom API Error: Status ${apiResponse.status}, URL: ${customApiUrl}`
    )

    try {
      // エラーレスポンスの内容も可能であればログに出力
      const errorResponseText = await apiResponse.text()
      console.error(`Error Response: ${errorResponseText}`)

      // レスポンスを再作成するため、新しいResponseオブジェクトを作成
      return new Response(
        JSON.stringify({
          error: `Custom API Error: ${apiResponse.status}`,
          errorCode: 'CustomAPIError',
        }),
        {
          status: apiResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    } catch (e) {
      console.error('Failed to read error response body:', e)
      return new Response(
        JSON.stringify({
          error: `Custom API Error: ${apiResponse.status}`,
          errorCode: 'CustomAPIError',
        }),
        {
          status: apiResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }

  if (stream) {
    const contentType = apiResponse.headers.get('Content-Type') || ''

    // HTMLレスポンス（CGI等）の場合はテキストを抽出してplain textで返す
    if (isCgiEndpoint || contentType.includes('text/html')) {
      const html = await apiResponse.text()
      const text = extractTextFromHtml(html)
      return new Response(text, {
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache',
        },
      })
    }

    // ストリーミングレスポンスをそのまま返す
    return new Response(apiResponse.body, {
      headers: {
        'Content-Type': contentType || 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } else {
    // 非ストリーミングレスポンス
    const data = await apiResponse.json()
    return new Response(
      JSON.stringify({
        text: data.text || data.content || JSON.stringify(data),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
