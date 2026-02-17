<template>
  <div class="leather-details">
    <div class="header">
      <div class="name">{{ page.name }}</div>
      <div class="icon">
        <BaseImage :data="page.icon" />
      </div>
    </div>
    <div class="description" v-html="page.description"></div>
    <leather-specs
      :breakin="page.breakin"
      :weight="page.weight"
    ></leather-specs>
    <div
      v-if="page.images && page.images.length"
      :class="['gallery', { 'pair-up': false }]"
    >
      <div class="gallery-head">
        <div class="title">
          <div class="name">{{ page.name }} glove</div>
          gallery
        </div>
        <BaseImage
          v-if="leatherGuideLeathers.length > 1"
          src="/show-imgs/leatherguide-black.svg"
          alt="Leather Guide"
          class="leatherguide"
          @click="toLeatherGuide"
        />
      </div>
      <div class="images">
        <div
          v-for="img in page.images"
          :key="(img.thumbnail || img.full).src || img.thumbnail || img.full"
          class="image"
          @click="setPreviewImage(img)"
        >
          <BaseImage :data="img.thumbnail || img.full" />
          <div class="sizer"></div>
        </div>
        <div class="image dummy"></div>
      </div>
    </div>
    <div
      v-else-if="leatherGuideLeathers.length > 1"
      class="just-the-leatherguide"
      @click="toLeatherGuide"
    >
      <BaseImage
        src="/show-imgs/leatherguide-black.svg"
        alt="Leather Guide"
        class="leatherguide"
      />
      <div class="message">Return to Leather Guide</div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapMutations, mapState } from "vuex";
import LeatherSpecs from "@/components/LeatherSpecs.vue";
export default defineComponent({
  name: "LeatherDetailsPage",
  props: {
    page: Object,
    setImage: Function,
  },
  components: {
    LeatherSpecs,
  },
  computed: {
    ...mapState(["leatherGuideLeathers"]),
  },
  methods: {
    ...mapMutations(["addLeatherGuidePage"]),
    toLeatherGuide() {
      this.addLeatherGuidePage();
    },
    setPreviewImage(image: any) {
      if (this.setImage) {
        this.setImage(image.full || image.thumbnail);
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.leather-details {
  padding: 28px 18px 36px;
  .header {
    padding: 0 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    .icon {
      max-width: 62px;
      img {
        max-width: 100%;
      }
    }
    .name {
      font: 700 17px/105.882% $fnt-cm;
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
      align-items: flex-start;
      flex-wrap: wrap;
      justify-content: space-between;
      .image {
        width: 33.3333%;
        position: relative;
        cursor: pointer;
        @media (min-width: $medium-width-up) {
          width: calc(33.3333% - 3px);
          margin-bottom: 5px;
        }
        @media (max-width: $xsmall-width) {
          width: 50%;
        }
        .sizer {
          padding-top: 100%;
        }
        img {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        }
      }
    }
    &.pair-up .images .image {
      width: 50%;
      @media (min-width: $medium-width-up) {
        width: calc(50% - 3px);
        margin-bottom: 6px;
      }
    }
  }
  .just-the-leatherguide {
    padding: 28px 18px 18px;
    display: flex;
    align-items: flex-start;
    user-select: none;
    cursor: pointer;
    .message {
      font: 600 17px/120% $fnt-cm;
      text-transform: uppercase;
      margin-left: 20px;
    }
  }
  .leatherguide {
    width: 29px;
    height: 31px;
    cursor: pointer;
    @media (min-width: $small-width-up) {
      transition: transform 0.3s ease;
      &:hover {
        transform: scale(1.2);
      }
    }
  }
}
</style>
