<template>
  <div
    :class="[
      'sub-attribute',
      { open, 'has-interaction': hasInteraction, opened, hidden: sub?.hidden },
    ]"
  >
    <div class="names-wrapper">
      <div 
        class="names" 
        @click="select" 
        :data-name="sub.name" 
        ref="namesEl" 
        :data-sub-attr-entry-index="index"
        :data-sub-attr-entry-id="sub?.id"
        :data-sub-attr-entry-current="open || undefined"
      >
        <div :class="['attr-name', { 'has-selected': showSelected }]">
          {{ sub.nickname || sub.name }}
        </div>
        <div
          :class="[
            'selected-name',
            { show: showSelected, render: renderSelected },
          ]"
          :style="nameWidth >= 0 ? { maxWidth: nameWidth + 'px' } : null"
        >
          <div class="names-s-ref" ref="nameEl">
            {{ selectedName }}
          </div>
        </div>
      </div>
      <div v-if="sub.info" class="info-button" @click="openInfo"></div>
    </div>
    <div
      class="options-wrapper"
      :style="{ height: height || null, transitionDuration: transDur || null }"
    >
      <div
        :class="[
          'options',
          sanitize(subAttributeKey),
          sanitize(optionKey),
          'type-' + toKebob(selected ? selected.type : options[0]?.type || ''),
          'count-' + options.length,
        ]"
        ref="optionsEl"
      >
        <div v-if="sub.subtitle" class="subtitle">{{ sub.subtitle }}</div>
        <grand-option
          v-for="option in options"
          :key="option.id"
          :option="option"
          :select="setSelectedOption"
          :selected="selected"
          :optkey="optionKey"
          :subkey="subAttributeKey"
          :setname="setSelectedName"
          :open="open"
          :casing="optionCasing"
        />
        <grand-addon-attribute-comp
          v-for="addon in addonAttributes"
          :key="addon.id"
          :addon="addon"
          :select="select"
          :subkey="subAttributeKey"
          :open="open"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, Ref, ref } from "vue";
import { mapGetters, mapMutations, mapState } from "vuex";
import {
  GrandOption,
  GrandAddonAttribute,
  GrandAddonOption,
  GrandSubAttribute,
} from "@/types";
import GrandAddonAttributeComp from "./GrandAddonAttribute.vue";
import GrandOptionComp from "./GrandOption.vue";
import utils from "@/utils";
import structure from "@/structure";
import { OptionCasing } from "@/structure";

export default defineComponent({
  name: "GrandSubAttribute",
  props: {
    sub: Object as () => GrandSubAttribute,
    select: Function,
    open: Boolean,
    index: Number
  },
  components: {
    "grand-option": GrandOptionComp,
    "grand-addon-attribute-comp": GrandAddonAttributeComp,
  },
  computed: {
    ...mapState(["objectIDMap", "selectedOptions", "currentProduct"]),
    ...mapGetters({
      attribute: "getAttribute",
      restrictions: "getRestrictions",
      enablers: "getIndexedEnablers",
    }),
    attributeKey(): string {
      if (this.attribute) {
        return this.attribute.name;
      }
      return "";
    },
    subAttributeKey(): string {
      if (this.sub) {
        return this.sub.name;
      }
      return "";
    },
    addonAttributes(): Array<GrandAddonAttribute> {
      if (this.sub && this.sub.attributes) {
        return this.sub.attributes
          .map((id: string) => this.objectIDMap[id])
          .filter((a: any) =>
            utils.standardAttributeFilter(a, this.restrictions, this.enablers)
          );
      }
      return [];
    },
    options(): Array<GrandOption> {
      if (this.sub && this.sub.options) {
        return this.sub.options.options
          .map((id: string) => this.objectIDMap[id])
          .filter(this.optionFilter);
      }
      return [];
    },
    optionKey(): string {
      if (this.sub && this.sub.options) {
        return this.sub.options.key;
      }
      return "";
    },
    suboptionKey(): string {
      if (
        this.selected &&
        "suboptions" in this.selected &&
        this.selected.suboptions
      ) {
        return this.selected.suboptions.key;
      }
      return "";
    },
    optionCasing(): OptionCasing | null {
      if (this.selectedOptions && this.optionKey) {
        return utils.getNested(this.selectedOptions, [
          this.currentProduct,
          "selections",
          this.attributeKey,
          this.subAttributeKey,
          this.optionKey,
        ]);
      }
      return null;
    },
    selected(): GrandOption | null {
      if (this.optionCasing) {
        return (this.optionCasing.value as GrandOption) || null;
      }
      return null;
    },
    hasInteraction(): boolean {
      if (
        this.selectedOptions &&
        (this.optionKey || this.addonAttributes.length)
      ) {
        const subSelections = utils.getNested(this.selectedOptions, [
          this.currentProduct,
          "selections",
          this.attributeKey,
          this.subAttributeKey,
        ]);
        return utils.fishCompletion(
          subSelections,
          this.restrictions,
          this.enablers,
          false,
          "tacos" as any as boolean
        );
      }
      return false;
    },
    selectedAddonOptions(): Array<GrandAddonOption> | null {
      if (this.selectedOptions && this.addonAttributes.length) {
        const addons = utils.getNested(this.selectedOptions, [
          this.currentProduct,
          "selections",
          this.attributeKey,
          this.subAttributeKey,
        ]);
        if (addons) {
          return Object.keys(addons).map((key) => {
            const obj = addons[key];
            const inkeys = Object.keys(obj);
            return obj[inkeys[0]].value;
          });
        }
      }
      return null;
    },
    selectedAddonOptionsCount(): number {
      if (this.selectedAddonOptions) {
        return this.selectedAddonOptions.filter((o) => o).length;
      }
      return 0;
    },
    allSelectionsRequired(): boolean {
      if (
        this.selectedOptions &&
        (this.optionKey || this.addonAttributes.length)
      ) {
        const subSelections = utils.getNested(this.selectedOptions, [
          this.currentProduct,
          "selections",
          this.attributeKey,
          this.subAttributeKey,
        ]);
        let allRequired = true;
        structure.traverse(subSelections, (casing: OptionCasing) => {
          if (!casing.required) {
            allRequired = false;
          }
        });
        return allRequired;
      }
      return false;
    },
  },
  methods: {
    ...mapMutations([
      "setSelectedNestedOption",
      "setNestedOptionInteraction",
      "setNestedAddonOptionInteraction",
      "setStandardPopup",
    ]),
    sanitize(subject: string) {
      return utils.sanitize(subject);
    },
    toKebob(subject: string) {
      return utils.toKebobCase(subject);
    },
    setSelectedOption(option: GrandOption | null, key: string) {
      this.setSelectedNestedOption({
        attribute: this.attributeKey,
        subattribute: this.subAttributeKey,
        section: key,
        value: option,
      });
    },
    setDropdownInteraction(value = true) {
      if (this.addonAttributes.length) {
        // Addon option interactions are set at a different level now
      } else {
        this.setNestedOptionInteraction({
          attribute: this.attributeKey,
          subattribute: this.subAttributeKey,
          section: this.optionKey,
          value,
        });
      }
    },
    setSelectedName(name: string | null) {
      if (name) {
        this.selectedName = name;
        this.renderSelected = true;
        requestAnimationFrame(() => {
          // For some reason some browsers need an extra frame
          requestAnimationFrame(() => {
            this.showSelected = true;
          });
        });
      } else {
        this.showSelected = false;
        setTimeout(() => {
          this.renderSelected = false;
          this.selectedName = "";
        }, 400);
      }
    },
    getShortestName(option: GrandOption) {
      // Get the shortest name to save the most space :)
      if ((option as any).shortname) {
        return (option as any).shortname;
      }
      if (option.nickname && option.nickname.length <= option.name.length) {
        return option.nickname;
      }
      return option.name;
    },
    handleSelectedName() {
      if (this.selected) {
        this.setSelectedName(this.getShortestName(this.selected));
      } else if (this.sub?.emptylabel) {
        this.setSelectedName(this.sub.emptylabel);
      } else if (this.selectedAddonOptions) {
        // We are using addon(sub,sub) attributes instead of options for this layer
        this.setSelectedName(
          this.selectedAddonOptions
            .filter((o) => o)
            .map((o) => this.getShortestName(o))
            .join(", ")
        );
      }
    },
    openInfo() {
      if (this.sub && this.sub.info) {
        // Let's check if it's a notification popup
        if (
          this.sub.info.title &&
          (this.sub.info.content || this.sub.info.image)
        ) {
          this.setStandardPopup(this.sub.info);
        }
      }
    },
    optionFilter(o: GrandOption | null) {
      return utils.standardOptionFilter(
        o,
        [
          this.currentProduct,
          "selections",
          this.attributeKey,
          this.subAttributeKey,
          this.selected ? this.selected.name : "",
        ],
        this.restrictions,
        this.enablers
      );
    },
  },
  setup() {
    const optionsEl: Ref<HTMLElement | null> = ref(null);
    const height: Ref<string | boolean> = ref(false);
    const showSelected: Ref<boolean> = ref(false);
    const renderSelected: Ref<boolean> = ref(false);
    const selectedName: Ref<string> = ref("");
    const busy: Ref<boolean> = ref(false);
    const transDur: Ref<string> = ref("");
    const opened: Ref<boolean> = ref(false);
    const nameEl: Ref<HTMLElement | null> = ref(null);
    const nameWidth: Ref<number> = ref(-1);
    const namesEl: Ref<HTMLElement | null> = ref(null);
    return {
      optionsEl,
      height,
      showSelected,
      renderSelected,
      selectedName,
      busy,
      transDur,
      opened,
      nameEl,
      nameWidth,
      namesEl,
    };
  },
  watch: {
    open(value) {
      if (!this.busy) {
        this.busy = true;
        this.$emit("start-transition");
        if (this.optionsEl && this.nameEl) {
          const height = this.optionsEl.getBoundingClientRect().height;
          this.height = height + "px";
          const time = Math.max(Math.min(height, 1000), 300);
          this.transDur = time + "ms";
          if (value) {
            this.nameWidth = this.nameEl.getBoundingClientRect().width;
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                this.nameWidth = 0;
                setTimeout(() => {
                  this.nameWidth = -1;
                }, 320);
              });
            });
            setTimeout(() => {
              this.height = "auto";
              this.transDur = "";
              this.busy = false;
              this.$emit("end-transition");
              this.opened = true;
            }, time);
          } else {
            this.opened = false;
            requestAnimationFrame(() => {
              // For some reason in some browsers we need an extra frame
              requestAnimationFrame(() => {
                this.height = false;
              });
            });
            this.nameWidth = 0;
            setTimeout(() => {
              if (this.nameEl) {
                this.nameWidth = this.nameEl.getBoundingClientRect().width;
                setTimeout(() => {
                  this.nameWidth = -1;
                }, 320);
              }
            }, 70);
            setTimeout(() => {
              this.transDur = "";
              this.busy = false;
              this.$emit("end-transition");
            }, time);
          }
        }
        if (!value) {
          // If it's being closed
          setTimeout(this.handleSelectedName, 60);
        } else {
          // If it's being opened
          this.setSelectedName(null);
        }
        if (
          this.selected ||
          !this.allSelectionsRequired ||
          this.selectedAddonOptionsCount
        ) {
          // Check if there are selections so a proper interaction can be declared
          this.setDropdownInteraction();
        } else {
          this.setDropdownInteraction(false);
        }
      }
    },
    selected() {
      if (!this.open) {
        this.handleSelectedName();
      }
    },
  },
  beforeMount() {
    this.handleSelectedName();
  },
  mounted() {
    setTimeout(() => {
      this.handleSelectedName();
    }, 300);
  },
});
</script>

<style lang="scss" scoped>
.sub-attribute {
  padding-left: 2.08em;
  padding-bottom: 2.4em;
  position: relative;
  font-size: 25px;
  transition: all 0.3s ease;
  @media (max-width: $small-width) {
    font-size: 19px;
  }
  &.hidden {
    display: none;
  }
  &::before {
    content: "";
    width: 0.8em;
    height: 0.8em;
    background-color: #d8d7d2;
    transition: background-color 0.2s linear;
    border-radius: 50%;
    position: absolute;
    top: 3px;
    left: 0;
    z-index: 1;
    @media (max-width: $small-width) {
      top: 1px;
    }
  }
  &:not(.last)::after {
    content: "";
    width: 2px;
    height: 100%;
    background-color: #0a0a0a;
    top: 0.4em;
    left: calc(0.4em - 1px);
    position: absolute;
  }
  &.last {
    padding-bottom: calc(2.4em + 55px);
  }
  &.has-interaction {
    &::before {
      background-color: $green;
    }
    .names .selected-name {
      color: $green;
    }
  }
  &.open {
    &::before {
      background-color: $orange;
    }
  }
  &.opened {
    overflow: visible;
  }
  .info-button {
    width: 0;
    height: 0.8em;
    background: url(../../../assets/info.svg) no-repeat center/contain;
    transition: opacity 0.15s linear 0.12s, width 0s linear 0.16s;
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
  }
  &.open .info-button {
    transition: opacity 0.15s linear 0.52s, width 0s linear 0.5s,
      transform 0.2s ease;
    width: 0.8em;
    opacity: 1;
    pointer-events: initial;
    @media (min-width: $medium-width-up) {
      &:hover {
        transform: scale(1.2);
      }
    }
  }
  .names-wrapper {
    display: flex;
    justify-content: flex-start;
    @media (max-width: $small-width) {
      justify-content: space-between;
    }
  }
  .names {
    font: 600 100%/120% $fnt-cm;
    letter-spacing: 0.06em;
    cursor: pointer;
    user-select: none;
    position: relative;
    display: inline-flex;
    flex-wrap: wrap;
    margin-right: 0;
    transition: color 0.2s linear, margin 0s linear 0.4s;
    &::before,
    &::after {
      position: absolute;
      top: calc(0.6em - 2px);
      content: "";
      width: 2px;
      height: 0.48em;
      background-color: #000;
      transition: transform 0.2s ease, background-color 0.2s linear;
    }
    &::before {
      right: 0.46em;
      transform: translateY(-50%) rotate(-45deg);
    }
    &::after {
      right: 0.18em;
      transform: translateY(-50%) rotate(45deg);
    }
    .attr-name {
      white-space: nowrap;
      margin-right: 1.3em;
      margin-bottom: 0.4em;
      position: relative;
      &::after {
        content: "";
        width: 1px;
        height: 1em;
        position: absolute;
        top: 0px;
        right: -0.65em;
        opacity: 0;
        background-color: $green;
        transition: background-color 0.2s linear, opacity 0.2s linear 0.1s;
      }
      &.has-selected::after {
        opacity: 1;
      }
    }
    .selected-name {
      margin: 0;
      font-weight: 300;
      transition: opacity 0.2s linear, max-width 0.2s ease 0.2s,
        margin 0.2s ease 0.2s, color 0.2s linear;
      display: none;
      white-space: nowrap;
      opacity: 0;
      max-width: 0;
      box-sizing: border-box;
      color: #c7c6c1;
      &.render {
        display: block;
      }
      &.show {
        opacity: 1;
        max-width: initial;
        transition: opacity 0.2s linear 0.2s, max-width 0.32s ease,
          margin 0.2s ease 0.2s;
        margin-right: 1.3em;
      }
      .names-s-ref {
        display: inline-block;
      }
    }
  }
  &.open .names {
    margin-right: 0.7em;
    transition: margin 0.7s ease, color 0.2s linear, width 320ms;
    color: $orange;
    &::before,
    &::after {
      background-color: $orange;
    }
    &::before {
      transform: translateY(-50%) rotate(-135deg);
    }
    &::after {
      transform: translateY(-50%) rotate(135deg);
    }
    .attr-name::after {
      background-color: $orange;
    }
    .selected-name {
      color: $orange;
    }
  }
  .options-wrapper {
    height: 0;
    transition: height 0.26s cubic-bezier(0.76, 0, 0.24, 1);
    overflow: hidden;
  }
  .options {
    padding-top: 30px;
    &.type-grand-meter-option {
      position: relative;
      padding-block: 30px;
      margin-inline: 32px;
      box-sizing: border-box;
      display: flex;
      justify-content: space-between;
      max-width: 488px;
      @media (max-width: $small-width) {
        margin-inline: 48px;
      }
      &::before {
        content: "";
        width: 100%;
        height: 1px;
        background-color: #000;
        position: absolute;
        top: 50%;
        left: 0;
      }
    }
  }
  .subtitle {
    text-align: center;
    font-size: 16px;
    padding: 0 2em 28px;
    font-weight: 600;
    @media (min-width: $medium-width-up) {
      text-align: left;
      padding-left: 0;
      padding-right: 0;
    }
  }
  &.opened .options-wrapper {
    overflow: visible;
  }

  .options {
    &.type-grand-tile-option {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      max-width: 240px;

      @media (min-width: $small-width-up) {
        max-width: 340px;
      }
    }
    &.delivery_priority {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      @media (max-width: $large-width) {
        flex-direction: column;
      }
      > .grand-addon-option {
        border-right: 1px solid #000;
        flex-basis: 0 1 300px;
        &.selected {
          border-right-color: $orange;
        }
        @media (max-width: $large-width) {
          width: 100%;
        }
      }
    }
  }
}
</style>
