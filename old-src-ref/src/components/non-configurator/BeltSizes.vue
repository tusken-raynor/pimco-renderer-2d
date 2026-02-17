<template>
  <div class="content-wrapper">
    <div class="head">select your size</div>
    <div class="youth-section" v-if="content.sizes?.youth">
      <h2 class="section-title">{{ content.sizes.youth.title }}</h2>
      <BaseImage :data="content.sizes.youth.image" />
      <div class="belts-sizes">
        <div
          v-for="(option, size) in content.sizes.youth.sizes"
          :key="size"
          :class="['belt-size', { selected: size == currentSize }]"
          @click="selectSize(size, 'youth', option)"
        >
          <span>{{ size }}</span>
        </div>
        <div v-for="i in 4" :key="i" class="belt-size dummy"></div>
      </div>
    </div>
    <div class="adult-section" v-if="content.sizes?.adult">
      <h2 class="section-title">{{ content.sizes.adult.title }}</h2>
      <BaseImage :data="content.sizes.adult.image" />
      <div class="belts-sizes">
        <div
          v-for="(option, size) in content.sizes.adult.sizes"
          :key="size"
          :class="['belt-size', { selected: size == currentSize }]"
          @click="selectSize(size, 'adult', option)"
        >
          <span>{{ size }}</span>
        </div>
        <div v-for="i in 4" :key="i" class="belt-size dummy"></div>
      </div>
    </div>
    <div
      :class="['next-btn', { disabled: !currentCategory }]"
      @click="clickNext"
    >
      next
    </div>
    <div class="size-guide-link" @click="openSizeGuide">
      {{ content.sizechart.label }}
    </div>
  </div>
</template>

<script lang="ts">
import { Model } from "@/types";
import { defineComponent } from "@vue/runtime-core";
import structure from "@/structure";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";

export default defineComponent({
  name: "BeltSizes",
  computed: {
    ...mapState(["models", "objectIDMap"]),
    ...mapGetters({
      content: "getPreConfigData",
      product: "getProduct",
    }),
    orderedModels() {
      // Sort the models by order in the models array on the product
      return this.models.sort(
        (a: Model, b: Model) =>
          this.product.models.indexOf(a.id) - this.product.models.indexOf(b.id)
      );
    },
  },
  data() {
    return {
      currentSize: "" as string | number,
      currentCategory: "",
      currentSizeOption: "",
      selectedModel: null as null | Model,
    };
  },
  methods: {
    ...mapMutations(["setCurrentModel", "setConfiguratorPage"]),
    ...mapActions(["onDataStepComplete", "switchModelData"]),
    selectSize(size: string | number, category: string, option: string) {
      this.currentSize = size;
      this.currentCategory = category;
      this.currentSizeOption = option;
    },
    openSizeGuide() {
      window.open(
        this.content.sizechart.url,
        "Size Guide",
        `height=${this.content.sizechart.height},width=${this.content.sizechart.width}`
      );
    },
    clickNext() {
      if (this.orderedModels.length < 10) {
        this.selectedModel = this.orderedModels[0];
        if (this.currentSizeOption) {
          const id = this.currentSizeOption;
          // Wait till the objects are loaded, then set the size id into the configurator
          this.onDataStepComplete({
            id: "objects",
            callback: () => {
              // Now grab the casing by using the branch ID and set it's value
              const casing = structure.branch(
                this.content?.configuratorSizeBranchID
              );
              if (casing && this.objectIDMap[id]) {
                casing.value = this.objectIDMap[id];
              }
            },
          });
          this.goToConfigurator();
        }
      } else {
        console.warn("You need to add a menu for selecting models");
      }
    },
    goToConfigurator() {
      if (this.selectedModel) {
        this.setCurrentModel(this.selectedModel.id);
        this.switchModelData();
        this.setConfiguratorPage("build");
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.content-wrapper {
  padding: 42px 24px;
}
.head {
  font: 40px/110% $fnt-fh;
  color: $orange;
  max-height: 72px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  flex: 1;
  &.cnstrn {
    min-height: 70px;
  }
}
.youth-section,
.adult-section {
  padding: 55px 0 6px;
  color: #000;
  & ::v-deep img {
    max-width: 100%;
  }
}
.youth-section {
  border-bottom: 1px solid #000;
}

.section-title {
  font: 700 22px/100% $fnt-ev;
  text-transform: uppercase;
  letter-spacing: 0.049em;
  padding-bottom: 1.2em;
}

.belts-sizes {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  max-width: 364px;
  margin: 0 auto;
  gap: 4%;
}
.belt-size {
  position: relative;
  margin: 15px 0;
  border: 1px solid #000;
  border-radius: 8px;
  padding: 14px 0 11px;
  font: 22px/100% $fnt-cm;
  text-transform: uppercase;
  letter-spacing: 0.049em;
  width: 50px;
  cursor: pointer;
  overflow: hidden;
  transition: color 0.2s linear 0.2s, border-color 0.3s linear,
    font-weight 0s linear 0.2s;

  &.selected {
    color: #fff;
    font-weight: 700;
    transition: color 0.2s linear, border-color 0.3s linear,
      font-weight 0s linear 0.2s;
    &::before {
      width: 0;
      height: 0;
    }
  }

  @media (min-width: $small-width-up) {
    &:not(.selected):hover {
      border-color: $orange;
    }
  }

  &::before {
    width: 100px;
    height: 100px;
    border: 40px solid $orange;
    position: absolute;
    content: "";
    top: 50%;
    left: 50%;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    transition: width 0.5s ease, height 0.5s ease;
  }

  > span {
    position: relative;
  }

  &.dummy {
    border-color: #0000 !important;
    height: 0 !important;
    margin-top: 0 !important;
    margin-bottom: 0 !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    border-top-width: 0;
    border-bottom-width: 0;
  }
}

.next-btn {
  font: 700 19px/120% $fnt_ev;
  letter-spacing: 0.073em;
  text-transform: uppercase;
  color: #fff;
  min-width: 260px;
  box-sizing: border-box;
  padding: 0.7368em 0.7368em 0.473em;
  border: 1px solid $orange;
  display: inline-block;
  margin-top: 24px;
  cursor: pointer;
  background-color: $orange;

  &.disabled {
    cursor: not-allowed;
    background-color: #8e8e8e;
    border-color: #8e8e8e;
  }

  @media (min-width: $small-width-up) {
    transition: background-color 0.2s linear, color 0.2s linear;
    &:not(.disabled):hover {
      background-color: #fff;
      color: $orange;
    }
  }
}

.size-guide-link {
  font: 700 17px/100% $fnt-cm;
  color: #000;
  text-transform: uppercase;
  padding-top: 2.2352em;
  padding-bottom: 1.1764em;
  text-decoration-line: underline;
  cursor: pointer;
  @media (min-width: $small-width-up) {
    transition: text-decoration-color 0.2s linear;
    &:not(:hover) {
      text-decoration-color: #0000;
    }
  }
}
</style>