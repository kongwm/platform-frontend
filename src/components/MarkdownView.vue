<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { computed } from 'vue'

const props = defineProps<{ content: string }>()

// html:false + linkify —— 学习项目先不做 XSS 消毒，P4 前加 DOMPurify
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

const html = computed(() => md.render(props.content))
</script>

<template>
  <!-- 流式渲染：每次 delta 都重新 render，内容规模下性能足够 -->
  <div class="md-body assistant-bubble" v-html="html"></div>
</template>

<style scoped>
.assistant-bubble {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 14px 14px 14px 4px;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.7;
  max-width: 92%;
}
</style>
