<template>
  <div v-if="page" class="option-gallery">
    <div class="header">
      <div class="name">{{ page.name }}</div>
    </div>
    <div class="description" v-html="page.description"></div>
    <div
      v-if="page.images && page.images.length"
      :class="['gallery', { 'pair-up': false }]"
    >
      <div class="gallery-head">
        <div class="title">Gallery</div>
      </div>
      <div class="images">
        <div
          v-for="img in page.images"
          :key="imgURL(img)"
          class="image"
          @click="setPreviewImage(img)"
        >
          <BaseImage :data="img.thumbnail || img.full || img" />
          <div class="sizer"></div>
        </div>
        <div class="image dummy"></div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import type { OptionGalleryPageTemplate } from "@/types";
export default defineComponent({
  name: "OptionGalleryPage",
  props: {
    page: Object as () => OptionGalleryPageTemplate,
    setImage: Function,
  },
  methods: {
    setPreviewImage(image: any) {
      if (this.setImage) {
        this.setImage(image.full || image.thumbnail || image);
      }
    },
    imgURL(img: any, thumbnail: boolean = false) {
      let url = img;
      if (typeof img == "object") {
        url = thumbnail ? img.thumbnail : img.full;
      }
      if (typeof url == "object") {
        url = url.src;
      }
      return url.toString();
    },
  },
});
</script>

<style lang="scss" scoped>
.option-gallery {
  padding: 28px 18px 36px;
}
.header {
  padding: 0 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  .name {
    font: 700 21px/105.882% $fnt-cm;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
}
.description {
  padding: 2px 18px 36px;
  text-align: left;
  font: 300 14px/138.46153% $fnt-cm;
  border-bottom: 1px solid #d8d6d2;
}
.specs {
  border-bottom: 1px solid #d8d6d2;
}
.gallery {
  .gallery-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 28px 18px 18px;
    text-transform: uppercase;
    text-align: left;
    .title {
      font: 700 20px/100% $fnt-cm;
    }
    .name {
      font: 700 10px/300% $fnt-cm;
    }
  }
  .images {
    display: flex;
    flex-direction: column;
    gap: 8px;
    .image {
      width: 100%;
      max-width: 750px;
      position: relative;
      cursor: pointer;
      img {
       width: 100%;
       height: auto;
       display: block;
      }
    }
  }
}
</style>
