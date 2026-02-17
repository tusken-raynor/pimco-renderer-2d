<template>
  <component :is="tag" ref="wrap" v-html="markup || ''"></component>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";

export default defineComponent({
  name: "MarkupWrapper",
  props: {
    tag: {
      type: String,
      default: "div",
    },
    markup: String,
    onload: Function as any as () => (wrap: HTMLElement) => void,
  },
  setup() {
    const wrap: Ref<HTMLElement | null> = ref(null);
    return {
      wrap,
    };
  },
  watch: {
    markup() {
      if (this.wrap && this.onload) {
        this.onload(this.wrap);
      }
    },
  },
  mounted() {
    if (this.wrap && this.onload) {
      this.onload(this.wrap);
    }
  },
});
</script>