<template>
  <div class="clone-text-field">
    <div class="label-wrap">
      <label v-if="field.label" v-html="formatLabel(field.label)"></label>
      <div v-if="field.info" class="info-btn" @click="showOptionsInfo"></div>
    </div>
    <input
      :id="field.key"
      type="text"
      v-model="textValue"
      placeholder="ENTER"
    />
  </div>
</template>

<script lang="ts">
import { OptionCasing } from "@/structure";
import {
  Option,
  StandardPopupInfo,
  TextMutationConditionalPattern,
} from "@/types";
import { defineComponent } from "vue";
import { mapActions, mapMutations, mapState } from "vuex";
import structure from "@/structure";

export default defineComponent({
  name: "CloneTextField",
  props: {
    field: Object as () => {
      key: string;
      value: string | null;
      ref: boolean;
      label: string;
      info?: StandardPopupInfo;
      pattern?:
        | string
        | TextMutationConditionalPattern
        | Array<string | TextMutationConditionalPattern>;
      source: "selection" | "meta";
      type: "text";
      disabled: boolean;
    },
    number: Number,
    setCloneMeta: Function as any as () => (
      meta: { key: string; value: string | null; ref: boolean },
      number: number
    ) => void,
  },
  computed: {
    ...mapState(["objectIDMap"]),
    casing(): OptionCasing<Option & { text?: string }> | null {
      if (this.field && this.field.source == "selection") {
        return structure.branch(this.field!.key) as any;
      }
      return null;
    },
    regex(): RegExp | false {
      if (this.field?.pattern) {
        if (!Array.isArray(this.field.pattern)) {
          return this.getPatternRegExp(this.field.pattern);
        }
        for (let i = 0; i < this.field.pattern.length; i++) {
          const regex = this.getPatternRegExp(this.field.pattern[i]);
          if (regex) {
            return regex;
          }
        }
      }
      return false;
    },
  },
  data() {
    return {
      textValue: "",
      storageTimer: -1 as any,
    };
  },
  methods: {
    ...mapMutations(["setStandardPopup", "forceUpdateOrderedPimcos"]),
    ...mapActions(["storeData"]),
    formatLabel(label: string) {
      return label.replaceAll("$i$", this.number + "");
    },
    showOptionsInfo() {
      if (this.field?.info) {
        this.setStandardPopup(this.field.info);
      }
    },
    setValue(string: string) {
      if (this.casing && this.number == 1) {
        this.casing.value.text = string;
        this.storeUpdatedValues();
        this.forceUpdateOrderedPimcos();
      }
      this.setMetaValue(string);
    },
    filterText(text: string, oldText: string): string {
      if (this.regex) {
        if (text.match(this.regex)) {
          return text;
        } else if (text.toUpperCase().match(this.regex)) {
          return text.toUpperCase();
        } else if (text.toLowerCase().match(this.regex)) {
          return text.toLowerCase();
        }
        return oldText;
      }
      return text;
    },
    setMetaValue(string: string) {
      if (
        this.setCloneMeta &&
        this.field &&
        !this.field.ref &&
        this.number !== undefined
      ) {
        this.setCloneMeta(
          {
            key: this.field.key,
            value: string,
            ref: false,
          },
          this.number
        );
      }
    },
    storeUpdatedValues() {
      if (this.storageTimer !== -1) {
        clearTimeout(this.storageTimer);
      }
      this.storageTimer = setTimeout(() => {
        this.storageTimer = -1;
        this.storeData();
      }, 1000);
    },
    getPatternRegExp(
      patternVal:
        | string
        | TextMutationConditionalPattern
        | Array<string | TextMutationConditionalPattern>
    ): RegExp | false {
      if (typeof patternVal == "string") {
        return new RegExp("^" + patternVal + "$");
      }
      if (!Array.isArray(patternVal)) {
        const branch = structure.branch(patternVal.branch);
        if (branch?.value && branch.value.id == patternVal.option) {
          return new RegExp("^" + patternVal.pattern + "$");
        }
      }
      return false;
    },
  },
  watch: {
    textValue(newVal: string, oldVal: string) {
      const filteredText = this.filterText(newVal, oldVal);
      if (filteredText !== newVal) {
        this.textValue = filteredText;
      }
      this.setValue(filteredText);
    },
  },
  mounted() {
    this.textValue = this.field?.value || "";
  },
});
</script>

<style lang="scss" scoped>
.clone-text-field {
  font: 300 16px/120% $fnt-cm;
  padding-bottom: 1.1em;
}
.label-wrap {
  display: flex;
  align-items: center;
  font: 300 16px/120% $fnt-cm;
  padding-bottom: 1em;
  gap: 1em;
}
label {
  padding-top: 0.2em;
}
.info-btn {
  width: 15px;
  height: 15px;
  background: url(../../../../assets/info.svg) no-repeat center/contain;
  cursor: pointer;
  @media (min-width: $medium-width-up) {
    width: 20px;
    height: 20px;
    transition: transform 0.2s ease;
    transform: rotate(360deg);
    &:hover {
      transform: rotate(360deg) scale(1.2);
    }
  }
}
input {
  display: block;
  padding: 16px 20px 12px;
  width: 175px;
  box-sizing: border-box;
  font: 300 16px/100% $fnt-cm;
  border: 1px solid #000;
  transition: width 0.2s ease;
  &::placeholder {
    color: #000;
    text-align: center;
    transition: color 0.08s;
  }
  &:focus::placeholder {
    color: #0000;
  }
}
</style>