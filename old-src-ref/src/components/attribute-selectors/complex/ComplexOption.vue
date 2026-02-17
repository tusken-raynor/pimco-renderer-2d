<template>
  <complex-label-option
    v-if="
      option.type == 'ComplexLabelOption'
    "
    :option="option"
    :selected="selected || null"
    :casing="casing"
    :select="clickOption"
  />
  <!-- Complex Selector now supports rendering of basic option -->
  <div
    v-else-if="option.type == 'BasicOption'"
    :key="option.name"
    :class="[
      'complex-option',
      'basic-option',
      { selected: option == selected },
    ]"
    :data-id="option.id"
    @click="clickOption"
  >
    <div class="name" v-html="option.nickname || option.name"></div>
    <div class="graphic">
      <BaseImage :src="option.graphic" :alt="option.name" />
    </div>
  </div>
  <div
    v-else-if="option.type == 'ComplexImageOption'"
    :class="[
      'complex-option',
      'complex-image-option',
      { selected: option == selected },
    ]"
    :data-id="option.id"
    @click="clickOption"
    :title="option.name"
  >
    <BaseImage :data="option.image" :alt="option.info || null" />
  </div>
  <complex-swatch-option
    v-else-if="
      option.type == 'ComplexChromaOption' ||
      option.type == 'ComplexSwatchOption' ||
      option.type == 'ColorOption'
    "
    :class="{ selected: option == selected }"
    :option="option"
    :select="clickOption"
    :casing="casing"
  />
  <div 
    v-else-if="option.type == 'ComplexSwatchLabelOption'" 
    class="complex-option complex-swatch-label-option"
    :data-id="option.id"
  >
    <span class="label">{{ option?.nickname || option?.name }}</span>
  </div>
  <complex-leather-option
    v-else-if="option.type == 'ComplexLeatherOption'"
    :class="[{ selected: option == selected }]"
    :data-id="option.id"
    :option="option"
    :select="clickOption"
    :sub-attribute="subAttribute"
    :option-name="optionName"
    :sub-option-name="subOptionName"
    :buckets="buckets"
    :casing="casing"
    :selected="selected"
  />
  <complex-colors-option
    v-else-if="option.type == 'ComplexColorsOption'"
    :data-id="option.id"
    :option="option"
    :select="clickOption"
    :selected="selected"
    :sub-attribute="subAttribute"
    :casing="casing"
  />
  <complex-text-option
    v-else-if="option.type == 'ComplexTextOption'"
    :data-id="option.id"
    :option="option"
    :select="clickOption"
    :selected="selected"
    :sub-attribute="subAttribute"
    :option-name="optionName"
    :sub-option-name="subOptionName"
    :on-unselected="onUnselected"
  />
  <complex-initials-option
    v-else-if="option.type == 'ComplexInitialsOption'"
    :data-id="option.id"
    :option="option"
    :select="clickOption"
    :selected="selected"
    :on-unselected="onUnselected"
    :sub-attribute="subAttribute"
    :sub-option-key="subOptionKey"
  />
  <complex-type-option
    v-else-if="option.type == 'ComplexTypeOption'"
    :data-id="option.id"
    :option="option"
    :select="clickOption"
    :selected="selected"
    :on-unselected="onUnselected"
    :sub-attribute="subAttribute"
    :sub-option-key="subOptionKey"
  />
  <complex-uploader-option
    v-else-if="option.type == 'ComplexUploaderOption'"
    :data-id="option.id"
    :option="option"
    :select="clickOption"
    :selected="selected"
    :sub-attribute="subAttribute"
    :casing="casing"
    :sub-option-name="subOptionName"
    :on-unselected="onUnselected"
  />
  <complex-compound-option
    v-else-if="option.type == 'ComplexCompoundOption'"
    :data-id="option.id"
    :option="option"
    :select="clickOption"
    :selected="selected"
    :sub-attribute="subAttribute"
    :casing="casing"
    :sub-option-name="subOptionName"
    :on-unselected="onUnselected"
  />
  <complex-dropdown-option
    v-else-if="option.type == 'ComplexDropdownOption'"
    :data-id="option.id"
    :option="option"
    :select="clickOption"
    :selected="selected"
    :sub-attribute="subAttribute"
    :casing="casing"
    :sub-option-name="subOptionName"
    :on-unselected="onUnselected"
  />
  <complex-toggle-option
    v-else-if="option.type == 'ComplexToggleOption' && option.boolean === true"
    :data-id="option.id"
    :option="option"
    :select="clickOption"
    :selected="selected"
    :casing="casing"
  />
</template>

<script lang="ts">
import { defineComponent } from "vue";
import ComplexLeatherOptionComp from "./ComplexLeatherOption.vue";
import ComplexColorsOptionComp from "./ComplexColorsOption.vue";
import ComplexSwatchOptionComp from "./ComplexSwatchOption.vue";
import ComplexTextOptionComp from "./ComplexTextOption.vue";
import ComplexInitialsOptionComp from "./ComplexInitialsOption.vue";
import ComplexTypeOptionComp from "./ComplexTypeOption.vue";
import ComplexUploaderOptionComp from "./ComplexUploaderOption.vue";
import ComplexCompoundOptionComp from "./ComplexCompoundOption.vue";
import ComplexDropdownOptionComp from "./ComplexDropdownOption.vue";
import ComplexLabelOptionComp from "./ComplexLabelOption.vue";
import { ComplexOption } from "@/types";
import { OptionCasing } from "@/structure";
import ComplexToggleOptionComp from "./ComplexToggleOption.vue";

export default defineComponent({
  name: "ComplexSelectorOption",
  components: {
    "complex-leather-option": ComplexLeatherOptionComp,
    "complex-colors-option": ComplexColorsOptionComp,
    "complex-swatch-option": ComplexSwatchOptionComp,
    "complex-text-option": ComplexTextOptionComp,
    "complex-initials-option": ComplexInitialsOptionComp,
    "complex-type-option": ComplexTypeOptionComp,
    "complex-uploader-option": ComplexUploaderOptionComp,
    "complex-compound-option": ComplexCompoundOptionComp,
    "complex-dropdown-option": ComplexDropdownOptionComp,
    "complex-label-option": ComplexLabelOptionComp,
    "complex-toggle-option": ComplexToggleOptionComp,
  },
  props: {
    option: {
      type: Object as () => ComplexOption,
      required: true,
    },
    nextOption: {
      type: Object as () => ComplexOption | null,
      default: null,
    },
    index: Number,
    select: Function,
    selected: [Object as () => ComplexOption],
    subAttribute: String,
    optionName: String,
    subOptionName: String,
    buckets: Array,
    onUnselected: Function,
    subOptionKey: String,
    casing: Object as () => OptionCasing,
  },
  computed: {
    // ...mapState(["currentProduct"]),
    // ...mapGetters({ modMap: "getWoocommerceMods", basePrice: "getBasePrice" }),
  },
  methods: {
    clickOption(option: ComplexOption | undefined, key: string | undefined) {
      option =
        option === undefined || option instanceof Event
          ? (this.option as ComplexOption)
          : option;
      if (this.select) {
        this.select(option, key);
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.complex-option {
  flex-shrink: 0;

  &.basic-option {
    padding: 6px 13px;
    position: relative;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: 45px;
    cursor: pointer;
    transition: background-color 0.2s ease;
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
    &.selected::after {
      transform: translateX(-50%) scaleY(1);
    }
    .name {
      height: 39.1%;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 12px;
      line-height: 100%;
      font-weight: 600;
    }
    .graphic {
      height: 60.9%;
      display: flex;
      flex-direction: column;
      align-items: center;
      max-width: 100%;
      img {
        max-width: 100%;
      }
    }
    @media (min-width: $medium-width-up) {
      &:hover {
        background-color: #f5f5f5;
      }
    }
  }
  &.complex-image-option {
    height: 100%;
    display: flex;
    align-items: center;
    padding: 0 18px;
    cursor: pointer;
    user-select: none;
    position: relative;
    &:first-child {
      margin-left: 6px;
    }
    &:last-child {
      padding-right: 24px;
    }
    img {
      max-height: 24px;
      display: block;
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
    &.selected::after {
      transform: translateX(-50%) scaleY(1);
    }
  }
  &.complex-swatch-label-option {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    font: 600 10px/1.2 $fnt-cm;
    letter-spacing: -0.025em;
    text-transform: uppercase;
    width: 1.7em;
    margin-left: 0.9em;
    user-select: none;
    &:first-child {
      margin-left: 0;
    }
    > .label {
      display: block;
      flex-shrink: 0;  
      transform: rotate(90deg) translate(50%, -50%) translateX(0.3em);
      transform-origin: top center;
      text-align: left;
    }
  }
}
</style>