import {
  buildDefaultFormData,
  CopyItem,
  FormData,
  generateImageAsset,
  generateCopyCandidates,
  ImageGenerateResult,
  LENGTH_OPTIONS,
  PLATFORM_OPTIONS,
  RESULT_COUNT_OPTIONS,
  TONE_OPTIONS,
} from '../../utils/generator'

const STORAGE_HISTORY_KEY = 'copy_generator_history_v1'
const STORAGE_DRAFT_KEY = 'copy_generator_draft_v1'
const MAX_HISTORY = 20

interface HistoryItem {
  id: string
  createdAt: number
  prompt: Pick<
    FormData,
    'topic' | 'scene' | 'audience' | 'requirements' | 'platform' | 'tone' | 'length' | 'resultCount' | 'diversity'
  >
  results: CopyItem[]
}

interface ImageCardState {
  loading: boolean
  url: string
  error: string
  revisedPrompt: string
}

function safeIndex<T>(options: readonly T[], value: T): number {
  const index = options.findIndex((item) => item === value)
  return index >= 0 ? index : 0
}

Component({
  data: {
    platformOptions: PLATFORM_OPTIONS,
    toneOptions: TONE_OPTIONS,
    lengthOptions: LENGTH_OPTIONS,
    resultCountOptions: RESULT_COUNT_OPTIONS,
    platformCards: [
      { key: '朋友圈', title: '朋友圈文案', subtitle: '偏生活化，熟人社交语境' },
      { key: '小红书', title: '小红书文案', subtitle: '更强调种草感与真实体验' },
      { key: '微博', title: '微博文案', subtitle: '更快节奏，观点更聚焦' },
    ],
    platformIndex: 0,
    toneIndex: 0,
    lengthIndex: 1,
    resultCountIndex: 1,
    formData: buildDefaultFormData() as FormData,
    images: [] as string[],
    loading: false,
    results: [] as CopyItem[],
    history: [] as HistoryItem[],
    activeTab: 'results',
    showSourceTag: true,
    lastGenerateSource: 'none' as 'none' | 'mock' | 'cloud',
    lastGenerateReason: '',
    imageStates: {} as Record<string, ImageCardState>,
  },

  lifetimes: {
    attached() {
      try {
        const history = wx.getStorageSync(STORAGE_HISTORY_KEY) || []
        const draft = wx.getStorageSync(STORAGE_DRAFT_KEY)
        if (Array.isArray(history)) {
          this.setData({ history })
        }
        if (draft && typeof draft === 'object') {
          const mergedFormData = { ...this.data.formData, ...draft }
          this.setData({
            formData: mergedFormData,
            platformIndex: safeIndex(this.data.platformOptions, mergedFormData.platform),
            toneIndex: safeIndex(this.data.toneOptions, mergedFormData.tone),
            lengthIndex: safeIndex(this.data.lengthOptions, mergedFormData.length),
            resultCountIndex: safeIndex(this.data.resultCountOptions, mergedFormData.resultCount),
          })
        }
      } catch (error) {
        console.warn('load storage failed', error)
      }
    },
    detached() {
      try {
        wx.setStorageSync(STORAGE_DRAFT_KEY, this.data.formData)
      } catch (error) {
        console.warn('save draft failed', error)
      }
    },
  },

  methods: {
    onTextInput(e: any) {
      const { field } = e.currentTarget.dataset
      const value = (e.detail.value || '').trimStart().slice(0, 200)
      if (!field) return
      this.setData({
        [`formData.${field}`]: value,
      })
    },

    onPlatformChange(e: any) {
      const index = Number(e.detail.value)
      this.setData({
        platformIndex: index,
        'formData.platform': this.data.platformOptions[index],
      })
    },

    onToneChange(e: any) {
      const index = Number(e.detail.value)
      this.setData({
        toneIndex: index,
        'formData.tone': this.data.toneOptions[index],
      })
    },

    onLengthChange(e: any) {
      const index = Number(e.detail.value)
      this.setData({
        lengthIndex: index,
        'formData.length': this.data.lengthOptions[index],
      })
    },

    onResultCountChange(e: any) {
      const index = Number(e.detail.value)
      this.setData({
        resultCountIndex: index,
        'formData.resultCount': this.data.resultCountOptions[index],
      })
    },

    onSelectPlatformCard(e: any) {
      const { platform } = e.currentTarget.dataset
      const index = this.data.platformOptions.findIndex((item) => item === platform)
      if (index < 0) return
      this.setData({
        platformIndex: index,
        'formData.platform': platform,
      })
    },

    onDiversityChange(e: any) {
      const value = Number(e.detail.value) || 70
      this.setData({
        'formData.diversity': value,
      })
    },

    onPickImages() {
      wx.chooseMedia({
        count: 9 - this.data.images.length,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const paths = res.tempFiles.map((item) => item.tempFilePath).filter(Boolean)
          const next = [...this.data.images, ...paths].slice(0, 9)
          this.setData({
            images: next,
            'formData.imageCount': next.length,
          })
        },
      })
    },

    onRemoveImage(e: any) {
      const index = Number(e.currentTarget.dataset.index)
      if (Number.isNaN(index)) return
      const next = [...this.data.images]
      next.splice(index, 1)
      this.setData({
        images: next,
        'formData.imageCount': next.length,
      })
    },

    onSwitchChange(e: any) {
      const { field } = e.currentTarget.dataset
      const value = !!e.detail.value
      if (!field) return
      this.setData({
        [`formData.${field}`]: value,
      })
    },

    async onGenerate() {
      const { formData, history, images } = this.data
      if (!formData.topic.trim()) {
        wx.showToast({ title: '先输入一个主题', icon: 'none' })
        return
      }

      const formDataForGenerate: FormData = {
        ...formData,
        imageCount: images.length,
      }

      this.setData({ loading: true })
      try {
        const generated = await generateCopyCandidates(formDataForGenerate)
        const results = generated.items

        const historyItem: HistoryItem = {
          id: `his_${Date.now()}`,
          createdAt: Date.now(),
          prompt: {
            topic: formDataForGenerate.topic,
            scene: formDataForGenerate.scene,
            audience: formDataForGenerate.audience,
            requirements: formDataForGenerate.requirements,
            platform: formDataForGenerate.platform,
            tone: formDataForGenerate.tone,
            length: formDataForGenerate.length,
            resultCount: formDataForGenerate.resultCount,
            diversity: formDataForGenerate.diversity,
          },
          results,
        }

        const nextHistory = [historyItem, ...history].slice(0, MAX_HISTORY)

        this.setData({
          results,
          history: nextHistory,
          activeTab: 'results',
          formData: formDataForGenerate,
          lastGenerateSource: generated.source,
          lastGenerateReason: generated.reason || '',
          imageStates: {},
        })

        try {
          wx.setStorageSync(STORAGE_HISTORY_KEY, nextHistory)
          wx.setStorageSync(STORAGE_DRAFT_KEY, formDataForGenerate)
        } catch (error) {
          console.warn('save history failed', error)
        }

        if (generated.source === 'mock') {
          wx.showToast({
            title: generated.reason ? `Mock(${generated.reason})` : '当前为Mock数据',
            icon: 'none',
          })
        }
      } catch (error) {
        console.error('generate failed', error)
        wx.showToast({ title: '生成失败，请重试', icon: 'none' })
      } finally {
        this.setData({ loading: false })
      }
    },

    onCopy(e: any) {
      const { content } = e.currentTarget.dataset
      if (!content) return
      wx.setClipboardData({
        data: content,
        success: () => {
          wx.showToast({ title: '已复制', icon: 'success' })
        },
      })
    },

    async onGenerateImage(e: any) {
      const { id } = e.currentTarget.dataset
      const item = this.data.results.find((entry) => entry.id === id)
      if (!item) return

      const prompt = [item.content, ...(item.hashtags || [])].join('\n').trim()
      if (!prompt) {
        wx.showToast({ title: '文案为空，无法配图', icon: 'none' })
        return
      }

      this.setData({
        [`imageStates.${id}`]: {
          loading: true,
          url: '',
          error: '',
          revisedPrompt: '',
        },
      })

      try {
        const generatedImage: ImageGenerateResult = await generateImageAsset(prompt)
        this.setData({
          [`imageStates.${id}`]: {
            loading: false,
            url: generatedImage.imageUrl,
            error: '',
            revisedPrompt: generatedImage.revisedPrompt,
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'IMAGE_UNKNOWN_ERROR'
        this.setData({
          [`imageStates.${id}`]: {
            loading: false,
            url: '',
            error: message,
            revisedPrompt: '',
          },
        })
        wx.showToast({ title: '配图失败', icon: 'none' })
      }
    },

    onRewrite(e: any) {
      const { id } = e.currentTarget.dataset
      const { results } = this.data
      const targetIndex = results.findIndex((item) => item.id === id)
      if (targetIndex < 0) return

      const target = results[targetIndex]
      const rewriteTips = ['换个叙事视角再写一版。', '把节奏再短促一点。', '最后加一个互动问题。', '加强情绪细节。']
      const rewriteTip = rewriteTips[Math.floor(Math.random() * rewriteTips.length)]

      const rewritten = {
        ...target,
        content: `${target.content}\n${rewriteTip}`,
        createdAt: Date.now(),
      }
      const nextResults = [...results]
      nextResults.splice(targetIndex, 1, rewritten)
      this.setData({ results: nextResults })
    },

    onToggleFavorite(e: any) {
      const { id } = e.currentTarget.dataset
      const nextResults = this.data.results.map((item) => {
        if (item.id !== id) return item
        return { ...item, favorite: !item.favorite }
      })
      this.setData({ results: nextResults })
    },

    onUseHistory(e: any) {
      const { historyId } = e.currentTarget.dataset
      const target = this.data.history.find((item) => item.id === historyId)
      if (!target) return
      this.setData({
        formData: {
          ...this.data.formData,
          ...target.prompt,
          imageCount: 0,
        },
        platformIndex: safeIndex(this.data.platformOptions, target.prompt.platform),
        toneIndex: safeIndex(this.data.toneOptions, target.prompt.tone),
        lengthIndex: safeIndex(this.data.lengthOptions, target.prompt.length),
        resultCountIndex: safeIndex(this.data.resultCountOptions, target.prompt.resultCount),
        images: [],
        results: target.results,
        activeTab: 'results',
      })
    },

    onChangeTab(e: any) {
      const { tab } = e.currentTarget.dataset
      if (!tab) return
      this.setData({ activeTab: tab })
    },

    onClearHistory() {
      wx.showModal({
        title: '清空历史',
        content: '确认清空最近生成记录吗？',
        success: (res) => {
          if (!res.confirm) return
          this.setData({ history: [] })
          wx.removeStorageSync(STORAGE_HISTORY_KEY)
        },
      })
    },
  },
})
