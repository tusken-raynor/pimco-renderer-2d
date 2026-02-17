<template>
  <div v-if="!isHidden" :class="['subattribute-compl', { completed, optional }]">
    {{ label }}
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import utils from "@/utils";
import { mapGetters, mapState } from "vuex";
export default defineComponent({
  name: "SubAttribute",
  props: {
    subattribute: Object,
    label: String,
  },
  computed: {
    ...mapState(["objectIDMap"]),
    ...mapGetters({
      restrictions: "getRestrictions",
      enablers: "getIndexedEnablers",
    }),
    completed(): boolean {
      if (this.subattribute) {
        return utils.fishCompletion(
          this.subattribute,
          this.restrictions,
          this.enablers
        );
      }
      return false;
    },
    optional(): boolean {
      if (this.subattribute) {
        const allowed = utils.fishCompletion(
          this.subattribute,
          this.restrictions,
          this.enablers,
          true
        );
        if (allowed && !this.completed) {
          return true;
        }
      }
      return false;
    },
    isHidden(): boolean {
      return (this.subattribute?.['x-data']?.attributes || []).some((attr: { id: string }) => this.objectIDMap[attr.id]?.hidden);
    },
  },
});
</script>

<style lang="scss" scoped>
.subattribute-compl {
  font-weight: 300;
  letter-spacing: -0.025em;
  padding-bottom: 8px;
  position: relative;
  &.completed {
    &::before,
    &::after {
      position: absolute;
      content: "";
      width: 2px;
      background-color: $orange;
      left: -16px;
      transform-origin: 50% calc(100% - 1px);
      .show-incomplete & {
        background-color: $green;
      }
    }
    &::before {
      height: 8px;
      transform: rotate(-45deg);
      top: 6px;
    }
    &::after {
      height: 16px;
      transform: rotate(40deg);
      top: -2px;
    }
  }
  .show-incomplete &:not(.completed):not(.optional) {
    &::before {
      content: "";
      background: url(../../assets/incomplete.svg) no-repeat center/contain;
      width: 12px;
      height: 12px;
      position: absolute;
      left: -20px;
      top: calc(50% - 12px);
      opacity: 0.5;
      transition: opacity 0.2s linear;
    }
    &:hover::before {
      opacity: 1;
    }
  }
}
</style>