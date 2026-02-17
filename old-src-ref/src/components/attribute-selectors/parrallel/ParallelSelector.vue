<template>
  <div class="parallel-selector">
    <div class="regions">
      <div
        v-for="region in regions"
        :key="region.name"
        :class="['region', {'selected': region==selectedAttribute.region}]"
        @click="clickOption(region, 'region')"
      >{{ region.nickname||region.name }}</div>
    </div>
    <div class="accessories">
      <div
        v-for="accessory in accessories"
        :key="accessory.name"
        :class="['accessory', {'selected': accessory==selectedAttribute.accessory}]"
        @click="clickOption(accessory, 'accessory')"
      >
        <img :srcset="accessory.image" :alt="accessory.info||null" />
      </div>
    </div>
    <div class="swatches">
      <div
        v-for="swatch in swatches"
        :key="swatch.name"
        :class="['swatch', {'selected': swatch==selectedAttribute.swatch}]"
        @click="clickOption(swatch, 'swatch')"
      >
        <img v-if="swatch.swatchtype=='image'" :srcset="swatch.swatch" :alt="swatch.info||null" />
        <div
          v-else-if="swatch.swatchtype=='color'"
          class="swatch-color"
          :style="{backgroundColor: swatch.swatch}"
        ></div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  ParallelAttribute,
  ParallelRegionOption,
  ParallelAccessoryOption,
  ParallelSwatchOption,
} from "@/types";
import { mapState, mapMutations } from "vuex";

export type ParallelOption =
  | ParallelRegionOption
  | ParallelAccessoryOption
  | ParallelSwatchOption;

export default defineComponent({
  name: "ParallelSelector",
  computed: {
    ...mapState([
      "attributes",
      "selectedOption",
      "currentProduct",
      "currentAttribute",
      "selectedOptions",
      "objectIDMap",
      "products",
    ]),
    attribute(): ParallelAttribute | null {
      const product = this.products.find(
        (p: any) => p.id == this.currentProduct
      );
      if (product) {
        const id = product.attributes[this.currentAttribute];
        return this.objectIDMap[id];
      }
      return null;
    },
    regions(): Array<ParallelRegionOption> {
      if (this.attribute) {
        return this.attribute.regions
          .map((id) => this.objectIDMap[id])
          .filter((o) => o);
      }
      return [];
    },
    accessories(): Array<ParallelAccessoryOption> {
      if (this.attribute) {
        return this.attribute.accessories
          .map((id) => this.objectIDMap[id])
          .filter((o) => o);
      }
      return [];
    },
    swatches(): Array<ParallelSwatchOption> {
      if (this.attribute) {
        return this.attribute.swatches
          .map((id) => this.objectIDMap[id])
          .filter((o) => o);
      }
      return [];
    },
    attributeKey(): string {
      if (this.attribute) {
        return this.attribute.name;
      }
      return "";
    },
    selectedAttribute(): {
      region: ParallelRegionOption;
      accessory: ParallelAccessoryOption;
      swatch: ParallelSwatchOption;
    } | null {
      if (this.selectedOptions[this.currentProduct][this.attributeKey]) {
        return this.selectedOptions[this.currentProduct][this.attributeKey];
      }
      return null;
    },
  },
  data() {
    return {
      storeSections: ["region", "accessory", "swatch"],
    };
  },
  methods: {
    ...mapMutations(["setSelectedParallelOption"]),
    findDefault(attribute: ParallelAttribute) {
      const keys = ["regions", "accessories", "swatches"];
      for (let x = 0; x < keys.length; x++) {
        const storeKey = this.storeSections[x];
        if (
          this.selectedAttribute &&
          (this.selectedAttribute as any)[storeKey] == null
        ) {
          const key: "regions" | "accessories" | "swatches" = keys[x] as any;
          const section = attribute[key];
          for (let i = 0; i < section.length; i++) {
            const option = this.objectIDMap[section[i]];
            if (option.default) {
              this.setSelectedOption(option, storeKey);
              break;
            }
          }
        }
      }
    },
    setSelectedOption(option: ParallelOption, key: string) {
      this.setSelectedParallelOption({
        attribute: this.attributeKey,
        section: key,
        value: option,
        type: "parallel",
      });
    },
    clickOption(option: ParallelOption, key: string) {
      // This is to add another layer so we can keep track of if the user interacted with the options

      // Tracker code here
      this.setSelectedOption(option, key);
    },
  },
  mounted() {
    setTimeout(() => {
      if (this.attribute) {
        this.findDefault(this.attribute);
      }
    }, 50);
    // For slow connection
    setTimeout(() => {
      if (this.attribute) {
        this.findDefault(this.attribute);
      }
    }, 500);
  },
});
</script>

<style lang="scss" scoped>
.parallel-selector {
  .regions {
    background-color: #000;
    color: #fff;
    font: 600 21px/120% $fnt-cm;
    letter-spacing: -0.025em;
    display: flex;
    align-items: center;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    .region {
      padding: 15px 18px;
      transition: color 0.2s linear;
      cursor: pointer;
      user-select: none;
      position: relative;
      &::after {
        content: "";
        position: absolute;
        width: 0;
        height: 0;
        border-style: solid;
        border-width: 0 10px 10px 10px;
        border-color: transparent transparent #fff transparent;
        bottom: 0;
        left: 50%;
        transform-origin: bottom;
        transform: translateX(-50%) scaleY(0);
        transition: transform 0.2s cubic-bezier(0.76, 0, 0.24, 1);
      }
      &.selected {
        color: $orange;
        &::after {
          transform: translateX(-50%) scaleY(1);
        }
      }
      &:hover {
        color: $orange;
      }
    }
  }
  .accessories {
    display: flex;
    align-items: center;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    .accessory {
      height: 55px;
      display: flex;
      align-items: center;
      padding: 0 18px;
      cursor: pointer;
      user-select: none;
      position: relative;
      &:first-child {
        padding-left: 24px;
      }
      &:last-child {
        padding-right: 24px;
      }
      img {
        max-height: 24px;
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
      }
      &.selected::after {
        transform: translateX(-50%) scaleY(1);
      }
    }
  }
  .swatches {
    display: flex;
    align-items: center;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    .swatch {
      height: 55px;
      position: relative;
      cursor: pointer;
      user-select: none;
      &:not(:last-child) {
        margin-right: 1px;
      }
      img {
        max-height: 100%;
      }
      .swatch-color {
        height: 100%;
        width: 55px;
      }
      &::after {
        content: "";
        position: absolute;
        width: 0;
        height: 0;
        border-style: solid;
        border-width: 0 10px 10px 10px;
        border-color: transparent transparent #fff transparent;
        bottom: 0;
        left: 50%;
        transform-origin: bottom;
        transform: translateX(-50%) scaleY(0);
        transition: transform 0.2s cubic-bezier(0.76, 0, 0.24, 1);
      }
      &.selected::after {
        transform: translateX(-50%) scaleY(1);
      }
    }
  }
}
</style>