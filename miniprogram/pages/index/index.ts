import {
  buildDefaultFormData,
  CopyItem,
  FormData,
  generateCopyCandidates,
  LENGTH_OPTIONS,
  PLATFORM_OPTIONS,
  TONE_OPTIONS,
} from '../../utils/generator'

const STORAGE_HISTORY_KEY = 'copy_generator_history_v1'
const STORAGE_DRAFT_KEY = 'copy_generator_draft_v1'
const MAX_HISTORY = 20

interface HistoryItem {
  id: string
  createdAt: number
  prompt: Pick<FormData, 'topic' | 'scene' | 'audience' | 'platform' | 'tone' | 'length'>
  results: CopyItem[]
}

function safeIndex<T extends string>(options: readonly T[], value: T): number {
  const index = options.findIndex((item) => item === value)
  return index >= 0 ? index : 0
}

Component({
  data: {
    platformOptions: PLATFORM_OPTIONS,
    toneOptions: TONE_OPTIONS,
    lengthOptions: LENGTH_OPTIONS,
    platformIndex: 0,
    toneIndex: 0,
    lengthIndex: 1,
    formData: buildDefaultFormData() as FormData,
    loading: false,
    results: [] as CopyItem[],
    history: [] as HistoryItem[],
    activeTab: 'results',
    showSourceTag: true,
    lastGenerateSource: 'none',
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
      const value = (e.detail.value || '').trimStart()
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

    onSwitchChange(e: any) {
      const { field } = e.currentTarget.dataset
      const value = !!e.detail.value
      if (!field) return
      this.setData({
        [`formData.${field}`]: value,
      })
    },

    async onGenerate() {
      const { formData, history } = this.data
      if (!formData.topic.trim()) {
        wx.showToast({ title: '先输入主题', icon: 'none' })
        return
      }

      this.setData({ loading: true })
      try {
        const generated = await generateCopyCandidates(formData)
        const results = generated.items

        const historyItem: HistoryItem = {
          id: `his_${Date.now()}`,
          createdAt: Date.now(),
          prompt: {
            topic: formData.topic,
            scene: formData.scene,
            audience: formData.audience,
            platform: formData.platform,
            tone: formData.tone,
            length: formData.length,
          },
          results,
        }

        const nextHistory = [historyItem, ...history].slice(0, MAX_HISTORY)

        this.setData({
          results,
          history: nextHistory,
          activeTab: 'results',
          lastGenerateSource: generated.source,
        })

        try {
          wx.setStorageSync(STORAGE_HISTORY_KEY, nextHistory)
          wx.setStorageSync(STORAGE_DRAFT_KEY, formData)
        } catch (error) {
          console.warn('save history failed', error)
        }

        if (generated.source === 'mock') {
          wx.showToast({ title: '当前为Mock数据', icon: 'none' })
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

    onRewrite(e: any) {
      const { id } = e.currentTarget.dataset
      const { results } = this.data
      const targetIndex = results.findIndex((item) => item.id === id)
      if (targetIndex < 0) return

      const target = results[targetIndex]
      const rewriteTips = [
        '补一句当下感受，让文案更有画面感。',
        '把语序再口语一点，像在和朋友聊天。',
        '收尾加一个开放问题，提高互动率。',
      ]
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
        },
        platformIndex: safeIndex(this.data.platformOptions, target.prompt.platform),
        toneIndex: safeIndex(this.data.toneOptions, target.prompt.tone),
        lengthIndex: safeIndex(this.data.lengthOptions, target.prompt.length),
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
