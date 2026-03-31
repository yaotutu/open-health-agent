<script setup lang="ts">
import { ref, reactive } from 'vue'

const props = defineProps<{
  channel: any
  loading: boolean
  error: string
}>()

const emit = defineEmits<{
  submit: [credentials: Record<string, string>]
}>()

/** 表单数据，key 对应渠道字段配置中的 key */
const form = reactive<Record<string, string>>({})

/** 初始化表单字段默认值 */
const initForm = () => {
  if (props.channel.fields) {
    for (const field of props.channel.fields) {
      if (!(field.key in form)) {
        form[field.key] = ''
      }
    }
  }
}
initForm()

/**
 * 提交表单
 */
const handleSubmit = () => {
  // 收集所有字段值
  const credentials: Record<string, string> = {}
  for (const field of props.channel.fields || []) {
    const value = (form[field.key] || '').trim()
    if (!value) return // 必填校验
    credentials[field.key] = value
  }
  emit('submit', credentials)
}
</script>

<template>
  <div class="form-area">
    <!-- 帮助文档 -->
    <div v-if="channel.help" class="help-box" v-html="channel.help" />

    <!-- 表单字段 -->
    <div v-for="field in channel.fields" :key="field.key" class="field">
      <label :for="field.key">{{ field.label }}</label>
      <input
        :id="field.key"
        v-model="form[field.key]"
        :type="field.type"
        :placeholder="field.placeholder || ''"
        @keyup.enter="handleSubmit"
      />
    </div>

    <!-- 错误信息 -->
    <div v-if="error" class="error">{{ error }}</div>

    <!-- 提交按钮 -->
    <button class="submit-btn" :disabled="loading" @click="handleSubmit">
      {{ loading ? '绑定中...' : '绑定并注册' }}
    </button>
  </div>
</template>

<style scoped>
.form-area {
  background: #fff;
  border-radius: 20px;
  padding: 32px 36px;
  border: 1px solid #e8e8ed;
  text-align: left;
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
}

.help-box :deep(a) {
  color: #0071e3;
  text-decoration: none;
  font-weight: 500;
}

.help-box :deep(a:hover) {
  text-decoration: underline;
}

.help-box :deep(strong) {
  color: #1d1d1f;
  font-weight: 600;
}

.field {
  margin-bottom: 18px;
}

.field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #1d1d1f;
  margin-bottom: 8px;
}

.field input {
  width: 100%;
  padding: 13px 16px;
  border: 1.5px solid #e8e8ed;
  border-radius: 12px;
  font-size: 15px;
  outline: none;
  transition: border-color 0.25s ease;
  background: #fafafa;
  color: #1d1d1f;
  font-family: inherit;
  box-sizing: border-box;
}

.field input::placeholder {
  color: #c7c7cc;
}

.field input:focus {
  border-color: #0071e3;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.08);
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
