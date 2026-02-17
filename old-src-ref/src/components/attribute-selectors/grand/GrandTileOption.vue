<template>
  <div
    :class="[
      'grand-option',
      'grand-tile-option',
      { selected: option == selected },
    ]"
    :data-id="option.id"
    @click="clickOption"
    v-html="option.nickname || option.name"
  ></div>
</template>

<script lang="ts">
import { OptionCasing } from "@/structure";
import { GrandTileOption } from "@/types";
import utils from "@/utils";
import { defineComponent } from "vue";
import { mapGetters, mapState } from "vuex";
export default defineComponent({
  name: "GrandTileOption",
  props: {
    option: Object as () => GrandTileOption,
    select: Function,
    setname: Function,
    open: Boolean,
    selected: Object as () => GrandTileOption | null,
    casing: Object as () => OptionCasing,
  },
  computed: {
    ...mapState(["objectIDMap", "selectedOptions", "currentProduct"]),
    ...mapGetters({ attribute: "getAttribute", modMap: "getWoocommerceMods", basePrice: "getBasePrice" }),
    upcharge(): string | number {
      if (this.option && this.currentProduct && this.casing) {
        return utils.getNumber(
          utils.getOptionUpcharge(
            this.option,
            this.casing,
            this.currentProduct,
            this.basePrice,
            this.modMap
          )
        );
      }
      return 0;
    },
  },
  methods: {
    clickOption() {
      if (this.select) {
        this.select();
      }
    },
  },
  watch: {
    open(value) {
      if (!value && this.setname && this.selected) {
        this.setname(this.selected.name);
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.grand-tile-option {
  width: 38px;
  height: 38px;
  border: 1px solid #000;
  display: flex;
  align-items: center;
  justify-content: center;
  font: 300 13px/100% $fnt-cm;
  letter-spacing: 0.025em;
  transition: background-color 0.2s, color 0.2s;
  cursor: pointer;
  user-select: none;
  &.selected {
    background-color: $orange;
    color: #fff;
    font-weight: 500;
  }
  @media (min-width: $small-width-up) {
    width: 50px;
    height: 50px;
    font-size: 16px;
  }
}
</style>