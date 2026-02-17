<template>
  <div
    v-if="popup?.payload"
    class="size-run-selector"
  >
    <div v-if="popup.message" class="head">
      <div v-if="popup.title" class="head-title">{{ popup.title }}</div>
      <div class="head-content" v-html="popup.message"></div>
    </div>
    <div class="body">
      <div v-if="popup.payload.label || popup.payload.info" class="label" @click="openInfo">
        <h2>{{ popup.payload.label || 'Size Run' }}</h2>
        <div v-if="popup.payload.info" class="info"></div>
      </div>
      <div class="sizes">
        <div class="size" v-for="(size, index) in popup.payload.options" :key="index">
          <span class="name">
            <span class="sizer" aria-hidden="true">{{ longestSizeName }}</span>
            <span class="value">{{ size.name }}</span>
          </span>
          <span class="sub">
            <span class="sizer" aria-hidden="true">{{ longestSubName }}</span>
            <span class="value">{{ size.sub }}</span>
          </span>
          <span class="qty">
            <select :name="size.name + ' quantity'" @change="e => updateQuantity(index, e?.target?.['value'])" :value="quantities[index] || '0'">
              <option v-for="n in (size.qtyHi - size.qtyLo + 1)" :key="n + size.qtyLo - 1" :value="n + size.qtyLo - 1">{{ n + size.qtyLo - 1 }}</option>
            </select>
          </span>
        </div>
      </div>
    </div>
    <div v-if="hasMinRequired" @click="onContinue" class="continue">Continue</div>
    <div v-if="popup.payload.skipable" @click="onSkip" class="skip">Skip Until Later</div>
  </div>
</template>

<script lang="ts">
import store from "@/store";
import { SpecialPopupInfo } from "@/types";
import { defineComponent, ref } from "vue";
import { mapMutations } from "vuex";

export default defineComponent({
  name: "SizeRunSelector",
  props: {
    popup: Object as () => SpecialPopupInfo | null,
  },
  computed: {
    longestSizeName() {
      if (!this.popup?.payload?.options) return '';
      let longest = '';
      for (const size of this.popup.payload.options) {
        if (size.name.length > longest.length) longest = size.name;
      }
      return longest;
    },
    longestSubName() {
      if (!this.popup?.payload?.options) return '';
      let longest = '';
      for (const size of this.popup.payload.options) {
        if (size.sub && size.sub.length > longest.length) longest = size.sub;
      }
      return longest;
    },
    hasMinRequired() {
      if (!this.popup?.payload?.options) return false;
      if (!this.popup?.payload?.minimum) return true;
      return Object.values(this.quantities).reduce((a, b) => a + b, 0) >= this.popup.payload.minimum;
    }
  },
  data() {
    return {
      quantities: {} as Record<number, number> 
    };
  },
  methods: {
    ...mapMutations(["setSpecialPopup", "setStandardPopup"]),
    updateQuantity(index: number, value: string) {
      const numVal = parseInt(value);
      if (isNaN(numVal) || numVal <= 0)  {
        delete this.quantities[index];
      } else {
        this.quantities[index] = numVal;
      }
      this.$emit('update', this.quantities);
      if (this.popup?.payload?.onUpdate) {
        this.popup.payload.onUpdate(this.quantities);
      }
    },
    openInfo() {
      if (this.popup?.payload?.info) {
        // Show info in another popup
        this.setStandardPopup(this.popup.payload.info);
        // Now watch the standardPopupInfo in the store
        // and reopen this popup when it closes
        const popupData = this.popup;
        const unwatch = store.watch(
          (state) => state.standardPopupInfo,
          (newVal) => {
            if (!newVal) {
              this.setSpecialPopup(popupData);
              unwatch();
            }
          }
        );
        // Close this popup
        this.setSpecialPopup(null);
      }
    },
    onSkip() {
      if (this.popup?.cancel?.callback) {
        this.popup.cancel.callback();
      }
      this.setSpecialPopup(null);
    },
    onContinue() {
      if (this.popup?.confirm?.callback) {
        this.popup.confirm.callback();
      }
      this.setSpecialPopup(null);
    }
  },
  setup() {
    const tempFileInput = ref<HTMLInputElement | null>(null);
    return {
      tempFileInput,
    };
  },
});
</script>

<style scoped lang="scss">

.size-run-selector {
  overflow: auto;
  display: flex;
  flex-direction: column;
  width: 485px;
  max-width: 100%;
  box-sizing: border-box;
}
.head {
  font: 400 13px/1.2 $fnt-cm;
  letter-spacing: 0.1em;
  @media (max-width: $xsmall-width) {
    font-size: 11px;
  }
}
.head-title {
  font: 500 16px/120% $fnt-cm;
  margin-right: 20px;
  display: inline-block;
  min-width: 214px;
  padding-bottom: 10px;
  @media (min-width: $small-width-up) {
    font-size: 20px;
    padding-right: 30px;
  }
}
.head-content {
  font: 400 16px/1.2 $fnt-cm;
  .head-title + & {
    margin-top: 16px;
    margin-bottom: 32px;
  }
}

.label {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  white-space: nowrap;
  margin-bottom: 0.4em;
  cursor: pointer;
  @media (max-width: $xsmall-width) {
    font-size: 12px;
  }
  h2 {
    font: inherit;
  }
}
.info {
  aspect-ratio: 1;
  height: 1.1em;
  background: url(../../assets/info.svg) no-repeat center / contain;
  transition: transform 0.2s ease;
  cursor: pointer;
  opacity: 1;
  margin-left: 0.3em;
  margin-bottom: 0.2em;
  :is(.discount, .title):hover & {
    transform: scale(1.2);
  }
}

.body {
  border-top: 1px solid #000;
  padding: 12px 12px 0 4px;
}
.sizes {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}

.size {
  display: flex;
  align-items: center;
  gap: 0.6em;
  font: 400 14px/1.2 $fnt-cm;
  text-align: left;
  @media (max-width: $xsmall-width) {
    font-size: 12px;
  }
}
.name {
  font: 600 30px/1.2 $fnt-cm;
  letter-spacing: -0.025em;
  text-transform: uppercase;
  position: relative;
  .value {
    position: absolute;
    inset: 0;
  }
  .sizer {
    visibility: hidden;
    user-select: none;
    pointer-events: none;
  }
}
.sub {
  font-weight: 600;
  text-transform: uppercase;
  position: relative;
  .value {
    position: absolute;
    inset: 0;
  }
  .sizer {
    visibility: hidden;
    user-select: none;
    pointer-events: none;
  }
}
.qty {
  margin-left: 4px;
  border: 1px solid #bcbec0;
  padding-right: 0.2em;

  select {
    border: none;
    padding: 0.3em 0.3em;
    background-color: #fff0;
    outline: none;
    cursor: pointer;
    border-radius: 0;
    font: 500 16px/1 $fnt-cm;
    color: #58595b;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
  }
}
.skip {
  margin-top: 1.5em;
  text-transform: uppercase;
  cursor: pointer;
  user-select: none;
  color: $orange;
  font: 500 16px/1.2 $fnt-cm;
  letter-spacing: 0.04em;
  text-decoration: underline #fff0;
  transition: text-decoration-color 0.2s linear;
  text-align: center;
  width: fit-content;
  margin-inline: auto;
  body:not(.is-touch) &:hover {
    text-decoration-color: $orange;
  }
  .continue ~ & {
    margin-top: 0.9em;
  }
}
.continue {
  margin: 1.3em auto 0;
  border: 2px solid #000;
  background-color: #000;
  color: #fff;
  font: 600 14px/1 $fnt-cm;
  border-radius: 1000px;
  user-select: none;
  text-align: center;
  padding: 0.9em 1.4em 0.8em;
  cursor: pointer;
  min-width: 92px;
  width: fit-content;
  letter-spacing: -0.025em;
  transition: background-color 0.2s linear, color 0.2s linear;
  body:not(.is-touch) &:hover {
    background-color: #fff;
    color: $orange;
  }
}
</style>
