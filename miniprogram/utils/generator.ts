export const PLATFORM_OPTIONS = ['朋友圈', '小红书', '微博'] as const
export const TONE_OPTIONS = ['自然', '治愈', '高级', '幽默'] as const
export const LENGTH_OPTIONS = ['短', '中', '长'] as const

export type Platform = (typeof PLATFORM_OPTIONS)[number]
export type Tone = (typeof TONE_OPTIONS)[number]
export type Length = (typeof LENGTH_OPTIONS)[number]

export interface FormData {
  topic: string
  scene: string
  audience: string
  platform: Platform
  tone: Tone
  length: Length
  withEmoji: boolean
  withHashtags: boolean
}

export interface CopyItem {
  id: string
  title: string
  content: string
  hashtags: string[]
  platform: Platform
  tone: Tone
  favorite: boolean
  createdAt: number
}

interface CloudGenerateResponse {
  items?: Array<Partial<CopyItem>>
}

interface GenerateResult {
  items: CopyItem[]
  source: 'mock' | 'cloud'
}

type GeneratorMode = 'mock' | 'cloud'

const GENERATOR_MODE: GeneratorMode = 'mock'
const GENERATE_API_URL = ''

function buildHashtags(topic: string, platform: Platform): string[] {
  const seed = topic.trim() || '今日分享'
  if (platform === '小红书') {
    return [`#${seed}`, '#真实体验', '#今日灵感']
  }
  if (platform === '微博') {
    return [`#${seed}`, '#碎碎念', '#记录生活']
  }
  return [`#${seed}`, '#朋友圈日常']
}

function buildLengthHint(length: Length): string {
  if (length === '短') {
    return '一句话点题，干净利落。'
  }
  if (length === '长') {
    return '补充场景与细节，让情绪更完整。'
  }
  return '控制在 2-3 句，信息和情绪平衡。'
}

function buildPlatformHooks(platform: Platform): string[] {
  if (platform === '小红书') {
    return ['今天挖到一个小确幸', '这条想给同频的人', '直接说结论：值得']
  }
  if (platform === '微博') {
    return ['今日份更新：', '一些碎碎念：', '突然想记录一下：']
  }
  return ['今天想分享一件小事', '这一刻很想发个朋友圈', '留个生活切片']
}

function buildMockResults(formData: FormData): CopyItem[] {
  const baseTopic = formData.topic.trim() || '今天'
  const scene = formData.scene.trim() || '普通的一天'
  const audience = formData.audience.trim() || '朋友们'
  const hooks = buildPlatformHooks(formData.platform)
  const hashtags = formData.withHashtags ? buildHashtags(baseTopic, formData.platform) : []
  const emoji = formData.withEmoji ? '✨' : ''
  const lengthHint = buildLengthHint(formData.length)

  return hooks.map((hook, idx) => {
    const now = Date.now() + idx
    return {
      id: `copy_${now}_${idx}`,
      title: `${formData.platform}风格 ${idx + 1}`,
      content: `${hook}${emoji}\n${scene}里，我对“${baseTopic}”有了新的感受。${lengthHint}\n写给${audience}，也提醒自己慢一点、真一点。`,
      hashtags,
      platform: formData.platform,
      tone: formData.tone,
      favorite: false,
      createdAt: now,
    }
  })
}

function normalizeCopyItem(input: Partial<CopyItem>, formData: FormData, index: number): CopyItem {
  const now = Date.now() + index
  return {
    id: input.id || `copy_${now}_${index}`,
    title: input.title || `${formData.platform}风格 ${index + 1}`,
    content: input.content || '',
    hashtags: Array.isArray(input.hashtags) ? input.hashtags.filter(Boolean) : [],
    platform: (input.platform as Platform) || formData.platform,
    tone: (input.tone as Tone) || formData.tone,
    favorite: !!input.favorite,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : now,
  }
}

function requestGenerate(formData: FormData): Promise<CloudGenerateResponse> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: GENERATE_API_URL,
      method: 'POST',
      data: formData,
      timeout: 10000,
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP_${res.statusCode}`))
          return
        }
        resolve((res.data || {}) as CloudGenerateResponse)
      },
      fail: (error) => reject(error),
    })
  })
}

export function buildDefaultFormData(): FormData {
  return {
    topic: '',
    scene: '',
    audience: '',
    platform: PLATFORM_OPTIONS[0],
    tone: TONE_OPTIONS[0],
    length: LENGTH_OPTIONS[1],
    withEmoji: true,
    withHashtags: true,
  }
}

export async function generateCopyCandidates(formData: FormData): Promise<GenerateResult> {
  const shouldUseCloud = GENERATOR_MODE === 'cloud' && !!GENERATE_API_URL
  if (!shouldUseCloud) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    return {
      items: buildMockResults(formData),
      source: 'mock',
    }
  }

  const response = await requestGenerate(formData)
  const items = Array.isArray(response.items) ? response.items : []
  if (!items.length) {
    throw new Error('EMPTY_RESPONSE')
  }

  return {
    items: items.map((item, index) => normalizeCopyItem(item, formData, index)).slice(0, 3),
    source: 'cloud',
  }
}
