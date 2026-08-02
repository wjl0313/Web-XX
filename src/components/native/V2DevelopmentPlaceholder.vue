<script setup lang="ts">
import { ArrowLeft, Construction, FlaskConical } from 'lucide-vue-next'
</script>

<template>
  <main id="native-main" class="native-state native-state--v2">
    <div class="native-state__mark" aria-hidden="true">
      <Construction :size="30" />
    </div>
    <p class="eyebrow">修行体系</p>
    <h1>新玩法尚未开放</h1>
    <p>回合制斗法、五行与灵根成长功能正在准备中。</p>
    <div class="native-state__actions">
      <a class="button button--primary" href="?mode=equivalent">
        <FlaskConical :size="17" />
        查看原生等价壳
      </a>
      <a class="button button--quiet" href="?mode=legacy">
        <ArrowLeft :size="17" />
        返回冻结旧版
      </a>
    </div>
  </main>
</template>
