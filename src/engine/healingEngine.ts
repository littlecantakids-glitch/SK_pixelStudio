// Healing Engine — Healing Brush 의 텍스처 보존 블렌드(순수 canvas 연산).
//
//   sourceTexture = source - blur(source)     (고주파 = 질감)
//   targetBase    = blur(target)              (저주파 = 색상/밝기/톤)
//   healed        = targetBase + sourceTexture
//
// healed 는 Stroke 시작 시점의 base(target) / source Snapshot 만으로 완전히 결정되므로
// Stroke 당 1회만 계산하고, 이후 Clone Renderer 파이프라인(Dab ∩ Selection 합성)에
// "정렬된 Source" 로 그대로 투입한다. (Healing = Clone 인데 Source 가 healed 로 바뀐 것)
import { enableHQSampling } from './brushEngine'

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  return c
}

/** Gaussian(canvas filter) 블러 캔버스 */
function blurCanvas(src: CanvasImageSource, w: number, h: number, r: number): HTMLCanvasElement {
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')!
  if (r > 0.1) ctx.filter = `blur(${r}px)`
  try {
    ctx.drawImage(src, 0, 0, w, h)
  } catch {
    /* noop */
  }
  ctx.filter = 'none'
  return c
}

export type BuildHealedOptions = {
  width: number
  height: number
  /** 대상 레이어 비트맵 (target) */
  base: CanvasImageSource | null
  /** 문서 크기 Source Composite Snapshot */
  sample: HTMLCanvasElement
  /** targetStart - sourceStart (문서 좌표) */
  offset: { x: number; y: number }
  /** 레이어 원점 (문서 좌표) */
  origin: { x: number; y: number }
  /** 저주파/고주파 분리 블러 반경 (Diffusion·Size 로 결정) */
  blurRadius: number
}

/**
 * healed = blur(target) + (source - blur(source))
 * 반환 캔버스는 레이어 로컬 좌표에 이미 정렬되어 있으며, alpha 는 source 의 alpha 를 따른다
 * (Source 가 투명한 영역은 Healing 하지 않는다).
 */
export function buildHealed(o: BuildHealedOptions): HTMLCanvasElement {
  const w = Math.max(1, Math.round(o.width))
  const h = Math.max(1, Math.round(o.height))

  // target(base) 레이어 로컬
  const baseC = makeCanvas(w, h)
  const bctx = baseC.getContext('2d')!
  if (o.base) {
    try {
      bctx.drawImage(o.base, 0, 0, w, h)
    } catch {
      /* noop */
    }
  }

  // source 를 offset 만큼 이동시켜 레이어 로컬에 정렬 (Bilinear)
  const srcC = makeCanvas(w, h)
  const sctx = srcC.getContext('2d')!
  enableHQSampling(sctx)
  sctx.drawImage(o.sample, o.offset.x - o.origin.x, o.offset.y - o.origin.y)

  const r = Math.max(0, o.blurRadius)
  const blurBase = blurCanvas(baseC, w, h, r)
  const blurSrc = blurCanvas(srcC, w, h, r)

  const A = blurBase.getContext('2d')!.getImageData(0, 0, w, h) // target low-freq
  const S = sctx.getImageData(0, 0, w, h) // source
  const B = blurSrc.getContext('2d')!.getImageData(0, 0, w, h) // source low-freq

  const out = makeCanvas(w, h)
  const octx = out.getContext('2d')!
  const img = octx.createImageData(w, h)
  const d = img.data
  const a = A.data
  const s = S.data
  const b = B.data
  for (let i = 0; i < d.length; i += 4) {
    const sa = s[i + 3]
    if (sa === 0) {
      d[i + 3] = 0
      continue
    }
    // healed = targetBase(blurBase) + sourceTexture(source - blurSource)
    for (let ch = 0; ch < 3; ch++) {
      const v = a[i + ch] + (s[i + ch] - b[i + ch])
      d[i + ch] = v < 0 ? 0 : v > 255 ? 255 : v
    }
    d[i + 3] = sa
  }
  octx.putImageData(img, 0, 0)
  return out
}

/** Diffusion(1~7) + Size → 저/고주파 분리 블러 반경 */
export function healingBlurRadius(size: number, diffusion: number): number {
  const d = Math.max(1, Math.min(7, diffusion))
  return Math.max(2, Math.min(80, Math.round(size * 0.35 + d * 1.5)))
}

/** Diffusion(1~7) → Dab 가장자리 소프트닝(경도 감소량). 높을수록 더 부드럽게 퍼진다 */
export function healingEdgeHardness(hardness: number, diffusion: number): number {
  const d = Math.max(1, Math.min(7, diffusion))
  return Math.max(0, Math.min(100, hardness - (d - 1) * 11))
}
