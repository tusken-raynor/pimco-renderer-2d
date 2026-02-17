<template>
  <div class="options-info-list-wrapper">
    <div v-if="page.info" class="attribute-info">
      <div class="title" v-html="page.info.title"></div>
      <div class="info" v-html="page.info.content"></div>
    </div>
    <options-info-tab
      v-for="option in page.options"
      :option="option"
      :key="option.id"
      :select="() => clickOption(option)"
    />
  </div>
</template>

<script lang="ts">
import { BasicOption, ColorOption } from "@/types";
import utils from "@/utils";
import { defineComponent } from "vue";
import { mapGetters, mapMutations, mapState } from "vuex";
import OptionsInfoTab from "./OptionsInfoTab.vue";
export default defineComponent({
  name: "OptionsInfoPage",
  props: {
    page: {
      type: Object,
      required: true
    }
  },
  components: {
    OptionsInfoTab,
  },
  computed: {
    ...mapState(["selectedOptions", "currentProduct"]),
    ...mapGetters({ attribute: "getAttribute" }),
    selectedOption(): BasicOption | ColorOption | null {
      if (this.selectedOptions && this.attribute && this.currentProduct) {
        return utils.getNested(this.selectedOptions, [
          this.currentProduct,
          "selections",
          this.attribute.name,
          "value",
        ]);
      }
      return null;
    },
  },
  methods: {
    ...mapMutations(["setSelectedOption"]),
    clickOption(option: BasicOption | ColorOption) {
      this.setSelectedOption({
        attribute: this.attribute.name,
        value: option,
      });
    },
  },
});
</script>

<style lang="scss" scoped>
.options-info-list-wrapper {
  .attribute-info {
    padding: 25px 36px 26px;
    font-size: 13px;
    font-weight: 300;
    line-height: 138.461%;
    text-align: left;
    .title {
      font-weight: 700;
    }
  }
}
</style>