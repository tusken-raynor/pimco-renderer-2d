<template>
  <div
    v-if="attribute && selectedOptions && !displayStudioControls"
    id="attribute-selector-tool"
    data-component
    :data-attribute="attribute.id"
    :data-type="attribute.type"
  >
    <div class="attribute-controls">
      <div class="left-controls">
        <div
          :class="['attribute-info', { 'sm-font': attributeName.length > 12 }]"
          ref="attrInfo"
        >
          <div class="progress">
            {{ currentAttribute + 1 + "/" + attributeCount }}
          </div>
          <div :class="['attribute-name', { disperse }]" ref="attrName">
            <span
              v-if="OS == 'iOS'"
              :style="
                attributeName.length > 14
                  ? `font-size:${14 / attributeName.length}em`
                  : undefined
              "
              >{{ attributeName }}</span
            >
            <dynamic-text v-else :text="attributeName" />
          </div>
        </div>
        <transition name="fade" appear>
          <div
            :class="['more-info', { hide: !attribute.info }]"
            @click="showOptionsInfo"
          ></div>
        </transition>
      </div>
      <div class="right-controls">
        <div
          class="progress-menu"
          @click="openCompletionOverlay"
          title="Check Progress"
        >
          <div class="hamburger">
            <div class="pattie"></div>
            <div class="pattie"></div>
            <div class="pattie"></div>
          </div>
        </div>
        <div class="arrows">
          <div
            :class="['arrow prev-arrow', { disabled: currentAttribute <= 0 }]"
            @click="prevAttr"
          ></div>
          <div
            :class="['arrow next-arrow', { disabled: disableNext }]"
            @click="nextAttr"
          ></div>
        </div>
      </div>
    </div>
    <div v-if="attributeComponent" class="attribute-options" ref="attrOpt">
      <div
        :class="[
          'attribute-component-wrapper',
          { visible, transitioning: attrTransitionBusy },
        ]"
        ref="attrRap"
      >
        <component
          v-if="render"
          :is="attributeComponent"
          :oaacSetter="setOnAttrArrowClick"
        ></component>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import { mapState, mapMutations, mapActions, mapGetters } from "vuex";
import { BasicOption, Product } from "../../types";

import ParallelSelector, {
  ParallelOption,
} from "./parrallel/ParallelSelector.vue";
import BasicSelector from "./basic/BasicSelector.vue";
import ComplexSelector from "./complex/ComplexSelectorNew.vue";
import ColorSelector from "./color/ColorSelector.vue";
import GrandSelector from "./grand/GrandSelector.vue";
import GenericSelector from "./generic/GenericSelector.vue";
import DynamicText from "@/components/DynamicText.vue";
import utils from "@/utils";

export type AttributeOption = BasicOption | ParallelOption;

export default defineComponent({
  name: "AttributeSelectorTool",
  components: {
    BasicSelector,
    ParallelSelector,
    ComplexSelector,
    ColorSelector,
    GrandSelector,
    GenericSelector,
    DynamicText,
  },
  computed: {
    ...mapState([
      "currentProduct",
      "currentAttribute",
      "attributes",
      "products",
      "objectIDMap",
      "selectedOptions",
      "attrTransitionWait",
      "attrTransitionBusy",
      "OS",
      "displayStudioControls",
    ]),
    ...mapGetters({
      model: "getModel",
      attribute: "getAttribute",
      attributes: "getFilteredAttributes",
      productCompleted: "getProductCompletionMinimal",
    }),
    product(): Product {
      return (
        this.products.find((p: any) => p.id == this.currentProduct) || null
      );
    },
    attributeCount(): number {
      return this.attributes.length;
    },
    attributeName(): string {
      if (this.attribute) {
        return this.attribute.nickname || this.attribute.name;
      }
      return "";
    },
    attributeComponent(): string {
      if (this.attribute && "component" in this.attribute) {
        return this.attribute.component;
      }
      return "";
    },
    disableNext(): boolean {
      return (
        this.currentAttribute >= this.attributeCount - 1 &&
        !this.productCompleted
      );
    },
  },
  methods: {
    ...mapGetters(["getProductCompletionMinimal"]),
    ...mapMutations([
      "addOptionInformationPage",
      "setCompletionOverlayRender",
      "setCheckoutOverlayRender",
      "setStandardPopup",
    ]),
    ...mapActions([
      "incrementCurrentAttribute",
      "decrementCurrentAttribute",
      "setCurrentAttribute",
    ]),
    prevAttr() {
      this.runDefault = true;
      if (this.onAttrArrowClick) {
        this.onAttrArrowClick(() => (this.runDefault = false), "previous");
      }
      if (this.runDefault) {
        if (this.currentAttribute > 0) {
          this.decrementCurrentAttribute();
        }
      }
    },
    nextAttr() {
      this.runDefault = true;
      if (this.onAttrArrowClick) {
        this.onAttrArrowClick(() => (this.runDefault = false), "next");
      }
      if (this.runDefault) {
        if (!this.disableNext) {
          this.incrementCurrentAttribute();
        }
      }
    },
    transitionAttribute() {
      if (this.attrOpt && this.attrRap) {
        // We are going to force a smooth transition for the height
        // const height = this.attrRap.getBoundingClientRect().height;
        // this.attrOpt.style.setProperty("height", height + "px");
        this.visible = false;
        setTimeout(() => {
          this.render = false;
          // Force the attribute component to rerender
          requestAnimationFrame(() => {
            this.render = true;
            requestAnimationFrame(() => {
              if (this.attrOpt && this.attrRap) {
                // const height = this.attrRap.getBoundingClientRect().height;
                // this.attrOpt.style.setProperty("height", height + "px");
                setTimeout(() => {
                  if (this.attrOpt && this.attrRap) {
                    // this.attrOpt.style.removeProperty("height");
                    this.visible = true;
                  }
                }, this.attrTransitionWait + 40);
              }
            });
          });
        }, this.attrTransitionWait);
      }
    },
    transitionAttributeName() {
      if (this.attribute && this.attrInfo && this.attrName) {
        const width = this.attrName.getBoundingClientRect().width;
        this.attrInfo.style.setProperty("width", width + "px");
        setTimeout(() => {
          if (this.attribute && this.attrInfo && this.attrName) {
            const newWidth = this.attrName.getBoundingClientRect().width;
            this.attrInfo.style.setProperty("width", newWidth + "px");
          }
          setTimeout(() => {
            if (this.attrInfo && this.attrName) {
              this.attrInfo.style.removeProperty("width");
            }
          }, 160);
        }, this.attrTransitionWait + 20);
        this.disperse = true;
        setTimeout(() => (this.disperse = false), 160);
      }
    },
    showOptionsInfo() {
      const sub = document.querySelector(
        ".attribute-component-wrapper .sub-attributes > .attribute.selected[data-id]"
      );
      if (sub) {
        const id = sub.getAttribute("data-id")!;
        if (id in this.objectIDMap && this.objectIDMap[id].info) {
          if (
            this.objectIDMap[id].info.title &&
            (this.objectIDMap[id].info.content ||
              this.objectIDMap[id].info.image)
          ) {
            this.setStandardPopup(this.objectIDMap[id].info);
          }
          return;
        }
      }
      if (this.attribute?.info && this.attribute.info.type == "OptionPage") {
        this.addOptionInformationPage(this.attribute.id);
      } else if (this.attribute && this.attribute.info) {
        // Default to standard popup if it has the necessary info
        if (
          this.attribute.info.title &&
          (this.attribute.info.content || this.attribute.info.image)
        ) {
          this.setStandardPopup(this.attribute.info);
        }
      }
    },
    openCompletionOverlay() {
      this.setCompletionOverlayRender(true);
    },
    setOnAttrArrowClick(
      onAttrArrowClick: (cancelDefault: Function, payload?: any) => void
    ) {
      this.onAttrArrowClick = onAttrArrowClick;
    },
    onKeyPress(e: KeyboardEvent) {
      if (document.activeElement === document.body) {
        if (e.key === "Shift") {
          (window as any).__nav_queued_set__ = 1;
        } else if (e.shiftKey) {
          // Set the next attribute digit if the pressed key was a digit 
          if (e.code.startsWith("Digit") && '__nav_queued_set__' in window) {
            let num = parseInt(e.code.slice(5));
            if (num === 0) {
              num = 10;
            }
            if ('__nav_queued_step__' in window) {
              (window as any).__nav_queued_step__ *= 10;
              (window as any).__nav_queued_step__ += num;
            } else {
              (window as any).__nav_queued_step__ = num;
            }
          } else {
            delete (window as any).__nav_queued_set__;
          }
          // Nav steps if shift key and arrows are pressed
          if (e.key === "ArrowRight") {
            this.nextAttr();
          } else if (e.key === "ArrowLeft") {
            this.prevAttr();
          }
        }
      }
    },
    onKeyRelease(e: KeyboardEvent) {
      if (e.key == "Shift" && '__nav_queued_set__' in window && '__nav_queued_step__' in window) {
        const index = (window as any).__nav_queued_step__ - 1;
        delete (window as any).__nav_queued_set__;
        delete (window as any).__nav_queued_step__;
        this.setCurrentAttribute(index);
      }
    }
  },
  setup() {
    const attrOpt: Ref<HTMLElement | null> = ref(null);
    const attrRap: Ref<HTMLElement | null> = ref(null);
    const render: Ref<boolean> = ref(true);
    const visible: Ref<boolean> = ref(true);
    const runDefault: Ref<boolean> = ref(true);
    const onAttrArrowClick: Ref<
      ((cancelDefault: Function, payload?: any) => void) | null
    > = ref(null);
    // Code for name transition
    const disperse: Ref<Boolean> = ref(false);
    const attrName: Ref<HTMLElement | null> = ref(null);
    const attrInfo: Ref<HTMLElement | null> = ref(null);
    return {
      attrRap,
      attrOpt,
      render,
      visible,
      disperse,
      attrInfo,
      attrName,
      runDefault,
      onAttrArrowClick,
    };
  },
  watch: {
    attrTransitionBusy(val) {
      if (val) {
        this.transitionAttributeName();
        this.transitionAttribute();
      }
    },
    currentAttribute() {
      this.onAttrArrowClick = null;
    },
  },
  mounted() {
    setTimeout(() => {
      // Make attribute wrapper a smooth resizer
      if (this.attrRap) {
        utils.smoothResize(this.attrRap, 200);
      }
    }, 500);
    document.addEventListener("keydown", this.onKeyPress);
    document.addEventListener("keyup", this.onKeyRelease);
  },
  beforeUnmount() {
    document.removeEventListener("keydown", this.onKeyPress);
    document.removeEventListener("keyup", this.onKeyRelease);
  },
});
</script>

<style lang="scss" scoped>
#attribute-selector-tool {
  position: relative;
  z-index: 10;
  &[data-type="GrandAttribute"] {
    z-index: 20;
  }
  .attribute-controls {
    background-color: #f5f5f5;
    display: flex;
    justify-content: space-between;
    min-height: 55px;
    border-bottom: 2px solid #040505;
    border-top: 2px solid #fff;
  }
  .left-controls {
    display: flex;
    align-items: flex-end;
    align-self: center;
    // flex-grow: 1;
    // @media (min-width: $small-width-up) {
    //   align-items: center;
    // }
  }
  .attribute-info {
    font-size: 21px;
    letter-spacing: -0.025em;
    line-height: 120%;
    font-weight: 600;
    text-align: left;
    margin-left: 18px;
    margin-bottom: 2px;
    transition: width 0.16s ease;
    // flex: 1 1 148px;
    @media (max-width: 355px) {
      margin-left: 10px;
      &.sm-font {
        font-size: 5.9155vw;
      }
    }
    .progress {
      font-size: 12px;
      line-height: 125%;
      letter-spacing: 0;
    }
    .attribute-name {
      transition: opacity 0.25s linear 0.1s;
      white-space: nowrap;
      height: 21px;
      overflow: hidden;
      &.disperse {
        opacity: 0;
        transition: opacity 0.16s linear;
      }
      .svg-dynamic-text {
        display: block;
        width: auto;
        height: auto;
        max-width: 100%;
        max-height: 100%;
      }
    }
    // @media (min-width: $small-width-up) {
    //   display: flex;
    //   font-size: 27px;
    //   padding-top: 7px;
    //   .progress {
    //     font-size: 19px;
    //     padding-top: 5px;
    //     padding-right: 8px;
    //   }
    // }
  }
  .more-info {
    width: 20px;
    height: 20px;
    margin-left: 10px;
    margin-bottom: 4px;
    margin-right: 10px;
    background: url(../../assets/info.svg) no-repeat center/contain;
    transition: opacity 0.15s linear 0.12s;
    cursor: pointer;
    &.hide {
      transition: opacity 0.15s linear;
      cursor: default;
      pointer-events: none;
      opacity: 0;
    }
    @media (min-width: $medium-width-up) {
      transition: transform 0.2s ease, opacity 0.15s linear 0.12s;
      transform: rotate(360deg);
      &:hover {
        transform: rotate(360deg) scale(1.2);
      }
      &.hide {
        transition: opacity 0.15s linear;
      }
    }
  }
  .right-controls {
    display: flex;
    @media (max-width: 345px) {
      width: 146px;
    }
  }
  .progress-menu {
    display: flex;
    align-items: center;
    cursor: pointer;
    .hamburger {
      width: 24px;
      height: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      margin-right: 30px;
      .pattie {
        width: 100%;
        height: 2px;
        background-color: #040505;
        @media (min-width: $medium-width-up) {
          // width: 134px;
        }
      }
      @media (max-width: 375px) {
        margin-right: calc(100vw - 345px);
        margin-left: 12px;
      }
      @media (max-width: 355px) {
        margin-right: 10px;
      }
    }
  }
  .arrows {
    width: 110px;
    display: flex;
    justify-content: space-between;
    box-sizing: border-box;
    position: relative;
    &::before {
      content: "";
      width: 2px;
      height: 100%;
      background-color: #fff;
      position: absolute;
      z-index: 10;
      top: 0;
      left: -2px;
    }
    &::after {
      content: "";
      width: 2px;
      height: 100%;
      background-color: #fff;
      position: absolute;
      z-index: 10;
      top: 0;
      left: calc(50% - 1px);
    }
    @media (max-width: 345px) {
      width: auto;
      flex-grow: 1;
      padding: 0 10px;
    }
    @media (min-width: $medium-width-up) {
      width: 134px;
    }
  }
  .arrows .arrow {
    width: 50px;
    height: 100%;
    cursor: pointer;
    position: relative;
    transition: opacity 0.1s linear;
    @media (min-width: $medium-width-up) {
      width: 66px;
    }
    &.disabled {
      opacity: 0.5;
      cursor: default;
    }
    &::before {
      content: "";
      width: 0;
      height: 0;
      border-style: solid;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
    @media (max-width: 345px) {
      width: 30px;
    }
  }
  .arrows .prev-arrow::before {
    border-width: 10px 10px 10px 0;
    border-color: transparent #040505 transparent transparent;
  }
  .arrows .next-arrow::before {
    border-width: 10px 0 10px 10px;
    border-color: transparent transparent transparent #040505;
  }
  .attribute-options {
    transition: height 0.18s ease;
    .attribute-component-wrapper {
      opacity: 0;
      transition: opacity 0.14s linear, height 0.2s ease;
      &.visible {
        opacity: 1;
      }
    }
  }
}
</style>
