<template>
  <div v-if="popup?.payload" class="bat-construction-modifier">
    <div class="popup-title">select</div>
    <div v-for="branch in branches" class="attribute">
      <div class="attribute-head">
        <div class="attribute-name">
          <div class="actual-name">{{ branch.attribute.nickname || branch.attribute.name }}</div>
          <div class="name-sizer" aria-hidden="true">{{ longestAttributeName }}</div>
        </div>
        <div v-if="branch.attribute.info" class="info-link" @click="openInfoDialog(branch.attribute.info)">Info</div>
      </div>
      <div v-if="branch.attribute.name == 'Length' && setValueStorage['brcY179409250'] != 'gwotdGlUycHLSN'" class="dumb-start-pricing">
        SIZE: 28"-30" STARTING AT $180<br>
        SIZE: 31"-34" STARTING AT $280
      </div>
      <div v-if="branch.attribute.name == 'Length' && setValueStorage['brcY179409250'] == 'gwotdGlUycHLSN'" class="dumb-start-pricing">
        SIZE: 34"-36" STARTING AT $280
      </div>
      <div class="option" @click="openSelectionMenu(branch.casing.branchID)">
        <select :name="branch.casing.branchID" @change="onOptionChange" @click.stop>
          <option v-for="option in branch.options" :value="option.id" :selected="branch.casing.value?.id == option.id">{{ option.nickname || option.name }}</option>
        </select>
      </div>
    </div>
    <div class="save">
      <button class="save-btn" @click="applySetValues">Save</button>
    </div>
  </div>
</template>

<script lang="ts">
import { SpecialPopupInfo, Attribute, Option, StandardPopupInfo } from "../../types";
import { defineComponent, ref, Ref } from "vue";
import { mapMutations, mapState, mapGetters } from "vuex";
import structure from "../../structure";
import { OptionCasing } from "../../structure/OptionCasing";
import utils from "@/utils";
import { evalApplicationConditions } from "@/store/mutations";

export default defineComponent({
  name: "BatConstruction",
  props: {
    popup: Object as () => SpecialPopupInfo | null,
  },
  computed: {
    ...mapState(["objectIDMap", "currentProduct"]),
    ...mapGetters({
      restrictions: "getRestrictions",
      enablers: "getIndexedEnablers",
    }),
    branches(): Array<{ casing: OptionCasing, attribute: Attribute, options: Option[] }> {
      const branches: Array<{ casing: OptionCasing, attribute: Attribute, options: Option[] }> = [];
      if (this.popup?.payload?.branches) {
        for (let i = 0; i < this.popup.payload.branches.length; i++) {
          const branchID = this.popup.payload.branches[i];
          const casing = structure.branch(branchID);
          if (!casing?.parent) continue;
          const attribute: Attribute | undefined = this.objectIDMap[casing.parent];
          if (!(attribute && 'options' in attribute && attribute.options)) continue;
          const options = 'options' in attribute.options ?
            attribute.options.options.map(id => this.objectIDMap[id]).filter((x: Option | undefined) => !!x) :
            attribute.options.map(id => this.objectIDMap[id]).filter((x: Option | undefined) => !!x);
          if (options.length === 0) continue;
          branches.push({ casing, attribute, options: this.filterOptions(options, casing) });
        }
      }
      return branches;
    },
    longestAttributeName(): string {
      let longest = this.branches[0]?.attribute.nickname || this.branches[0]?.attribute.name;
      for (let i = 1; i < this.branches.length; i++) {
        const name = this.branches[i].attribute.nickname || this.branches[i].attribute.name;
        if (name.length > longest.length) longest = name;
      }
      return longest;
    },
    pseudoRestrictions(): Record<string, string[]> {
      // Look through whatever may need to be applied even when chaning options in the popup
      const restrictions: Record<string, string[]> = {};
      for (const branchID in this.setValueStorage) {
        const optionID = this.setValueStorage[branchID];
        const branch = structure.branch(branchID);
        if (!branch) continue;
        const option: Option = this.objectIDMap[optionID];
        if (!(option && 'restrict' in option)) continue;
        if (option.restrict) {
          const restrictArray = option.restrict instanceof Array ? option.restrict : [option.restrict];
          for (let i = 0; i < restrictArray.length; i++) {
            const restriction = restrictArray[i];
            if (typeof restriction == "string") {
              restrictions[restriction] = [];
            } else {
              if (restriction.extrarules && !evalApplicationConditions(restriction.extrarules, this.$store.state)) {
                continue
              }
              restrictions[restriction.id as string] = restriction.path || [];
            }
          }
        }
      }
      return restrictions;
    },
    pseudoEnablers(): Record<string, string[]> {
      // Look through whatever may need to be applied even when chaning options in the popup
      const enablers: Record<string, string[]> = {};
      for (const branchID in this.setValueStorage) {
        const optionID = this.setValueStorage[branchID];
        const branch = structure.branch(branchID);
        if (!branch) continue;
        const option: Option = this.objectIDMap[optionID];
        if (!(option && 'enable' in option)) continue;
        if (option.enable) {
          const enableArray = option.enable instanceof Array ? option.enable : [option.enable];
          for (let i = 0; i < enableArray.length; i++) {
            const enable = enableArray[i];
            if (typeof enable == "string") {
              enablers[enable] = [];
            } else {
              if (enable.extrarules && !evalApplicationConditions(enable.extrarules, this.$store.state)) {
                continue
              }
              const ids = enable.id instanceof Array ? enable.id : [enable.id];
              for (let j = 0; j < ids.length; j++) {
                enablers[ids[j]] = enable.path || [];
              }
            }
          }
        }
      }
      return enablers;
    },
  },
  methods: {
    ...mapMutations(["setSpecialPopup", "setStandardPopup", "removeStandardPopup"]),
    onOptionChange(event: Event) {
      const target = event.target as HTMLSelectElement;
      const branchID = target.name;
      const optionID = target.value;
      this.setOption(branchID, optionID);
    },
    setOption(branchID: string, optionID: string) {
      this.setValueStorage[branchID] = optionID;
    },
    applySetValues() {
      // Set the values on the branches
      for (const branchID in this.setValueStorage) {
        const optionID: string = this.setValueStorage[branchID];
        const branch = structure.branch(branchID);
        if (!branch) continue;
        const option = this.objectIDMap[optionID];
        if (!option) continue;
        branch.value = option;
        branch.userInteraction = true;
      }
      // Close the popup
      this.setSpecialPopup(null);
    },
    openInfoDialog(info: StandardPopupInfo | undefined) {
      if (!info) return;
      const popupData = this.popup!;
      const setSpecialPopup = this.setSpecialPopup;
      const removeStandardPopup = this.removeStandardPopup;
      setSpecialPopup(null);
      this.setStandardPopup({
        ...info,
        onClose() {
          removeStandardPopup();
          setSpecialPopup(popupData);
        }
      })
    },
    openSelectionMenu(name: string) {
      const selectElement = document.querySelector<HTMLSelectElement>(`.bat-construction-modifier select[name="${name}"]`);
      setTimeout(() => {
        if (selectElement) {
          selectElement.focus();
          selectElement.click();
        }
      }, 100);
    },
    filterOptions(options: Option[], branch: OptionCasing): Option[] {
      return options.filter(option => this.optionFilter(option, branch));
    },
    optionFilter(o: Option | null, branch: OptionCasing): boolean {
      return utils.standardOptionFilter(
        o,
        [
          this.currentProduct,
          "selections",
          ...branch.getPath()
        ],
        this.pseudoRestrictions as any,
        this.pseudoEnablers as any
      );
    },
  },
  setup() {
    const setValueStorage: Ref<Record<string, string>> = ref({});
    return {
      setValueStorage,
    };
  },
  mounted() {
    // Set the initial values in the setValueStorage
    for (const branch of this.branches) {
      if (branch.casing.value?.id) {
        this.setValueStorage[branch.casing.branchID] = branch.casing.value.id;
      }
    }
  },
  beforeUnmount() {
    this.setValueStorage = {};
  },
});
</script>

<style lang="scss" scoped>
  .popup-title {
    font: 40px / 110% $fnt-fh;
    color: $orange;
    text-align: center;
    padding-bottom: 0.3em;
    margin-bottom: 4px;
    border-bottom: 1px solid #D1D3D4;
  }
  .attribute {
    margin-top: 36px;
    max-width: 340px;
    margin-inline: auto;
    @media (max-width: $small-width) {
      margin-top: 20px;
    }
  }
  .attribute-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .attribute-name {
    font: 700 28px / 110% $fnt-cm;
    letter-spacing: -0.02em;
    @media (max-width: $small-width) {
      font-size: 20px;
    }

    .name-sizer {
      height: 0!important;
      overflow: hidden;
    }
  }
  .info-link {
    cursor: pointer;
    font-size: 0;
    width: 17px;
    aspect-ratio: 1;
    background: url(../../assets/info.svg) no-repeat center/contain;
  }
  .option {
    margin-top: 14px;
    position: relative;
    font: 300 18px / 110% $fnt-cm;

    select {
      width: 100%;
      border: 1px solid #D1D3D4;
      background-color: #fff;
      font: inherit;
      padding: 0.7em 2.5em 0.5em 0.6em;
      border-radius: 0.55em;
      color: #000;
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      cursor: pointer;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='%236E6F6F' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M1 1.5L6 6.5L11 1.5'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 0.8em center;
      background-size: 12px 8px;
    }
  }

  .dumb-start-pricing {
    font: 600 12px / 1.2 $fnt-cm;
    color: #000;
    letter-spacing: 0.053em;
    text-transform: uppercase;
    margin-bottom: 0.8em;
    margin-top: 0.8em;
  }

  .save {
    margin-inline: auto;
    max-width: 340px;
    margin-top: 88px;
    margin-bottom: 24px;
    @media (max-width: $small-width) {
      margin-top: 40px;
    }

    .save-btn {
      border: 2px solid $orange;
      background: $orange;
      color: #fff;
      font: 700 24px / 110% $fnt-cm;
      padding: 0.7em 1.5em 0.6em;
      cursor: pointer;
      transition: color 0.2s linear, background-color 0.2s linear;
      width: 100%;
      text-transform: uppercase;

      &:hover {
        background-color: #fff;
        color: $orange;
      }
    }
  }
</style>
