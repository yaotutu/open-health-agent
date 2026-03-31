<script setup lang="ts">
import { ref } from 'vue'
import Login from './views/Login.vue'
import BindSuccess from './views/BindSuccess.vue'

/** 当前视图：登录页或绑定成功页 */
const currentView = ref<'login' | 'success'>('login')
/** 绑定成功后的用户 ID */
const boundUserId = ref('')

/**
 * 绑定成功回调
 * 切换到成功页面，显示用户 ID
 */
const onBindSuccess = (userId: string) => {
  boundUserId.value = userId
  currentView.value = 'success'
}

/**
 * 返回登录页
 */
const goBack = () => {
  currentView.value = 'login'
  boundUserId.value = ''
}
</script>

<template>
  <Login v-if="currentView === 'login'" @bind-success="onBindSuccess" />
  <BindSuccess v-else :user-id="boundUserId" @go-back="goBack" />
</template>
