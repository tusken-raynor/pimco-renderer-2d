<template>
  <div class="generic-selector">
    <div v-if="subattributes.length > 1" class="subattributes fix-scrollbar">
      <div
        v-for="(subattribute, index) in subattributes"
        :key="subattribute.id"
        class="subattribute"
        :data-id="subattribute.id"
        :class="{ current: index === currentSubattribute }"
        @click="currentSubattribute = index"
      >
        <h3 v-html="subattribute.nickname || subattribute.name"></h3>
      </div>
    </div>
    <component
      v-if="template"
      :is="template"
      :attribute="attribute"
      :currentSubattribute="currentSubattribute"
      :select="select"
      :casing-nest="casingNest"
    ></component>
  </div>
</template>

<script lang="ts">
import utils from "@/utils";
import { OptionCasing } from "@/structure";
import { defineComponent } from "vue";
import { mapGetters, mapMutations, mapState } from "vuex";
import BigBoy from "./generic-templates/BigBoy.vue";
import { Attribute, GenericOption, GenericSubAttribute } from "@/types";
import SizeRun from "./generic-templates/SizeRun.vue";
import PlayerNumbers from "./generic-templates/PlayerNumbers.vue";

type CasingNest = { [key: string]: CasingNest | OptionCasing };

export default defineComponent({
  name: "GenericSelector",
  components: {
    "big-boy": BigBoy,
    "size-run": SizeRun,
    "player-numbers": PlayerNumbers,
  },
  props: {
    oaacSetter: {
      type: Function,
      required: false,
    },
  },
  computed: {
    ...mapState(["currentProduct", "selectedOptions", "objectIDMap"]),
    ...mapGetters({ attribute: "getAttribute" }),
    template(): string {
      if (this.subattribute?.template) {
        return this.subattribute.template;
      }
      return "";
    },
    attributeKey(): string {
      if (this.attribute) {
        return this.attribute.name;
      }
      return "";
    },
    subattributes(): Attribute[] {
      if (this.attribute?.attributes) {
        return this.attribute.attributes.map((id: string) => this.objectIDMap[id] as Attribute).filter((attr: Attribute | undefined) => !!attr);
      }
      return [];
    },
    subattribute(): GenericSubAttribute | null {
      if (this.subattributes.length > 0) {
        return this.subattributes[this.currentSubattribute] as GenericSubAttribute;
      }
      return null;
    },
    casingNest(): CasingNest {
      if (this.selectedOptions[this.currentProduct]) {
        return (
          utils.getNested(this.selectedOptions, [
            this.currentProduct,
            "selections",
            this.attributeKey,
          ]) || ({} as any)
        );
      }
      return {};
    },
  },
  data() {
    return {
      currentSubattribute: 0
    };
  },
  methods: {
    ...mapMutations(["setSelectedNestedOption"]),
    select(option: GenericOption, subAttribute: string, section: string) {
      this.setSelectedNestedOption({
        attribute: this.attributeKey,
        subattribute: subAttribute,
        section,
        value: option,
        type: "generic",
      });
    },
  },
  mounted() {
    setTimeout(() => {
      // console.log(this.attribute);
      // console.log("Selected:", this.selected);
    }, 1000);
    if (this.oaacSetter) {
      this.oaacSetter((cancelDefault: Function, payload: "next" | "previous") => {
        if (payload === "next") {
          if (this.currentSubattribute < this.subattributes.length - 1) {
            this.currentSubattribute += 1;
            cancelDefault();
          }
        } else if (payload === "previous") {
          if (this.currentSubattribute > 0) {
            this.currentSubattribute -= 1;
            cancelDefault();
          }
        }
      });
    }
  },
});
</script>

<style lang="scss" scoped>
.subattributes {
  background-color: #000;
  display: flex;
  align-items: center;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  height: 55px;
}
.subattribute {
  padding: 15px 18px;
  transition: color 0.2s linear, opacity 0.2s linear;
  cursor: pointer;
  user-select: none;
  position: relative;
  color: #fff;
  white-space: nowrap;
  font: 600 21px/120% $fnt-cm;
  letter-spacing: -0.025em;

  &.has-info {
    display: flex;
    align-items: center;
    gap: 0.35em;
  }

  &::before {
    content: "";
    position: absolute;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 0 10px 10px 10px;
    border-color: transparent transparent #fff transparent;
    bottom: 2px;
    left: 50%;
    transform-origin: bottom;
    transform: translateX(-50%) scaleY(0);
    transition: transform 0.2s cubic-bezier(0.76, 0, 0.24, 1);

    @media (min-width: $medium-width-up) {
      border-width: 0 13px 14px 13px;
      bottom: 0;
    }
  }

  &.current {
    color: $orange;

    &::before {
      transform: translateX(-50%) scaleY(1);
    }
  }

  h3 {
    font: inherit;
  }
}
</style>