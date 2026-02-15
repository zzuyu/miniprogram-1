export const PLATFORM_OPTIONS = ['朋友圈', '小红书', '微博'] as const
export const TONE_OPTIONS = ['自然', '治愈', '高级', '幽默'] as const
export const LENGTH_OPTIONS = ['短', '中', '长'] as const
export const RESULT_COUNT_OPTIONS = [3, 5, 8] as const

export type Platform = (typeof PLATFORM_OPTIONS)[number]
export type Tone = (typeof TONE_OPTIONS)[number]
export type Length = (typeof LENGTH_OPTIONS)[number]
export type ResultCount = (typeof RESULT_COUNT_OPTIONS)[number]

export interface FormData {
  topic: string
  scene: string
  audience: string
  requirements: string
  platform: Platform
  tone: Tone
  length: Length
  resultCount: ResultCount
  diversity: number
  imageCount: number
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

interface ImageFunctionResult {
  success?: boolean
  imageUrl?: string
  revised_prompt?: string
  revisedPrompt?: string
  code?: string | number
  message?: string
}

export interface ImageGenerateResult {
  source: 'cloud'
  imageUrl: string
  revisedPrompt: string
}

interface CloudGenerateResponse {
  items?: Array<Partial<CopyItem>>
}

interface GenerateResult {
  items: CopyItem[]
  source: 'mock' | 'cloud'
  reason?: string
}

type GeneratorMode = 'mock' | 'cloud'

const GENERATOR_MODE: GeneratorMode = 'cloud'
const DEEPSEEK_PROVIDER = 'deepseek'
const DEEPSEEK_MODEL = 'deepseek-v3.2'
const IMAGE_FUNCTION_NAME = 'aiImageGenerate'
const ENABLE_MOCK_FALLBACK = true
const RECOVERABLE_REASONS = new Set(['INVALID_MODEL_JSON', 'EMPTY_MODEL_ITEMS', 'EMPTY_RESPONSE'])

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

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
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
  const requirements = formData.requirements.trim()
  const hooks = buildPlatformHooks(formData.platform)
  const hashtags = formData.withHashtags ? buildHashtags(baseTopic, formData.platform) : []
  const emoji = formData.withEmoji ? '✨' : ''
  const lengthHint = buildLengthHint(formData.length)
  const endings = [
    '你会怎么写这一天？',
    '希望这条也能给你一点点灵感。',
    '愿我们都能把普通日子过成喜欢的样子。',
    '如果你也有同感，留言告诉我。',
    '把这一刻收藏给未来的自己。',
  ]
  const transitions = ['换个角度看', '突然意识到', '最打动我的是', '后来回想起来', '慢慢发现']

  return Array.from({ length: formData.resultCount }).map((_, idx) => {
    const now = Date.now() + idx
    const hook = hooks[idx % hooks.length]
    const transition = transitions[idx % transitions.length]
    const ending = endings[idx % endings.length]
    const imageHint =
      formData.imageCount > 0
        ? `配上${formData.imageCount}张图会更有画面感。`
        : '纯文字也能成立。'
    return {
      id: `copy_${now}_${idx}`,
      title: `${formData.platform}风格 ${idx + 1}`,
      content: [
        `${hook}${emoji}`,
        `${scene}里，${transition}“${baseTopic}”这件事其实很值得认真记录。`,
        requirements ? `按我的要求补充：${requirements}` : `想分享给${audience}。`,
        `${lengthHint}${imageHint}`,
        pick([ending, ending.replace('。', '，真的挺好。')]),
      ].join('\n'),
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
  const rawContent = typeof input.content === 'string' ? input.content : ''
  return {
    id: input.id || `copy_${now}_${index}`,
    title: input.title || `${formData.platform}风格 ${index + 1}`,
    content: sanitizeContent(rawContent),
    hashtags: Array.isArray(input.hashtags) ? input.hashtags.filter(Boolean) : [],
    platform: (input.platform as Platform) || formData.platform,
    tone: (input.tone as Tone) || formData.tone,
    favorite: !!input.favorite,
    createdAt: typeof input.createdAt === 'number' ? input.createdAt : now,
  }
}

function buildModelPrompt(formData: FormData, strictJson = false): string {
  const lengthHint =
    formData.length === '短'
      ? '每条 35-60 字'
      : formData.length === '中'
        ? '每条 60-110 字'
        : '每条 110-180 字'

  return [
    '你是资深中文社媒文案编辑，擅长朋友圈/小红书/微博。',
    `任务：生成 ${formData.resultCount} 条风格明显不同、可直接发布的文案。`,
    '必须遵守：',
    '1) 仅输出 JSON 数组，不要任何解释文字。',
    `2) ${formData.resultCount}条文案不能出现重复句、重复段、重复开头。`,
    '3) 语言自然，不要模板腔，不要出现“写给xx”“提醒自己”等固定套话。',
    '4) 不要输出 markdown 代码块标记。',
    `平台：${formData.platform}`,
    `主题：${formData.topic}`,
    `场景：${formData.scene || '无'}`,
    `受众：${formData.audience || '无'}`,
    `额外要求：${formData.requirements || '无'}`,
    `语气：${formData.tone}`,
    `长度：${formData.length}（${lengthHint}）`,
    `多样性强度：${formData.diversity}/100（越高越敢于改变句式、叙事角度和开头）`,
    `用户上传图片数量：${formData.imageCount}（需要让文字与图片内容风格兼容，但不要臆测具体图片细节）`,
    `是否包含 emoji：${formData.withEmoji ? '是' : '否'}`,
    `是否包含 hashtag：${formData.withHashtags ? '是' : '否'}`,
    '输出结构（严格一致）：',
    '[{"title":"","content":"","hashtags":[],"platform":"","tone":""}]',
    strictJson ? '再次强调：必须是可被 JSON.parse 直接解析的合法 JSON。' : '',
  ].join('\n')
}

function sanitizeContent(content: string): string {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const line of lines) {
    if (seen.has(line)) continue
    seen.add(line)
    deduped.push(line)
  }
  return deduped.join('\n')
}

function extractJsonText(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }

  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1)
  }

  return raw.trim()
}

function parseModelItems(raw: string, formData: FormData): CopyItem[] {
  const jsonText = extractJsonText(raw)
  const parsed = JSON.parse(jsonText)
  if (!Array.isArray(parsed)) {
    throw new Error('INVALID_MODEL_JSON')
  }

  const normalized = parsed
    .map((item, index) => normalizeCopyItem((item || {}) as Partial<CopyItem>, formData, index))
    .filter((item) => !!item.content.trim())
    .filter((item, index, arr) => arr.findIndex((x) => x.content === item.content) === index)
    .slice(0, formData.resultCount)

  if (!normalized.length) {
    throw new Error('EMPTY_MODEL_ITEMS')
  }
  return normalized
}

async function requestGenerateByCloudAI(formData: FormData): Promise<CloudGenerateResponse> {
  const ai = (wx.cloud as any)?.extend?.AI
  if (!ai || typeof ai.createModel !== 'function') {
    throw new Error('AI_EXT_NOT_READY')
  }

  const res = await ai.createModel(DEEPSEEK_PROVIDER).streamText({
    data: {
      model: DEEPSEEK_MODEL,
      messages: [
        {
          role: 'user',
          content: buildModelPrompt(formData),
        },
      ],
    },
  })

  let output = ''

  // Prefer official text stream to avoid SSE event parsing incompatibilities.
  if (res?.textStream && typeof res.textStream[Symbol.asyncIterator] === 'function') {
    for await (const text of res.textStream as AsyncIterable<string>) {
      if (text) output += text
    }
  } else if (res?.eventStream && typeof res.eventStream[Symbol.asyncIterator] === 'function') {
    for await (const event of res.eventStream as AsyncIterable<{ data: string }>) {
      if (!event?.data) continue
      if (event.data === '[DONE]') break
      try {
        const data = JSON.parse(event.data)
        const text = data?.choices?.[0]?.delta?.content
        if (text) {
          output += text
        }
      } catch (error) {
        continue
      }
    }
  }

  return {
    items: parseModelItems(output, formData),
  }
}

async function requestGenerateByCloudAIStrictJson(formData: FormData): Promise<CloudGenerateResponse> {
  const ai = (wx.cloud as any)?.extend?.AI
  if (!ai || typeof ai.createModel !== 'function') {
    throw new Error('AI_EXT_NOT_READY')
  }

  const res = await ai.createModel(DEEPSEEK_PROVIDER).streamText({
    data: {
      model: DEEPSEEK_MODEL,
      messages: [
        {
          role: 'user',
          content: buildModelPrompt(formData, true),
        },
      ],
    },
  })

  let output = ''
  if (res?.textStream && typeof res.textStream[Symbol.asyncIterator] === 'function') {
    for await (const text of res.textStream as AsyncIterable<string>) {
      if (text) output += text
    }
  }

  return {
    items: parseModelItems(output, formData),
  }
}

function normalizeErrorReason(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (error && typeof error === 'object') {
    const maybeErr = error as { errCode?: number | string; errMsg?: string; message?: string }
    if (maybeErr.errCode !== undefined || maybeErr.errMsg) {
      return `errCode:${String(maybeErr.errCode ?? 'UNKNOWN')}|errMsg:${maybeErr.errMsg || 'UNKNOWN'}`
    }
    if (maybeErr.message) {
      return maybeErr.message
    }
  }
  return 'UNKNOWN_ERROR'
}

export async function generateImageAsset(prompt: string): Promise<ImageGenerateResult> {
  const cleanPrompt = prompt.trim()
  if (!cleanPrompt) {
    throw new Error('EMPTY_IMAGE_PROMPT')
  }
  if (!IMAGE_FUNCTION_NAME) {
    throw new Error('IMAGE_FUNCTION_NOT_CONFIGURED')
  }

  const response = await wx.cloud.callFunction({
    name: IMAGE_FUNCTION_NAME,
    data: { prompt: cleanPrompt },
  })

  const result = (response?.result || {}) as ImageFunctionResult
  if (result.success === false) {
    const code = result.code ?? 'UNKNOWN'
    const msg = result.message || 'GEN_IMAGE_FAILED'
    throw new Error(`IMAGE_FUNCTION_FAIL:${String(code)}|${msg}`)
  }

  const imageUrl = result.imageUrl || ''
  if (!imageUrl) {
    throw new Error('EMPTY_IMAGE_URL')
  }

  return {
    source: 'cloud',
    imageUrl,
    revisedPrompt: result.revised_prompt || result.revisedPrompt || cleanPrompt,
  }
}

export function buildDefaultFormData(): FormData {
  return {
    topic: '',
    scene: '',
    audience: '',
    requirements: '',
    platform: PLATFORM_OPTIONS[0],
    tone: TONE_OPTIONS[0],
    length: LENGTH_OPTIONS[1],
    resultCount: RESULT_COUNT_OPTIONS[1],
    diversity: 72,
    imageCount: 0,
    withEmoji: true,
    withHashtags: true,
  }
}

export async function generateCopyCandidates(formData: FormData): Promise<GenerateResult> {
  const shouldUseCloud = GENERATOR_MODE === 'cloud'
  if (!shouldUseCloud) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    return {
      items: buildMockResults(formData),
      source: 'mock',
      reason: 'FORCED_MOCK_MODE',
    }
  }

  try {
    const response = await requestGenerateByCloudAI(formData)
    let items = Array.isArray(response.items) ? response.items : []
    if (!items.length) {
      throw new Error('EMPTY_RESPONSE')
    }

    // Retry once with stricter JSON constraints when response is unstable.
    if (items.length < formData.resultCount) {
      try {
        const retryRes = await requestGenerateByCloudAIStrictJson(formData)
        const retryItems = Array.isArray(retryRes.items) ? retryRes.items : []
        if (retryItems.length >= items.length) {
          items = retryItems
        }
      } catch (error) {
        // Ignore retry failure and keep first response.
      }
    }

    return {
      items: items.map((item, index) => normalizeCopyItem(item, formData, index)).slice(0, formData.resultCount),
      source: 'cloud',
    }
  } catch (error) {
    const reason = normalizeErrorReason(error)
    if (RECOVERABLE_REASONS.has(reason)) {
      try {
        const retryRes = await requestGenerateByCloudAIStrictJson(formData)
        const retryItems = Array.isArray(retryRes.items) ? retryRes.items : []
        if (retryItems.length) {
          return {
            items: retryItems
              .map((item, index) => normalizeCopyItem(item, formData, index))
              .slice(0, formData.resultCount),
            source: 'cloud',
          }
        }
      } catch (retryError) {
        const retryReason = normalizeErrorReason(retryError)
        console.warn('cloud strict retry failed', retryReason)
      }
    }

    if (!ENABLE_MOCK_FALLBACK) {
      throw new Error(reason)
    }

    console.warn('cloud generate failed, fallback to mock', reason)
    await new Promise((resolve) => setTimeout(resolve, 300))
    return {
      items: buildMockResults(formData),
      source: 'mock',
      reason,
    }
  }
}
