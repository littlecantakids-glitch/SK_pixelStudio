import { useEffect } from 'react'

/**
 * 앱 단축키가 브라우저/다른 핸들러보다 먼저 실행되도록 capture 단계에서 선점하고,
 * 막을 수 있는 브라우저 기본 동작(예: Ctrl+S 저장, Ctrl+O 열기)을 차단한다.
 *
 * 주의: Ctrl+T(새 탭), Ctrl+N(새 창), Ctrl+W(탭 닫기), Ctrl+Shift+T 등은
 * 브라우저가 예약한 단축키라 일반 탭에서는 preventDefault 로 막을 수 없다.
 * 완전히 막으려면 PWA(standalone)로 설치해 실행해야 한다.
 */
const GUARDED = new Set([
  's', // 저장
  'o', // 열기
  't', // 자유 변형 (브라우저 새 탭 — 일반 탭에선 실제 차단 불가)
  'n', // 새 문서 (브라우저 새 창 — 일반 탭에선 실제 차단 불가)
  'j', // 레이어 복제
  'g', // 그룹
  '0', // 화면 맞춤
  '1', // 100%
])

function isTyping(target: EventTarget | null) {
  const tag = (target as HTMLElement | null)?.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
}

export function useGlobalShortcutGuard() {
  useEffect(() => {
    function onKeyDownCapture(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return
      if (isTyping(e.target)) return
      const key = e.key.toLowerCase()
      if (GUARDED.has(key)) {
        // 브라우저 기본 동작 선점 (막을 수 있는 키에 한해 효과 있음)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDownCapture, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDownCapture, { capture: true })
  }, [])
}
