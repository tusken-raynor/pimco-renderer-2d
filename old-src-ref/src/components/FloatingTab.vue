<template>
  <div :class="['floating-dropdown', side, { tucked, plus: renderPlus }]" @click="clickThisThang">
    <div class="thumbnail">
      <BaseImage v-if="image" :data="image" :alt="text || null" class="thumb" />
    </div>
    <div class="size-name" v-html="text"></div>
    <div class="sizes-list"></div>
  </div>
</template>

<script lang="ts">
import { ImageData } from "@/types";
import { defineComponent } from "vue";

export default defineComponent({
  name: "FloatingTab",
  props: {
    side: {
      type: String,
      default: "left",
    },
    image: {
      type: [String, Object as () => ImageData],
    },
    text: String,
    task: Function,
    renderPlus: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      tucked: true,
      untuckedTimer: -1 as any,
    };
  },
  methods: {
    clickThisThang(e: MouseEvent) {
      if (this.task) {
        if (window.innerWidth <= 600) {
          if (this.tucked) {
            this.tucked = false;
            this.untuckedTimer = setTimeout(() => {
              this.tucked = true;
            }, 2000);
          } else {
            this.tucked = true;
            clearTimeout(this.untuckedTimer);
            this.task(e);
          }
        } else {
          this.task(e);
        }
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.floating-dropdown {
  position: absolute;
  z-index: 10;
  top: 0;
  left: 0;
  padding: 10px 8px;
  margin: 6px 0;
  display: flex;
  align-items: center;
  cursor: pointer;
  background-color: #fff;
  &.left {
    border-top-right-radius: 12px;
    border-bottom-right-radius: 12px;
    box-shadow: 3px 3px 8px 0 #00000033;
  }
  &.right {
    border-top-left-radius: 12px;
    border-bottom-left-radius: 12px;
    box-shadow: -3px 3px 8px 0 #00000033;
    left: initial;
    right: 0;
  }
  &.plus {
    padding-right: 42px;
  }
  &.plus::before,
  &.plus::after {
    position: absolute;
    top: 50%;
    right: 16px;
    content: "";
    width: 2px;
    height: 11px;
    background-color: #707070;
  }
  &.plus::before {
    transform: translateY(-50%) rotate(-90deg);
  }
  &.plus::after {
    transform: translateY(-50%);
  }
  .thumbnail {
    height: 45px;
    transition: opacity 0.2s linear;
  }
  .thumbnail img {
    height: 100%;
  }
  .size-name {
    font-size: 13px;
    letter-spacing: 0.05em;
    line-height: 104%;
    font-weight: 600;
    color: #707070;
    text-transform: uppercase;
    text-align: left;
    margin-left: 4px;
    transition: opacity 0.2s linear;
  }
  @media (min-width: $large-width-up) {
    padding: 3px 20px;
    &.plus {
      padding-right: 48px;
    }
    &.plus::before,
    &.plus::after {
      width: 4px;
      height: 16px;
    }
    .size-name {
      color: #000;
      font-size: 14px;
    }
  }
  @media (max-width: $small-width) {
    transition: transform 0.3s cubic-bezier(0.76, 0, 0.24, 1);
    &.tucked {
      transform: translateX(calc(-100% + 40px));
      .thumbnail,
      .size-name {
        opacity: 0;
      }
      &::before,
      &::after {
        position: absolute;
        top: 50%;
        right: 16px;
        content: "";
        width: 2px;
        height: 11px;
        background-color: #707070;
      }
      &::before {
        transform: translateY(-80%) rotate(-50deg);
      }
      &::after {
        transform: translateY(-20%) rotate(50deg);
      }
      &.right {
        transform: translateX(calc(100% - 40px));

        &::before,
        &::after {
          right: initial;
          left: 16px;
        }
        &::before {
          transform: translateY(-80%) rotate(50deg);
        }
        &::after {
          transform: translateY(-20%) rotate(-50deg);
        }
      }
    }
  }
}
</style>
