<template>
  <div
    :class="[
      'complex-option',
      'complex-colors-option',
      { selected: isSelected, 'has-icon': option.icon },
    ]"
  >
    <div
      v-if="option.icon"
      class="icon"
      @click="openOptions"
      :title="option.name"
    >
      <BaseImage :data="option.icon" />
    </div>
    <div
      v-else
      class="label"
      @click="openOptions"
      v-html="nameWithUpcharge(option)"
    ></div>
    <div v-if="sections.length > 1" class="sections" ref="secs">
      <div
        v-for="(section, i) in sections"
        :class="[
          'section',
          extraClasses[i] || null,
          { selected: section == selected, 'has-selection': selectedColors[i] },
        ]"
        :key="section.id"
        :data-id="section.id"
        @click="xSelect(section)"
      >
        <div class="graze"></div>
        <complex-swatch-option
          v-if="selectedColors[i] && (section == selected ? replace : true)"
          :option="selectedColors[i]"
          :class="'color'"
        />
        <div class="number">{{ i + 1 }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import {
  ComplexColorsOption,
  ComplexSwatchOption,
  Product,
  Option,
} from "@/types";
import ComplexSwatchOptionComp from "./ComplexSwatchOption.vue";
import { mapGetters, mapState } from "vuex";
import utils from "@/utils";
import { OptionCasing } from "@/structure";

export default defineComponent({
  name: "ComplexColorsOption",
  props: {
    option: Object as () => ComplexColorsOption,
    select: Function,
    selected: Object as () => Option | null,
    subAttribute: String,
    casing: Object as () => OptionCasing,
  },
  components: {
    "complex-swatch-option": ComplexSwatchOptionComp,
  },
  computed: {
    ...mapState([
      "objectIDMap",
      "currentProduct",
      "currentAttribute",
      "selectedOptions",
    ]),
    ...mapGetters({
      attribute: "getAttribute",
      restrictions: "getRestrictions",
      enablers: "getIndexedEnablers",
      modMap: "getWoocommerceMods",
      basePrice: "getBasePrice",
    }),
    sections(): Array<ComplexColorsOption> {
      if (this.option) {
        return this.getSections(this.option as ComplexColorsOption);
      }
      return [];
    },
    isSelected(): boolean {
      if (this.selected) {
        return this.sections.includes(this.selected as ComplexColorsOption);
      }
      return false;
    },
    selectedColors(): Array<ComplexSwatchOption> {
      if (this.selectedOptions && this.subAttribute) {
        this.replace = false;
        requestAnimationFrame(this.renderTriggers);
        const datas = utils.getNested(this.selectedOptions, [
          this.currentProduct,
          "selections",
          this.attribute.name,
          this.subAttribute,
        ]);
        return this.sections.map((sec) => datas[sec.suboptions.key].value);
      }
      return [];
    },
    colorsKeys(): Array<string> {
      return this.sections.slice(1).map((o) => o.suboptions.key);
    },
    extraClasses() {
      if (this.switcher !== undefined && this.secs) {
        const arr: string[] = [];
        const colors = this.secs.querySelectorAll(".section");
        for (let i = 0; i < colors.length; i++) {
          const el = colors[i].querySelector(".swatch-color");
          let string = "";
          if (el) {
            const style = getComputedStyle(el);
            const color = JSON.parse(
              "[" + style.backgroundColor.replace(/(rgba?\(|\))/g, "") + "]"
            );
            // Add weight to Red and Green components to make yellows closer to white
            delete color[2];
            const dist = this.pythag(color.map((n: number) => 255 - n));
            if (dist < 100) {
              string = "too-close-to-white";
            }
          }
          arr.push(string);
        }
        return arr;
      }
      return [];
    },
  },
  data() {
    return {
      replace: true,
      switcher: false,
    };
  },
  methods: {
    openOptions() {
      if (!this.sections.includes(this.selected as ComplexColorsOption)) {
        if (this.selected) {
          const oldSections = this.getSections(
            this.selected as ComplexColorsOption
          );
          requestAnimationFrame(() => {
            this.clearExtraColors(this.sections, oldSections);
          });
        }
        if (this.select) {
          this.select(this.option);
          this.renderTriggers();
        }
      }
    },
    getSections(option: ComplexColorsOption): Array<ComplexColorsOption> {
      if ("source" in option && option.source) {
        option = this.objectIDMap[option.source] || option;
      }
      const arr: Array<ComplexColorsOption> = [option];
      if ("comrades" in option && option.comrades) {
        const comrades: Array<ComplexColorsOption> = option.comrades
          .map((id: string) => this.objectIDMap[id])
          .filter((o: any) => {
            return utils.standardOptionFilter(
              o,
              [
                this.currentProduct,
                "selections",
                /// Just have this scoped for the whole product for now
              ],
              this.restrictions,
              this.enablers
            );
          });
        arr.push(...comrades);
      }
      return arr;
    },
    xSelect(section: ComplexColorsOption) {
      if (this.select) {
        this.select(section);
      }
    },
    pythag(nums: Array<number>): number {
      const dist = nums.reduce((total, num) => (total += num * num), 0);
      return Math.sqrt(dist);
    },
    renderTriggers() {
      this.replace = true;
      setTimeout(() => {
        this.switcher = !this.switcher;
      }, 35);
    },
    clearExtraColors(
      newSections: Array<ComplexColorsOption>,
      oldSections: Array<ComplexColorsOption>
    ) {
      const oldKeys = oldSections.map((s) => s.suboptions.key);
      const newKeys = newSections.map((s) => s.suboptions.key);
      const commands = oldKeys
        .filter((s) => !newKeys.includes(s))
        .map((key) => {
          return { value: null, key };
        });
      this.$emit("subset", commands);
    },
    nameWithUpcharge(option: ComplexColorsOption) {
      const name = option.nickname || option.name;
      if (this.casing) {
        const upcharge = utils.getOptionUpcharge(
          option,
          this.casing,
          this.currentProduct,
          this.basePrice,
          this.modMap
        );
        if (upcharge) {
          return (
            name +
            `&nbsp;<span style="font-weight:400;font-size:0.8em;">(+$${upcharge})</span>`
          );
        }
      }
      return name;
    },
  },
  setup() {
    const secs: Ref<HTMLElement | null> = ref(null);
    return { secs };
  },
  watch: {
    isSelected(val) {
      if (
        !val &&
        this.selected &&
        this.selected.type !== "ComplexColorsOption"
      ) {
        this.colorsKeys.forEach((key) => {
          if (this.select) {
            this.select(null, key);
            this.renderTriggers();
          }
        });
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.complex-colors-option {
  display: flex;
  align-items: center;
  user-select: none;
  position: relative;
  height: 100%;
  &.has-icon {
    padding-left: 18px;
    padding-right: 7px;
  }
  .icon {
    cursor: pointer;
    height: 100%;
    display: flex;
    align-items: center;
    position: relative;
    flex-shrink: 0;
    .imaujee {
      display: block;
      max-height: 100%;
    }
    &::after {
      content: "";
      position: absolute;
      width: 0;
      height: 0;
      border-style: solid;
      border-width: 0 10px 10px 10px;
      border-color: transparent transparent $orange transparent;
      bottom: 0;
      left: 50%;
      transform-origin: bottom;
      transform: translateX(-50%) scaleY(0);
      transition: transform 0.2s cubic-bezier(0.76, 0, 0.24, 1);
      @media (min-width: $medium-width-up) {
        border-width: 0 13px 14px 13px;
      }
    }
  }
  &.selected .icon::after {
    transform: translateX(-50%) scaleY(1);
  }
  .label {
    color: #000;
    font: 600 16px/120% $fnt-cm;
    letter-spacing: -0.025em;
    padding: 10px 18px;
    transition: color 0.2s linear;
    cursor: pointer;
    user-select: none;
    @media (min-width: $large-width-up) {
      padding: 12px 18px 9px;
    }
  }
  &.selected .label {
    color: $orange;
  }
  @media (min-width: $small-width-up) {
    .label:hover {
      color: $orange;
    }
  }
  .sections {
    display: flex;
    height: 100%;
    margin-left: 9px;
    .section {
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      position: relative;
      width: 0;
      opacity: 0;
      transition: all 0.2s cubic-bezier(0.76, 0, 0.24, 1);
      overflow: hidden;
      &:not(:last-child) {
        margin-right: 2px;
      }
      .graze {
        position: absolute;
        top: 3px;
        left: 3px;
        bottom: 3px;
        right: 3px;
        background: url(../../../assets/graze.svg) no-repeat center/cover;
        @media (min-width: $large-width-up) {
          top: 0;
          left: 0;
          bottom: 0;
          right: 0;
        }
      }
      .color {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        &.color {
          margin-right: 0;
        }
      }
      .number {
        display: flex;
        justify-content: center;
        align-items: center;
        position: relative;
        font: 22px/120% $fnt-cm;
        height: 100%;
        width: 100%;
        box-sizing: border-box;
        user-select: none;
        padding-top: 3px;
        transition: background-color 0.2s linear, color 0.2s linear;
        @media (max-width: $large-width) {
          font-size: 39px;
          padding-top: 8px;
          color: #707070;
        }
      }
      &::after {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
        border: 3px solid $orange;
        transform: scale(1.3);
        transition: transform 0.3s ease;
      }
      &.selected::after {
        transform: scale(1);
      }
      &.has-selection {
        .number {
          color: #fff;
        }
        &.too-close-to-white {
          .number {
            color: #3a3a3a;
            @media (max-width: $large-width) {
              color: #000;
            }
          }
        }
      }
    }
  }
  &.selected .sections .section {
    transition: width 0.2s cubic-bezier(0.76, 0, 0.24, 1),
      opacity 0.2s linear 0.08s;
    width: 55px;
    opacity: 1;
  }
}
.fade-enter-to {
  transition: opacity 0.17s linear;
}
.fade-leave-to {
  transition: opacity 0.17s linear;
}
.fade-enter-from, .fade-leave-to /* .fade-leave-active below version 2.1.8 */ {
  opacity: 0;
}
</style>
