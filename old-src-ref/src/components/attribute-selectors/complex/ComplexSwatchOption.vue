<template>
  <div
    v-if="option"
    :class="[
      'complex-option',
      'complex-swatch-option',
      {
        'too-close-to-white': tooCloseToWhite,
        'basically-is-white': basicallyIsWhite,
      },
    ]"
    :title="option.name"
    @click="clickOption"
    :data-id="option.id"
    :style="'backdrop' in option && option.backdrop ? { '--blend': option.backdrop.blend } : undefined"
  >
    <BaseImage 
      v-if="'backdrop' in option && option.backdrop"
      class="backdrop"
      :data="option.backdrop!.image"
    />
    <div
      v-if="option.type == 'ComplexSwatchOption' && option.swatchtype == 'image'"
      :class="['swatch', 'swatch-image', { loaded: imgLoaded }]"
      :style="{ '--swatch': `url(${setVersionParam(option.swatch['src'] || option.swatch || '')})` }"
      ref="imgRap"
    >
      <BaseImage
        v-if="!safariStrict || imgLoaded"
        :data="option.swatch"
        :alt="option.info || null"
      />
    </div>
    <div
      v-else-if="option.type !== 'ColorOption' && option.swatchtype == 'color'"
      class="swatch swatch-color"
      :style="{ backgroundColor: option.swatch as string }"
      ref="color"
    ></div>
    <div
      v-else-if="option.type == 'ColorOption'"
      class="swatch swatch-color"
      :style="{ backgroundColor: option.color as string }"
      ref="color"
    ></div>
    <div
      v-else-if="option.swatchtype == 'empty'"
      class="swatch swatch-empty"
      ref="color"
    ></div>
    <div
      v-if="option.type == 'ComplexSwatchOption' && option.label"
      class="swatch-label"
      v-html="posttitle(option)"
    ></div>
    <div
      v-else-if="option.type == 'ColorOption' && option.posttitle"
      class="swatch-label"
      v-html="posttitle(option)"
    ></div>
  </div>
</template>

<script lang="ts">
import { starters } from "@/store/initialize";
import { OptionCasing } from "@/structure";
import { ColorOption, ComplexChromaOption, ComplexSwatchOption, ImageData, ProductImageContributer } from "@/types";
import utils from "@/utils";
import { defineComponent, ref, Ref } from "vue";
import { mapGetters, mapState, mapMutations } from "vuex";
export default defineComponent({
  name: "ComplexSwatchOption",
  props: {
    option: Object as () => ComplexSwatchOption | ComplexChromaOption | ColorOption,
    select: Function,
    casing: Object as () => OptionCasing,
  },
  computed: {
    ...mapState(["OS", "currentProduct", "userBrowser"]),
    ...mapGetters({ modMap: "getWoocommerceMods", basePrice: "getBasePrice" }),
    safariStrict() {
      const isSafari = this.userBrowser == "Safari";
      return isSafari && this.option?.type == 'ComplexSwatchOption' && this.option.shrink === false;
    },
    colorPimco(): ProductImageContributer | null {
      if (this.option?.pimco) {
        if (this.option.pimco.USECASCADING) {
          return this.option.pimco.USECASCADING;
        }
        return Object.entries(this.option.pimco).find(([_, p]) => p.mode == "color" || p.mode == "image")?.[1] || null;
      }
      return null;
    },
  },
  methods: {
    ...mapMutations(["setEditorPimcoOption"]),
    clickOption(e?: MouseEvent) {
      if (this.select) {
        this.select(this.option);
      }
      if (e && e.shiftKey) {
        this.openSwatchPimcoEditor();
      }
    },
    getClosenessToWhite() {
      if (this.option && this.option.type != 'ColorOption' && this.option.shadow !== undefined) {
        this.tooCloseToWhite = this.option.shadow;
      } else if (this.color) {
        const style = getComputedStyle(this.color);
        const rgbArray = JSON.parse(
          "[" + style.backgroundColor.replace(/(rgba?\(|\))/g, "") + "]"
        );
        // Add weight to Red and Green components to make yellows closer to white
        delete rgbArray[2];
        const dist = this.pythag(rgbArray.map((n: number) => 255 - n));
        if (dist < 100) {
          this.tooCloseToWhite = true;
          if (dist < 18) {
            this.basicallyIsWhite = true;
          }
        }
      }
      return false;
    },
    pythag(nums: Array<number>): number {
      const dist = nums.reduce((total, num) => (total += num * num), 0);
      return Math.sqrt(dist);
    },
    openSwatchPimcoEditor() {
      if (starters.dev) {
        this.setEditorPimcoOption({
          option: this.option,
          onClose: this.clickOption,
        });
      }
    },
    toStringValue(val: any) {
      if (val instanceof Object) {
        return JSON.stringify(val);
      } else if (val != undefined) {
        return val.toString();
      }
      return val;
    },
    loadImageOnSafari() {
      if (this.option?.type == 'ComplexSwatchOption' && this.option.swatchtype == "image") {
        const img = new Image();
        img.addEventListener("load", () => {
          if (this.imgRap) {
            const style = getComputedStyle(this.imgRap);
            const height =
              this.imgRap.getBoundingClientRect().height -
              parseInt(style.paddingTop) -
              parseInt(style.paddingBottom);
            //this.imgWidth = Math.round((img.width / img.height) * height);
            //this.imgHeight = Math.round(height);
            const heightNum = Math.round(
              (img.width / img.height) * height +
                parseInt(style.paddingLeft) +
                parseInt(style.paddingRight)
            );
            if (heightNum > 0) {
              this.imgRap.style.width = heightNum + "px";
            }
            requestAnimationFrame(() => {
              this.imgLoaded = true;
            });
          }
        });
        img.src = this.source(this.option.swatch);
      }
    },
    source(data: ImageData | string): string {
      if (data instanceof Object && data.src) {
        return data.src;
      } else if (typeof data == "string") {
        return data;
      }
      return "";
    },
    posttitle(option: ComplexSwatchOption | ComplexSwatchOption | ColorOption) {
      let label = "";
      if (option.type == 'ColorOption' && option.posttitle) {
        label = option.posttitle;
      } else if (option.type == 'ComplexSwatchOption' && option.label) {
        label = option.label;
      }
      if (label) {
        if (label.includes("$upcharge$") && this.casing) {
          const upcharge = option.upcharge
            ? option.upcharge
            : utils.getOptionUpcharge(
                option,
                this.casing,
                this.currentProduct,
                this.basePrice,
                this.modMap
              );
          if (upcharge) {
            return label.replaceAll("$upcharge$", "$" + upcharge);
          }
          return label.replaceAll("$upcharge$", "");
        }
        return label;
      }
      return "";
    },
    setVersionParam(url: string) {
      return utils.setVersionParam(url);
    }
  },
  setup() {
    const tooCloseToWhite: Ref<boolean> = ref(false);
    const basicallyIsWhite: Ref<boolean> = ref(false);
    const color: Ref<HTMLElement | null> = ref(null);
    const imgRap: Ref<HTMLElement | null> = ref(null);
    const holdDown: Ref<boolean> = ref(false);
    const openEditor: Ref<boolean> = ref(false);
    const imgLoaded: Ref<boolean> = ref(false);
    const imgWidth: Ref<number> = ref(0);
    const imgHeight: Ref<number> = ref(0);
    return {
      tooCloseToWhite,
      basicallyIsWhite,
      color,
      openEditor,
      holdDown,
      imgLoaded,
      imgRap,
      imgWidth,
      imgHeight,
    };
  },
  mounted() {
    requestAnimationFrame(this.getClosenessToWhite);
    if (this.safariStrict) {
      this.loadImageOnSafari();
    }
  },
});
</script>

<style lang="scss" scoped>
.complex-swatch-option {
  height: 100%;
  position: relative;
  cursor: pointer;
  user-select: none;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  &:not(:last-child) {
    margin-right: 1px;
  }
  &.too-close-to-white .swatch::after {
    filter: drop-shadow(0 0 0 rgba(0, 0, 0, 0));
  }
  &.too-close-to-white.selected .swatch::after {
    filter: drop-shadow(0px -1px 2px rgba(0, 0, 0, 0.2));
  }
  img {
    max-height: 100%;
    height: auto;
    display: block;
  }
  .swatch {
    position: relative;
    overflow: hidden;
    mix-blend-mode: var(--blend, multiply);
  }
  .swatch-color {
    height: 100%;
    width: 55px;
    transition: background-color 0.2s linear;
  }
  & .swatch::after {
    content: "";
    position: absolute;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 0 10px 10px 10px;
    border-color: transparent transparent #fff transparent;
    bottom: 0;
    left: 50%;
    transform-origin: bottom;
    transform: translate(-50%, 100%);
    transition: transform 0.2s cubic-bezier(0.76, 0, 0.24, 1),
      filter 0.2s linear;
    @media (min-width: $medium-width-up) {
      border-width: 0 13px 14px 13px;
    }
  }
  &.selected .swatch::after {
    transform: translate(-50%, 0);
  }
  // &.basically-is-white::before {
  //   content: "";
  //   position: absolute;
  //   top: 0;
  //   bottom: 0;
  //   left: 0;
  //   right: 0;
  //   border: 2px solid #000;
  // }
}
.swatch-empty {
  background-color: #efefef;
  width: 55px;
  flex-grow: 1;
  &::before {
    content: "";
    position: absolute;
    inset: 0;
    clip-path: polygon(
      1px 0,
      0 1px,
      calc(50% - 1px) 50%,
      0 calc(100% - 1px),
      1px 100%,
      50% calc(50% + 1px),
      calc(100% - 1px) 100%,
      100% calc(100% - 1px),
      calc(50% + 1px) 50%,
      100% 1px,
      calc(100% - 1px) 0,
      50% calc(50% - 1px)
    );
    background-color: #707070;
  }
}
.swatch-label {
  font: 300 13px/123.076% $fnt-cm;
  letter-spacing: -0.025em;
  margin-top: 0.2em;
}
.options.logo_diamond .complex-leather-option .complex-swatch-option .swatch::after {
  border-bottom-color: $orange;
}
.backdrop {
  position: absolute;
  inset: 0;
  object-fit: cover;
  width: 100%;
  height: 100%;
}
</style>