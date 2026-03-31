<script setup lang="ts">
defineProps<{
  userId: string
}>()

const emit = defineEmits<{
  'go-back': []
}>()
</script>

<template>
  <div class="success-page">
    <div class="card">
      <div class="icon">&#10003;</div>
      <div class="title">绑定成功</div>
      <div class="desc">你的健康顾问已启动运行</div>
      <div class="user-id">
        <span class="label">用户 ID</span>
        <code>{{ userId }}</code>
      </div>
      <div class="hint">现在可以通过 {{ userId.split(':')[0] === 'qq' ? 'QQ' : '渠道' }} 与你的健康顾问对话了</div>
      <button class="back-btn" @click="emit('go-back')">返回</button>
    </div>
  </div>
</template>

<style scoped>
.success-page {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
  background: #fbfbfd;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-font-smoothing: antialiased;
}

.card {
  text-align: center;
  max-width: 400px;
  padding: 40px;
}

.icon {
  font-size: 48px;
  color: #34c759;
  margin-bottom: 16px;
}

.title {
  font-size: 20px;
  font-weight: 700;
  color: #1d1d1f;
  margin-bottom: 6px;
}

.desc {
  font-size: 14px;
  color: #86868b;
  margin-bottom: 20px;
}

.user-id {
  background: #f5f5f7;
  border-radius: 12px;
  padding: 14px 18px;
  margin-bottom: 16px;
}

.user-id .label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #86868b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.user-id code {
  font-size: 14px;
  color: #1d1d1f;
  font-family: 'SF Mono', Menlo, monospace;
}

.hint {
  font-size: 13px;
  color: #86868b;
  margin-bottom: 24px;
}

.back-btn {
  padding: 10px 28px;
  background: transparent;
  color: #0071e3;
  border: 1.5px solid #0071e3;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: #0071e3;
  color: #fff;
}
</style>
