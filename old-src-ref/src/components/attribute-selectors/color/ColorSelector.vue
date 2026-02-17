<template>
  <div
    :class="['color-selector', 'fix-scrollbar', sanitize(attributeKey)]"
    data-component
    ref="list"
  >
    <color-option
      v-for="option in options"
      :key="option.name"
      :class="{ selected: option == selectedOption }"
      :option="option"
      :casing="casing"
      @click="clickOption(option)"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import { mapState, mapMutations, mapGetters } from "vuex";
import { ColorOption, ColorAttribute } from "@/types";
import ColorOptionComp from "./ColorOption.vue";
import utils from "@/utils";
import { OptionCasing } from "@/structure";

export default defineComponent({
  name: "ColorSelector",
  components: {
    "color-option": ColorOptionComp,
  },
  computed: {
    ...mapState([
      "currentProduct",
      "currentAttribute",
      "attributes",
      "products",
      "selectedOptions",
      "objectIDMap",
    ]),
    ...mapGetters({
      attribute: "getAttribute",
      restrictions: "getRestrictions",
      model: "getModel",
      enablers: "getIndexedEnablers",
    }),
    options(): Array<ColorOption> {
      if (this.attribute) {
        return (this.attribute as ColorAttribute).options
          .map((id) => this.objectIDMap[id])
          .filter((o: ColorOption | null) => {
            return utils.standardOptionFilter(
              o,
              [this.currentProduct, "selections", this.attributeKey],
              this.restrictions,
              this.enablers
            );
          });
      }
      return [];
    },
    casing(): OptionCasing | null {
      if (
        this.currentProduct &&
        this.selectedOptions &&
        this.attributeKey &&
        this.selectedOptions?.[this.currentProduct]?.selections[
          this.attributeKey
        ]
      ) {
        return this.selectedOptions[this.currentProduct].selections[
          this.attributeKey
        ];
      }
      return null;
    },
    attributeKey(): string {
      if (this.attribute) {
        return this.attribute.name;
      }
      return "";
    },
    selectedOption(): ColorOption | null {
      const selectedOption = utils.getNested(this.selectedOptions, [
        this.currentProduct,
        "selections",
        this.attributeKey,
      ]);
      if (selectedOption) {
        return selectedOption.value;
      }
      return null;
    },
  },
  methods: {
    ...mapMutations(["setSelectedOption", "setOptionInteraction"]),
    selectOption(option: ColorOption) {
      this.setSelectedOption({
        attribute: this.attributeKey,
        value: option,
      });
    },
    clickOption(option: ColorOption) {
      // This is to add another layer so we can keep track of if the user interacted with the options

      // Tracker code here
      this.selectOption(option);
    },
    setInteraction() {
      this.setOptionInteraction({
        attribute: this.attributeKey,
        value: true,
      });
    },
    sanitize(string: string) {
      return utils.sanitize(string);
    },
  },
  setup() {
    const list: Ref<HTMLElement | null> = ref(null);
    const interactionTimer: Ref<any> = ref(-1);
    return { list, interactionTimer };
  },
  mounted() {
    if (this.list) {
      utils.scrollPresent(this.list);
    }
    // If they sit on the attribute for 2 seconds, mark it as interacted
    this.interactionTimer = setTimeout(this.setInteraction, 800);
  },
  beforeUnmount() {
    if (this.interactionTimer > -1) {
      clearTimeout(this.interactionTimer);
    }
  },
});
</script>

<style lang="scss" scoped>
.color-selector {
  display: flex;
  min-height: 110px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  position: relative;
  &.edge_paint {
    height: 163px;
  }
  &.elastic_color {
    height: 163px;
    .color-option,
    ::v-deep .swatch {
      height: 100%;
    }
  }
  body.belts &.thread {
    height: 163px;
    .color-option,
    ::v-deep .swatch {
      height: 100%;
    }
  }
}
</style>