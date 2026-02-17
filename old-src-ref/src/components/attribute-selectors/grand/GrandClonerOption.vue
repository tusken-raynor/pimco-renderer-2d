<template>
  <div
    :class="['grand-option', 'grand-cloner-option', { selected: isSelected }]"
    :data-id="option.id"
  >
    <div v-if="prompt" class="prompt" v-html="prompt"></div>
    <div class="selector" @click="selectOption">yes</div>
    <div class="unselector" @click="unselectOption">no</div>
    <div class="cloner" ref="clonerEl">
      <transition name="fade">
        <div v-if="isSelected" class="cloner-wrap">
          <div class="clone-sequence">
            <clone-field-set
              v-for="(fieldset, i) in cloneFieldData"
              :key="clonerKey + i"
              :number="i + 1"
              :fieldset="fieldset"
              :edit="editIndex == i"
              :remove="() => removeFieldSet(i)"
              :set-clone-meta="setCloneMeta"
              :set-edit-index="setEditIndex"
              ref="fieldSets"
            />
          </div>
          <div class="create-clone" @click="addCloneMetaGrouping">
            <div class="plus"></div>
            <span>{{ addLabel }}</span>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script lang="ts">
import { OptionCasing } from "@/structure";
import { GrandClonerOption, OrderCloneMutation } from "@/types";
import utils from "@/utils";
import { defineComponent, ref, Ref, VueElement } from "vue";
import { mapGetters, mapMutations, mapState } from "vuex";
import CloneFieldSet from "./parts/CloneFieldSet.vue";
export default defineComponent({
  name: "GrandClonerOption",
  props: {
    option: Object as () => GrandClonerOption,
    select: Function,
    subKey: String,
    setname: Function,
    open: Boolean,
    selected: Object as () => GrandClonerOption | null,
    casing: Object as () => OptionCasing,
  },
  components: {
    CloneFieldSet,
  },
  computed: {
    ...mapState(["objectIDMap", "selectedOptions", "currentProduct"]),
    ...mapGetters({
      attribute: "getAttribute",
      cloneFieldDataMap: "getDerivedCloneFieldData",
    }),
    cloneMeta(): any {
      return this.selectedOptions[this.currentProduct].cloneMeta || {};
    },
    isSelected(): boolean {
      return !!(this.option && this.option == this.selected);
    },
    prompt(): string {
      if (this.option?.prompt) {
        return this.option.prompt;
      }
      return "";
    },
    addLabel(): string {
      if (this.option?.addlabel) {
        return this.option.addlabel;
      }
      return "Add";
    },
    clonerKey(): string {
      if (this.casing && this.option) {
        return this.casing.branchID + "-" + this.option.id;
      }
      return "";
    },
    cloneMetaList():
      | { key: string; value: string | null; ref: boolean }[][]
      | false {
      if (this.clonerKey) {
        return this.cloneMeta[this.clonerKey] || [];
      }
      return false;
    },
    cloneFieldData(): ({
      key: string;
      value: string | null;
      ref: boolean;
    } & OrderCloneMutation)[][] {
      return this.cloneFieldDataMap[this.clonerKey] || [];
    },
  },
  methods: {
    ...mapMutations([
      "setCloneMetaValue",
      "addCloneMetaGroup",
      "removeCloneMetaGroup",
    ]),
    selectOption() {
      if (this.select) {
        this.select();
      }
    },
    unselectOption() {
      if (this.select) {
        this.select(null);
      }
    },
    setCloneMeta(
      meta: { key: string; value: string | null; ref: boolean },
      number: number
    ) {
      const index = number - 1;
      this.setCloneMetaValue({
        meta,
        index,
        cloneKey: this.clonerKey,
      });
    },
    addCloneMetaGrouping() {
      if (this.option?.mutations && this.cloneMetaList) {
        const length = this.cloneMetaList.length;
        if (length < 1) {
          this.addCloneMetaGroup({
            schema: this.option.mutations.filter((x) => x.source == "meta"),
            cloneKey: this.clonerKey,
          });
        } else {
          this.addCloneMetaGroup({
            schema: this.option.mutations,
            cloneKey: this.clonerKey,
          });
        }
        this.setEditIndex(length);
      }
    },
    setEditIndex(index: number) {
      this.editIndex = index;
    },
    removeFieldSet(index: number) {
      this.removeCloneMetaGroup({ cloneKey: this.clonerKey, index });
      this.editIndex = -1;
    },
    getScrollableParent(el: HTMLElement): HTMLElement | null {
      let parent = el.parentElement as HTMLElement | null;
      while (parent && parent.scrollTop === 0) {
        parent = parent.parentElement;
      }
      return parent;
    },
  },
  setup() {
    const clonerEl: Ref<HTMLElement | null> = ref(null);
    const editIndex: Ref<number> = ref(0);
    const fieldSets: Ref<{ $el: HTMLElement }[]> = ref([]);
    return {
      clonerEl,
      editIndex,
      fieldSets,
    };
  },
  watch: {
    open(value) {
      if (!value && this.setname && this.selected) {
        this.setname(this.selected.name);
      }
    },
    isSelected(value) {
      if (value && this.cloneMetaList && !this.cloneMetaList.length) {
        this.addCloneMetaGrouping();
      }
    },
    // editIndex(index) {
    //   console.log(this.fieldSets, index);
    //   const el = this.fieldSets[index]?.$el;
    //   if (el) {
    //     const scrollParent = this.getScrollableParent(el);
    //     if (scrollParent) {
    //       setTimeout(() => {
    //         const top =
    //           el.getBoundingClientRect().top -
    //           scrollParent.getBoundingClientRect().top -
    //           scrollParent.scrollTop;
    //         utils.smoothScroll({ top: top - 18, left: 0 }, 700, scrollParent);
    //       }, 500);
    //     }
    //   }
    // },
  },
  mounted() {
    requestAnimationFrame(() => {
      // Rig up clonerEl to have smooth size transition
      if (this.clonerEl) {
        utils.smoothResize(this.clonerEl, 400);
      }
    });
  },
});
</script>

<style lang="scss" scoped>
.grand-cloner-option {
  display: flex;
  flex-direction: column;
  font: 300 25px/120% $fnt-cm;
  letter-spacing: 0.06em;
  @media (max-width: $medium-width) {
    font-size: 16px;
  }
}
.prompt {
  padding-bottom: 1em;
}
.selector,
.unselector {
  padding-left: 1.875em;
  text-transform: capitalize;
  position: relative;
  box-sizing: border-box;
  margin-bottom: 1em;
  cursor: pointer;
  user-select: none;
  &::before,
  &::after {
    content: "";
    position: absolute;
    border-radius: 50%;
    top: calc(50% - 2px);
  }
  &::before {
    width: 0.875em;
    height: 0.875em;
    border: 1px solid #707070;
    transform: translateY(-50%);
    left: 0.312em;
  }
  &::after {
    width: calc(0.875em - 8px);
    height: calc(0.875em - 8px);
    background-color: $green;
    transform: translateY(-50%) scale(0);
    transition: transform 0.2s;
    left: calc(0.312em + 5px);
    @media (max-width: $medium-width) {
      width: calc(0.875em - 4px);
      height: calc(0.875em - 4px);
      left: calc(0.312em + 3px);
    }
  }
}
.grand-option.selected .selector::after {
  transform: translateY(-50%);
}
.grand-option:not(.selected) .unselector::after {
  transform: translateY(-50%);
}
.cloner {
  transition: height 400ms cubic-bezier(0.165, 0.84, 0.44, 1);
}
.create-clone {
  display: flex;
  align-items: center;
  width: max-content;
  cursor: pointer;
  user-select: none;
  .plus {
    height: 1.875em;
    width: 1.875em;
    border-radius: 50%;
    border: 2px solid $orange;
    box-sizing: border-box;
    position: relative;
    transition: background-color 0.3s;
    &::before,
    &::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: $orange;
      transition: background-color 0.3s;
    }
    &::before {
      width: 1.2em;
      height: 2px;
    }
    &::after {
      width: 2px;
      height: 1.2em;
    }
  }
  span {
    padding-top: 0.3em;
    padding-left: 12px;
  }
  @media (min-width: $large-width-up) {
    &:hover .plus {
      background-color: $orange;
      &::before,
      &::after {
        background-color: #fff;
      }
    }
  }
}
</style>