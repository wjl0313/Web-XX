<script setup lang="ts">
import LoginLayout from '../layouts/LoginLayout.vue'
import { useCloudStore } from '../stores/cloud.store'
import { useSaveStore } from '../stores/save.store'
import { useUiStore } from '../stores/ui.store'

const saves = useSaveStore()
const cloud = useCloudStore()
const ui = useUiStore()

async function enterCloud() {
  try {
    await cloud.signIn()
    ui.showRoster()
  } catch (cause) {
    ui.toast(cause instanceof Error ? cause.message : '云道籍连接失败', 'danger')
  }
}
</script>

<template>
  <LoginLayout>
    <section class="legacy-login-card" aria-labelledby="local-entry-title">
      <h1 id="local-entry-title">凡修录</h1>
      <div class="legacy-login-benefit">
        <strong>☁ 道籍权益：</strong>
        <span>跨设备同步、公开斗法快照与三类排行榜。</span>
      </div>

      <div class="legacy-login-news" aria-label="版本说明">
        <div class="legacy-login-news__title"><strong>🗞 最新消息</strong><span>v1.6</span></div>
        <article><strong>凡修录</strong><small>本地道途 · 自动保存</small></article>
      </div>

      <form class="legacy-login-form" @submit.prevent>
        <input type="email" placeholder="正式道籍由 CloudBase 身份服务绑定" disabled />
        <input type="password" placeholder="请在身份服务完成验证" disabled />
        <div>
          <button type="button" :disabled="!cloud.available || cloud.busy" @click="enterCloud">{{ cloud.busy ? '连接中' : '匿名云道籍进入' }}</button>
          <button type="button" disabled>正式道籍绑定</button>
        </div>
      </form>

      <p v-if="!cloud.available" class="legacy-login-warning" role="status">当前构建未配置云环境，本地入口仍可正常使用。</p>

      <p v-if="saves.issues.length" class="legacy-login-warning" role="status">检测到 {{ saves.issues.length }} 项旧存档问题，异常内容已隔离，不会阻断进入。</p>
      <div class="legacy-local-entry">
        <button type="button" aria-label="进入本地修仙界" @click="ui.startLocal">本地进入（无需道籍）</button>
        <small>进度仅保存在本浏览器中。</small>
      </div>
    </section>
  </LoginLayout>
</template>
