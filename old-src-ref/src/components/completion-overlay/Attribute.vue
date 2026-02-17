<template>
  <div :class="['attribute-compl', { completed }]">
    <span class="num" v-html="(index! < 9 ? '0' : '') + (index! + 1)"></span>
    <span class="title" @click="goToAttribute">{{ label }}</span>
    <div v-if="hasSubs" class="subs-attributes">
      <sub-attribute
        v-for="(sub, key, i) in subattributes"
        :key="key"
        :label="key + ''"
        :subattribute="sub"
        @click="() => goToSubAttribute(i)"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
import { OptionCasing } from "../../structure";
import SubAttribute from "./SubAttribute.vue";
import utils from "@/utils";
import { Attribute } from "@/types";
export default defineComponent({
  name: "Attribute",
  props: {
    attribute: Object as () => { [key: string]: any } | OptionCasing,
    label: String,
    index: Number,
  },
  components: {
    SubAttribute,
  },
  computed: {
    ...mapState(["currentAttribute", "objectIDMap"]),
    ...mapGetters({
      restrictions: "getRestrictions",
      enablers: "getIndexedEnablers",
      filteredAttributes: "getFilteredAttributes",
    }),
    mainAttribute(): Attribute | null {
      if (this.attribute && !(this.attribute instanceof OptionCasing)) {
        const attrID: string = (this.attribute["x-data"] as any).id;
        return this.objectIDMap[attrID] || null;
      }
      return null;
    },
    subattributes(): { [key: string]: any } {
      const bub: { [key: string]: any } = {};
      if (this.attribute && !(this.attribute instanceof OptionCasing)) {
        const keys = Object.keys(this.attribute);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          if (key == "x-data") {
            continue;
          }
          const subAttr = this.attribute[key];
          const attrID: string = (subAttr["x-data"] as any).id;
          if (subAttr['x-data']?.templated) {
            continue;
          }
          if (
            utils.standardAttributeFilter(
              this.objectIDMap[attrID] || null,
              this.restrictions,
              this.enablers
            )
          ) {
            bub[key] = subAttr;
          }
        }
      }
      return bub;
    },
    hasSubs(): boolean {
      // const subs = Object.values(this.subattributes);
      return !(this.attribute instanceof OptionCasing);
      // return !(this.attribute instanceof OptionCasing) && !(subs.length == 1 && subs[0].name == this.attribute?.name);
    },
    completed(): boolean {
      if (this.attribute) {
        if (this.attribute instanceof OptionCasing) {
          return Boolean(
            this.attribute.value && this.attribute.userInteraction
          );
        } else {
          const ff = utils.fishCompletion(
            this.attribute,
            this.restrictions,
            this.enablers,
            true
          );
          return ff;
        }
      }
      return false;
    },
  },
  methods: {
    ...mapMutations(["setCompletionOverlayRender"]),
    ...mapActions(["setCurrentAttribute", "setAttributes"]),
    goToAttribute() {
      const alreadyThere = this.index === this.currentAttribute;
      this.setCompletionOverlayRender(false);
      if (!alreadyThere) {
        this.setCurrentAttribute(this.index);
      }
    },
    goToSubAttribute(sub: number) {
      this.setCompletionOverlayRender(false);
      // If the attribute type is 'GrandAttribute', then add a delay to the sub-attribute transition
      const subAttributeDelay = this.mainAttribute?.type === "GrandAttribute" ? 600 : 0;
      this.setAttributes({
        attribute: this.index,
        subAttribute: sub,
        subAttributeDelay
      });
    },
  },
});
</script>

<style lang="scss" scoped>
.attribute-compl {
  padding-left: 42px;
  padding-bottom: 12px;
  position: relative;
  .num {
    font: 500 13px/230% $fnt-cm;
    margin-right: 1em;
    letter-spacing: -0.025em;
  }
  .title {
    font: 600 21px/143% $fnt-cm;
    letter-spacing: -0.025em;
    cursor: pointer;
  }
  .subs-attributes {
    padding-left: 30px;
    .subattribute-compl {
      cursor: pointer;
    }
  }
  &.completed {
    &::before,
    &::after {
      position: absolute;
      content: "";
      width: 5px;
      background-color: $orange;
      left: 4px;
      transform-origin: 50% calc(100% - 2.5px);
      .show-incomplete & {
        background-color: $green;
      }
    }
    &::before {
      height: 13px;
      transform: rotate(-45deg);
      top: 10px;
    }
    &::after {
      height: 23px;
      transform: rotate(40deg);
      top: 0;
    }
  }
  .show-incomplete &:not(.completed) {
    &::before {
      content: "";
      background: url(../../assets/incomplete.svg) no-repeat center/contain;
      width: 16px;
      height: 16px;
      position: absolute;
      left: 2px;
      top: 7px;
      opacity: 0.5;
      transition: opacity 0.2s linear;
    }
    &:hover::before {
      opacity: 1;
    }
  }
}
</style>