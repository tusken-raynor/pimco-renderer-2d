<template>
  <div class="grand-addon-attribute">
    <div v-if="addon.image" class="addon-image">
      <BaseImage :data="addon.image" />
    </div>
    <div class="addon-name">
      <span>{{ addon.name }}</span>
      <div v-if="addon.info" class="info-icon" @click="openInfo"></div>
    </div>
    <div :class="['addon-options', { many: options.length > 2 }]">
      <div
        v-for="option in options"
        :key="option.id"
        :class="[
          'addon-option',
          'grand-addon-option',
          'count-' + options.length,
          { selected: selected == option },
        ]"
        @click="clickOption(option)"
      >
        <div class="name">{{ option.nickname || option.name }}</div>
        <div class="price">+${{ getUpcharge(option) }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapGetters, mapMutations, mapState } from "vuex";
import { GrandAddonAttribute, GrandAddonOption } from "@/types";
import utils from "@/utils";
import { OptionCasing } from "@/structure";
export default defineComponent({
  name: "GrandAddonAttribute",
  props: {
    addon: Object as () => GrandAddonAttribute,
    select: Function,
    subkey: String,
    open: Boolean,
  },
  computed: {
    ...mapState(["objectIDMap", "currentProduct", "selectedOptions"]),
    ...mapGetters({ attribute: "getAttribute", modMap: "getWoocommerceMods", basePrice: "getBasePrice" }),
    attrKey(): string {
      if (this.attribute) {
        return this.attribute.name;
      }
      return "";
    },
    addonKey(): string {
      if (this.addon && this.addon.name) {
        return this.addon.name;
      }
      return "";
    },
    options(): Array<GrandAddonOption> {
      if (this.addon && this.addon.options) {
        return this.addon.options.options
          .map((id: string) => this.objectIDMap[id])
          .filter((o: any) => o);
      }
      return [];
    },
    optionsKey(): string {
      if (this.addon && this.addon.options) {
        return this.addon.options.key;
      }
      return "";
    },
    optionCasing(): OptionCasing | null {
      if (
        this.selectedOptions &&
        this.currentProduct &&
        this.optionsKey &&
        this.subkey
      ) {
        return (
          utils.getNested(this.selectedOptions, [
            this.currentProduct,
            "selections",
            this.attrKey,
            this.subkey,
            this.addonKey,
            this.optionsKey,
          ]) || null
        );
      }
      return null;
    },
    selected(): GrandAddonOption | null {
      if (this.optionCasing) {
        return (this.optionCasing.value as GrandAddonOption) || null;
      }
      return null;
    },
  },
  methods: {
    ...mapMutations([
      "setSelectedNestedAddonOption",
      "setNestedAddonOptionInteraction",
      "setStandardPopup",
    ]),
    selectAddonOption(option: GrandAddonOption | null) {
      this.setSelectedNestedAddonOption({
        attribute: this.attrKey,
        subattribute: this.subkey,
        addonattribute: this.addonKey,
        section: this.optionsKey,
        value: option,
      });
    },
    clickOption(option: GrandAddonOption) {
      this.selectAddonOption(option);
    },
    setInteraction(value = true) {
      this.setNestedAddonOptionInteraction({
        attribute: this.attrKey,
        subattribute: this.subkey,
        addonattribute: this.addonKey,
        section: this.optionsKey,
        value,
      });
    },
    openInfo() {
      if (this.addon && this.addon.info) {
        // Let's check if it's a notification popup
        if (
          this.addon.info.title &&
          (this.addon.info.content || this.addon.info.image)
        ) {
          this.setStandardPopup(this.addon.info);
        }
      }
    },
    getUpcharge(option: GrandAddonOption) {
      if (this.optionCasing && this.currentProduct) {
        return utils.getOptionUpcharge(
          option,
          this.optionCasing,
          this.currentProduct,
          this.basePrice,
          this.modMap
        );
      }
      return 0;
    },
  },
  watch: {
    open(value) {
      this.setInteraction(Boolean(this.selected));
    },
  },
  mounted() {
    if (!this.selected && this.addon && this.addon.options.default) {
      this.selectAddonOption(this.objectIDMap[this.addon.options.default]);
    }
  },
});
</script>

<style lang="scss" scoped>
.grand-addon-attribute {
  padding-bottom: 80px;
  .addon-image {
    margin: 0 auto 24px;
    @media (min-width: $medium-width-up) {
      margin-left: 35px;
    }
    img {
      max-width: 500px;
      height: auto;
      @media (max-width: 712px) {
        max-width: 100%;
      }
    }
  }
  .addon-name {
    font: 600 1em/187.5% $fnt-cm;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    position: relative;
    @media (max-width: $medium-width) {
      justify-content: center;
      padding: 0 calc(0.8em + 10px);
    }
    .info-icon {
      background: url(../../../assets/info.svg) no-repeat center/contain;
      height: 0.8em;
      width: 0.8em;
      margin-left: 18px;
      margin-bottom: 8px;
      @media (max-width: $medium-width) {
        position: absolute;
        top: calc(50% - 0.4em);
        right: 2px;
      }
      @media (min-width: $medium-width-up) {
        cursor: pointer;
        transition: transform 0.2s ease;
        &:hover {
          transform: scale(1.2);
        }
      }
    }
  }
  .addon-options {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    &.many .addon-option {
      flex-grow: 1;
    }
    @media (min-width: 900px) {
      justify-content: flex-start;
    }
  }
  .addon-option {
    border: 1px solid #000;
    transition: all 0.2s ease;
    background-color: #fff;
    text-align: center;
    font-weight: 300;
    display: inline-block;
    position: relative;
    // width: 100%;
    padding: 0.5em 0.5em 2px;
    box-sizing: border-box;
    min-width: 280px;
    cursor: pointer;
    user-select: none;
    margin: -1px -1px 0;
    .price {
      font-size: 12px;
    }
    @media (max-width: $small-width) {
      min-width: initial;
      width: 100%;
      &.count-2 {
        min-width: initial;
        width: calc(50% - 2px);
      }
      &.count-4,
      &.count-3 {
        min-width: 160px;
      }
    }
    // &.count-2 {
    //   width: calc(50% - 2px);
    // }
    // &.count-3 {
    //   width: calc(33.333333% - 2px);
    // }
    // &.count-4 {
    //   width: calc(25% - 2px);
    // }
    &.selected {
      background-color: $orange;
      border-color: $orange;
      color: #fff;
      font-weight: 700;
      z-index: 3;
      margin-right: 0;
      margin-left: 0;
      &::after {
        opacity: 1;
      }
    }
  }
}
</style>