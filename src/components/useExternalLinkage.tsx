import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import webSocketStore from '@/features/stores/websocketStore'
import { EmotionType } from '@/features/messages/messages'

///取得したコメントをストックするリストの作成（receivedMessages）
interface TmpMessage {
  text: string
  role: string
  emotion: EmotionType
  type: string
}

interface Params {
  handleReceiveTextFromWs: (
    text: string,
    role?: string,
    emotion?: EmotionType,
    type?: string
  ) => Promise<void>
}

const useExternalLinkage = ({ handleReceiveTextFromWs }: Params) => {
  const { t } = useTranslation()
  const externalLinkageMode = settingsStore((s) => s.externalLinkageMode)
  const [receivedMessages, setTmpMessages] = useState<TmpMessage[]>([])

  const processMessage = useCallback(
    async (message: TmpMessage) => {
      await handleReceiveTextFromWs(
        message.text,
        message.role,
        message.emotion,
        message.type
      )
    },
    [handleReceiveTextFromWs]
  )

  useEffect(() => {
    if (receivedMessages.length > 0) {
      const message = receivedMessages[0]
      const processedMessage =
        message.role === 'output' ||
        message.role === 'executing' ||
        message.role === 'console'
          ? { ...message, role: 'code' }
          : message
      setTmpMessages((prev) => prev.slice(1))
      processMessage(processedMessage)
    }
  }, [receivedMessages, processMessage])

  useEffect(() => {
    const ss = settingsStore.getState()
    if (!ss.externalLinkageMode) return

    const handleOpen = (event: Event) => {}
    const handleMessage = async (event: MessageEvent) => {
      const jsonData = JSON.parse(event.data)
      setTmpMessages((prevMessages) => [...prevMessages, jsonData])
    }
    const handleError = (event: Event) => {}
    const handleClose = (event: Event) => {}

    const handlers = {
      onOpen: handleOpen,
      onMessage: handleMessage,
      onError: handleError,
      onClose: handleClose,
    }

    function connectWebsocket() {
      const current = webSocketStore.getState().wsManager
      if (current?.isConnected()) return current.websocket
      return new WebSocket('ws://localhost:8000/ws')
    }

    webSocketStore.getState().initializeWebSocket(t, handlers, connectWebsocket)

    const reconnectInterval = setInterval(() => {
      const ss = settingsStore.getState()
      if (!ss.externalLinkageMode) return

      const currentManager = webSocketStore.getState().wsManager
      if (!currentManager) {
        // No manager at all — create one (handles first-render null capture case)
        webSocketStore.getState().initializeWebSocket(t, handlers, connectWebsocket)
        return
      }

      if (
        currentManager.websocket &&
        currentManager.websocket.readyState !== WebSocket.OPEN &&
        currentManager.websocket.readyState !== WebSocket.CONNECTING
      ) {
        homeStore.setState({ chatProcessing: false })
        console.log('try reconnecting...')
        currentManager.disconnect()
        webSocketStore
          .getState()
          .initializeWebSocket(t, handlers, connectWebsocket)
      }
    }, 2000)

    return () => {
      clearInterval(reconnectInterval)
      webSocketStore.getState().disconnect()
    }
  }, [externalLinkageMode, t])

  return null
}

export default useExternalLinkage
