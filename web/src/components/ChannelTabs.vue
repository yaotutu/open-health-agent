<script setup lang="ts">
defineProps<{
  channels: any[]
  selected?: string
}>()

const emit = defineEmits<{
  select: [channel: any]
}>()
</script>

<template>
  <div class="tabs">
    <div
      v-for="channel in channels"
      :key="channel.type"
      :class="['tab', { active: selected === channel.type, disabled: !channel.enabled }]"
      @click="channel.enabled && emit('select', channel)"
    >
      <span class="tab-icon">{{ channel.icon }}</span>
      <span class="tab-label">{{ channel.name }}</span>
      <span v-if="!channel.enabled" class="tab-badge">暂未开放</span>
    </div>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-bottom: 32px;
}

.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 28px;
  border-radius: 16px;
  background: #fff;
  border: 1.5px solid #e8e8ed;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 100px;
}

.tab:hover:not(.disabled) {
  border-color: #d1d1d6;
  transform: translateY(-1px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

.tab.active {
  border-color: #0071e3;
  box-shadow: 0 2px 16px rgba(0, 113, 227, 0.10);
}

.tab.active .tab-label {
  color: #0071e3;
}

.tab.disabled {
  opacity: 0.35;
  cursor: default;
  pointer-events: none;
}

.tab-icon {
  font-size: 26px;
  line-height: 1;
}

.tab-label {
  font-size: 12px;
  font-weight: 600;
  color: #1d1d1f;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
}

.tab-badge {
  font-size: 9px;
  color: #aaa;
  font-weight: 400;
}
</style>
