<template>
  <div class="attribute-rev">
    <div class="head-wrap">
      <div class="title-wrap" :data-index="index">
        <span
          class="num"
          v-html="index < 8 ? '0' + (index + offset) : index + offset"
        ></span>
        <span class="title">{{ label + (hasMultipleSubs ? "" : ": ") }}</span>
        <span v-if="value" class="value" v-html="value"></span>
      </div>
      <div class="edit-btn" title="Edit Attribute" @click="goToAttribute"></div>
    </div>
    <div v-if="hasMultipleSubs" class="subs-attributes">
      <sub-attribute
        v-for="(sub, key, i) in subattributes"
        :key="key"
        :label="key.toString()"
        :subattribute="sub"
        :edit-sub="() => goToSubAttribute(i)"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
import structure, { OptionCasing } from "../../structure";
import SubAttribute from "./SubAttribute.vue";
import utils from "@/utils";
import { Attribute } from "@/types";
export default defineComponent({
  name: "Attribute",
  props: {
    attribute: Object,
    label: String,
    index: {
      type: Number,
      required: true
    },
    offset: {
      type: Number,
      default: 1,
    },
  },
  components: {
    SubAttribute,
  },
  computed: {
    ...mapState(["objectIDMap"]),
    ...mapGetters({
      restrictions: "getRestrictions",
      enablers: "getIndexedEnablers",
    }),
    hasMultipleSubs(): boolean {
      return Object.keys(this.subattributes).length > 1;
    },
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
    value(): string | null {
      const subCount = Object.keys(this.subattributes).length;
      if (!subCount && this.attribute?.value) {
        return this.attribute.value.name;
      } else if (subCount == 1) {
        const subs = Object.values(this.subattributes)[0];
        let vals: Array<string | null> = [];
        structure.traverse(subs, (casing: OptionCasing, path, key) => {
          const blah = this.evaluateOption(casing, key) || null;
          vals.push(blah);
        });
        vals = vals.filter((s) => s);
        if (subs[Object.keys(subs)[0]] instanceof OptionCasing) {
          vals = [...new Set(vals)];
        }
        return vals.join(", ") || "None";
      }
      return null;
    },
  },
  methods: {
    ...mapMutations(["setCheckoutOverlayRender"]),
    ...mapActions(["setCurrentAttribute", "setAttributes"]),
    goToAttribute() {
      this.setCheckoutOverlayRender(false);
      this.setCurrentAttribute(this.index);
    },
    goToSubAttribute(sub: number) {
      this.setCheckoutOverlayRender(false);
      // If the attribute type is 'GrandAttribute', then add a delay to the sub-attribute transition
      const subAttributeDelay = this.mainAttribute?.type === "GrandAttribute" ? 600 : 0;
      this.setAttributes({
        attribute: this.index,
        subAttribute: sub,
        subAttributeDelay
      });
    },
    evaluateOption(optionCasing: OptionCasing, key: string) {
      const option = optionCasing.value;
      // If they are binarys and false, dont return
      // If they are binary and true, but the name is yes, return name of attribute
      if (option && "boolean" in option) {
        if (!option.boolean && option.name == "No") {
          return null;
        } else {
          return option.name == "Yes" || option.name == "No"
            ? key
            : option.name;
        }
      }
      // Don't evaluate complex buckets
      if (option && !(option as any).bucket) {
        // If there is an explicit preview value in the casing meta data, return that value
        const preview = optionCasing.getMetaData('preview', '+preview');
        if (preview && typeof preview == "string") {
          return preview;
        }
        let match: RegExpMatchArray | null | undefined;
        if ('wcvalue' in option && (match = option.wcvalue?.match(/^\$([^\$]+)\$$/))) {
          // Look in the option casing meta for this value (must be string)
          const metaValue = optionCasing.getMetaData(match[1]);
          if (metaValue && typeof metaValue === "string") {
            return metaValue;
          }
        }
        if ("text" in option || option['wcvalue'] == "$text$") {
          return option['text'] || '';
        }
        return option.name;
      }
      return null;
    },
  },
});
</script>

<style lang="scss" scoped>
.attribute-rev {
  padding-bottom: 4px;
  position: relative;
  border-bottom: 1px solid #dadada;
  cursor: default;
  &:not(:first-child) {
    padding-top: 22px;
  }
  .head-wrap {
    display: flex;
    justify-content: space-between;
  }
  .num {
    font: 500 13px/230% $fnt-cm;
    margin-right: 1em;
    letter-spacing: -0.025em;
  }
  .title {
    font: 600 21px/143% $fnt-cm;
    letter-spacing: -0.025em;
  }
  .value {
    margin-left: 0.9em;
    font-weight: 500;
  }
  .edit-btn {
    width: 24px;
    height: 24px;
    background: url("../../assets/edit.svg") no-repeat center/contain;
    cursor: pointer;
    @media (min-width: $small-width-up) {
      transition: transform 0.2s ease;
      &:hover {
        transform: scale(1.14);
      }
    }
  }
  .subs-attributes {
    padding-left: 30px;
    padding-top: 6px;
    .subattribute-rev {
      cursor: default;
    }
  }
}
</style>
