// Font Manager — Font Cache / Loading / Missing Font Manager / Auto Activate Font.
// document.fonts(FontFaceSet)로 웹폰트를 자동 활성화(load)하고, 시스템 폰트 가용성은
// 폭 비교 휴리스틱으로 판별한다. 폰트가 로드되면 구독자(RenderEngine)에게 알려 재렌더한다.

type Availability = 'available' | 'missing' | 'pending'

const availability = new Map<string, Availability>()
const listeners = new Set<() => void>()

/** 폰트 로드/가용성 변경 알림 구독 (RenderEngine 이 캐시 무효화 + 재렌더) */
export function onFontsChanged(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function notify() {
  for (const cb of listeners) cb()
}

const hasDocFonts = typeof document !== 'undefined' && 'fonts' in document

// 폭 비교용 오프스크린 컨텍스트
let probeCtx: CanvasRenderingContext2D | null = null
function ctx(): CanvasRenderingContext2D {
  if (!probeCtx) probeCtx = document.createElement('canvas').getContext('2d')!
  return probeCtx
}

const PROBE = 'mmmmmwwwwwiii가나다ABCdefg0123'
const GENERICS = ['monospace', 'serif', 'sans-serif']

/**
 * 시스템/로드된 폰트 가용성 휴리스틱 — family 가 generic fallback 과 다른 폭을 내면 실제 존재.
 * (모든 generic 과 폭이 동일하면 fallback 으로만 렌더된 것 → 미설치)
 */
function detectAvailable(family: string): boolean {
  const c = ctx()
  for (const g of GENERICS) {
    c.font = `72px ${g}`
    const base = c.measureText(PROBE).width
    c.font = `72px "${family}", ${g}`
    const test = c.measureText(PROBE).width
    if (Math.abs(test - base) > 0.5) return true
  }
  return false
}

/** family 가 웹폰트로 로드 가능한지 시도 (Auto Activate) 후 재판별 */
function tryActivate(family: string) {
  if (!hasDocFonts) return
  availability.set(family, 'pending')
  const set = (document as Document & { fonts: FontFaceSet }).fonts
  // 다양한 weight 를 시도 (variable / 개별 웨이트)
  Promise.allSettled([
    set.load(`400 72px "${family}"`),
    set.load(`700 72px "${family}"`),
  ])
    .then(() => set.ready)
    .then(() => {
      const ok = detectAvailable(family)
      availability.set(family, ok ? 'available' : 'missing')
      notify()
    })
    .catch(() => {
      availability.set(family, detectAvailable(family) ? 'available' : 'missing')
      notify()
    })
}

/**
 * 폰트 보장 — 캐시된 가용성 반환. 미확인 시 판별하고, 없으면 Auto Activate 시도.
 * 렌더/측정 경로에서 매번 호출해도 저렴하다(캐시).
 */
export function ensureFont(family: string): Availability {
  const cached = availability.get(family)
  if (cached) return cached
  if (!hasDocFonts) {
    const a = detectAvailable(family) ? 'available' : 'missing'
    availability.set(family, a)
    return a
  }
  const ok = detectAvailable(family)
  if (ok) {
    availability.set(family, 'available')
    return 'available'
  }
  // 아직 없음 → 로드 시도 (비동기, 완료 시 notify)
  tryActivate(family)
  return 'pending'
}

/** 현재 미설치(대체 글꼴 사용)로 판정된 family 인지 */
export function isFontMissing(family: string): boolean {
  return ensureFont(family) === 'missing'
}

/** 미설치 폰트 목록 (Missing Font Manager) */
export function missingFonts(): string[] {
  const out: string[] = []
  for (const [family, a] of availability) if (a === 'missing') out.push(family)
  return out
}

/** 폰트 로드 완료를 일괄 감지해 구독자에게 통지 (앱 시작 시 1회 호출) */
export function watchFontLoads() {
  if (!hasDocFonts) return
  const set = (document as Document & { fonts: FontFaceSet }).fonts
  set.ready.then(() => {
    // 로드 완료 시 pending → 재판별
    let changed = false
    for (const [family, a] of availability) {
      if (a === 'pending') {
        availability.set(family, detectAvailable(family) ? 'available' : 'missing')
        changed = true
      }
    }
    if (changed) notify()
  })
  set.addEventListener?.('loadingdone', () => {
    availability.clear() // 재판별하도록 캐시 비우고
    notify()
  })
}
