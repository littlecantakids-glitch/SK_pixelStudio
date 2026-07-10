import { useCallback, useEffect, useState } from 'react'
import type { DocumentPreset } from '../types/document'

const STORAGE_KEY = 'pixelstudio.recentDocuments'
const MAX_RECENT = 20

// 최초 실행 시 보여줄 기본 사전 설정 (Photoshop의 최근 항목 느낌)
const SEED: DocumentPreset[] = [
  mk('클립보드', 320, 63, 96),
  mk('사용자 정의', 755, 122, 96),
  mk('사용자 정의', 1920, 1080, 72),
  mk('사용자 정의', 1376, 768, 72),
  mk('사용자 정의', 600, 350, 72),
  mk('사용자 정의', 1500, 1920, 72),
  mk('사용자 정의', 1280, 1920, 72),
  mk('사용자 정의', 1080, 1920, 72),
  mk('사용자 정의', 1080, 1680, 72),
  mk('사용자 정의', 1080, 1280, 72),
  mk('사용자 정의', 1200, 1800, 72),
  mk('사용자 정의', 2048, 2048, 72),
]

function mk(name: string, w: number, h: number, res: number): DocumentPreset {
  return {
    id: `seed-${name}-${w}x${h}-${res}`,
    name,
    width: w,
    height: h,
    unit: 'px',
    resolution: res,
    resolutionUnit: 'ppi',
    orientation: w >= h ? 'landscape' : 'portrait',
    artboard: false,
    colorMode: 'RGB',
    bitDepth: 8,
    background: 'white',
    colorProfile: 'sRGB IEC61966-2.1',
    pixelAspectRatio: '정사각형 픽셀',
  }
}

function load(): DocumentPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return SEED
    const parsed = JSON.parse(raw) as DocumentPreset[]
    return Array.isArray(parsed) && parsed.length ? parsed : SEED
  } catch {
    return SEED
  }
}

export function useRecentDocuments() {
  const [recent, setRecent] = useState<DocumentPreset[]>(() => load())

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recent))
    } catch {
      // 저장 실패는 무시 (프라이빗 모드 등)
    }
  }, [recent])

  const addRecent = useCallback((preset: DocumentPreset) => {
    setRecent((prev) => {
      const next = [preset, ...prev.filter((p) => p.id !== preset.id)]
      return next.slice(0, MAX_RECENT)
    })
  }, [])

  return { recent, addRecent }
}
