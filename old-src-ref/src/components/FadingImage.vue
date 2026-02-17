<template>
  <BaseImage :src="imgSrc" :data-loaded="loaded ? '' : null" />
</template>

<script lang="ts">
import { defineComponent, ref } from "vue";
export default defineComponent({
  name: "FadingImage",
  props: {
    src: String,
  },
  data() {
    return {
      image: new Image(),
      loaded: false,
      imgSrc: "",
    };
  },
  methods: {
    load() {
      this.image.onload = () => {
        this.loaded = true;
        this.imgSrc = this.src!;
      };
      this.image.src = this.src!;
    },
  },
  mounted() {
    this.load();
  },
  watch: {
    src() {
      this.loaded = false;
      this.load();
    },
  },
});
</script>

<style lang="scss" scoped>
img {
  transition: opacity 0.3s;
  opacity: 0;
  &[data-loaded] {
    opacity: 1;
  }
}
</style>
