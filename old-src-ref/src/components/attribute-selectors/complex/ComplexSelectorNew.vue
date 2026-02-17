<template>
  <div
    :class="['complex-selector', sanitize(attributeKey), sanitize(subAttributeKey), { openfull, leatherguide }]"
    ref="selector"
  >
    <div
      :class="[
        'sub-attributes',
        'fix-scrollbar',
        {
          'dont-show': subattributes.length == 1 && !subattributes.some((a) => a.virtual || a['vtemplate']),
          'sub-transition': subTransition,
        },
      ]"
      :data-subs="subattributes.length"
      ref="subs"
    >
      <template
        v-for="(subattribute, i) in subattributes"
        :key="subattribute['vtemplate'] ? subattribute.name : subattribute.id"
      >
        <div
          v-if="!subattribute['virtual']"
          :class="[
            'attribute',
            { selected: subAttrIndex == i, virtual: !!subattribute['vtemplate'], 'has-info': !!subattribute.info },
          ]"
          :data-id="subattribute.id"
          :data-name="subattribute.name"
          :data-sub-attr-entry-index="i"
          :data-sub-attr-entry-id="subattribute.id"
          :data-sub-attr-entry-current="subAttrIndex == i || undefined"
          @click="setSubAttribute(i)"
        >
          <span class="name" v-html="subattribute.nickname || subattribute.name"></span>
          <div
            v-if="subattribute['vtemplate']"
            class="remove-virtual x-pattern"
            @click.stop="removeVirtualAttribute(subattribute.name)"
            :title="subattribute['removeVirtualLabel'] || 'Remove this step'"
          ></div>
          <div v-if="subattribute.info" class="sub-info" @click.stop="setStandardPopup(subattribute.info)"></div>
        </div>
        <div
          v-if="subattribute['virtual'] || (subattribute['vtemplate'] && !subattributes[i + 1]?.['vtemplate'])"
          class="add-virtual"
          v-html="subattribute['virtual']?.['addlabel'] || subattribute['addVirtualLabel'] || '+add'"
          @click="createVirtualAttribute(subattribute['vtemplate'] || subattribute.name)"
        ></div>
      </template>
    </div>
    <div v-if="!optionLayers.length" class="sub-attribute-hint">
      <div
        v-html="
          attribute.hint ||
          (currentSubAttribute?.virtual ? 'Please add an item to work on.' : 'Select an attribute to work on.')
        "
      ></div>
    </div>
    <!-- <transition-group name="fade" appear> -->
    <div
      v-for="(optionData, i) in optionLayersFiltered"
      :key="optionData.key"
      class="options fix-scrollbar"
      :class="[
        'option-layer-' + (i + 1),
        optionClasses(optionData),
        {
          closed: !openfull,
        },
      ]"
      ref="opts"
    >
      <complex-selector-option
        v-for="(option, index) in optionData.options"
        :key="option.id"
        :index="index"
        :option="option"
        :selected="optionData.selected || undefined"
        :select="(o, k) => selectOption(o, k ? k : optionData.key)"
        :sub-attribute="subAttributeKey"
        @subset="alterSubSelections"
        :on-unselected="(cb, p) => onUnselection(optionData.key, cb, p)"
        :casing="optionData.casing"
        :nextOption="optionData.options[index + 1] || null"
        :data-name="option.name"
      />
    </div>
    <div class="option-layers-after"></div>
    <!-- </transition-group> -->
    <leather-guide-button v-if="leatherguide" :tip="!tippedLeatherGuide" :buckets="bucketList" />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import { ComplexSubAttribute, ComplexOption, ComplexLabelOption, ComplexColorsOption, Option } from "@/types";
import { mapState, mapMutations, mapGetters, mapActions } from "vuex";
import ComplexSelectorOption from "./ComplexOption.vue";
import LeatherGuideButton from "../../LeatherGuideButton.vue";
import utils from "@/utils";
import structure, { OptionCasing } from "@/structure";
import { getApplicationValue } from "@/store/mutations";
import { title } from "process";

type OptionData = {
  key: string;
  options: Array<string>;
  default?: string;
  required?: boolean;
  ignore?: boolean;
  permanent?: boolean;
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
type OptionLayer = {
  options: ComplexOption[];
  key: string;
  casing: OptionCasing;
  selected: ComplexOption | null;
  contain?: boolean;
  default?: number | boolean | string | [string | number | boolean, ...(string | number | boolean)[]];
  parallel?: boolean;
  required?: boolean;
  permanent?: boolean;
};
type HolderXData = {
  id: string;
  disabled?: boolean;
  attributes: Array<{ id: string; disabled?: boolean }>;
  virtual?: string;
  virtualOrder?: number;
  viewing?: boolean;
};

export default defineComponent({
  name: "ComplexSelector",
  props: {
    oaacSetter: Function,
  },
  components: {
    ComplexSelectorOption,
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
      if (this.attribute?.attributes) {
        return structure.handleVirtualAttributes<ComplexSubAttribute>(
          this.attribute.attributes
            .map((id: string) => this.objectIDMap[id])
            .filter((o: any) => utils.standardAttributeFilter(o, this.restrictions, this.enablers)),
          [this.attribute.name],
          this.selectedOptions[this.currentProduct]?.selections || {}
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
          return utils.filterObject(casingHolder, (v, key) => key != "x-data");
        }
      }
      return {};
    },
    subAttributeXData(): HolderXData | null {
      if (this.subAttributeKey && this.selectedOptions[this.currentProduct]) {
        const casingHolder = utils.getNested(this.selectedOptions, [
          this.currentProduct,
          "selections",
          this.attributeKey,
          this.subAttributeKey,
        ]);
        if (casingHolder?.["x-data"]) {
          return casingHolder["x-data"];
        }
      }
      return null;
    },
    optionLayers(): OptionLayer[] {
      const layers: OptionLayer[] = [];
      if (this.currentSubAttribute && !this.currentSubAttribute.virtual) {
        let data: OptionData | null = this.currentSubAttribute.options as any;
        let pData: {
          parent: OptionHolder & { id: string };
        } | null = null as any;
        const parallelDataQueue: any[] = [];
        while (data || pData) {
          if (data) {
            const casing = utils.getNested(this.selectedOptions, [
              this.currentProduct,
              "selections",
              this.attributeKey,
              this.subAttributeKey,
              data.key,
            ]) as OptionCasing<ComplexOption | null>;
            if (casing) {
              layers.push({
                key: data.key,
                options: data.options.map((x) => this.objectIDMap[x]).filter(this.optionFilter),
                casing,
                selected: casing.value,
                contain: data.contain,
                default: data.default,
                parallel: !!pData,
                required: data.required === undefined ? true : data.required,
                permanent: data.permanent === undefined ? true : data.permanent,
              });
              data = casing.value?.["suboptions"] || null;
              if (casing.value && ("comrades" in casing.value || "source" in casing.value)) {
                parallelDataQueue.push(...this.getParallelData(casing.value));
              }
              if (!data) {
                pData = parallelDataQueue.shift() || null;
              }
            }
          } else if (pData) {
            if ("options" in pData.parent && pData.parent.options) {
              data = pData.parent.options;
            } else if ("suboptions" in pData.parent && pData.parent.suboptions) {
              data = pData.parent.suboptions;
            }
          }
        }
      }
      return layers;
    },
    optionLayersFiltered(): OptionLayer[] {
      const arr = this.optionLayers.filter((x) => !x.parallel);
      return arr.filter((x) => !x.contain);
    },
    currentOptions(): { [key: string]: ComplexOption | null } {
      return utils.mapObject(this.optionCasings as any, (c: any) => c.value);
    },
    clearCasingData() {
      const layers: (OptionLayer & { parentOption: false | ComplexOption })[] = [];
      for (let i = 0; i < this.optionLayers.length; i++) {
        const layer = this.optionLayers[i];
        const prevLayer = this.optionLayers[i - 1];
        layers.push({ ...layer, parentOption: prevLayer?.selected || false });
      }
      return {
        attr: this.currentAttribute,
        subattr: (this as any).subAttrIndex as number,
        layers,
      };
    },
    leatherguide(): boolean {
      return Boolean(this.currentSubAttribute && this.currentSubAttribute.leatherguide);
    },
    bucketList(): Array<string> {
      if (this.currentSubAttribute && this.currentSubAttribute.options) {
        return this.currentSubAttribute.options.options;
      }
      return [];
    },
    leatherList(): Array<{ leather: string; bucket: string }> {
      const leathers: any[] = [];
      let options = this.optionLayers.find(
        (d) =>
          d.key == "Bucket" || (d.options?.[0]?.type == "ComplexLabelOption" && d.options?.[0]?.subtype == "bucket")
      )?.options;
      if (options) {
        for (let i = 0; i < options.length; i++) {
          const option = options[i];
          if ("suboptions" in option && option.suboptions) {
            const subs = option.suboptions.options;
            for (let j = 0; j < option.suboptions.options.length; j++) {
              const subopt: ComplexOption | undefined = this.objectIDMap[subs[j]];
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
      openfull: true,
      preventPresentation: false,
      subXData: null as HolderXData | null,
    };
  },
  methods: {
    ...mapMutations([
      "setSelectedNestedOption",
      "setStandardPopup",
      "setSpecialPopup",
      "setLeatherGuideLeathers",
      "setNestedOptionInteraction",
      "setProductView",
      "setStageHijacker",
      "setStageHijackerPath",
    ]),
    ...mapActions(["storeData", "onDataStepComplete"]),
    setSubAttribute(index: number) {
      const attribute = this.subattributes[index];
      if (!attribute) return;
      this.subAttrIndex = index;
      if (attribute.notify) {
        this.setStandardPopup(attribute.notify);
      }
      if ("viewset" in attribute && attribute.viewset !== undefined) {
        const viewset = getApplicationValue(utils.unpackViewset(attribute.viewset), this.$store.state);
        if (viewset !== null) {
          this.setProductView({ view: viewset, asIndex: false });
        }
      }
      // Set the hijack data in the store
      if (attribute.hijack) {
        this.setStageHijacker(attribute.hijack);
        this.setStageHijackerPath([this.currentProduct, "selections", this.attributeKey, this.subAttributeKey]);
      } else {
        this.setStageHijacker(null);
        this.setStageHijackerPath(null);
      }
      // If the user hangs out on this step for 800 miliseconds or
      // longer, then mark it as having been interacted with
      this.interactionTimer = setTimeout(this.setUserInteraction, 800);
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
    checkOpeness() {
      if (this.openfull) {
        this.setSubAttribute(0);
        return;
      }
      // Check to see if third row of options has been opened
      // If there's only one sub attribute, just set openfull to true automatically
      if (this.subattributes.length == 1) {
        this.openfull = true;
        this.preventPresentation = true;
        this.setSubAttribute(0);
        requestAnimationFrame(() => {
          this.preventPresentation = false;
        });
        return;
      }
      // Check to see if third row of options has been opened
      const attr = utils.getNested(this.selectedOptions, [this.currentProduct, "selections", this.attributeKey]);
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
                this.setSubAttribute(count);
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
    selectOption(option: ComplexOption | null, key: string) {
      const optionData = this.optionLayers.find((x) => x.key == key);
      if (optionData) {
        this.setSelectedOption(option, optionData.key);
      }
    },
    createVirtualAttribute(name: string) {
      if (!this.selectedOptions[this.currentProduct]?.selections) return;
      const newName = structure.createVirtualBranchGroup(
        [this.attribute.name, name],
        this.selectedOptions[this.currentProduct].selections
      );
      if (!newName) {
        console.warn("Failed to create virtual attribute from template:", name);
      }
      // Wait till the next frame to select the new virtual attribute
      requestAnimationFrame(() => {
        this.setSubAttribute(this.subattributes.findIndex((x) => x.name == newName));

        this.storeData();
      });
    },
    removeVirtualAttribute(name: string) {
      if (!this.selectedOptions[this.currentProduct]?.selections) return;
      const selections = this.selectedOptions[this.currentProduct].selections;
      this.setSpecialPopup({
        title: "Remove?",
        message: `Are you sure you want to remove "<strong>${name}</strong>" and all its selections?`,
        confirm: {
          label: "Yes, Remove",
          callback: () => {
            structure.removeVirtualBranchGroup([this.attribute.name, name], selections);
            // Wait till the next frame to select the new virtual attribute
            requestAnimationFrame(() => {
              this.setSubAttribute(this.subattributes.findIndex((x) => x.name == name) - 1);
              this.storeData();
            });
          },
        },
        cancel: { label: "Cancel" },
      });
    },
    // selectOption(option: ComplexOption | null, optionData: OptionData) {
    //   // Tracker code here
    //   if (option !== this.selectedOption) {
    //     if (
    //       !this.openfull &&
    //       option &&
    //       "suboptions" in option &&
    //       option.suboptions
    //     ) {
    //       this.openfull = true;
    //     }
    //     // If the option is a 'bucket' then leave the suboption just below selected from the
    //     // previous option if the previous option is a 'bucket' as well.
    //     // If the option switches but the new option also has the same suboption
    //     // listed, keep it selected.
    //     // If the suboption selection can't be retained and the new option has a
    //     // default defined, set the default for the suboption
    //     // If none of the above work out, set the suboption selection to null.
    //     const prevKey = this.subOptionKey;
    //     const leKey = optionData.key;
    //     requestAnimationFrame(() => {
    //       // If we are dealing with buckets
    //       if (option && "bucket" in option && option.bucket) {
    //         this.bucket = option;
    //         return;
    //       }
    //       this.setSelectedOption(option, leKey);
    //       // We need to make sure the suboption is an option of the selected option
    //       const checkOption = option || this.selectedOption;
    //       if (!(checkOption && checkOption.suboptions)) {
    //         this.setSelectedOption(null, this.subOptionKey);
    //       } else if (
    //         !this.selectedSuboption ||
    //         !checkOption.suboptions.options.includes(this.selectedSuboption.id)
    //       ) {
    //         const dfltID =
    //           checkOption.suboptions.default ||
    //           checkOption.suboptions.options[0];
    //         const sub = this.objectIDMap[dfltID] || null;
    //         this.setSelectedOption(sub, this.subOptionKey);
    //       }
    //       // If we dropped a previously used suboption, set it's casing value to null
    //       if (prevKey !== this.subOptionKey && !this.subOptionKey) {
    //         this.setSelectedOption(null, prevKey);
    //       }
    //     });
    //   }
    // },
    getSuboptionsKey(option: ComplexOption): string {
      if (option instanceof Object && "suboptions" in option && option.suboptions) {
        return option.suboptions.key;
      }
      return "";
    },
    sanitize(subject: string): string {
      return utils.sanitize(subject);
    },
    alterSubSelections(commands: Array<{ key: string; value: ComplexOption | null }>) {
      commands.forEach((command) => {
        this.setSelectedOption(command.value, command.key);
      });
    },
    optionFilter(o: ComplexOption | null) {
      return utils.standardOptionFilter(
        o,
        [
          this.currentProduct,
          "selections",
          this.attributeKey,
          this.subAttributeKey,
          ...Object.keys(this.optionCasings),
        ],
        this.restrictions,
        this.enablers
      );
    },
    setUserInteraction() {
      // Set the user interaction to true for the current options
      this.optionLayers.forEach((data) => {
        if (data.selected) {
          this.setNestedOptionInteraction({
            attribute: this.attributeKey,
            subattribute: this.subAttributeKey,
            section: data.key,
          });
        }
      });
    },
    onUnselection(key: string, callback: Function, permanent = false) {
      if (this.subAttributeKey && this.selectedOptions[this.currentProduct]) {
        const casing = utils.getNested(this.selectedOptions, [
          this.currentProduct,
          "selections",
          this.attributeKey,
          this.subAttributeKey,
          key,
        ]) as OptionCasing | undefined;
        if (casing) {
          casing.onValueChange(callback as any, permanent);
        }
      }
    },
    optionClasses(layer: OptionLayer) {
      let opt: ComplexOption;
      let className = utils.sanitize(layer.key);
      if (layer.selected) {
        className += " " + utils.sanitize(layer.selected.name);
        opt = layer.selected;
      } else if (layer.options[0]) {
        opt = layer.options[0];
      } else {
        return "";
      }
      className += " type-" + utils.toKebobCase(opt.type);
      if ("subtype" in opt && opt.subtype && opt.subtype != "default") {
        className += " sub-type-" + utils.sanitize(opt.subtype);
      }

      if (!layer.options.length) {
        className += " hide";
      }
      if (layer.options.length == 1) {
        className += " single-child";
      }
      return className;
    },
    retainBucket(oldLayers: OptionLayer[], newLayers: OptionLayer[]) {
      const count = oldLayers.length > newLayers.length ? oldLayers.length : newLayers.length;
      for (let i = 0; i < count; i++) {
        const oldLayer = oldLayers[i];
        const newLayer = newLayers[i];
        if (oldLayer && newLayer && oldLayer.selected && newLayer.selected) {
          if (oldLayer.selected.type == "ComplexLabelOption" && newLayer.selected.type == "ComplexLabelOption") {
            if (oldLayer.selected.subtype == "bucket" && newLayer.selected.subtype == "bucket") {
              // If parallel layers are both buckets and both buckets exist
              // as options under both parents, retain the bucket
              if (newLayer.options.includes(oldLayer.selected)) {
                newLayer.casing.value = oldLayer.selected;
              }
            }
          }
        }
      }
    },
    handledSubSelections(newLayers: OptionLayer[]) {
      const inst = Math.floor(Math.random() * 100);
      for (let i = 0; i < newLayers.length; i++) {
        const newLayer = newLayers[i];
        // If a current selection does not exist within
        // a the new list of options, set the selected
        // to the current default. If we run into a
        // bucket, break the loop. If the option has
        // comrades then skip the iteration
        if (newLayer.selected?.type == "ComplexLabelOption" && newLayer.selected.subtype == "bucket") {
          break;
        } else if (newLayer.selected && ("comrades" in newLayer.selected || "source" in newLayer.selected)) {
          continue;
        }
        if (newLayer.selected && !newLayer.options.includes(newLayer.selected)) {
          newLayer.casing.value = this.getDefaultOption(newLayer.default, newLayer.options);
        } else if (newLayer.selected == null && newLayer.default !== undefined && newLayer.default !== false) {
          newLayer.casing.value = this.getDefaultOption(newLayer.default, newLayer.options);
        }
      }
    },
    getDefaultOption(
      dflt:
        | boolean
        | string
        | number
        | [string | boolean | number, ...Array<string | boolean | number>]
        | null
        | undefined,
      options: ComplexOption[]
    ) {
      if (dflt === undefined) {
        return options.find((o) => utils.isSelectable(o)) || null;
      }
      if (dflt === null) {
        return null;
      }
      dflt = dflt instanceof Array ? dflt : [dflt];
      for (let i = 0; i < dflt.length; i++) {
        const d = dflt[i];
        if (typeof d == "number" && options[d]) {
          return options[d];
        } else if (typeof d == "string" && options.find((x) => x.id == d)) {
          return options.find((x) => x.id == d)!;
        } else {
          const firstValid = options.find((o) => utils.isSelectable(o));
          if (firstValid) {
            return firstValid;
          }
        }
      }
      return null;
    },
    getParallelData(option: ComplexOption & ({ comrades: string[] } | { source: string })): any[] {
      if ("comrades" in option) {
        return option.comrades.map((x) => ({ parent: this.objectIDMap[x] })).filter((x) => x.parent);
      } else if ("source" in option) {
        const source = this.objectIDMap[option.source] as ComplexColorsOption<"source">;
        if (source) {
          return [option.source, ...source.comrades]
            .map((x) => ({ parent: this.objectIDMap[x] }))
            .filter((x) => x.parent && x.parent.id != option.id);
        }
      }
      return [];
    },
  },
  setup() {
    const selector: Ref<HTMLElement | null> = ref(null);
    const subs: Ref<HTMLElement | null> = ref(null);
    const opts: Ref<HTMLElement | null> = ref(null);
    const subopts: Ref<HTMLElement | null> = ref(null);
    const interactionTimer: Ref<any> = ref(-1);
    const bucket: Ref<ComplexLabelOption | null> = ref(null);
    const attrChanged = ref(false);
    const supposedAttr = ref(-1);
    const subTransition = ref(false);
    const subTransTimer = ref(-1 as any);
    return {
      selector,
      subs,
      opts,
      subopts,
      interactionTimer,
      bucket,
      attrChanged,
      subTransition,
      subTransTimer,
      supposedAttr,
    };
  },
  watch: {
    subattributes(newVal: ComplexSubAttribute[], oldVal?: ComplexSubAttribute[]) {
      if (!oldVal) return;
      // Use the supposed attribute to determine reliably within the context of
      // this watch function whether or not the main attribute has changed
      const newAttribute = this.supposedAttr != this.currentAttribute;
      if (newAttribute) {
        this.supposedAttr = this.currentAttribute;
      }

      // Only let the changed number of sub attrbiutes have any
      // effect if the main attribute didn't change
      const changeSubNumbers = !newAttribute && newVal.length != oldVal?.length;
      if (changeSubNumbers) {
        // This is where it gets tricky, which is why we're here
        // in the first place. We have the ability to disable sub
        // attributes that are placed before the current sub
        // attribute. This doesn't work by default because when a
        // sub is removed that is before the current sub, the current
        // sub now has a different index. So, here we need to change
        // the index, so that it matches the new index of the sub
        // attribute we were just on before the list changed. We are
        // going to use the sub attribute id to find the new index.
        // If the sub attribute id is not found, then we'll just
        // set the index to 0.
        const subID = oldVal[this.subAttrIndex]?.id;
        const newIndex = subID ? newVal.findIndex((x) => x.id == subID) : 0;
        this.subAttrIndex = newIndex > -1 ? newIndex : 0;
      }
    },
    leatherList(value) {
      this.setLeatherGuideLeathers(value);
    },
    optionLayers(layers: OptionLayer[]) {
      // Loop through each layer and fill in emptied values that are required
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        if (layer.required && layer.permanent && !layer.selected && layer.casing.userInteraction) {
          // get the default option which we'll use to fill the null value
          let option: Option | null = this.getDefaultOption(layer.default, layer.options);
          // Now set the option
          if (option) {
            layer.casing.value = option;
          }
          // just end the loop, because this should be the end anyways
          break;
        }
      }
    },
    clearCasingData(
      novel: {
        attr: number;
        subattr: number;
        layers: (OptionLayer & { parentOption: false | ComplexOption })[];
      },
      old:
        | {
            attr: number;
            subattr: number;
            layers: (OptionLayer & { parentOption: false | ComplexOption })[];
          }
        | undefined
    ) {
      // Unset the selection for any option layer that doesn't exist
      // within the updated stack if the attributes didn't change or
      // the layers change after a ComplexColorsOption selection with
      // comrades
      if (old) {
        // Mark that the attribute has changed if the attribute or sub-
        // attribute are different than the previous, or if we marked it
        // as changed on an earlier iteration
        const attrChanged = this.attrChanged || novel.attr != old.attr || novel.subattr != old.subattr;
        // If the attribute didn't change, but the layers did, then
        // let's find any layers that aren't in the stack anymore
        // by name (key)
        if (!attrChanged && novel.layers !== old.layers) {
          this.attrChanged = false;
          const longGone = old.layers.filter((l) => {
            // Only validate layers that don't have matching  keys within the new stack
            return !novel.layers.find((x) => x.key == l.key);
          });
          // This list contains layers that don't correlate anymore within
          // the curreent selection by name. Set their values to null
          for (let i = 0; i < longGone.length; i++) {
            const layer = longGone[i];
            if (!OptionCasing.getValuePersistance(layer.casing, this.objectIDMap)) {
              layer.casing.value = null;
            }
          }
          this.handledSubSelections(novel.layers);
        } else if (attrChanged && !this.attrChanged) {
          // Mark the attribute as changed only if it is not currently marked
          this.attrChanged = true;
          // Reset the attrChangede marker after half a second
          setTimeout(() => {
            this.attrChanged = false;
          }, 500);
          // Use this method to retain the current bucket if it exists
          // within the new sub-attribute
          this.retainBucket(old.layers, novel.layers);
        } else if (attrChanged) {
          // Otherwise make sure the change is not tracked
          this.attrChanged = false;
        }
      }
    },
    subAttrIndex(val) {
      this.subTransition = true;
      if (this.subTransTimer > -1) {
        clearTimeout(this.subTransTimer);
      }
      // You get two seconds for any sub attribute transition animations
      this.subTransTimer = setTimeout(() => {
        this.subTransTimer = -1;
        this.subTransition = false;
      }, 300);
    },
    subAttributeXData(subX, prevX) {
      // Store a copy of the current XData so we have in reserve for unmount
      this.subXData = subX;
      if (prevX?.virtual && "viewing" in prevX) {
        delete prevX.viewing;
      }
      if (subX?.virtual) {
        subX.viewing = true;
      }
    },
  },
  mounted() {
    this.onDataStepComplete({
      id: "objects",
      callback: this.checkOpeness,
    });
    requestAnimationFrame(() => {
      // Let's just wait one frame
      this.interactionTimer = setTimeout(this.setUserInteraction, 800);
      // After one frame, set the supposed attribute to the current attribute
      this.supposedAttr = this.currentAttribute;
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
        if (payload === "next" && this.subattributes && this.subAttrIndex < this.subattributes.length - 1) {
          cancelDefault();
          const index = this.subAttrIndex + 1;
          subEl = this.subs ? this.subs.children[index] : null;
          this.setSubAttribute(index);
        } else if (payload === "previous" && this.subAttrIndex > 0) {
          cancelDefault();
          const index = this.subAttrIndex - 1;
          subEl = this.subs ? this.subs.children[index] : null;
          this.setSubAttribute(index);
        }
        if (subEl && this.subs) {
          const rect = subEl.getBoundingClientRect();
          utils.smoothScroll(
            {
              left: rect.left + rect.width / 2 - innerWidth / 2 + this.subs.scrollLeft,
              top: 0,
            },
            350,
            this.subs
          );
        }
      });
    }
    // setTimeout(() => {
    //   console.log(this.optionLayersFiltered);
    // }, 2000);
  },
  beforeUnmount() {
    this.setLeatherGuideLeathers();
    // Clear the interaction timer if the user moved away too fast
    if (this.interactionTimer > -1) {
      clearTimeout(this.interactionTimer);
      this.interactionTimer = -1;
    }

    // Unset the stage hijacker if we bounce to a different selector type
    this.setStageHijacker(null);
    this.setStageHijackerPath(null);
    // Unset the viewing state from the current sub attribute x-data
    // Use the stored copy of the x-data in case the current
    // sub attribute changed right before unmount
    if (this.subXData && "viewing" in this.subXData) {
      delete this.subXData.viewing;
    }
  },
});
</script>

<style lang="scss" scoped>
.complex-selector {
  // transition: height 0.2s ease;
  background-color: #f5f5f5;

  .options {
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    height: 55px;
    background-color: #fff;

    // transition: height 0.2s ease, opacity 0.2s linear;
    &.hide {
      opacity: 0;
      height: 0 !important;

      .transitioning & {
        transition: none;
      }
    }
    &.type-basic-option {
      height: initial;
    }
    &.type-complex-uploader-option {
      height: 90px;
    }
    &.type-complex-dropdown-option {
      height: 40px;
    }
  }

  .type-complex-label-option {
    &:not(.hide) {
      @media (min-width: $large-width-up) {
        height: 40px;
      }
    }
  }

  .type-complex-image-option,
  .type-complex-colors-option,
  .type-complex-toggle-option {
    height: 40px;
  }

  &.openfull {
    &.leather.binding,
    &.leather.piping,
    &.leather.base,
    &.web.web_style {
      .option-layer-1 {
        height: 110px;
        transition: none;

        @media (min-width: $large-width-up) {
          height: 110px;
          align-items: flex-start;

          .complex-option {
            height: 100%;
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
          height: 96px;
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

  &.web.web_style.openfull,
  &.construction.construction_type.openfull {
    .options:not(.personalization):not(.hide) {
      border-bottom: none;
      height: 110px;

      @media (min-width: $large-width-up) {
        .complex-option {
          height: 98px;
        }
      }
    }
  }

  &.web.web_style.openfull .options.options.numbers_initials {
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

  &.buckle_style {
    .color {
      height: 110px;

      ::v-deep .swatch-image {
        height: 100%;

        img {
          height: 100%;
          width: 55px;
        }
      }
    }
  }

  &.logo_style .sub-attributes[data-subs="1"] ~ {
    .type.type-complex-label-option {
      height: 53px;
      background-color: #000;
      border-bottom: none;

      .complex-option.complex-label-option {
        font: 600 21px/120% $fnt-cm;
        padding: 15px 18px;

        &:not(.selected) {
          color: #fff;
        }
      }
    }

    .metal {
      height: 110px;

      ::v-deep .swatch-image {
        height: 100%;

        img {
          height: 100%;
          width: 55px;
        }
      }
    }
  }

  &.logo_color {
    .color {
      height: 96px;

      ::v-deep .swatch-image {
        height: 100%;

        img {
          height: 100%;
          width: 55px;
        }
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

    // transition: height 0.2s ease;
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

      &.selected {
        color: $orange;

        &::before {
          transform: translateX(-50%) scaleY(1);
        }
      }

      @media (min-width: $small-width-up) {
        &:hover {
          color: $orange;
          &:has(.sub-info:hover) {
            color: #fff;
          }
        }
        body:not(.is-touch) &:not(:hover) .remove-virtual {
          opacity: 0;
          pointer-events: none;
        }
      }
    }
    .sub-info {
      display: inline-block;
      aspect-ratio: 1;
      height: 1em;
      $mask: url(../../../assets/info.svg) no-repeat center / contain;
      -webkit-mask: $mask;
      mask: $mask;
      background-color: #fff;
      transition: transform 0.2s ease;
      cursor: pointer;
      opacity: 1;
      margin-bottom: 0.1em;
      body:not(.is-touch) &:hover {
        transform: scale(1.1);
        background-color: $orange;
      }
    }

    .add-virtual {
      color: #fff;
      transition: color 0.2s linear;
      padding: 15px 18px;
      cursor: pointer;
      font: 700 21px/1 $fnt-cm;
      letter-spacing: 0.02em;
      white-space: nowrap;

      body:not(.is-touch) &:hover {
        color: $orange;
      }
    }
    .attribute ~ .add-virtual {
      font-size: 16px;
    }

    .remove-virtual {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background-color: $orange;
      font-size: 0;
      cursor: pointer;
      transition: transform 0.2s ease, opacity 0.2s linear;
      &:hover {
        transform: scale(1.1);
      }

      &::before,
      &::after {
        background-color: #fff;
        height: 66%;
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
    min-height: 55px;
    text-align: left;
    display: flex;
    padding: 19px 16px 17px;
    box-sizing: border-box;
  }

  .option-layers-after {
    display: none;
  }

  .options.material:not(.hot_stamped) + .option-layers-after {
    height: 0 !important; // this here because of a chrome bug
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

.type-complex-label-option {
  border-bottom: 1px solid $orange;

  .sub-attributes + &.sub-type-dark {
    height: 53px;
    background-color: #000;
    border-bottom: none;
  }
  &.sub-type-thick.sub-type-thick {
    height: 55px;
    border-bottom-color: #000;
    @media (max-width: $small-width) {
      height: 42px;
    }
  }
  &.sub-type-radio.sub-type-radio {
    height: 54px;
  }
}

.type-complex-image-option {
  border-bottom: 1px solid $orange;
}

.type-complex-type-option.options {
  background-color: #f5f5f5;
}

body.belts .complex-selector .thread_color {
  height: 163px;

  ::v-deep .color-swatch-option,
  ::v-deep .swatch-color {
    height: 100%;
  }
}

.initials_numbers .hot_stamped + .option-layers-after {
  display: block;
  height: 55px;
}

.personalize_tip.flag .options.flag,
.personalize_liner_tip .flags + .options,
.personalize_keeper .option-layer-2.flag {
  padding: 0 17px;
  gap: 17px;
  align-items: center;

  @media (max-width: $large-width) {
    height: 166px;
  }

  .complex-option {
    height: auto;
  }
}

.personalize_tip.flag .options.flag {
  height: 151px;
}
.personalize_keeper .option-layer-2.flag {
  height: 90px;
}

.personalize_liner_tip .flags + .options {
  height: 98px;
}

.personalize_keeper .metal_diamond + .metal {
  height: 151px;

  @media (max-width: $large-width) {
    height: 167px;
  }

  ::v-deep .swatch-image {
    height: 100%;

    img {
      height: 100%;
      width: 55px;
    }
  }
}

.leather.laces .options.scheme {
  border-bottom: 1px solid $orange;
}

.complex-selector.barrel_end {
  &.cupping .option-layer-1 {
    height: 90px;
    &.uncupped ~ .option-layers-after {
      display: block;
      height: 55px;
    }
  }
  body:not(.is-touch) &.info .sub-attributes[data-subs="2"] ~ .option-layers-after {
    display: block;
    height: 90px;
  }
  body:not(.is-touch) &.info .sub-attributes[data-subs="1"] ~ .options {
    height: 145px;
    ::v-deep {
      .swatch-image {
        height: 100%;
        img {
          height: 100%;
          width: 55px;
        }
      }
      .complex-option[data-name="Natural"] .swatch-image {
        background: var(--swatch) repeat center/100% auto;
        img {
          opacity: 0;
        }
      }
    }
  }
}
.complex-selector.grip_specs .options.specs.none ~ .option-layers-after {
  height: 131px;
  display: block;
  @media (max-width: $large-width) {
    height: 110px;
  }
  @media (max-width: $small-width) {
    height: 55px;
  }
}
.complex-selector.grip_stitching .option-layer-1 {
  height: 184px;
  @media (max-width: $large-width) {
    height: 163px;
  }
}
.complex-selector.handle_texture .option-layer-1 ~ .option-layers-after {
  display: block;
  height: 55px;
}

.personalize_tip.initials_numbers .option-layer-1.type.none + .option-layers-after {
  display: block;
  height: 96px;
}

.thread.added_thread::v-deep .swatch.swatch.swatch {
  height: 110px;
  flex-grow: 0;
}

.complex-selector.logo.palm::v-deep .swatch.swatch-image::after {
  border-bottom-color: $orange;
}
.complex-selector.knob {
  :deep(.basic-option .name) {
    height: 32%;
  }
  &.personalization::v-deep .options.color .swatch::after {
    border-bottom-color: #000;
  }
}

.complex-selector.keeper.right_keeper::v-deep .keeper_2_leather.none + .option-layers-after {
  display: block;
  height: 90px;
}
.complex-selector.personalize_keeper:is(.right_keeper, .left_keeper) .options {
  &.material {
    height: 110px;
    ::v-deep .swatch-image,
    ::v-deep .swatch-image img {
      height: 100%;
      width: 55px;
    }
  }
  &.flag {
    height: 110px;
  }
}
.complex-selector.personalize_graphic .options {
  height: 151px;
  align-items: center;
  gap: 17px;
  padding: 0 17px;
  .complex-option {
    height: 55px;
    box-shadow: 0 1px 6px 0 #0003;
    transition: box-shadow 0.2s linear;
    &.selected {
      box-shadow: 0 1px 10px 0 #0008;
    }
  }
  ::v-deep .swatch-image,
  ::v-deep .swatch-image img {
    height: 100%;
  }
}

.attribute-component-wrapper:not(.transitioning) {
  .sub-attributes:not(.sub-transition) ~ {
    .fade-enter-active,
    .fade-leave-active {
      transition: opacity 0.2s linear;
    }

    .fade-enter-from,
    .fade-leave-to {
      opacity: 0;
      height: 0 !important;
    }
  }

  .sub-transition ~ {
    .fade-leave-active {
      display: none;
    }
  }
}

// For the bats specifically we are adding a silly little toggle switch
// in the sub-attributes bar to switch between the matte and gloss
body.bats .complex-selector.bat_colors {
  display: flex;
  flex-wrap: wrap;
  background-color: #000;
  .sub-attributes {
    width: fit-content;
    flex-shrink: 0;
  }
  .options {
    width: 100%;
  }
  .options.coating {
    height: 55px;
    margin-left: 12px;
    width: fit-content;
    flex-shrink: 0;
    background-color: #000;
    border-bottom: none;
    position: relative;
    display: flex;
    @media (max-width: $small-width) {
      margin-left: 8px;
    }
    > :first-child {
      order: 1;
      padding-right: 8px;
    }
    > :last-child {
      order: 3;
      padding-left: 8px;
    }
    &::before,
    &::after {
      content: "";
      order: 2;
      margin-bottom: 1px;
      align-self: center;
      border-radius: 100px;
    }
    &::before {
      width: 14px;
      margin-right: -14px;
      aspect-ratio: 1;
      background-color: $orange;
      position: relative;
      left: 2px;
      transition: left 0.24s cubic-bezier(0.76, 0, 0.24, 1);
    }
    &::after {
      content: "";
      width: 32px;
      height: 16px;
      order: 2;
      border: 1px solid #fff;
    }
    &.gloss::before {
      left: 18px;
    }
    .complex-option {
      display: flex;
      align-items: center;
      color: #fff;
      position: static;
      &::after {
        display: none;
      }
      &:not(.selected)::before {
        content: "";
        position: absolute;
        inset: 0;
        cursor: pointer;
      }
    }
  }
}
</style>

<style lang="scss">
.complex-selector {
  &.logo.palm .option-layer-1 {
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

  // Hide the label option layer of "Personalize Back" steps that only contains a single option
  &.personalize_back {
    .type-complex-label-option.single-child {
      display: none;
    }
  }

  // Make the color swatches taller for the "Thread" step
  body.model-showbelt_pro &.thread_color.thread .options {
    height: 110px;
  }

  // Make the color swatches taller for the logo colors step
  body.model-showbelt_pro &.logo:is(.logo_paint, .logo_color) .options {
    height: 90px;
  }
  &.knob.style .options.options {
    height: 110px;
    @media (max-width: $small-width) {
      height: 90px;
    }
  }
  body.bats &.logo .option-layer-1 {
    height: 165px;
    @media (max-width: $small-width) {
      height: 145px;
    }
    .complex-option .swatch {
      height: 100%;
      img {
        height: 100%;
      }
    }
  }
}
body.belts,
body.belts_testing {
  .option-layer-2.diamond.logo_diamond .complex-swatch-option {
    width: initial;
    flex-grow: 0;
  }
}
</style>
