<template>
  <ResizeAware
    :class="['product-stage', { expanded: expandProductStage }]"
    :style="{ background: stageBackground, '--stage-height': stageHeight + 'px' }"
    @resize="
      (e) => {
        stageHeight = e.contentRect.height;
      }
    "
    data-component
  >
    <div id="nav-outer-alt" class="nav-outer-alt" ref="navOuterAlt"></div>
    <div class="visual-interface-wrapper">
      <transition name="fade">
        <product-images
          v-if="toggleRender && product && (!hijack || disableHijacking) && (wasmLoaded || wasmUnavailable)"
        />
        <div v-else-if="toggleRender && hijackImage" class="stage-hijack">
          <div
            v-if="hijackText && hijackText.position == 'above'"
            class="hijack-tex"
            v-html="hijackText.content"
            :data-cheese="JSON.stringify(hijack)"
          ></div>
          <svg
            class="hijack-image"
            :width="hijackImage.width"
            :height="hijackImage.height"
            :viewBox="`0 0 ${hijackImage.width} ${hijackImage.height}`"
            xmlns="http://www.w3.org/2000/svg"
          >
            <image :href="hijackImage.src" :width="hijackImage.width" :height="hijackImage.height" />
            <text
              v-if="hijackImage.overtext"
              x="0"
              y="0"
              :data-width="overTextWidth"
              :data-max="hijackImage.overtext.max ? (hijackImage.overtext.max * hijackImage.width) / 100 : 'N/A'"
              text-anchor="middle"
              alignment-baseline="middle"
              :style="`transform: translate(${(hijackImage.overtext.x * hijackImage.width) / 100}px, ${
                (hijackImage.overtext.y * hijackImage.height) / 100
              }px) translate(50%, 50%) rotate(${overTextAngle}deg);
              font-size:${overTextSize}px`"
              ref="overTextEl"
            >
              {{ overTextValue }}
            </text>
          </svg>
          <div v-if="hijackText && hijackText.position == 'below'" class="hijack-tex" v-html="hijackText.content"></div>
        </div>
      </transition>
      <ViewInterface v-if="!hijack && navOuterAlt" :type="interfaceType" />

      <BaseImage class="made-n-america" v-if="isMadeNAmerica" :data="tFlag" @click="openFlagStampPopup" />
    </div>
  </ResizeAware>
</template>

<script lang="ts">
import ProductImages from "./ProductImages.vue";
import { defineComponent, ref, Ref } from "vue";
import { mapGetters, mapMutations, mapState } from "vuex";
import { Model } from "@/types";
import tFlag from "../assets/t-flag.svg";
import structure, { OptionCasing } from "../structure";
import utils from "@/utils";
import ViewInterface from "./ViewInterface.vue";
import ResizeAware from "./ResizeAware.vue";

export default defineComponent({
  name: "ProductStage",
  props: {
    interfaceType: {
      type: String,
      default: "arrows",
      options: ["arrows", "front-back", "none"],
    },
  },
  components: {
    ProductImages,
    ViewInterface,
    ResizeAware,
  },
  computed: {
    ...mapState([
      "expandProductStage",
      "windowWidth",
      "models",
      "selectedOptions",
      "productView",
      "wasmLoaded",
      "wasmUnavailable",
      "toggleRender",
    ]),
    ...mapState({
      hijack: "stageHijacker",
      productID: "currentProduct",
    }),
    ...mapGetters({
      model: "getModel",
      disableHijacking: "getDisableHijacking",
      view: "getProductView",
      product: "getProduct",
    }),
    hijackImage(): {
      src: string;
      width: number;
      height: number;
      overtext?: {
        x: number;
        y: number;
        angle?: number;
        max?: number;
        fontsize?: number;
        value: string[];
      };
    } | null {
      if (this.hijack?.images) {
        const key = Object.keys(this.hijack.images)
          .filter((n) => !isNaN(n as any))
          .map((n) => parseInt(n))
          .find((n) => this.windowWidth <= n);
        if (key !== undefined) {
          return this.hijack.images[key];
        } else if ("default" in this.hijack.images) {
          return this.hijack.images.default;
        }
      }
      return null;
    },
    hijackText(): { content: string; position: "below" | "above" } | null {
      if (this.hijack?.text) {
        if (typeof this.hijack.text == "string") {
          return {
            content: this.hijack.text,
            position: "below",
          };
        } else {
          return this.hijack.text;
        }
      }
      return null;
    },
    isMadeNAmerica(): boolean {
      if (this.productID == "gloves" && this.model && this.models) {
        const id: string = this.model.id;
        for (let i = 0; i < this.models.length; i++) {
          const model: Model = this.models[i];
          if (model.pair?.origin === id) {
            return false;
          }
        }
        return true;
      }
      return false;
    },
    isEdgeX(): boolean {
      // This is an edgex construction
      for (let i = 0; i < this.models.length; i++) {
        const model = this.models[i];
        if (
          model.pair?.construction == this.selectedOptions[this.productID]?.model ||
          (model.pair as any)?.edgex == this.selectedOptions[this.productID]?.model
        ) {
          return true;
        }
      }
      return false;
    },
    overTextSize(): number {
      const fontSize = this.hijackImage?.overtext?.fontsize || 50;
      if (!this.useDfltTextSize && this.hijackImage?.overtext?.max) {
        if (this.overTextWidth > this.hijackImage.overtext.max) {
          return (fontSize * this.hijackImage.overtext.max) / this.overTextWidth;
        }
      }
      return fontSize;
    },
    stageBackground(): string | undefined {
      if (this.model?.background) {
        const background: NonNullable<Model["background"]> = this.model.background;
        if (typeof background == "string") {
          return background;
        } else {
          return [
            background.color,
            background.image,
            background.repeat,
            (background.position || "center") + "/" + (background.size || "cover"),
          ]
            .filter(Boolean)
            .join(" ");
        }
      }
      return undefined;
    },
  },
  data() {
    return {
      tFlag,
      overTextValue: "",
      overTextAngle: 0,
      overTextWidth: 0,
      overTextBranch: null as OptionCasing | null,
      useDfltTextSize: false,
      stageHeight: 0,
    };
  },
  methods: {
    ...mapMutations(["setProductView", "setStandardPopup"]),
    openFlagStampPopup() {
      this.setStandardPopup({
        title: "Made-In-America Label",
        content: this.isEdgeX
          ? "The American flag is stitched with pride on the back of every EdgeX glove."
          : "The American flag is stitched with pride on the back of every custom Nokona.",
        image: {
          src: `/show-imgs/am-flag${this.isEdgeX ? "-edgex" : ""}-example.jpg`,
          srcset: `/show-imgs/am-flag${this.isEdgeX ? "-edgex" : ""}-example.jpg 1x, /show-imgs/am-flag${
            this.isEdgeX ? "-edgex" : ""
          }-example@2x.jpg 1.5x`,
          width: 750,
          height: this.isEdgeX ? 450 : 470,
        },
      });
    },
    loopCheckBranchValue() {
      if (this.overTextBranch) {
        const value = utils.getNested(this.overTextBranch, this.hijackImage!.overtext!.value.slice(1));
        if (value !== this.overTextValue) {
          this.overTextValue = value;
        }
        setTimeout(this.loopCheckBranchValue, 500);
      }
    },
    sizeOverText() {
      const el = this.overTextEl;
      if (el) {
        this.useDfltTextSize = true;
        if (this.overTextAngle != 0) {
          this.overTextAngle = 0;
        }
        requestAnimationFrame(() => {
          this.overTextWidth =
            (el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width) * 100;
          this.useDfltTextSize = false;
          if (this.hijackImage?.overtext?.angle) {
            this.overTextAngle = this.hijackImage.overtext.angle;
          }
        });
      }
    },
    forceProductRerender() {
      const view = this.productView;
      this.setProductView(view + 1);
      requestAnimationFrame(() => {
        this.setProductView(view);
      });
    },
  },
  setup() {
    const overTextEl: Ref<Element | null> = ref(null);
    const navOuterAlt: Ref<HTMLDivElement | null> = ref(null);
    return { overTextEl, navOuterAlt };
  },
  watch: {
    hijack(val) {
      if (!val) {
        // If we leave the hijack mode, cycle the frames to force a re-render of the product images
        this.forceProductRerender();
      }
    },
    hijackImage(val) {
      if (val?.overtext?.value[0]?.startsWith("brc")) {
        this.overTextBranch = structure.branch(val.overtext.value[0]) || null;
        this.overTextAngle = val.overtext.angle || 0;
        this.loopCheckBranchValue();
      } else {
        this.overTextBranch = null;
        this.overTextAngle = 0;
      }
    },
    overTextValue() {
      this.sizeOverText();
    },
    overTextEl() {
      this.sizeOverText();
    },
    disableHijacking(val) {
      if (val) {
        // If we leave the hijack mode, cycle the frames to force a re-render of the product images
        this.forceProductRerender();
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.product-stage {
  display: flex;
  flex-direction: column-reverse;
  position: relative;
  background: url(../assets/showcase-bg.png) no-repeat center/cover;
  flex-grow: 1;
  flex-shrink: 1;
  overflow: hidden;
  @media (min-width: $large-width-up) {
    background-image: url(../assets/showcase-bg-desktop.svg);
  }
  &.expanded {
    // This is only when the product image needs to rendered to a headless service
    background: #fff !important;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10000;
    ::v-deep {
      .img-arrow,
      .next-button,
      .prev-button,
      .front-back {
        display: none !important;
      }
    }
  }
}

.visual-interface-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  flex-grow: 1;
}

.stage-hijack {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hijack-image {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  text {
    font-size: 50px;
    font-weight: 700;
    // transform-origin: center;
    font-family: "AlternateGothicPro-No1", sans-serif;
    fill: rgba(0, 0, 0, 0.6);
    letter-spacing: 0;
  }
}

.made-n-america {
  cursor: pointer;
  width: 122px;
  height: auto;
  position: absolute;
  bottom: 8px;
  left: 0px;
  @media (max-width: 600px) {
    width: 20.333vw;
  }
}

.nav-outer-alt:empty {
  display: none;
}
</style>
