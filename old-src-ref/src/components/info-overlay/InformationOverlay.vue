<template>
  <div
    id="information-overlay"
    v-show="render"
    :class="{ show }"
    @click="closeAllPages"
  >
    <div class="pages">
      <transition-group name="slide-in" appear tag="div" @click.stop>
        <div
          v-for="(page, i) in pages"
          :key="page.id || page.name"
          :class="[
            'page',
            'fix-scrollbar',
            { current: i == pages.length - 1 },
            sanitize(page.name),
            toKebob(page.component)
          ]"
          :style="i == pages.length - 1 ? { zIndex: 400 } : undefined"
        >
          <div class="page-head">
            <div v-if="currentPage" class="page-name">
              {{
                i == pages.length - 1
                  ? currentPage.title || currentPage.name
                  : ""
              }}
            </div>
            <div class="close-button" @click="closePage"></div>
          </div>
          <component
            :is="page.component"
            :page="page"
            :current="i == pages.length - 1"
            :set-image="setImage"
          />
        </div>
      </transition-group>
    </div>
    <transition name="fade" appear>
      <div v-if="image" class="image-viewer" @click.stop="closeImageViewer">
        <div class="image-viewer-modal" @click.stop>
          <BaseImage :data="image" />
          <div class="exit-btn x-pattern" @click="closeImageViewer"></div>
        </div>
      </div>
    </transition>
    <div class="reactive-style" v-html="styleString"></div>
  </div>
</template>

<script lang="ts">
import { PageTemplate } from "@/types";
import { defineComponent, ref, Ref } from "vue";
import { mapMutations, mapState } from "vuex";
import OptionsInfoPage from "./OptionsInfoPage.vue";
import LeatherGuidePage from "./LeatherGuidePage.vue";
import LeatherDetailsPage from "./LeatherDetailsPage.vue";
import LeatherComparePage from "./LeatherComparePage.vue";
import OptionGalleryPage from "./OptionGalleryPage.vue";
import utils from "@/utils";

export default defineComponent({
  name: "InformationOverlay",
  components: {
    OptionsInfoPage,
    LeatherGuidePage,
    LeatherDetailsPage,
    LeatherComparePage,
    OptionGalleryPage
  },
  computed: {
    ...mapState(["informationOverlayPages", "windowHeight"]),
    pages(): Array<PageTemplate> {
      if (this.informationOverlayPages) {
        return this.informationOverlayPages;
      }
      return [];
    },
    currentPage(): PageTemplate | null {
      if (this.pages.length) {
        return this.pages[this.pages.length - 1];
      }
      return null;
    },
    open(): boolean {
      if (this.informationOverlayPages) {
        return Boolean(this.informationOverlayPages.length);
      }
      return false;
    },
    styleString(): string {
      return `<style>
              #information-overlay {
                height: ${this.windowHeight}px;
              }
              #information-overlay .page {
                min-height: ${this.windowHeight}px;
              }
              #information-overlay .page:not(.current) {
                max-height: ${this.windowHeight}px;
              }
              </style>`;
    },
  },
  methods: {
    ...mapMutations(["removeInformationPage"]),
    closePage() {
      this.removeInformationPage();
    },
    closeAllPages() {
      this.removeInformationPage("all");
    },
    closeImageViewer() {
      this.image = "";
    },
    setImage(image: ImageData | string) {
      this.image = image;
    },
    sanitize(string: string) {
      return utils.sanitize(string);
    },
    toKebob(string: string) {
      return utils.toKebobCase(string);
    },
  },
  setup() {
    const show: Ref<boolean> = ref(false);
    const render: Ref<boolean> = ref(false);
    const image: Ref<string | ImageData> = ref("");
    return { show, render, image };
  },
  watch: {
    open(value) {
      if (value) {
        this.render = true;
        requestAnimationFrame(() => {
          // Some browsers need an extra frame
          requestAnimationFrame(() => {
            this.show = true;
          });
        });
      } else {
        this.show = false;
        setTimeout(() => {
          this.render = false;
        }, 500);
      }
    },
  },
});
</script>

<style lang="scss" scoped>
#information-overlay {
  position: fixed;
  top: 0;
  right: 0;
  // height: 100vh;
  width: 100vw;
  overflow: hidden;
  z-index: $info-overlay-z;
  transition: opacity 0.2s ease 0.3s, height 0.2s ease;
  opacity: 0;
  background-color: rgba(0, 0, 0, 0.63);
  &.show {
    opacity: 1;
    transition: opacity 0.2s ease, height 0.2s ease;
  }
  .pages {
    top: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    position: absolute;
    overflow: hidden;
  }
  .page {
    background-color: #fff;
    position: absolute;
    padding-top: 53px;
    top: 0;
    right: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    transition: max-height 0.2s ease, min-height 0.2s ease;
    -webkit-overflow-scrolling: touch;
    overflow: auto;
    max-width: 630px;
    &:not(.current) {
      overflow: hidden;
      z-index: $info-overlay-z;
    }
    &.current {
      z-index: 400;
      .page-head {
        z-index: 2;
      }
    }
    &.leather_comparison {
      max-width: 100%;
      @media (min-width: 631px) {
        min-width: 630px;
        width: fit-content;
      }
      .page-head {
        position: absolute;
        max-width: initial;
      }
    }
    &.option-gallery-page {
      max-width: 100%;
      @media (min-width: 801px) {
        max-width: 800px;
        width: fit-content;
      }
      .page-head {
        position: absolute;
        max-width: initial;
      }
    }
  }
  .page-head {
    height: 53px;
    background-color: $orange;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 18px;
    z-index: 1;
    box-sizing: border-box;
    width: 100%;
    position: fixed;
    top: 0;
    right: 0;
    max-width: 630px;

    .page-name {
      font-size: 21px;
      line-height: 120%;
      letter-spacing: -0.025em;
      color: #fff;
      font-weight: 700;
      transition: opacity 0.2s linear;
    }
    .close-button {
      height: 20px;
      width: 20px;
      position: relative;
      cursor: pointer;
      transition: opacity 0.2s linear;
    }
    .close-button::before,
    .close-button::after {
      content: "";
      background-color: #fff;
      position: absolute;
      height: 141%;
      width: 2px;
      top: 50%;
      left: 50%;
      border-radius: 1px;
    }
    .close-button::before {
      transform: translate(-50%, -50%) rotate(45deg);
    }
    .close-button::after {
      transform: translate(-50%, -50%) rotate(-45deg);
    }
  }
  .attribute-info {
    padding: 25px 36px 26px;
    font-size: 13px;
    font-weight: 300;
    line-height: 138.461%;
    .title {
      font-weight: 700;
    }
  }
  .attribute-info {
    opacity: 0;
    transition: opacity 0.2s linear;
  }
  &.show .attribute-info {
    opacity: 1;
    transition: opacity 0.2s linear 0.5s;
  }
  .image-viewer {
    z-index: 400;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    .image-viewer-modal {
      flex-shrink: 0;
      background-color: #fff;
      padding: 19px 19px 14px;
      position: relative;
      box-shadow: 2px 2px 7px 1px rgba(0, 0, 0, 0.603);
      .imaujee {
        max-width: calc(100vw - 48px);
        max-height: calc(100vh - 48px);
      }
      .exit-btn {
        width: 20px;
        height: 20px;
        position: absolute;
        top: 28px;
        right: 28px;
        cursor: pointer;
        filter: drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.31));
        &::before,
        &::after {
          transition: background-color 0.2s linear;
          background-color: #fff;
        }
        @media (min-width: $small-width-up) {
          &:hover::before,
          &:hover::after {
            background-color: $orange;
          }
        }
      }
    }
  }
}
.slide-in-enter-from.current {
  opacity: 0;
  transform: translateX(60px);
}
.slide-in-enter-to.current {
  transition: transform 0.2s cubic-bezier(0.165, 0.84, 0.44, 1) 0.2s,
    opacity 0.12s linear 0.2s !important;
}
.slide-in-leave-active.current {
  transition: transform 0.2s cubic-bezier(0.895, 0.03, 0.685, 0.22),
    opacity 0.2s linear !important;
}
.slide-in-leave-to.current {
  transform: translateX(60px);
  opacity: 0;
}
</style>