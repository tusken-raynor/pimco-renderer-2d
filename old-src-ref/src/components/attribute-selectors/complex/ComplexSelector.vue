<template>
  <div
    :class="[
      'complex-selector',
      sanitize(attributeKey),
      sanitize(subAttributeKey),
      { openfull, leatherguide },
    ]"
  >
    <div
      :class="[
        'sub-attributes',
        'fix-scrollbar',
        { 'dont-show': subattributes.length == 1 },
      ]"
      :data-subs="subattributes.length"
      ref="subs"
    >
      <div
        v-for="(subattribute, i) in subattributes"
        :key="subattribute.id"
        :class="['attribute', { selected: subAttrIndex == i }]"
        :data-id="subattribute.id"
        @click="setSubAttribute(i, subattribute)"
      >
        {{ subattribute.nickname || subattribute.name }}
      </div>
    </div>
    <div v-if="!options.length" class="sub-attribute-hint">
      Select an attribute to work on.
    </div>
    <template
      v-for="(optionData, i) in optionLayersUncontained"
      :key="optionData.key"
    >
      <transition name="fade" appear>
        <div
          v-if="optionData.options?.length"
          class="options fix-scrollbar"
          :class="[
            'option-layer-' + (i + 1),
            sanitize(optionData.key),
            optionData.selected ? sanitize(optionData.selected.name) : '',
            optionData.selected
              ? 'type-' + toKebobCase(optionData.selected.type)
              : '',
            {
              closed: !suboptions.length && !openfull,
              hide: options.length && !suboptions.length,
            },
          ]"
          ref="opts"
        >
          <complex-selector-option
            v-for="option in optionData.options"
            :key="option.id"
            :option="option"
            :selected="optionData.selected"
            :select="clickOption"
            :sub-attribute="subAttributeKey"
            @subset="alterSubSelections"
            :on-unselected="(cb) => onUnselection(optionData.key, cb)"
            :casing="optionData.casing"
          />
        </div>
      </transition>
    </template>
    <!-- <div
      :class="[
        'options',
        'fix-scrollbar',
        sanitize(optionKey),
        selectedOption ? sanitize(selectedOption.name) : '',
        selectedOption ? sanitize(selectedOption.type) : '',
        { hide: !options.length },
        options.length ? toKebobCase(options[0].type) : '',
      ]"
      v-if="options"
      ref="opts"
    >
      <complex-selector-option
        v-for="option in options"
        :key="option.id"
        :option="option"
        :selected="selectedOption"
        :select="clickOption"
        :sub-attribute="subAttributeKey"
        @subset="alterSubSelections"
        :on-unselected="(cb) => onUnselection(optionKey, cb)"
        :casing="optionCasing"
      />
    </div>
    <transition name="fade" appear>
      <div
        :class="[
          'suboptions',
          'fix-scrollbar',
          sanitize(subOptionKey),
          selectedSuboption ? sanitize(selectedSuboption.name) : '',
          selectedSuboption ? sanitize(selectedSuboption.type) : '',
          {
            closed: !suboptions.length && !openfull,
            hide: options.length && !suboptions.length,
          },
        ]"
        ref="subopts"
      >
        <complex-selector-option
          v-for="option in suboptions"
          :key="option.id"
          :option="option"
          :selected="selectedSuboption"
          :select="clickSubOption"
          :sub-attribute="subAttributeKey"
          :option-name="selectedOption ? selectedOption.name : ''"
          :sub-option-name="selectedSuboption ? selectedSuboption.name : ''"
          :on-unselected="(cb) => onUnselection(subOptionKey, cb)"
          :sub-option-key="subOptionKey"
          :buckets="bucketList"
          :casing="suboptionCasing"
        />
      </div>
    </transition>
    <transition name="fade" appear>
      <div
        v-if="subsuboptions.length"
        :class="[
          'suboptions',
          'subsuboptions',
          'fix-scrollbar',
          sanitize(subOptionKey),
          selectedSubsuboption ? sanitize(selectedSubsuboption.name) : '',
          selectedSubsuboption ? sanitize(selectedSubsuboption.type) : '',
          {
            closed: !subsuboptions.length && !openfull,
            hide: suboptions.length && !subsuboptions.length,
          },
        ]"
        ref="subsubopts"
      >
        <complex-selector-option
          v-for="option in subsuboptions"
          :key="option.id"
          :option="option"
          :selected="selectedSuboption"
          :select="clickSubOption"
          :sub-attribute="subAttributeKey"
          :option-name="selectedOption ? selectedOption.name : ''"
          :sub-option-name="selectedSuboption ? selectedSuboption.name : ''"
          :on-unselected="(cb) => onUnselection(subOptionKey, cb)"
          :sub-option-key="subOptionKey"
          :buckets="bucketList"
          :casing="suboptionCasing"
        />
      </div>
    </transition> -->
    <leather-guide-button
      v-if="leatherguide"
      :tip="!tippedLeatherGuide"
      :buckets="bucketList"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import {
  ComplexSubAttribute,
  ComplexOption,
  ComplexLabelOption,
} from "@/types";
import { mapState, mapMutations, mapGetters, mapActions } from "vuex";
import ComplexSelectorOption from "./ComplexOption.vue";
import LeatherGuideButton from "../../LeatherGuideButton.vue";
import utils from "@/utils";
import { OptionCasing } from "@/structure";
import { getApplicationValue } from "@/store/mutations";

type OptionData = {
  key: string;
  options: Array<string>;
  default?: string;
  required?: boolean;
  ignore?: boolean;
  pimcocontributer?: boolean;
  wcscope?: string;
  contain?: boolean;
};
type OptionHolder =
  | {
      options?: OptionData;
    }
  | {
      suboptions?: OptionData;
    };

export default defineComponent({
  name: "ComplexSelector",
  props: {
    oaacSetter: Function,
  },
  components: {
    "complex-selector-option": ComplexSelectorOption,
    LeatherGuideButton,
  },
  computed: {
    ...mapState([
      "attributes",
      "selectedOption",
      "currentProduct",
      "currentAttribute",
      "selectedOptions",
      "objectIDMap",
      "tippedLeatherGuide",
    ]),
    ...mapGetters({
      restrictions: "getRestrictions",
      attribute: "getAttribute",
      enablers: "getIndexedEnablers",
    }),
    attributeKey(): string {
      if (this.attribute) {
        return this.attribute.name;
      }
      return "";
    },
    subattributes(): Array<ComplexSubAttribute> {
      if (this.attribute) {
        return this.attribute.attributes
          .map((id: string) => this.objectIDMap[id])
          .filter((o: any) =>
            utils.standardAttributeFilter(o, this.restrictions, this.enablers)
          );
      }
      return [];
    },
    currentSubAttribute(): ComplexSubAttribute | null {
      return this.subattributes[this.subAttrIndex] || null;
    },
    subAttributeKey(): string {
      if (this.currentSubAttribute) {
        return this.currentSubAttribute.name;
      }
      return "";
    },
    optionCasings(): { [key: string]: OptionCasing } {
      if (this.subAttributeKey && this.selectedOptions[this.currentProduct]) {
        const casingHolder = utils.getNested(this.selectedOptions, [
          this.currentProduct,
          "selections",
          this.attributeKey,
          this.subAttributeKey,
        ]);
        if (casingHolder) {
          return casingHolder;
        }
      }
      return {};
    },
    optionLayers(): Array<{
      options: ComplexOption[];
      key: string;
      casing: OptionCasing;
      selected: ComplexOption;
      contain?: boolean;
    }> {
      if (this.currentSubAttribute) {
        const layers: any[] = [];
        let currentOptionHolder: OptionHolder | null = this
          .currentSubAttribute as any;
        let i = 0;
        while (
          i < 10 &&
          currentOptionHolder &&
          ("options" in currentOptionHolder ||
            "suboptions" in currentOptionHolder)
        ) {
          i++;
          let data: OptionData | null = null;
          if ("options" in currentOptionHolder && currentOptionHolder.options) {
            data = currentOptionHolder.options;
          } else if (
            "suboptions" in currentOptionHolder &&
            currentOptionHolder.suboptions
          ) {
            data = currentOptionHolder.suboptions;
          }
          if (data?.options.length) {
            layers.push({
              options: data.options
                .map((id) => this.objectIDMap[id])
                .filter(this.optionFilter),
              key: data.key,
              casing: this.optionCasings[data.key],
              selected: (this.optionCasings[data.key]?.value ||
                null) as ComplexOption,
              contain: data.contain,
            });
          }
          if (data) {
            currentOptionHolder = this.optionCasings[data.key]
              .value as ComplexOption;
          } else {
            currentOptionHolder = null;
          }
        }
        return layers;
      }
      return [];
    },
    optionLayersUncontained(): Array<{
      options: ComplexOption[];
      key: string;
      casing: OptionCasing;
      selected: ComplexOption;
      contain?: boolean;
    }> {
      // Only return the list of optionsData up to the first contain protocal
      const containIdx = (this.optionLayers as any).findIndex(
        (x: any) => x.contain
      );
      if (containIdx > -1) {
        return (this.optionLayers as any).splice(0, containIdx);
      }
      return this.optionLayers;
    },
    currentOptions(): { [key: string]: ComplexOption | null } {
      return utils.mapObject(this.optionCasings as any, (c: any) => c.value);
    },
    unfilteredOptions(): Array<ComplexOption> {
      if (this.currentSubAttribute) {
        let g: Array<any> = this.currentSubAttribute.options.options;
        g = g.map((id) => this.objectIDMap[id]);
        return g;
      }
      return [];
    },
    options(): Array<ComplexOption> {
      if (this.currentSubAttribute) {
        return this.currentSubAttribute.options.options
          .map((id) => this.objectIDMap[id])
          .filter(this.optionFilter);
      }
      return [];
    },
    suboptions(): Array<ComplexOption> {
      if (
        this.selectedOption &&
        "suboptions" in this.selectedOption &&
        this.selectedOption.suboptions
      ) {
        return this.selectedOption.suboptions.options
          .map((id) => this.objectIDMap[id])
          .filter(this.optionFilter);
      }
      return [];
    },
    subsuboptions(): Array<ComplexOption> {
      if (
        this.selectedSuboption &&
        "suboptions" in this.selectedSuboption &&
        this.selectedSuboption.suboptions &&
        this.selectedSuboption.type !== "ComplexLeatherOption"
      ) {
        return this.selectedSuboption.suboptions.options
          .map((id) => this.objectIDMap[id])
          .filter(this.optionFilter);
      }
      return [];
    },
    optionCasing(): OptionCasing | null {
      if (
        this.subAttributeKey &&
        this.selectedOptions[this.currentProduct] &&
        this.optionKey
      ) {
        return (
          utils.getNested(this.selectedOptions, [
            this.currentProduct,
            "selections",
            this.attributeKey,
            this.subAttributeKey,
            this.optionKey,
          ]) || null
        );
      }
      return null;
    },
    selectedOptionLiteral(): ComplexOption | null {
      if (this.optionCasing) {
        return (this.optionCasing.value as ComplexOption) || null;
      }
      return null;
    },
    selectedOption(): ComplexOption | null {
      if (this.selectedOptionLiteral) {
        if (
          this.selectedOptionLiteral.type == "ComplexLabelOption" &&
          this.selectedOptionLiteral.subtype == "bucket" &&
          this.bucket &&
          this.unfilteredOptions.includes(this.bucket)
        ) {
          return this.bucket;
        }
        return this.selectedOptionLiteral;
      }
      return null;
    },
    suboptionCasing(): OptionCasing | null {
      if (
        this.subAttributeKey &&
        this.selectedOptions[this.currentProduct] &&
        this.subOptionKey
      ) {
        return (
          utils.getNested(this.selectedOptions, [
            this.currentProduct,
            "selections",
            this.attributeKey,
            this.subAttributeKey,
            this.subOptionKey,
          ]) || null
        );
      }
      return null;
    },
    // Left off
    subsuboptionCasing(): OptionCasing | null {
      if (
        this.subAttributeKey &&
        this.selectedOptions[this.currentProduct] &&
        this.subOptionKey
      ) {
        return (
          utils.getNested(this.selectedOptions, [
            this.currentProduct,
            "selections",
            this.attributeKey,
            this.subAttributeKey,
            this.subOptionKey,
          ]) || null
        );
      }
      return null;
    },
    selectedSuboption(): ComplexOption | null {
      if (this.suboptionCasing) {
        return (this.suboptionCasing.value as ComplexOption) || null;
      }
      return null;
    },
    selectedSubsuboption(): ComplexOption | null {
      if (this.suboptionCasing) {
        return (this.suboptionCasing.value as ComplexOption) || null;
      }
      return null;
    },
    optionKey(): string {
      if (this.currentSubAttribute) {
        return this.currentSubAttribute.options.key;
      }
      return "";
    },
    subOptionKey(): string {
      if (
        this.selectedOption &&
        "suboptions" in this.selectedOption &&
        this.selectedOption.suboptions
      ) {
        return this.selectedOption.suboptions.key;
      }
      return "";
    },
    specialKey(): string {
      if (this.selectedSuboption) {
        return this.getSuboptionsKey(this.selectedSuboption);
      }
      return "";
    },
    specialCasing(): OptionCasing | null {
      if (
        this.specialKey &&
        this.subAttributeKey &&
        this.selectedOptions[this.currentProduct]
      ) {
        return (
          utils.getNested(this.selectedOptions, [
            this.currentProduct,
            "selections",
            this.attributeKey,
            this.subAttributeKey,
            this.specialKey,
          ]) || null
        );
      }
      return null;
    },
    specialOption(): ComplexOption | null {
      if (this.specialCasing) {
        return (this.specialCasing.value as ComplexOption) || null;
      }
      return null;
    },
    leatherguide(): boolean {
      return Boolean(
        this.currentSubAttribute && this.currentSubAttribute.leatherguide
      );
    },
    bucketList(): Array<string> {
      if (this.currentSubAttribute && this.currentSubAttribute.options) {
        return this.currentSubAttribute.options.options;
      }
      return [];
    },
    leatherList(): Array<{ leather: string; bucket: string }> {
      const leathers: any[] = [];
      if (this.options) {
        for (let i = 0; i < this.options.length; i++) {
          const option = this.options[i];
          if (option.suboptions) {
            const subs = option.suboptions.options;
            for (let j = 0; j < option.suboptions.options.length; j++) {
              const subopt: ComplexOption | undefined =
                this.objectIDMap[subs[j]];
              if (subopt && subopt.type === "ComplexLeatherOption") {
                leathers.push({ leather: subopt.id, bucket: option.id });
              }
            }
          }
        }
      }
      return leathers;
    },
  },
  data() {
    return {
      subAttrIndex: -1,
      openfull: false,
      preventPresentation: false,
    };
  },
  methods: {
    ...mapMutations([
      "setSelectedNestedOption",
      "setStandardPopup",
      "setLeatherGuideLeathers",
      "setNestedOptionInteraction",
      "setProductView",
    ]),
    ...mapActions(["onDataStepComplete"]),
    setSubAttribute(index: number, attribute: ComplexSubAttribute) {
      // Check to see if our selected option is a complex bucket option in bucket mode, but it's not the global bucket
      const isBucketButNotTheeBucket =
        this.selectedOption &&
        this.bucket !== this.selectedOption &&
        this.selectedOption.type == "ComplexLabelOption" &&
        this.selectedOption.subtype == "bucket";

      this.subAttrIndex = index;
      if (attribute.notify) {
        this.setStandardPopup(attribute.notify);
      }
      if ("viewset" in attribute && attribute.viewset !== undefined) {
        const viewset = getApplicationValue(utils.unpackViewset(attribute.viewset), this.$store.state);
        if (viewset !== null) {
          this.setProductView({view: viewset, asIndex: false});
        }
      }
      this.interactionTimer = setTimeout(this.setUserInteraction, 800);
      // Now deal with bucket recongifuration real quick
      // So basically if we just came from a region where the global bucket
      // Did not exist, and then we go to a region where the global bucket
      // Does exist, but there is no selection within the global bucket for
      // This region, then just go to the selected bucket for that region's
      // leather selection
      if (
        isBucketButNotTheeBucket &&
        this.bucket &&
        this.selectedSuboption &&
        !this.bucket.suboptions?.options.includes(this.selectedSuboption.id)
      ) {
        const bucketWithSelection = this.selectedOptionLiteral;
        if (
          bucketWithSelection &&
          bucketWithSelection.type == "ComplexLabelOption" &&
          bucketWithSelection.subtype == "bucket"
        ) {
          this.bucket = bucketWithSelection;
        } else {
          this.bucket = null;
        }
      }
    },
    setSelectedOption(option: ComplexOption | null, key: string) {
      this.setSelectedNestedOption({
        attribute: this.attributeKey,
        subattribute: this.subAttributeKey,
        section: key,
        value: option,
        type: "complex",
      });
    },
    setDefaultOption() {
      if (
        this.currentSubAttribute &&
        this.currentSubAttribute.options.default
      ) {
        const option =
          this.objectIDMap[this.currentSubAttribute.options.default];
        if (option) {
          this.setSelectedOption(option, this.optionKey);
        }
      }
    },
    setDefaultSubOption() {
      if (
        this.selectedOption &&
        "suboptions" in this.selectedOption &&
        this.selectedOption.suboptions &&
        "default" in this.selectedOption.suboptions &&
        this.selectedOption.suboptions.default
      ) {
        const option = this.objectIDMap[this.selectedOption.suboptions.default];
        if (option) {
          this.setSelectedOption(option, this.subOptionKey);
        }
      }
    },
    checkOpeness() {
      // Check to see if third row of options has been opened
      // If ther's only one sub attribute, just set openfull to true automatically
      if (this.subattributes.length == 1) {
        this.openfull = true;
        this.preventPresentation = true;
        this.setSubAttribute(0, this.subattributes[0]);
        requestAnimationFrame(() => {
          this.preventPresentation = false;
        });
        return;
      }
      // Check to see if third row of options has been opened
      const attr = utils.getNested(this.selectedOptions, [
        this.currentProduct,
        "selections",
        this.attributeKey,
      ]);
      if (attr) {
        let count = 0;
        for (const key in attr) {
          if (attr.hasOwnProperty(key) && key !== "x-data") {
            const element = attr[key];
            const keys = Object.keys(element);
            for (let i = 0; i < keys.length; i++) {
              const key = keys[i];
              if (key !== "x-data" && element[key].value !== null) {
                this.openfull = true;
                this.preventPresentation = true;
                this.setSubAttribute(count, this.subattributes[count]);
                requestAnimationFrame(() => {
                  this.preventPresentation = false;
                });
                break;
              }
            }
            if (this.openfull) {
              break;
            }
          }
          count++;
        }
      }
    },
    selectOption(option: ComplexOption | null, optionData: OptionData) {
      // Tracker code here
      if (option !== this.selectedOption) {
        if (
          !this.openfull &&
          option &&
          "suboptions" in option &&
          option.suboptions
        ) {
          this.openfull = true;
        }
        // If the option is a 'bucket' then leave the suboption just below selected from the
        // previous option if the previous option is a 'bucket' as well.
        // If the option switches but the new option also has the same suboption
        // listed, keep it selected.
        // If the suboption selection can't be retained and the new option has a
        // default defined, set the default for the suboption
        // If none of the above work out, set the suboption selection to null.
        const prevKey = this.subOptionKey;
        const leKey = optionData.key;
        requestAnimationFrame(() => {
          // If we are dealing with buckets
          if (option && "subtype" in option && option.subtype == "bucket") {
            this.bucket = option;
            return;
          }
          this.setSelectedOption(option, leKey);
          // We need to make sure the suboption is an option of the selected option
          const checkOption = option || this.selectedOption;
          if (!(checkOption && checkOption.suboptions)) {
            this.setSelectedOption(null, this.subOptionKey);
          } else if (
            !this.selectedSuboption ||
            !checkOption.suboptions.options.includes(this.selectedSuboption.id)
          ) {
            const dfltID =
              checkOption.suboptions.default ||
              checkOption.suboptions.options[0];
            const sub = this.objectIDMap[dfltID] || null;
            this.setSelectedOption(sub, this.subOptionKey);
          }
          // If we dropped a previously used suboption, set it's casing value to null
          if (prevKey !== this.subOptionKey && !this.subOptionKey) {
            this.setSelectedOption(null, prevKey);
          }
        });
      }
    },
    clickOption(option: ComplexOption | null, key?: string) {
      key = key === undefined ? this.optionKey : key;
      // This is to add another layer so we can keep track of if the user interacted with the options

      // Tracker code here
      if (option !== this.selectedOption) {
        if (
          !this.openfull &&
          option &&
          "suboptions" in option &&
          option.suboptions
        ) {
          this.openfull = true;
        }
        // If the option is a 'bucket' then leave the suboption selected from the
        // previous option if it is a 'bucket' as well.
        // If the option switches but the new option also has the same suboption
        // listed, keep it selected.
        // If the suboption selection can't be retained and the new option has a
        // default defined, set the default for the suboption
        // If none of the above work out, set the suboption selection to null.
        const previousOpt = this.selectedOption;
        const previousSub = this.selectedSuboption;
        const prevSpecial = this.specialOption;
        const prevKey = this.subOptionKey;
        const leKey = key;
        requestAnimationFrame(() => {
          // If we are dealing with buckets
          if (option && "subtype" in option && option.subtype == "bucket") {
            this.bucket = option;
            return;
          }
          this.setSelectedOption(option, leKey);
          // We need to make sure the suboption is an option of the selected option
          const checkOption = option || this.selectedOption;
          if (!(checkOption && checkOption.suboptions)) {
            this.setSelectedOption(null, this.subOptionKey);
          } else if (
            !this.selectedSuboption ||
            !checkOption.suboptions.options.includes(this.selectedSuboption.id)
          ) {
            const dfltID =
              checkOption.suboptions.default ||
              checkOption.suboptions.options[0];
            const sub = this.objectIDMap[dfltID] || null;
            this.setSelectedOption(sub, this.subOptionKey);
          }
          // If we dropped a previously used suboption, set it's casing value to null
          if (prevKey !== this.subOptionKey && !this.subOptionKey) {
            this.setSelectedOption(null, prevKey);
          }

          // Keep this code around just in case
          // if (
          //   previousOpt &&
          //   "bucket" in previousOpt &&
          //   previousOpt.bucket &&
          //   "bucket" in option &&
          //   option.bucket
          // ) {
          //   // I guess do nothing with the current selection
          // }
          // // If the selected suboption is a suboption of the newly selected option
          // else if (previousSub && this.suboptions.includes(previousSub)) {
          //   // Wait another frame for special option
          //   requestAnimationFrame(() => {
          //     if (prevSpecial && this.selectedSuboption) {
          //       const specialOptions = this.selectedSuboption.suboptions
          //         ? this.selectedSuboption.suboptions.options
          //         : null;
          //       if (
          //         (specialOptions &&
          //           !specialOptions.includes(prevSpecial.id)) ||
          //         !specialOptions
          //       ) {
          //         const specialKey = this.getSuboptionsKey(previousSub);
          //         if (specialKey) {
          //           this.setSelectedOption(null, specialKey);
          //         }
          //       }
          //     } else {
          //       // Just automatically remove it
          //       const specialKey = this.getSuboptionsKey(previousSub);
          //       if (specialKey) {
          //         this.setSelectedOption(null, specialKey);
          //       }
          //     }
          //   });
          // }
          // // If a default is defined
          // else if (
          //   this.selectedOption?.suboptions?.default &&
          //   this.selectedOption.suboptions.options.includes(
          //     this.selectedOption.suboptions.default
          //   ) &&
          //   this.objectIDMap[this.selectedOption.suboptions.default]
          // ) {
          //   this.setSelectedOption(
          //     this.objectIDMap[this.selectedOption.suboptions.default],
          //     prevKey
          //   );
          // }
          // // If all else fails, set to null
          // else {
          //   this.setSelectedOption(option, prevKey);
          // }
        });
        // this.setSelectedOption(option, key);
      }
    },
    clickSubOption(option: ComplexOption, key?: string) {
      key = key === undefined ? this.subOptionKey : key;
      // Tracker code here
      if (option !== this.selectedSuboption) {
        this.setSelectedOption(option, key);
      }
      // Set the bucket to whatever the global bucket is when a selection is made
      if (
        this.bucket == this.selectedOption &&
        this.selectedOption &&
        this.selectedOption.type == "ComplexLabelOption" &&
        this.selectedOption.subtype == "bucket"
      ) {
        this.setSelectedOption(this.bucket, this.optionKey);
      }
    },
    getSuboptionsKey(option: ComplexOption): string {
      if (
        option instanceof Object &&
        "suboptions" in option &&
        option.suboptions
      ) {
        return option.suboptions.key;
      }
      return "";
    },
    sanitize(subject: string): string {
      return utils.sanitize(subject);
    },
    toKebobCase(subject: string) {
      return utils.toKebobCase(subject);
    },
    alterSubSelections(
      commands: Array<{ key: string; value: ComplexOption | null }>
    ) {
      commands.forEach((command) => {
        this.setSelectedOption(command.value, command.key);
      });
    },
    presentSubAttributes() {
      if (this.subs) {
        utils.scrollPresent(this.subs, 25, 300);
      }
    },
    presentOptions() {
      if (this.opts) {
        utils.scrollPresent(this.opts, 10, 300);
      }
    },
    presentSubOptions() {
      if (this.subopts) {
        utils.scrollPresent(this.subopts, 10, 300);
      }
    },
    optionFilter(o: ComplexOption | null) {
      return utils.standardOptionFilter(
        o,
        [
          this.currentProduct,
          "selections",
          this.attributeKey,
          this.subAttributeKey,
          this.selectedOption ? this.selectedOption.name : "",
          this.selectedSuboption ? this.selectedSuboption.name : "",
        ],
        this.restrictions,
        this.enablers
      );
    },
    setUserInteraction() {
      // Set the user interaction to true for the current options
      if (this.selectedOption) {
        this.setNestedOptionInteraction({
          attribute: this.attributeKey,
          subattribute: this.subAttributeKey,
          section: this.optionKey,
        });
      }
      if (this.selectedSuboption) {
        this.setNestedOptionInteraction({
          attribute: this.attributeKey,
          subattribute: this.subAttributeKey,
          section: this.subOptionKey,
        });
      }
    },
    onUnselection(key: string, callback: Function) {
      if (
        this.subAttributeKey &&
        this.selectedOptions[this.currentProduct] &&
        this.subOptionKey
      ) {
        const casing = utils.getNested(this.selectedOptions, [
          this.currentProduct,
          "selections",
          this.attributeKey,
          this.subAttributeKey,
          key,
        ]) as OptionCasing | undefined;
        if (casing) {
          casing.onValueChange(callback as any);
        }
      }
    },
  },
  setup() {
    const subs: Ref<HTMLElement | null> = ref(null);
    const opts: Ref<HTMLElement | null> = ref(null);
    const subopts: Ref<HTMLElement | null> = ref(null);
    const interactionTimer: Ref<any> = ref(-1);
    const bucket: Ref<ComplexLabelOption | null> = ref(null);
    return { subs, opts, subopts, interactionTimer, bucket };
  },
  watch: {
    subAttrIndex(value, prevValue) {
      if (value > -1 && prevValue == -1) {
        this.presentOptions();
      }
    },
    selectedOption(value, prevValue) {
      if (value !== null && prevValue == null) {
        this.presentSubOptions();
      }
    },
    leatherList(value) {
      this.setLeatherGuideLeathers(value);
    },
  },
  mounted() {
    this.onDataStepComplete({
      id: "objects",
      callback: this.checkOpeness,
    });
    this.presentSubAttributes();
    requestAnimationFrame(() => {
      // Let's just wait one frame
      this.interactionTimer = setTimeout(this.setUserInteraction, 800);
    });
    // Set the function which gets called when the step arrows get clicked
    // When the function get called a function will be passed into it that
    // if called will prevent the app from going to the next step
    // This will be used to change the sub attributes by using the arrow
    // buttons that normally change the attribute
    if (this.oaacSetter) {
      this.oaacSetter((cancelDefault: Function, payload: string) => {
        this.subattributes;
        this.subAttrIndex;
        let subEl: Element | null = null;
        if (
          payload === "next" &&
          this.subattributes &&
          this.subAttrIndex < this.subattributes.length - 1
        ) {
          cancelDefault();
          const index = this.subAttrIndex + 1;
          subEl = this.subs ? this.subs.children[index] : null;
          this.setSubAttribute(index, this.subattributes[index]);
        } else if (payload === "previous" && this.subAttrIndex > 0) {
          cancelDefault();
          const index = this.subAttrIndex - 1;
          subEl = this.subs ? this.subs.children[index] : null;
          this.setSubAttribute(index, this.subattributes[index]);
        }
        if (subEl && this.subs) {
          const rect = subEl.getBoundingClientRect();
          utils.smoothScroll(
            {
              left: rect.left + rect.width / 2 - innerWidth / 2 + this.subs.scrollLeft,
              top: 0
            },
            350,
            this.subs
          );
        }
      });
    }
  },
  beforeUnmount() {
    this.setLeatherGuideLeathers();
    // Clear the interaction timer if the user moved away too fast
    if (this.interactionTimer > -1) {
      clearTimeout(this.interactionTimer);
      this.interactionTimer = -1;
    }
  },
});
</script>

<style lang="scss" scoped>
.complex-selector {
  transition: height 0.2s ease;
  background-color: #f5f5f5;
  .options {
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    height: 55px;
    background-color: #fff;
    transition: height 0.2s ease, opacity 0.2s linear;
    &.hide {
      opacity: 0;
      height: 0 !important;
      .transitioning & {
        transition: none;
      }
    }
    &.type-complex-uploader-option {
      height: 90px;
    }
  }
  &.openfull {
    .type-complex-label-option,
    .type-complex-bucket-option {
      &:not(.hide) {
        @media (min-width: $large-width-up) {
          height: 40px;
        }
      }
    }
    &.leather.binding,
    &.leather.piping,
    &.leather.base,
    &.web.web_style {
      .option-layer-1 {
        height: 110px;
        transition: none;
        @media (min-width: $large-width-up) {
          height: 130px;
          align-items: flex-start;
          .complex-option {
            height: 96px;
          }
        }
      }
      // .option-layer-2 {
      //   height: 0 !important;
      //   transition: none;
      // }
    }
    &.logo.palm {
      .option-layer-1 {
        height: 110px;
        transition: none;
        @media (min-width: $large-width-up) {
          height: 95px;
          align-items: flex-start;
          .complex-option {
            height: 96px;
          }
        }
      }
      .option-layer-2 {
        height: 0 !important;
        transition: none;
      }
    }
  }
  &.leather.binding,
  &.leather.piping,
  &.leather.base,
  &.web.web_style {
    .option-layer-1 {
      border-bottom: none;
    }
  }
  &.leather.binding,
  &.leather.piping,
  &.leather.base {
    .suboptions.hide {
      transition: none;
    }
    .suboptions.closed {
      height: 0;
    }
  }
  &.web.web_style,
  &.web.web_style.openfull {
    .options:not(.hide) {
      border-bottom: none;
      height: 110px;

      @media (min-width: $large-width-up) {
        .complex-option {
          height: 98px;
        }
      }
    }
  }
  &.web.web_style.openfull .options.numbers_initials {
    border-bottom: 1px solid $orange;
  }
  &.liner_leather .option-layer-2 {
    height: 110px;
  }
  &.openfull {
    background-color: #fff;
    @media (min-width: $large-width-up) {
      .type-complex-leather-option {
        height: 90px;
        align-items: flex-start;
      }
      &.laces .suboptions .complex-option {
        height: 55px;
      }
    }
  }
  .sub-attributes {
    background-color: #000;
    display: flex;
    align-items: center;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    height: 55px;
    transition: height 0.2s ease;
    .attribute {
      padding: 15px 18px;
      transition: color 0.2s linear, opacity 0.2s linear;
      cursor: pointer;
      user-select: none;
      position: relative;
      color: #fff;
      white-space: nowrap;
      font: 600 21px/120% $fnt-cm;
      letter-spacing: -0.025em;
      &::after {
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
      &.selected {
        color: $orange;
        &::after {
          transform: translateX(-50%) scaleY(1);
        }
      }
      @media (min-width: $small-width-up) {
        &:hover {
          color: $orange;
        }
      }
    }
    &.dont-show {
      height: 0;
      .attribute {
        opacity: 0;
      }
    }
  }
  .sub-attribute-hint {
    position: absolute;
    left: 8px;
    bottom: 17px;
  }
  &.leatherguide {
    position: relative;
    .option-layer-1 {
      margin-left: 64px;
    }
    .leather-guide-btn {
      position: absolute;
      left: 0;
      bottom: 0px;
      border-bottom: 1px solid #000;
      transition: all 0.2s ease;
    }
    &.openfull {
      .leather-guide-btn {
        bottom: 55px;
        @media (min-width: $large-width-up) {
          bottom: 54px;
        }
      }
      @media (min-width: $large-width-up) {
        .leather-guide-btn {
          bottom: 0;
          border: none;
          width: 110px;
          height: 96px;
        }
        .option-layer-1 {
          margin-left: 110px;
        }
        .option-layer-2 {
          margin-left: 110px;
        }
      }
    }
  }
  @media (min-width: $large-width-up) {
    &.leather.leatherguide.openfull .leather-guide-btn {
      bottom: 35px;
    }
  }
}
.option-layer-1 {
  border-bottom: 1px solid $orange;
  .sub-attributes.dont-show + &.type-complex-dark-label-option {
    height: 53px;
    background-color: #000;
    border-bottom: none;
  }
}
.fade-enter-to,
.fade-leave-to {
  transition: opacity 0.17s linear;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

<style lang="scss">
.complex-selector.logo.palm .option-layer-1 {
  .complex-swatch-option {
    .swatch-image {
      height: 100%;
      padding: 15px;
      box-sizing: border-box;
      margin: 0;
      img.imaujee {
        margin: 0;
        display: block;
        height: 100%;
      }
    }
    &::after {
      border-color: transparent transparent $orange transparent;
    }
  }
}
</style>