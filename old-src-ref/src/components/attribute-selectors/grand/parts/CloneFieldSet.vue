<template>
  <div v-if="edit" class="clone-field-set">
    <template v-for="field in fieldset" :key="field.key">
      <clone-text-field
        v-if="field.type == 'text'"
        :field="field"
        :number="number"
        :set-clone-meta="setCloneMeta"
      />
      <clone-option-field
        v-else
        :field="field"
        :number="number"
        :set-clone-meta="setCloneMeta"
        :restrictions="localRestrictions"
        :enablers="localEnablers"
      />
    </template>
    <div v-if="number > 1" class="edit-group remove" @click="remove">
      remove
    </div>
  </div>
  <div v-else class="clone-field-set-static">
    <div v-for="field in fieldset" :key="field.key" class="field">
      <span
        class="field-label"
        v-html="formatLabel(field.shortlabel || field.label)"
      ></span>
      <strong class="field-value">{{ getValue(field) }}</strong>
    </div>
    <div
      v-if="setEditIndex"
      class="edit-group"
      @click="setEditIndex(number - 1)"
    >
      edit
    </div>
  </div>
</template>

<script lang="ts">
import { ConfiguratorEnabling, ConfiguratorRestriction, Option, StandardPopupInfo } from "@/types";
import { defineComponent } from "vue";
import CloneTextField from "./CloneTextField.vue";
import CloneOptionField from "./CloneOptionField.vue";
import { mapState, mapGetters } from "vuex";

type CloneMetaField = {
  key: string;
  value: string | null;
  ref: boolean;
  label: string;
  info?: StandardPopupInfo;
  options?: string[];
  source: "selection" | "meta";
  type: "text" | "options";
  pattern?: string;
};

export default defineComponent({
  components: { CloneTextField, CloneOptionField },
  name: "CloneFieldSet",
  props: {
    fieldset: Array as () => CloneMetaField[],
    number: Number,
    edit: Boolean,
    setCloneMeta: Function,
    setEditIndex: Function,
    remove: Function,
  },
  computed: {
    ...mapState(["objectIDMap"]),
    ...mapGetters({ restrictions: "getRestrictions", enablers: "getIndexedEnablers", }),
    localRestrictions() {
      if (this.number === 1) {
        return this.restrictions;
      }
      const restrictions: Record<string, Array<any>> = {};
      if (this.fieldset) {
        for (let i = 0; i < this.fieldset.length; i++) {
          const field = this.fieldset[i];
          if (field.value && this.objectIDMap[field.value]?.restrict) {
            const restrict = Array.isArray(this.objectIDMap[field.value].restrict)
              ? this.objectIDMap[field.value].restrict
              : [this.objectIDMap[field.value].restrict];
              for (let j = 0; j < restrict.length; j++) {
              const em = restrict[j];
              if (typeof em == 'string') {
                restrictions[em] = [];
              } else {
                restrictions[em.id] = em.path;
              }
            }
          }
        }
      }
      return restrictions;
    },
    localEnablers() {
      if (this.number === 1) {
        return this.enablers
      }
      const enablers: Record<string, Array<any>> = {};
      if (this.fieldset) {
        for (let i = 0; i < this.fieldset.length; i++) {
          const field = this.fieldset[i];
          if (field.value && this.objectIDMap[field.value]?.enable) {
            const enable = Array.isArray(this.objectIDMap[field.value].enable)
              ? this.objectIDMap[field.value].enable
              : [this.objectIDMap[field.value].enable];
            for (let j = 0; j < enable.length; j++) {
              const em = enable[j];
              if (typeof em == 'string') {
                enablers[em] = [];
              } else {
                enablers[em.id] = em.path;
              }
            }
          }
        }
      }
      return enablers;
    }
  },
  methods: {
    formatLabel(label: string) {
      return label.replaceAll("$i$", this.number + "");
    },
    getValue(field: CloneMetaField) {
      if (!field.value) {
        return "N/A";
      }
      if (field.type == "options") {
        const option = this.objectIDMap[field.value] as Option;
        return option ? option.name : field.value;
      }
      return field.value;
    },
  }
});
</script>

<style lang="scss" scoped>
.clone-field-set,
.clone-field-set-static {
  padding-bottom: 38px;
  padding-top: 1em;
  position: relative;
}
.edit-group {
  font: 20px/120% $fnt-cm;
  position: absolute;
  top: 0;
  left: min(100%, 400px);
  transform: translateX(-100%);
  text-transform: capitalize;
  color: $orange;
  text-decoration-line: underline;
  transition: text-decoration-color 0.2s;
  user-select: none;
  cursor: pointer;
  &:not(:hover) {
    text-decoration-color: #0000;
  }
  @media (max-width: $medium-width) {
    font-size: 16px;
  }
}
.field-label {
  &::after {
    content: ": ";
  }
}
</style>