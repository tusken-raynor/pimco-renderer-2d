<template>
  <div :class="['basic-selector', 'fix-scrollbar', { taller: postTitlePresent }]" data-component ref="list">
    <div
      v-for="option in options"
      :key="option.name"
      :class="['option', { selected: option == selectedOption }]"
      :data-id="option.id"
      @click="clickOption(option)"
    >
      <div class="name" v-html="option.nickname || option.name"></div>
      <div class="swatch">
        <BaseImage :src="option.graphic" :alt="option.name" />
      </div>
      <div v-if="option.posttitle" class="post-title" v-html="posttitle(option)"></div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import { mapState, mapMutations, mapGetters } from "vuex";
import { BasicOption } from "../../../types";
import utils from "@/utils";
import structure from "@/structure";
import { OptionCasing } from "@/structure";

export default defineComponent({
  name: "BasicSelector",
  computed: {
    ...mapState(["currentProduct", "currentAttribute", "attributes", "products", "selectedOptions", "objectIDMap"]),
    ...mapGetters({
      restrictions: "getRestrictions",
      attribute: "getAttribute",
      enablers: "getIndexedEnablers",
      modMap: "getWoocommerceMods",
      basePrice: "getBasePrice",
    }),
    options(): Array<BasicOption> {
      this;
      if (this.attribute) {
        return this.attribute.options
          .map((id: string) => this.objectIDMap[id])
          .filter((o: BasicOption | null) => {
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
    attributeKey(): string {
      if (this.attribute) {
        return this.attribute.name;
      }
      return "";
    },
    casing(): OptionCasing | null {
      if (
        this.currentProduct &&
        this.selectedOptions &&
        this.attributeKey &&
        this.selectedOptions?.[this.currentProduct]?.selections[this.attributeKey]
      ) {
        return this.selectedOptions[this.currentProduct].selections[this.attributeKey];
      }
      return null;
    },
    selectedOption(): BasicOption | null {
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
    postTitlePresent() {
      for (let i = 0; i < this.options.length; i++) {
        if (this.options[i].posttitle) {
          return true;
        }
      }
      return false;
    },
  },
  data() {
    return {
      interactionTimer: -1 as any,
    };
  },
  methods: {
    ...mapMutations(["setSelectedOption", "setOptionInteraction"]),
    selectOption(option: BasicOption) {
      this.setSelectedOption({
        attribute: this.attributeKey,
        value: option,
      });
    },
    clickOption(option: BasicOption) {
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
    posttitle(option: BasicOption) {
      if ("posttitle" in option && option.posttitle) {
        if (option.posttitle.includes("$upcharge$") && this.casing) {
          const upcharge = option.upcharge
            ? option.upcharge
            : utils.getOptionUpcharge(option, this.casing, this.currentProduct, this.basePrice, this.modMap);
          if (upcharge) {
            return option.posttitle.replaceAll("$upcharge$", "$" + upcharge);
          }
          return option.posttitle.replaceAll("$upcharge$", "");
        }
        // This variable is very specific to belt base prices
        if (option.posttitle.includes("$sizecharge$") && this.casing) {
          const sizeCasing = structure.branch(["Size"]);
          if (sizeCasing && sizeCasing.value) {
            let upcharge = option.upcharge
              ? option.upcharge
              : utils.getOptionUpcharge(option, this.casing, this.currentProduct, this.basePrice, this.modMap);
            let sizecharge =
              "upcharge" in sizeCasing.value && sizeCasing.value.upcharge
                ? sizeCasing.value.upcharge
                : utils.getOptionUpcharge(
                    sizeCasing.value,
                    sizeCasing,
                    this.currentProduct,
                    this.basePrice,
                    this.modMap
                  );
            upcharge = parseFloat(upcharge as string) + parseFloat(sizecharge as string) + this.basePrice;
            if (upcharge) {
              return option.posttitle.replaceAll("$sizecharge$", "$" + upcharge);
            }
          }
          return option.posttitle.replaceAll("$sizecharge$", "");
        }
        return option.posttitle;
      }
      return "";
    },
  },
  setup() {
    const list: Ref<HTMLElement | null> = ref(null);
    return { list };
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
.basic-selector {
  display: flex;
  min-height: 110px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  position: relative;
  & > :first-child {
    padding-left: 18px;
  }
  & > :last-child {
    padding-right: 18px;
  }
  &.taller {
    min-height: 166px;
  }
}

.option {
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
  @media (min-width: $medium-width-up) {
    &:hover {
      background-color: #f5f5f5;
    }
  }
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
  .taller::v-deep & {
    height: 25.1%;
  }
}
.swatch {
  height: 60.9%;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 100%;
  img {
    max-width: 100%;
  }
  .taller::v-deep & {
    height: 38.75%;
  }
}
.post-title {
  text-align: center;
  font-size: 10px;
  margin: 0 -10px;
  letter-spacing: -0.025em;
  line-height: 140%;
}
</style>
