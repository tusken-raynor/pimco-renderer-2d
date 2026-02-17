<template>
  <div
    :class="['grand-option', 'grand-gratuity-option', { selected: isSelected }]"
    @click="selectMain"
    :style="{ marginBottom }"
  >
    <div class="name">{{ option.nickname || option.name }}</div>
    <!-- <div class="price">+${{ upchargeText }}</div> -->
    <div class="meter" @click.stop>
      <div
        v-for="(mark, i) in meterOptions"
        :key="mark.id"
        :class="['meter-mark', { selected: subselection == mark }]"
        :style="getMarkStyles(meterOptions.length, i)"
        @click="selectMark(mark)"
      >
        <div class="name">{{ mark.nickname || mark.name }}</div>
      </div>
    </div>
    <div
      v-if="option.text || option.text === ''"
      class="note-input-wrapper"
      ref="noteRap"
    >
      <div v-if="option.noteprompt" class="note-prompt">
        {{ option.noteprompt }}
      </div>
      <textarea
        class="note-input"
        v-model="note"
        placeholder="Enter note here"
      ></textarea>
    </div>
  </div>
</template>

<script lang="ts">
import { GrandGratuityOption, GrandMeterOption, Option } from "@/types";
import utils from "@/utils";
import { defineComponent, ref, Ref } from "vue";
import { mapActions, mapGetters, mapState } from "vuex";
export default defineComponent({
  name: "GrandGratuityOption",
  props: {
    option: Object as () => GrandGratuityOption,
    select: Function,
    selected: Object as () => Option | null,
    subKey: String,
  },
  computed: {
    ...mapState(["objectIDMap", "selectedOptions", "currentProduct"]),
    ...mapGetters({ attribute: "getAttribute", price: "getPrice" }),
    subselection(): GrandMeterOption | null {
      if (
        this.selectedOptions &&
        this.attribute &&
        this.subKey &&
        this.option &&
        this.option.suboptions
      ) {
        return (
          utils.getNested(this.selectedOptions, [
            this.currentProduct,
            "selections",
            this.attribute.name,
            this.subKey,
            this.option.suboptions.key,
            "value",
          ]) || null
        );
      }
      return null;
    },
    upcharge(): number {
      if (this.option && this.option.upcharge) {
        return this.option.upcharge;
      } else if (this.subselection) {
        if (typeof this.subselection.upcharge === "number") {
          return this.subselection.upcharge;
        } else if (this.subselection.upcharge.endsWith("%")) {
          return (
            this.price *
            (Number(this.subselection.upcharge.replace("%", "")) / 100)
          );
        } else {
          return Number(this.subselection.upcharge);
        }
      }
      return 0;
    },
    upchargeText(): string {
      if (this.upcharge) {
        return utils.formatPrice(this.upcharge);
      }
      return " varies";
    },
    meterOptions(): Array<GrandMeterOption> {
      if (this.option && this.option.suboptions) {
        return this.option.suboptions.options
          .map((id: string) => this.objectIDMap[id])
          .filter((o: any) => o);
      }
      return [];
    },
    defaultOption(): GrandMeterOption | null {
      // Set the default option if null, use cheapest option if no default is set
      if (
        this.option &&
        this.option.suboptions &&
        this.option.suboptions.default
      ) {
        const _default = this.objectIDMap[this.option.suboptions.default];
        if (_default) {
          return _default;
        }
      }
      let price = Infinity;
      let cheapest: GrandMeterOption | null = null;
      for (let i = 0; i < this.meterOptions.length; i++) {
        const option = this.meterOptions[i];
        const upchargeVal = utils.getNumber(option.upcharge);
        if (upchargeVal < price) {
          price = upchargeVal;
          cheapest = option;
        }
      }
      return cheapest;
    },
    meterKey(): string {
      if (this.option && this.option.suboptions) {
        return this.option.suboptions.key || "";
      }
      return "";
    },
    isSelected(): boolean {
      return this.selected == this.option;
    },
    marginBottom(): string {
      return this.marginBottomValue + "px";
    },
  },
  methods: {
    ...mapActions(["storeData"]),
    getMarkStyles(meterMarkCount: number, index: number) {
      let width = 100 / (meterMarkCount - 1);
      let left = width * index + "%";
      let right = "initial";
      if (!index) {
        width = width / 2 + 5;
        left = "-5px";
      } else if (index == meterMarkCount - 1) {
        width = width / 2 + 5;
        left = "initial";
        right = "-5px";
      }
      return {
        width: width + "%",
        left,
        right,
      };
    },
    selectMain() {
      if (this.select) {
        this.select();
        if (this.defaultOption && !this.subselection) {
          this.select(this.defaultOption, this.meterKey);
        }
      }
    },
    selectMark(mark: GrandMeterOption | null) {
      if (this.option && this.selected == this.option && this.select) {
        this.select(mark, this.meterKey);
      }
    },
  },
  setup() {
    const noteRap: Ref<HTMLElement | null> = ref(null);
    const note: Ref<string> = ref("");
    const marginBottomValue: Ref<number> = ref(70);
    const saverTimer: Ref<any> = ref(-1);
    return { noteRap, note, marginBottomValue, saverTimer };
  },
  watch: {
    isSelected(value) {
      if (!value && this.select) {
        this.select(null, this.meterKey);
      }
    },
    note(value) {
      if (this.option) {
        this.option.text = value;
        clearTimeout(this.saverTimer);
        this.saverTimer = setTimeout(() => {
          this.saverTimer = -1;
          this.storeData();
        }, 1000);
      }
    },
  },
  mounted() {
    if (this.option && this.option.text) {
      this.note = this.option.text;
    }
    if (this.noteRap) {
      this.marginBottomValue = this.noteRap.getBoundingClientRect().height + 70;
    }
  },
});
</script>

<style lang="scss" scoped>
.grand-gratuity-option {
  border: 1px solid #000;
  transition: all 0.2s ease;
  background-color: #fff;
  text-align: center;
  font-weight: 300;
  display: inline-block;
  position: relative;
  width: 100%;
  padding: 0.7em 0.2em;
  box-sizing: border-box;
  max-width: 300px;
  cursor: pointer;
  user-select: none;
  z-index: 5;
  &:not(:last-child) {
    border-right-width: 0;
    &::after {
      content: "";
      height: 100%;
      width: 1px;
      opacity: 0;
      background-color: $orange;
      position: absolute;
      top: 0;
      right: -1px;
    }
  }
  .price {
    font-size: 12px;
  }
  .name {
    font-size: 19px;
    @media (max-width: $medium-width) {
      font-size: 16px;
    }
  }
  .count-2 & {
    width: calc(50% - 0px);
  }
  .count-3 & {
    width: calc(33.333333% - 1px);
  }
  .count-4 & {
    width: calc(25% - 1px);
  }
  &.selected {
    background-color: $orange;
    border-color: $orange;
    color: #fff;
    font-weight: 700;
    z-index: 3;
    &::after {
      opacity: 1;
    }
  }
  .meter {
    width: 100%;
    height: 70px;
    position: absolute;
    top: 100%;
    right: 0;
    opacity: 0;
    transition: opacity 0.1s linear;
    .count-2 & {
      width: 200%;
    }
    .count-3 & {
      width: 300%;
    }
    .count-4 & {
      width: 400%;
    }
    .meter-mark {
      z-index: 2;
      position: absolute;
      top: 0;
      height: 100%;
      &:not(:first-child):not(:last-child) {
        transform: translateX(-50%);
      }
      &::before {
        content: "";
        width: 1px;
        height: 11px;
        background-color: #000;
        position: absolute;
        left: 50%;
        top: calc(72.857% - 11px);
        transition: all 0.2s ease;
      }
      &:first-child::before {
        left: 5px;
      }
      &:last-child::before {
        left: calc(100% - 6px);
      }
      .name {
        position: absolute;
        top: calc(72.857% - 12px);
        left: 50%;
        transform: translate(-50%, -100%);
        z-index: 200;
        font-size: 14px;
        line-height: 105%;
        color: #000;
        transition: top 0.2s ease;
        font-weight: 400;
      }
      &:first-child .name {
        left: 5px;
      }
      &:last-child .name {
        left: calc(100% - 5px);
      }
    }
    &::before {
      content: "";
      width: 100%;
      height: 2px;
      background-color: #000;
      position: absolute;
      left: 0;
      top: calc(72.857% - 1px);
    }
  }
  &.selected .meter .meter-mark.selected {
    .name {
      font-weight: bold;
      color: $orange;
      top: calc(72.857% - 17px);
    }
    &::before {
      width: 3px;
      background-color: $orange;
      height: 28px;
      top: calc(72.857% - 14px);
    }
  }
  .opened &.selected .meter {
    transition: opacity 0.2s linear;
    opacity: 1;
  }
  .note-input-wrapper {
    position: absolute;
    top: calc(100% + 70px);
    right: 0;
    width: 100%;
    font: 300 16px/112.5% $fnt-cm;
    color: #000;
    text-align: left;
    padding-top: 45px;
    box-sizing: border-box;
    opacity: 0;
    transition: opacity 0.1s linear;
    .count-2 & {
      width: 200%;
    }
    .count-3 & {
      width: 300%;
    }
    .count-4 & {
      width: 400%;
    }
    textarea {
      width: 100%;
      border: 1px solid #000;
      overflow: auto;
      outline: none;
      box-shadow: none;
      resize: none; /*remove the resize handle on the bottom right*/
      height: 136px;
      margin-top: 1em;
      padding: 14px 16px;
      box-sizing: border-box;
      font: 300 16px/112.5% $fnt-cm;
    }
  }
  .opened &.selected .note-input-wrapper {
    transition: opacity 0.2s linear;
    opacity: 1;
  }
}
</style>