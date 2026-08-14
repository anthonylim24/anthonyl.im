import { useCallback, useEffect, useRef, useState } from 'react'
import { invokeDeepseek } from '@/lib/apiService'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
}

interface HistoryTurn {
  role: ChatRole
  content: string
}

function newId(): string {
  return crypto.randomUUID()
}

function toHistory(messages: ChatMessage[]): HistoryTurn[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }))
}

function lastMatchingUserIndex(messages: ChatMessage[], content: string): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user' && messages[i].content === content) {
      return i
    }
  }
  return -1
}

export function useChatSession() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(false)
  const loadingRef = useRef(false)
  const lastPromptRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    return () => {
      requestIdRef.current += 1
    }
  }, [])

  const send = useCallback(async (text: string, options?: { retry?: boolean }) => {
    const trimmed = text.trim()
    if (!trimmed || loadingRef.current) return

    lastPromptRef.current = trimmed
    loadingRef.current = true
    setError(false)
    setIsLoading(true)

    const assistantMessage: ChatMessage = {
      id: newId(),
      role: 'assistant',
      content: '',
    }

    let history: HistoryTurn[] = []
    setMessages((prev) => {
      if (options?.retry) {
        const userIndex = lastMatchingUserIndex(prev, trimmed)
        const base = userIndex >= 0 ? prev.slice(0, userIndex + 1) : prev
        history = toHistory(base.slice(0, -1))
        return [...base, assistantMessage]
      }
      history = toHistory(prev)
      const userMessage: ChatMessage = {
        id: newId(),
        role: 'user',
        content: trimmed,
      }
      return [...prev, userMessage, assistantMessage]
    })

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    try {
      await invokeDeepseek(trimmed, history, (content) => {
        if (requestId !== requestIdRef.current) return
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          const next = prev.slice()
          next[next.length - 1] = { ...last, content }
          return next
        })
      })
    } catch {
      if (requestId !== requestIdRef.current) return
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.content === '') {
          return prev.slice(0, -1)
        }
        return prev
      })
      setError(true)
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false
        setIsLoading(false)
      }
    }
  }, [])

  const retry = useCallback(() => {
    const prompt = lastPromptRef.current
    if (!prompt) return
    void send(prompt, { retry: true })
  }, [send])

  const clear = useCallback(() => {
    requestIdRef.current += 1
    loadingRef.current = false
    lastPromptRef.current = null
    setMessages([])
    setError(false)
    setIsLoading(false)
  }, [])

  return {
    messages,
    isLoading,
    error,
    send,
    retry,
    clear,
  }
}
