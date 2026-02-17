<template>
  <div
    v-if="option"
    :class="[
      'grand-option',
      'grand-block-option',
      { selected: selected == option, 'hidden-price': option['hideupcharge'] },
    ]"
    @click="clickOption"
  >
    <div class="name" v-html="(option!.nickname || option.name).replaceAll('$upcharge$', upcharge!)"></div>
    <div v-if="!option['hideupcharge']" class="price">{{ upcharge!.slice(0, 1) }}${{ upcharge!.slice(1) }}</div>
  </div>
</template>

<script lang="ts">
import { GrandTileOption } from "@/types";
import { defineComponent } from "vue";
import { mapGetters, mapState } from "vuex";
export default defineComponent({
  name: "GrandTileOption",
  props: {
    option: Object as () => GrandTileOption,
    select: Function,
    selected: Object as () => GrandTileOption | null,
    upcharge: String,
  },
  computed: {
    ...mapState(["objectIDMap", "selectedOptions", "currentProduct"]),
    ...mapGetters({ attribute: "getAttribute", }),
  },
  methods: {
    clickOption() {
      if (this.select) {
        this.select();
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.grand-block-option {
  border: 1px solid #000;
  transition: all 0.2s ease;
  background-color: #fff;
  text-align: center;
  font-weight: 300;
  display: block;
  position: relative;
  width: 100%;
  padding: 0.5em 0.4em 2px;
  box-sizing: border-box;
  max-width: 320px;
  width: 100%;
  margin-left: 1px;
  cursor: pointer;
  user-select: none;
  &:not(:last-child) {
    margin-bottom: 8px;
  }
  &.hidden-price {
    padding-block: 0.7em;
  }
  .price {
    font-size: 12px;
    line-height: 1.2em;
  }
  .name {
    font-size: 19px;
    line-height: 1.2em;
    @media (max-width: $medium-width) {
      font-size: 16px;
    }
  }
  &.selected {
    background-color: $orange;
    border-color: $orange;
    color: #fff;
    font-weight: 700;
    z-index: 3;
    &::after {
      opacity: 1;
    }
  }
}
</style>