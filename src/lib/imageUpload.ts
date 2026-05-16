import { supabase } from '@/lib/supabase'

const BUCKET = 'gelato-tasks'
const MAX_DIMENSION = 1024
const JPEG_QUALITY = 0.82

/** Image element 로드. URL.createObjectURL 사용 후 호출자가 revoke 책임. */
function loadImage(file: File): Promise<{ img: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 읽을 수 없습니다. JPG·PNG·WebP 형식만 지원합니다.'))
    }
    img.src = url
  })
}

function scaleToFit(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h }
  if (w >= h) return { width: max, height: Math.round((max * h) / w) }
  return { width: Math.round((max * w) / h), height: max }
}

/** 클라이언트에서 리사이즈 + JPEG 압축. EXIF orientation은 브라우저가 자동 처리. */
export async function resizeImage(
  file: File,
  maxDim: number = MAX_DIMENSION,
): Promise<Blob> {
  const { img, url } = await loadImage(file)
  try {
    const { width, height } = scaleToFit(img.width, img.height, maxDim)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context를 사용할 수 없습니다.')
    ctx.drawImage(img, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('이미지 변환에 실패했습니다.')),
        'image/jpeg',
        JPEG_QUALITY,
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 리사이즈 후 Storage 업로드. 반환값 = storage path (bucket 상대). */
export async function uploadTaskImage(
  file: File,
  storeId: string,
): Promise<string> {
  const blob = await resizeImage(file)
  const stamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `tasks/${storeId}/${stamp}-${rand}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (error) throw error
  return path
}

/** Storage path 1건 또는 여러 건 일괄 삭제. */
export async function deleteTaskImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await supabase.storage.from(BUCKET).remove(paths)
  if (error) throw error
}

/** 1건 signed URL (기본 1시간) */
export async function getSignedUrl(
  path: string,
  expiresIn: number = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn)
  if (error) throw error
  return data.signedUrl
}

/** N건 signed URL 배치 발급. path → URL Map 반환. */
export async function getSignedUrls(
  paths: string[],
  expiresIn: number = 3600,
): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  if (paths.length === 0) return m
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, expiresIn)
  if (error) throw error
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) m.set(item.path, item.signedUrl)
  }
  return m
}
