<template>
  <div v-if="product" :class="['patterns-page', product.id]">
    <div v-if="product.startpage" class="patterns-page-cell">
      <component :is="product.startpage.rtemplate" v-if="content" />
      <div class="x-button x-pattern" @click="headOnHome"></div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapGetters, mapMutations, mapState } from "vuex";
import BeltSizes from "./BeltSizes.vue";
import GlovePatterns from "./GlovePatterns.vue";

export default defineComponent({
  name: "PatternsPage",
  components: { GlovePatterns, BeltSizes },
  computed: {
    ...mapState(["preConfigData", "currentProduct"]),
    ...mapGetters({ product: "getProduct", content: "getPreConfigData" }),
  },
  methods: {
    ...mapMutations([
      "setConfiguratorPage",
      "setCurrentModel",
      "setConfiguratorMode",
      "setCurrentSeries",
    ]),
    headOnHome() {
      // If we are one the patterns page and they click the logo
      // at the top, send them to the start page
      this.setConfiguratorPage("start");
      this.setConfiguratorMode("");
      this.setCurrentSeries("");
    },
  },
});
</script>

<style lang="scss" scoped>
.patterns-page {
  height: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #fff url("../../assets/stage-bg.jpg") no-repeat center/cover;
  &.belts {
    overflow: auto;
    align-items: flex-start;
    @media (min-width: 651px) and (min-height: 651px) {
      padding: 30px 0;
    }
  }
}
.patterns-page-cell {
  background-color: #fff;
  width: 100%;
  height: 100%;
  position: relative;
  .belts::v-deep & {
    height: auto;
    // @media (max-width: 650px) {
    //   background-color: initial;
    // }
  }
  .gloves::v-deep & {
    @media (max-width: 500px) {
      overflow: auto;
    }
  }
  @media (min-width: 651px) and (min-height: 651px) {
    width: 94%;
    border-radius: 25px;
    max-width: 725px;
    .gloves::v-deep & {
      height: 82%;
      max-height: 735px;
    }
  }
  .x-button {
    width: 40px;
    height: 40px;
    position: absolute;
    top: 10px;
    right: 10px;
    cursor: pointer;
    &::before,
    &::after {
      height: 50%;
      background-color: #666666;
      transition: background-color 0.2s linear;
    }
    @media (min-width: $medium-width-up) {
      &:hover::before,
      &:hover::after {
        background-color: $orange;
      }
    }
  }
}
</style>
