<template>
  <div
    v-if="option && casing"
    :class="['complex-dropdown-option']"
  >
    <div class="selection-wrapper">
      <select :name="option.name" :id="`${casing.branchID}-${option.id}`" v-model="selectedValue">
        <option
          v-if="option.emptylabel"
          value=""
          :selected="option.default ? undefined : true"
          disabled
        >{{ option.emptylabel }}</option>
        <option
          v-for="choice in choices"
          :key="choice.value"
          :value="choice.value"
        >{{ choice.label }}</option>
      </select>
    </div>
    <div 
      v-if="suboptions.length" 
      class="contained-suboptions" 
      :class="[sanitize(subKey), 'type-' + sanitize(suboptions[0]?.type || 'unknown'), sanitize(selectedSub?.name || '')]"
    >
      <template v-for="suboption in suboptions" :key="suboption.id">
        <complex-label-option
          v-if="suboption.type == 'ComplexLabelOption'"
          :option="suboption"
          :selected="selectedSub"
          :casing="casing"
          :select="select ? (o: ComplexOption) => select(o, subKey) : () => {}"
        />
        <complex-toggle-option
          v-else-if="suboption.type == 'ComplexToggleOption'"
          :option="suboption"
          :selected="selectedSub"
          :casing="casing"
          :select="select ? (o: ComplexOption) => select(o, subKey) : () => {}"
        />
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  ComplexDropdownOption,
  ComplexOption,
} from "@/types";
import { mapActions, mapGetters, mapState } from "vuex";
import { OptionCasing } from "@/structure";
import utils from "@/utils";
import ComplexLabelOption from "./ComplexLabelOption.vue";
import ComplexToggleOption from "./ComplexToggleOption.vue";

export default defineComponent({
  name: "ComplexDropdownOption",
  props: {
    option: {
      type: Object as () => ComplexDropdownOption,
      required: true,
    },
    selected: Object as () => ComplexDropdownOption | null,
    select: {
      type: Function,
      required: true,
    },
    subAttribute: {
      type: String,
      required: true,
    },
    optionName: String,
    subOptionName: String,
    onUnselected: Function,
    casing: Object as () => OptionCasing,
  },
  components: {
    ComplexLabelOption,
    ComplexToggleOption,
  },
  computed: {
    ...mapState(["objectIDMap", "currentProduct", "selectedOptions"]),
    ...mapGetters({
      attribute: "getAttribute",
      restrictions: "getRestrictions",
      enablers: "getIndexedEnablers",
    }),
    choices(): Array<{ label: string; value: string; }> {
      if (!this.option) return [];
      return this.option.choices.map(c => (c instanceof Object) ? c : { label: c, value: c });
    },
    currentAttributeName(): string {
      return this.attribute?.name || "";
    },
    suboptions() {
      if (this.casing && this.option?.suboptions?.contain) {
        return this.option!.suboptions!.options.map(id => this.objectIDMap[id]).filter(o => {
          return utils.standardOptionFilter(o, [...this.casing!.getPath(), this.option!.suboptions!.key], this.restrictions, this.enablers);
        });
      }
      return [];
    },
    subKey(): string {
      return this.option?.suboptions?.key ?? "";
    },
    selectedSub(): ComplexOption | null {
      if (this.selectedOptions?.[this.currentProduct].selections[this.currentAttributeName]?.[this.subAttribute]?.[this.subKey]) {
        return this.selectedOptions[this.currentProduct].selections[this.currentAttributeName][this.subAttribute][this.subKey].value as ComplexOption;
      }
      return null
    }
  },
  data() {
    return {
      selectedValue: null as null | string
    };
  },
  methods: {
    ...mapActions(["storeData", "onDataStepComplete"]),
    sanitize(value: string) {
      return utils.sanitize(value);
    },
    onCasingChange() {
      if (this.casing) {
        this.selectedValue = this.casing.getMetaData('+value') ?? null;
      }
    },
    onValueChange() {
      const value = this.selectedValue;
      if (value === null && this.option.default) {
        this.selectedValue = this.option.default;
        return;
      }
      if (this.casing) {
        this.casing.setMetaData('+value', value);
        if (this.option.previewformat) {
          this.casing.setMetaData('+preview', this.option.previewformat.replace("$value$", value || ""));
        }
        this.storeData();
      }
    }
  },
  watch: {
    selectedValue() {
      this.onValueChange();
    },
    casing() {
      this.onCasingChange();
    },
    
  },
  setup() {},
  mounted() {
    this.onDataStepComplete({
      id: "objects",
      callback: () => {
        this.onCasingChange();
        this.onValueChange();
      },
    });
  },
});
</script>

<style lang="scss" scoped>
.complex-dropdown-option {
  padding: 4px 8px 4px 18px;
  text-align: left;
  display: flex;
  align-items: center;
}

.selection-wrapper {
  height: 28px;
  border: 1px solid #bcbec0;
  position: relative;

  &::after {
    content: "";
    position: absolute;
    width: 6px;
    aspect-ratio: 1;
    top: 50%;
    right: 6px;
    transform: translate(-50%, -75%) rotate(45deg);
    border: 2px solid #000;
    border-top-width: 0;
    border-left-width: 0;
    transition: border-color 0.15s linear, transform 0.15s ease;
  }
  body:not(.is-touch) &:hover::after {
    border-color: $orange;
  }

  select {
    height: 100%;
    border: none;
    background: transparent;
    font-size: 14px;
    padding: 0 8px;
    outline: none;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    border-radius: 0;
    background-color: #fff0;
    color: #939598;
    padding: 0.7em 2em 0.3em 0.8em;
    font: 500 14px/1 $fnt-cm;
    transition: border-color .15s linear;
    position: relative;
    z-index: 3;
  }
}

.contained-suboptions {
  display: flex;
}
</style>