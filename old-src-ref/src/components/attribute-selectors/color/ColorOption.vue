<template>
  <div
    :class="[
      'color-option',
      {
        'too-close-to-white': tooCloseToWhite,
        'basically-is-white': basicallyIsWhite,
        empty: option.color === null,
      },
    ]"
    :data-id="option.id"
    @click="openSwatchPimcoEditor"
  >
    <div
      class="swatch"
      :style="{ backgroundColor: option.color || option.swatch }"
      :title="option.nickname || option.name"
      ref="color"
    ></div>
    <div
      v-if="option.posttitle"
      class="post-title"
      v-html="posttitle(option)"
    ></div>
  </div>
</template>

<script lang="ts">
import { starters } from "@/store/initialize";
import { OptionCasing } from "@/structure";
import { ColorOption, ComplexSwatchOption } from "@/types";
import utils from "@/utils";
import { defineComponent, ref, Ref } from "vue";
import { mapGetters, mapState, mapMutations } from "vuex";
export default defineComponent({
  name: "ColorOption",
  props: {
    option: Object as () => ColorOption | ComplexSwatchOption,
    casing: Object as () => OptionCasing,
  },
  computed: {
    ...mapState(["currentProduct"]),
    ...mapGetters({ modMap: "getWoocommerceMods", basePrice: "getBasePrice" }),
  },
  methods: {
    ...mapMutations(["setEditorPimcoOption"]),
    getClosenessToWhite() {
      if (this.color) {
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
    openSwatchPimcoEditor(e?: MouseEvent) {
      if (e && e.shiftKey && starters.dev) {
        this.setEditorPimcoOption({
          option: this.option,
          onClose: () => {
            if (this.$refs.color) {
              (this.$refs.color as any).click();
            }
          },
        });
      }
    },
    pythag(nums: Array<number>): number {
      const dist = nums.reduce((total, num) => (total += num * num), 0);
      return Math.sqrt(dist);
    },
    posttitle(option: ColorOption | ComplexSwatchOption) {
      if ("posttitle" in option && option.posttitle) {
        if (option.posttitle.includes("$upcharge$") && this.casing) {
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
            return option.posttitle.replaceAll("$upcharge$", "$" + upcharge);
          }
          return option.posttitle.replaceAll("$upcharge$", "");
        }
        return option.posttitle;
      }
      return "";
    },
  },
  setup() {
    const tooCloseToWhite: Ref<boolean> = ref(false);
    const basicallyIsWhite: Ref<boolean> = ref(false);
    const color: Ref<HTMLElement | null> = ref(null);
    return { tooCloseToWhite, basicallyIsWhite, color };
  },
  mounted() {
    requestAnimationFrame(this.getClosenessToWhite);
  },
});
</script>

<style lang="scss" scoped>
.color-option {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  cursor: pointer;
  transition: background-color 0.2s ease;
  margin-right: 1px;
}
.swatch {
  width: 55px;
  height: 110px;
  position: relative;
  overflow: hidden;
  .empty > & {
    background-color: #efefef;
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
  &::after {
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
    transition: transform 0.2s cubic-bezier(0.76, 0, 0.24, 1);
    @media (min-width: $medium-width-up) {
      border-width: 0 13px 14px 13px;
    }
    .selected > & {
      transform: translateX(-50%);
    }
    .too-close-to-white > & {
      filter: drop-shadow(0px 3px 3px rgba(0, 0, 0, 0.582));
    }
  }
}
.post-title {
  font: 300 13px/123.076% $fnt-cm;
  letter-spacing: -0.025em;
  margin-top: 0.2em;
}
</style>