<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  appearance?: Record<string, unknown> | null
  label?: string
}>(), {
  appearance: null,
  label: '修士形象',
})

const skin = computed(() => {
  const value = String(props.appearance?.skinTone || props.appearance?.tone || '')
  const named: Record<string, string> = { 白皙: '#efd4b0', 自然: '#d7b189', 小麦: '#c8956a', 古铜: '#9a673f' }
  return named[value] || (value.startsWith('#') ? value : '#d7b189')
})
const hair = computed(() => {
  const value = String(props.appearance?.hairColor || '')
  return value.startsWith('#') ? value : '#3a2814'
})
const robe = computed(() => {
  const value = String(props.appearance?.tunicColor || props.appearance?.robe || '')
  const named: Record<string, string> = { 青衫: '#4a5d4a', 玄袍: '#292c38', 赤衣: '#71382d', 素衣: '#aea78e' }
  return named[value] || (value.startsWith('#') ? value : '#4a5d4a')
})
const pants = computed(() => {
  const value = String(props.appearance?.pantsColor || '')
  return value.startsWith('#') ? value : '#3a2f25'
})
const hairStyle = computed(() => String(props.appearance?.hairStyle || props.appearance?.hairstyle || 'short'))
</script>

<template>
  <svg class="legacy-cultivator-avatar" viewBox="0 0 200 460" xmlns="http://www.w3.org/2000/svg" role="img" :aria-label="label" preserveAspectRatio="xMidYMax meet">
    <ellipse cx="100" cy="438" rx="42" ry="9" fill="rgba(0,0,0,.28)" />
    <path d="M76 230 62 354 82 360 91 236Z" :fill="robe" stroke="#1a1a18" stroke-width="2" />
    <path d="M124 230 138 354 118 360 109 236Z" :fill="robe" stroke="#1a1a18" stroke-width="2" />
    <ellipse cx="64" cy="357" rx="11" ry="14" :fill="skin" stroke="#3d2916" />
    <ellipse cx="136" cy="357" rx="11" ry="14" :fill="skin" stroke="#3d2916" />
    <path d="M70 224 130 224 122 356 78 356Z" :fill="robe" stroke="#1a1a18" stroke-width="2" />
    <ellipse cx="79" cy="235" rx="21" ry="14" fill="#7a5a2a" stroke="#3d2914" stroke-width="2" />
    <ellipse cx="121" cy="235" rx="21" ry="14" fill="#7a5a2a" stroke="#3d2914" stroke-width="2" />
    <rect x="78" y="346" width="44" height="17" fill="#92762b" stroke="#3a2810" stroke-width="2" />
    <circle cx="100" cy="354" r="6" fill="#e8c45a" stroke="#5a4214" />
    <path d="M79 363 98 363 94 426 76 426Z" :fill="pants" stroke="#0f0a08" stroke-width="2" />
    <path d="M102 363 121 363 124 426 106 426Z" :fill="pants" stroke="#0f0a08" stroke-width="2" />
    <path d="M76 421 94 421 94 440 69 440Z" fill="#3a2515" stroke="#0f0a08" stroke-width="2" />
    <path d="M106 421 124 421 131 440 106 440Z" fill="#3a2515" stroke="#0f0a08" stroke-width="2" />
    <rect x="92" y="190" width="16" height="30" :fill="skin" stroke="#3d2916" />
    <ellipse cx="100" cy="158" rx="28" ry="34" :fill="skin" stroke="#3d2916" stroke-width="2" />
    <path v-if="hairStyle !== 'bald' && hairStyle !== 'none'" d="M73 153Q78 116 100 118Q126 118 128 153Q115 137 100 138Q85 137 73 153Z" :fill="hair" stroke="#1a0e08" />
    <path v-if="hairStyle === 'long' || hairStyle === '披发'" d="M74 145 67 207 84 200 88 135ZM126 145 133 207 116 200 112 135Z" :fill="hair" stroke="#1a0e08" />
    <path v-else-if="hairStyle === '高髻'" d="M87 126Q100 97 113 126Z" :fill="hair" stroke="#1a0e08" />
    <circle cx="90" cy="158" r="2.4" fill="#2a1f12" />
    <circle cx="110" cy="158" r="2.4" fill="#2a1f12" />
    <path d="M94 175Q100 180 106 175" fill="none" stroke="#3d2916" stroke-width="1.5" />
  </svg>
</template>
