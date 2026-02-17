<template>
  <div v-if="label !== 'x-data'" class="subattribute-rev">
    <span class="label">{{ label }}:</span>
    <span class="value" v-html="valueString"></span>
    <div 
      v-if="!isHidden" 
      class="edit-button" 
      @click="editSub"
    ></div>
  </div>
</template>

<script lang="ts">
import uploaded from "@/storage/uploaded";
import structure, { OptionCasing } from "@/structure";
import utils from "@/utils";
import { defineComponent } from "vue";
import { mapState } from "vuex";
export default defineComponent({
  name: "SubAttribute",
  props: {
    subattribute: Object,
    label: String,
    editSub: Function as () => any,
  },
  computed: {
    ...mapState(['objectIDMap']),
    isHidden(): boolean {
      return (this.subattribute?.['x-data']?.attributes || []).some((attr: { id: string }) => this.objectIDMap[attr.id]?.hidden);
    },
  },
  data() {
    return {
      valueString: ""
    }
  },
  methods: {
    async evaluateOption(optionCasing: OptionCasing, key: string) {
      const option = optionCasing.value;
      if (option) {
        // If they are binarys and false, dont return
        // If they are binary and true, but the name is yes, return name of attribute
        if ("boolean" in option) {
          if (!option.boolean && option.name == "No") {
            return null;
          } else {
            return option.name == "Yes" || option.name == "No"
              ? key
              : option.name;
          }
        }
        // Don't evaluate complex buckets
        if (!(option as any).bucket) {
          // If there is an explicit preview value in the casing meta data, return that value
          const preview = optionCasing.getMetaData('preview', '+preview');
          if (preview && typeof preview == "string") {
            return preview;
          }
          // If the option uploads content, check for an uploaded image file
          if (option && option.type == "ComplexUploaderOption" && typeof optionCasing.getMetaData("+keys") === 'string' && optionCasing.getMetaData("+keys")) {
            if (!option['text']) {
              return 'None';
            }
            const {currentKey, keys} = await utils.parseMetaData(optionCasing.getMetaData("+keys"));
            const key = keys[currentKey];
            const url = key.startsWith('file|') ? option['text']! : (await uploaded.getBlobUrl(key, optionCasing.branchID));
            return `<img src="${url}" alt="${option.name}" style="max-width: min(100%, 100px); max-height: min(100%, 72px); width: auto; height: auto; display: block;" />`;
          }
          let match: RegExpMatchArray | null | undefined;
          if ('wcvalue' in option && (match = option.wcvalue?.match(/^\$([^\$]+)\$$/))) {
            // Look in the option casing meta for this value (must be string)
            const metaValue = optionCasing.getMetaData(match[1]);
            if (metaValue && typeof metaValue === "string") {
              return metaValue;
            }
          }
          // Or just output text values
          if ("text" in option && option.text || option['wcvalue'] == "$text$") {
            return option['text'] || '';
          }
          return option.name;
        }
      }
      return null;
    },
    async generateValueString(subs: Record<string, any> | undefined): Promise<string> {
      if (subs) {
        let promises: Array<Promise<string | null>> = [];
        structure.traverse(subs, (casing: OptionCasing, path, key) => {
          if (
            (casing.woocommerceName && casing.value?.['wcvalue']) ||
            (casing.woocommerceProduct && (casing.value as any)?.wooid)
          ) {
            promises.push(this.evaluateOption(casing, key));
          }
        });
        let vals = (await Promise.all(promises)).filter((s) => s) as string[];
        if (subs[Object.keys(subs)[0]] instanceof OptionCasing) {
          vals = [...new Set(vals)];
        }
        return vals.join(", ") || "None";
      }
      return "";
    }
  },
  watch: {
    async subattribute(value) {
      this.valueString = await this.generateValueString(value);
    }
  },
  mounted() {
    this.generateValueString(this.subattribute).then((value) => {
      this.valueString = value;
    });
  },
});
</script>

<style lang="scss" scoped>
.subattribute-rev {
  font-weight: 300;
  letter-spacing: -0.025em;
  padding-bottom: 8px;
  position: relative;
  display: flex;
  .label {
    white-space: nowrap;
  }
  .value {
    font-weight: 500;
    color: #000;
    margin-left: 0.6em;
    display: block;
    &:has(img) {
      max-width: 100px;
      max-height: 72px;
    }
  }
  .edit-button {
    position: absolute;
    width: 24px;
    height: 16px;
    background: url("../../assets/edit.svg") no-repeat left/contain;
    cursor: pointer;
    top: 0;
    right: 100%;
    transform: scaleX(0);
    opacity: 0;
  }
  @media (min-width: $small-width-up) {
    .edit-button {
      transition: transform 0.2s ease 0.15s, opacity 0.2s linear;
      transform-origin: right;
    }
    &:hover .edit-button {
      transform: scaleX(1);
      opacity: 1;
      transition: transform 0.2s ease, opacity 0.2s linear 0.15s;
    }
  }
}
</style>
