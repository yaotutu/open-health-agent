<script setup lang="ts">
import { ref } from 'vue'
import QrcodeVue from 'qrcode.vue'

const props = defineProps<{
  loading: boolean
  error: string
}>()

const emit = defineEmits<{
  'bind-success': [userId: string]
}>()

/** QR 码文本内容（由后端返回，需要渲染成 QR 图片） */
const qrCodeText = ref('')
/** 当前登录状态 */
const loginStatus = ref<'idle' | 'loading' | 'waiting' | 'scanned' | 'needs_rebind' | 'confirmed' | 'error'>('idle')
/** 登录会话 ID */
let loginId = ''
/** 轮询定时器 */
let pollTimer: ReturnType<typeof setInterval> | null = null
/** 重新绑定确认中 */
const rebindConfirming = ref(false)

/**
 * 生成 QR 码
 * 调用后端接口启动 QR 登录流程
 */
const generateQRCode = async () => {
  loginStatus.value = 'loading'

  try {
    const res = await fetch('/api/wechat/qrcode', { method: 'POST' })
    const data = await res.json()

    if (!res.ok) {
      loginStatus.value = 'error'
      return
    }

    // 后端返回的是 QR 文本内容，需要用 qrcode.vue 渲染成图片
    qrCodeText.value = data.qrCodeUrl
    loginId = data.loginId
    loginStatus.value = 'waiting'

    // 开始轮询登录状态
    startPolling()
  } catch {
    loginStatus.value = 'error'
  }
}

/**
 * 轮询登录状态
 * 每 2 秒检查一次，直到确认或出错
 */
const startPolling = () => {
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/wechat/login-status/${loginId}`)
      const data = await res.json()

      if (data.status === 'confirmed') {
        loginStatus.value = 'confirmed'
        stopPolling()
        emit('bind-success', data.userId)
      } else if (data.status === 'needs_rebind') {
        // 已有绑定，需要用户二次确认
        loginStatus.value = 'needs_rebind'
        stopPolling()
      } else if (data.status === 'error') {
        loginStatus.value = 'error'
        stopPolling()
      } else if (data.status === 'scanned') {
        loginStatus.value = 'scanned'
      }
    } catch {
      // 轮询失败，继续尝试
    }
  }, 2000)
}

/**
 * 确认重新绑定
 * 用户点击确认后调用后端接口清掉旧绑定并创建新绑定
 */
const confirmRebind = async () => {
  rebindConfirming.value = true
  try {
    const res = await fetch('/api/wechat/confirm-rebind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId }),
    })
    const data = await res.json()

    if (data.success) {
      loginStatus.value = 'confirmed'
      emit('bind-success', data.userId)
    } else {
      loginStatus.value = 'error'
    }
  } catch {
    loginStatus.value = 'error'
  } finally {
    rebindConfirming.value = false
  }
}

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/** 状态文案 */
const statusText: Record<string, string> = {
  idle: '',
  loading: '正在生成二维码...',
  waiting: '请使用微信扫描二维码',
  scanned: '已扫描，请在微信中确认',
  needs_rebind: '检测到已有微信绑定',
  confirmed: '绑定成功！',
  error: '登录失败，请重试',
}
</script>

<template>
  <div class="qr-area">
    <!-- 帮助文档 -->
    <div class="help-box">
      <strong>扫码绑定</strong> — 点击下方按钮生成二维码，使用微信扫描即可完成绑定。
      <br/>
      需要微信已开启 <strong>ClawBot 插件</strong>（微信 &gt; 我 &gt; 设置 &gt; 插件）。
    </div>

    <!-- QR 码区域：用 qrcode.vue 从文本内容渲染 -->
    <div v-if="qrCodeText && loginStatus !== 'needs_rebind'" class="qr-container">
      <QrcodeVue :value="qrCodeText" :size="200" level="M" class="qr-image" />
      <div class="qr-status" :class="loginStatus">
        {{ statusText[loginStatus] }}
      </div>
    </div>

    <!-- 重新绑定确认框 -->
    <div v-if="loginStatus === 'needs_rebind'" class="rebind-confirm">
      <div class="rebind-warning">
        你已绑定过微信，重新绑定会<strong>清除之前的所有聊天记录和数据</strong>。
      </div>
      <div class="rebind-actions">
        <button class="confirm-btn" :disabled="rebindConfirming" @click="confirmRebind">
          {{ rebindConfirming ? '处理中...' : '确认重新绑定' }}
        </button>
        <button class="cancel-btn" @click="loginStatus = 'idle'; qrCodeText = ''">
          取消
        </button>
      </div>
    </div>

    <!-- 外部错误信息 -->
    <div v-if="error" class="error">{{ error }}</div>

    <!-- 按钮 -->
    <button
      v-if="loginStatus !== 'needs_rebind'"
      class="submit-btn"
      :disabled="loading || loginStatus === 'loading' || loginStatus === 'waiting' || loginStatus === 'scanned'"
      @click="generateQRCode"
    >
      {{
        loginStatus === 'loading' ? '生成中...' :
        loginStatus === 'waiting' ? '等待扫码...' :
        loginStatus === 'scanned' ? '等待确认...' :
        loginStatus === 'confirmed' ? '已绑定' :
        loginStatus === 'error' ? '重新生成二维码' :
        '生成二维码'
      }}
    </button>
  </div>
</template>

<style scoped>
.qr-area {
  background: #fff;
  border-radius: 20px;
  padding: 32px 36px;
  border: 1px solid #e8e8ed;
  text-align: center;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
}

.help-box {
  background: #f5f5f7;
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 28px;
  font-size: 13px;
  line-height: 1.65;
  color: #6e6e73;
  text-align: left;
}

.help-box :deep(strong) {
  color: #1d1d1f;
  font-weight: 600;
}

.qr-container {
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qr-image {
  border-radius: 12px;
  overflow: hidden;
}

.qr-status {
  margin-top: 12px;
  font-size: 14px;
  color: #86868b;
}

.qr-status.scanned {
  color: #0071e3;
}

.qr-status.confirmed {
  color: #34c759;
  font-weight: 600;
}

.qr-status.error {
  color: #cf1322;
}

.rebind-confirm {
  margin-bottom: 24px;
}

.rebind-warning {
  background: #fff8e1;
  border: 1px solid #ffe58f;
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #92400e;
  line-height: 1.6;
  text-align: left;
}

.rebind-warning :deep(strong) {
  color: #cf1322;
}

.rebind-actions {
  display: flex;
  gap: 12px;
}

.confirm-btn {
  flex: 1;
  padding: 12px;
  background: #ff3b30;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.confirm-btn:hover:not(:disabled) {
  background: #e0342b;
}

.confirm-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cancel-btn {
  flex: 1;
  padding: 12px;
  background: #f5f5f7;
  color: #6e6e73;
  border: 1px solid #e8e8ed;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}

.cancel-btn:hover {
  background: #ebedf0;
}

.error {
  background: #fff2f0;
  border: 1px solid #ffccc7;
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 14px;
  font-size: 13px;
  color: #cf1322;
}

.submit-btn {
  width: 100%;
  padding: 14px;
  background: #0071e3;
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 8px;
  transition: background 0.2s ease;
  font-family: inherit;
}

.submit-btn:hover:not(:disabled) {
  background: #0077ed;
}

.submit-btn:active:not(:disabled) {
  background: #006edb;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
