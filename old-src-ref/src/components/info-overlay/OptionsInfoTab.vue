<template>
  <div
    :class="['option', { dropdown: height > magicNumber, open }]"
    @click="toggleDropdown"
  >
    <div class="swatch">
      <BaseImage :data="option.graphic" />
    </div>
    <div class="info">
      <div class="label">{{ option.name }}</div>
      <div
        class="description"
        :style="transition ? { height: height + 'px' } : ''"
        ref="optionText"
        v-html="option.info"
      ></div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import { BasicOption } from "@/types";
import { mapMutations } from "vuex";
export default defineComponent({
  name: "OptionsInfoTab",
  props: {
    option: Object as () => BasicOption,
    select: Function,
  },
  methods: {
    checkHeight() {
      if (this.optionText) {
        const height = this.optionText.getBoundingClientRect().height;
        this.height = height;
      }
    },
    toggleDropdown() {
      if (this.height > this.magicNumber) {
        this.transition = true;
        if (this.open) {
          requestAnimationFrame(() => {
            this.transition = false;
          });
        } else {
          setTimeout(() => {
            this.transition = false;
          }, 300);
        }
        this.open = !this.open;
      }
    },
  },
  setup() {
    const magicNumber: Ref<number> = ref(48);
    const optionText: Ref<HTMLElement | null> = ref(null);
    const height: Ref<number> = ref(-1);
    const transition: Ref<boolean> = ref(false);
    const open: Ref<boolean> = ref(false);
    return { optionText, height, open, transition, magicNumber };
  },
  mounted() {
    setTimeout(this.checkHeight, 50);
  },
});
</script>

<style lang="scss" scoped>
.option {
  margin: 0 18px;
  padding: 20px 18px;
  display: flex;
  position: relative;
  border-top: 1px solid #d8d6d2;
  &.dropdown {
    cursor: pointer;
    user-select: none;
    &::before {
      content: "";
      position: absolute;
      top: 17px;
      right: 15px;
      width: 7px;
      height: 7px;
      border: 2px solid transparent;
      border-bottom-color: #707070;
      border-left-color: #707070;
      transform: rotate(-45deg);
      transition: transform 0.2s ease;
    }
    .description {
      height: 32px;
      overflow: hidden;
      transition: height 0.3s ease;
    }
    &.open {
      .description {
        height: auto;
      }
      &::before {
        transform: rotate(-225deg);
      }
    }
  }
  .swatch {
    margin-right: 20px;
    cursor: pointer;
    width: 45px;
    flex-shrink: 0;
    img {
      max-width: 100%;
      height: auto;
      display: block;
    }
  }
  .info {
    font-size: 14px;
    letter-spacing: 0.075em;
    line-height: 121.428%;
    font-weight: 300;
    text-align: left;
    .label {
      font-weight: 700;
      margin-bottom: 0.2em;
      margin-right: 12px;
      text-transform: uppercase;
    }
  }
  &::after {
    content: "";
    position: absolute;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 10px 0 10px 10px;
    border-color: transparent transparent transparent #ff6b00;
    top: 30px;
    left: -16px;
    transform-origin: left;
    transform: scaleX(0);
    transition: transform 0.2s cubic-bezier(0.76, 0, 0.24, 1);
  }
  &.selected::after {
    transform: scaleX(1);
  }
}
</style>