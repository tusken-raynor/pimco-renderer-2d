<template>
  <div :class="['clone-option-field', optionClass]">
    <div class="label-wrap">
      <label v-if="field!.label" v-html="formatLabel(field!.label)"></label>
      <div v-if="field!.info" class="info-btn" @click="showOptionsInfo"></div>
    </div>
    <div class="options">
      <template v-for="option in optionList">
        <grand-tile-option
          :key="option.id + 'tile'"
          v-if="option.type == 'GrandTileOption'"
          :option="option"
          :select="(opt) => selectOption(opt === undefined ? option : opt)"
          :selected="currentOption"
          :setname="() => {}"
          :open="false"
          :casing="casing"
        />
        <grand-wide-option
          :key="option.id + 'wide'"
          v-else-if="option.type == 'GrandWideOption'"
          :option="option"
          :select="() => selectOption(option)"
          :selected="currentOption"
        />
        <grand-block-option
          :key="option.id + 'block'"
          v-else-if="option.type == 'GrandBlockOption'"
          :option="option"
          :select="() => selectOption(option)"
          :selected="currentOption"
          :upcharge="getUpcharge(option)"
        />
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import { OptionCasing } from "@/structure";
import { Option, GrandOption, StandardPopupInfo, OptionApplication } from "@/types";
import { defineComponent } from "vue";
import { mapMutations, mapState, mapGetters } from "vuex";
import structure from "@/structure";
import GrandTileOptionComp from "../GrandTileOption.vue";
import GrandWideOptionComp from "../GrandWideOption.vue";
import GrandBlockOptionComp from "../GrandBlockOption.vue";
import utils from "@/utils";

export default defineComponent({
  components: { 
    "grand-tile-option": GrandTileOptionComp, 
    "grand-wide-option": GrandWideOptionComp, 
    "grand-block-option": GrandBlockOptionComp,
  },
  name: "CloneOptionField",
  props: {
    field: Object as () => {
      key: string;
      value: string | null;
      ref: boolean;
      label: string;
      info?: StandardPopupInfo;
      options: string[];
      source: "selection" | "meta";
      type: "options";
    },
    number: Number,
    setCloneMeta: Function as any as () => (
      meta: { key: string; value: string | null; ref: boolean },
      number: number
    ) => void,
    restrictions: Object as () => Record<string, any[]>,
    enablers: Object as () => Record<string, any[]>,
  },
  computed: {
    ...mapState(["objectIDMap", "currentProduct"]),
    ...mapGetters({ modMap: "getWoocommerceMods", basePrice: "getBasePrice", }),
    optionList(): Option[] {
      if (this.field?.options) {
        return this.field.options
          .map((id) => this.objectIDMap[id])
          .filter((o) => {
            return utils.standardOptionFilter(
              o,
              [
                this.currentProduct,
                "selections",
                ...this.casing.getPath(),
              ],
              this.restrictions!,
              this.enablers!
            );
          });
      }
      return [];
    },
    currentOption(): Option | null {
      if (this.field?.value) {
        return this.objectIDMap[this.field.value] || null;
      }
      return null;
    },
    casing(): OptionCasing {
      return structure.branch(this.field!.key)!;
    },
    optionClass(): string {
      if (this.currentOption) {
        return "type-" + utils.toKebobCase(this.currentOption.type);
      }
      if (this.optionList[0]) {
        return "type-" + utils.toKebobCase(this.optionList[0].type);
      }
      return "";
    },
  },
  methods: {
    ...mapMutations(["setStandardPopup"]),
    formatLabel(label: string) {
      return label.replaceAll("$i$", this.number + "");
    },
    selectOption(option: Option | null) {
      // Make sure the first iteration of the player list is the
      // only selection that updates the actual casing value. The 
      // rest of the iterations will only update the cloner meta.
      if (this.number == 1) {
        this.casing.value = option;
      }
      if (option) {
        this.setMetaValue(option.id);
        if ('apply' in option && option.apply) {
          const applications = Array.isArray(option.apply) ? option.apply : [option.apply];
          for (let i = 0; i < applications.length; i++) {
            const application = applications[i];
            this.enforceApplication(application);
          }
        }
      } else {
        this.setMetaValue(null);
      }
    },
    enforceApplication(application: OptionApplication) {
      if (this.number == 1 || !this.setCloneMeta) {
        return;
      }
      const branch = structure.branch(application.path);
      if (!branch) {
        return;
      }
      if (!application.force && branch.userInteraction) {
        // The branch has already had user interaction, so we can't
        // apply an application to it, unless it's a force application.
        return;
      }
      const option = application.option ? (this.objectIDMap[application.option] || null) : null;
      if (application.delay) {
        setTimeout(() => {
          this.setCloneMeta!({ key: branch.branchID, value: option?.id || null, ref: false }, this.number!);
        }, application.delay);
      } else {
        this.setCloneMeta({ key: branch.branchID, value: option?.id || null, ref: false }, this.number!);
      }
    },
    showOptionsInfo() {
      if (this.field?.info) {
        this.setStandardPopup(this.field.info);
      }
    },
    setMetaValue(value: string | null) {
      if (
        this.setCloneMeta &&
        this.field &&
        !this.field.ref &&
        this.number !== undefined
      ) {
        this.setCloneMeta(
          {
            key: this.field.key,
            value,
            ref: false,
          },
          this.number
        );
      }
    },
    getUpcharge(option: GrandOption) {
      if (this.casing && this.currentProduct) {
        if (option) {
          let upcharge = utils.getOptionUpcharge(
            option,
            this.casing,
            this.currentProduct,
            this.basePrice,
            this.modMap
          );
          if (typeof upcharge == "string") {
            upcharge = parseFloat(upcharge);
          }
          if (upcharge >= 0) {
            return `+${upcharge}`;
          }
          return upcharge.toString();
        }
      }
      return "+0";
    },
  },
});
</script>

<style lang="scss" scoped>
.label-wrap {
  display: flex;
  align-items: center;
  font: 300 16px/120% $fnt-cm;
  padding-bottom: 1em;
  gap: 1em;
}
label {
  padding-top: 0.8em;
  font-weight: 700;
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
.options {
  margin-bottom: 12px;
}
.type-grand-tile-option > .options {
  display: flex;
  flex-wrap: wrap;
  max-width: 340px;
  gap: 8px;
}

.type-grand-wide-option > .options {
  display: flex;
  flex-wrap: wrap;
  column-gap: 24px;
  row-gap: 14px;
}
.grand-wide-option {
  padding-top: 0;
  margin-bottom: 0;
  :deep(.option-name) {
    margin-inline: 0;
    white-space: nowrap;
  @media (max-width: $small-width) {
    padding-inline: 8px;
  }
  }
}
</style>