<template>
  <div class="color-play color-play-section" :class="['mode-' + mode]"
    :data-open="colorPlayOnlyRender && generatedItems.length ? '' : null">
    <div class="color-play-wrapper">
      <div class="logo-stretch"></div>
      <div class="section-title">color play</div>
      <div class="sub-title">get inspired</div>
      <div class="section-prompt">
        pick your favorite colors and we’ll help you get started
      </div>
      <div class="color-pickers">
        <div class="color-picker">
          <div id="color-picker-1" :class="['button', { 'has-color': color1, alert }]"
            :style="color1 ? { backgroundColor: color1.hex } : null" @click="setColor1"></div>
          <span>{{ color1 ? color1.name : "Color One" }}</span>
        </div>
        <div class="color-picker">
          <div id="color-picker-2" :class="['button', { 'has-color': color2 }]"
            :style="color2 ? { backgroundColor: color2.hex } : null" @click="setColor2"></div>
          <span>{{ color2 ? color2.name : "Color Two" }}</span>
        </div>
      </div>
      <div v-show="!generated" class="start-button" @click="generatePreviews">{{ generateButtonText }}</div>
      <div class="generated-wrapper" ref="genWrap">
        <div v-show="generatedItems.length" :class="['generated-items', { 'centered': generatedItems.length <= 2 }]">
          <div v-for="(item, i) in generatedItems" :key="i" class="generated-item">
            <component :is="mode === 'assigner' ? 'div' : 'a'" :href="mode === 'assigner' ? undefined : item.href"
              :class="['generated-item-mos', mode]" :target="colorPlayOnlyRender ? '_blank' : undefined"
              @click="mode === 'assigner' ? clickCustomize(i) : null">
              <div class="image-wrap">
                <FadingImage :src="item.src" v-bind="info.dimensions || {}" />
                <div class="image-loading"></div>
              </div>
              <div class="cta">Customize</div>
            </component>
          </div>
        </div>
      </div>
    </div>
    <div class="reactive-style" v-html="colorPlayOnlyStyles"></div>
  </div>
</template>

<script lang="ts">
import utils from "@/utils";
import { defineComponent, ref, Ref } from "vue";
import { mapMutations, mapState } from "vuex";
import FadingImage from "@/components/FadingImage.vue";
import params from "@/params";
type SwatchStruct = {
  name: string;
  hex: string;
  options: {
    [key: string]: string;
  };
};
export default defineComponent({
  name: "ColorPlay",
  props: {
    info: {
      type: Object as () => {
        formulas: {
          template?: string;
          "one-color": Array<{ [key: string]: string }>;
          "two-color": Array<{ [key: string]: string }>;
        };
        dimensions?: {
          width: number;
          height: number;
        };
        swatches: Array<{
          name: string;
          hex: string;
          options: { [key: string]: string };
        }>;
      },
      required: true,
    },
    model: String,
    mode: {
      type: String as () => "hyperlink" | "assigner",
      default: "hyperlink",
    },
    imagePrefix: {
      type: String,
      default: "cp-",
    },
    generateButtonText: {
      type: String,
      default: "Generate",
    },
    autoGenerate: {
      // If true, will automatically generate when both colors are selected
      type: Boolean,
      default: false,
    },
  },
  components: {
    FadingImage,
  },
  emits: {
    "customize": (params: { [key: string]: string }) => true,
    "preview": (event: { colors: { color1: SwatchStruct | null; color2: SwatchStruct | null }, preventDefault: () => void }) => true,
  },
  computed: {
    ...mapState(["currentProduct"]),
    colorPlay1(): SwatchStruct[] {
      if (this.info?.swatches) {
        return this.info.swatches;
      }
      return [];
    },
    colorPlay2(): SwatchStruct[] {
      if (this.info?.swatches) {
        return this.info.swatches;
      }
      return [];
    },
    imageFileMat(): string {
      if (this.color1 && this.color2) {
        return (
          utils.sanitize(this.color1.name) +
          "-" +
          utils.sanitize(this.color2.name)
        );
      } else if (this.color1) {
        return utils.sanitize(this.color1.name);
      }
      return "";
    },
    uKeyMap(): { [key: string]: string } {
      const obj: { [key: string]: string } = {};
      if (this.color1) {
        for (const key in this.color1.options) {
          const id = this.color1.options[key];
          const ukey = `$${key}1$`;
          obj[ukey] = id;
        }
      }
      if (this.color2) {
        for (const key in this.color2.options) {
          const id = this.color2.options[key];
          const ukey = `$${key}2$`;
          obj[ukey] = id;
        }
      }
      return obj;
    },
    generatedItems() {
      if (this.info && this.generated) {
        if (this.color1 && this.color2) {
          return this.info.formulas["two-color"].map((formula, i) => {
            const params: { [key: string]: string } = {};
            if (this.info!.formulas.template) {
              params.id = this.info!.formulas.template;
            } else {
              params.model = this.model || "";
              params.p = this.currentProduct || "";
            }
            Object.keys(formula).forEach((key) => {
              if (formula[key].startsWith("$")) {
                if (formula[key] in this.uKeyMap) {
                  params[key] = this.uKeyMap[formula[key]];
                }
              } else {
                params[key] = formula[key];
              }
            });
            const qstring = utils.toQueryString(params);
            return {
              href: location.pathname + qstring,
              src:
                "/wp-content/uploads/configurator-images/colorplay/" +
                this.imagePrefix +
                this.imageFileMat +
                "-" +
                i +
                ".webp",
              params
            };
          });
        } else if (this.color1) {
          return this.info.formulas["one-color"].map((formula, i) => {
            const params: { [key: string]: string } = {};
            if (this.info!.formulas.template) {
              params.id = this.info!.formulas.template;
            } else {
              params.model = this.model || "";
              params.p = this.currentProduct || "";
            }
            Object.keys(formula).forEach((key) => {
              if (formula[key].startsWith("$")) {
                if (formula[key] in this.uKeyMap) {
                  params[key] = this.uKeyMap[formula[key]];
                }
              } else {
                params[key] = formula[key];
              }
            });
            const qstring = utils.toQueryString(params);
            return {
              href: location.pathname + qstring,
              src:
                "/wp-content/uploads/configurator-images/colorplay/" +
                this.imagePrefix +
                this.imageFileMat +
                "-" +
                i +
                ".webp",
              params
            };
          });
        }
      }
      return [];
    },
    colorPlayOnlyRender() {
      return params.has("color-play-only");
    },
    colorPlayInterfaceMode() {
      return params.getString("color-play-control");
    },
    colorPlayOnlyStyles() {
      // So this is weird, but we are going to hide everything but the colorplay block on the landing page
      if (this.colorPlayOnlyRender) {
        return `
          <style>
          body.belts .belt-landingpage-template {
            display: flex;
            justify-content: center;
            align-items: center;
            padding-left: 24px;
            padding-right: 24px;
            max-width: 1420px;
            margin-left: auto;
            margin-right: auto;
          }
          body.belts .belt-landingpage-template > :not(.color-play-block),
          body.belts header {
            display: none;
          }
          body.belts .color-play-block {
            display: contents;
          }
          body.belts .color-play-block .color-play-image {
            order: 3;
            margin-left: 0;
            margin-right: 0;
            padding-right: 36px;
            flex-shrink: 1;
            max-width: 800px;
            flex-grow: 1;
            flex-basis: 100px;
            transition: max-width 0.3s ease, opacity 0.3s linear;
          }
          body.belts .color-play-block .color-play-section {
            order: 1;
            flex-shrink: 0;
            flex-grow: 1;
            flex-basis: 100px;
          }
          body.belts .belt-landingpage-template::before {
            order: 2;
            content: "";
            width: 36px;
          }
          body.belts .color-play .color-play-wrapper {
            padding-top: 108px;
            padding-bottom: 108px;
          }
          body.belts #special-popup {
            background-color: #0000;
          }
          body.belts #special-popup > .modal {
            box-shadow: 0 4px 20px 3px #0009;
          }
          body.belts .color-play-block:has(.color-play-section[data-open]) .color-play-image {
            max-width: 0;
            opacity: 0;
          }
          body.belts .color-play-block .color-play-image img {
            width: initial;
            max-width: 100%;
            height: auto;
          }
          @media (max-width: 1000px) {
            body.belts .belt-landingpage-template {
              flex-direction: column;
            }
            body.belts .color-play-block .color-play-image, 
            body.belts .belt-landingpage-template::before {
              display: none;
            }
          }
          ${this.conditionalStyles}
          </style>
        `;
      }
      return "";
    },
    conditionalStyles(): string {
      let styles = "";
      if (this.colorPlayInterfaceMode == "api") {
        styles += `
        body.belts .color-play-block .logo-stretch.logo-stretch.logo-stretch, 
        body.belts .color-play-block .section-title.section-title, 
        body.belts .color-play-block .sub-title.sub-title.sub-title,
        body.belts .color-play-block .section-prompt.section-prompt,
        body.belts .color-play-block .color-pickers.color-pickers.color-pickers,
        body.belts .color-play-block .start-button.start-button.start-button,
        body.belts .color-play-block .color-play-image {
          display: none;
        }
        body.belts .color-play-wrapper.color-play-wrapper {
          transition: padding 0.3s;
          min-height: 0;
        }
        body.belts .color-play-section:not([data-open]) .color-play-wrapper.color-play-wrapper {
          padding-top: 0;
          padding-bottom: 0;
        }
        body.belts .color-play-section[data-open] .color-play-wrapper.color-play-wrapper {
          padding-top: 50px;
          padding-bottom: 50px;
        }
        `;
      }
      return styles;
    },
  },
  data() {
    const color1 = null as SwatchStruct | null;
    const color2 = null as SwatchStruct | null;
    const alert: boolean = false;
    const resizeObserver: ResizeObserver | null = null as any;
    const messageChannel = new MessageChannel();
    const resizeNotificationPort: MessagePort | null = null as any;
    return {
      color1,
      color2,
      alert,
      generated: false,
      resizeObserver,
      resizeNotificationPort,
    };
  },
  methods: {
    ...mapMutations(["setSpecialPopup"]),
    setColor1() {
      if (this.colorPlay1) {
        this.setSpecialPopup({
          title: "Select your Color 1",
          mode: "colorplay",
          payload: {
            colors: this.colorPlay1,
            select: (color: any) => {
              this.color1 = color;
            },
            current: this.color1,
          },
        });
      }
    },
    setColor2() {
      if (this.colorPlay2) {
        this.setSpecialPopup({
          title: "Select your Color 2",
          mode: "colorplay",
          payload: {
            colors: this.colorPlay2,
            select: (color: any) => {
              this.color2 = color;
            },
            current: this.color2,
          },
        });
      }
    },
    generatePreviews() {
      let defaultPrevented = false;
      this.$emit("preview", {
        colors: { color1: this.color1, color2: this.color2 },
        preventDefault: () => { defaultPrevented = true; }
      });

      if (defaultPrevented) return;
      if (this.color1) {
        this.generated = true;
      } else {
        this.alert = true;
        setTimeout(() => (this.alert = false), 1201);
      }
    },
    clickCustomize(index: number) {
      this.$emit("customize", this.generatedItems[index].params);
    }
  },
  watch: {
    color2(value) {
      if (this.autoGenerate && value && !this.generated) {
        this.generatePreviews();
      }
    }
  },
  setup() {
    const genWrap: Ref<HTMLElement | null> = ref(null);
    return {
      genWrap,
    };
  },
  mounted() {
    if (this.genWrap) {
      utils.smoothResize(this.genWrap, 500);
    }
    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (this.resizeNotificationPort) {
            this.resizeNotificationPort.postMessage({
              type: "colorplay",
              action: "onResize",
              payload: { width: entry.contentRect.width, height: entry.contentRect.height },
            });
          }
        }
      });
      this.resizeObserver.observe(document.body);
    }

    // If the interface mode is set to use the javascript api,
    // set the api to the window
    if (this.colorPlayInterfaceMode == "api" && !("cpapi" in window)) {
      const cpapi = {
        setColor1: (name: string) => {
          name = name.toLowerCase();
          const option = this.colorPlay1.find(
            (x) => x.name.toLowerCase() == name
          );
          if (option) {
            this.color1 = option;
            return true;
          }
          return false;
        },
        setColor2: (name: string) => {
          name = name.toLowerCase();
          const option = this.colorPlay2.find(
            (x) => x.name.toLowerCase() == name
          );
          if (option) {
            this.color2 = option;
            return true;
          }
          return false;
        },
        generatePreviews: () => {
          if (!this.generated) {
            this.generatePreviews();
            return true;
          }
          return false;
        },
        isGenerated: () => this.generated,
      };
      (window as any).cpapi = cpapi;
      // Create a new version of the colorplay javascript api that uses
      // iframe postMessage to communicate with the parent window
      window.addEventListener("message", (event) => {
        const $id = event.data.$id;
        if (event.data && event.data.type == "colorplay") {
          const { action, payload } = event.data;
          const source = event.source;
          if (!source) {
            console.warn("No source for message");
            return;
          }
          if (action == "setColor1") {
            const success = cpapi.setColor1(payload);
            source.postMessage({ type: "colorplay", payload: success, $id });
          } else if (action == "setColor2") {
            const success = cpapi.setColor2(payload);
            source.postMessage({ type: "colorplay", payload: success, $id });
          } else if (action == "generatePreviews") {
            const success = cpapi.generatePreviews();
            source.postMessage({ type: "colorplay", payload: success, $id });
          } else if (action == "isGenerated") {
            const generated = cpapi.isGenerated();
            source.postMessage({ type: "colorplay", payload: generated, $id });
          } else if (action == "onResize") {
            const port: MessagePort = payload;
            if (this.resizeNotificationPort) {
              this.resizeNotificationPort.close();
            }
            this.resizeNotificationPort = port;
            source.postMessage({ type: "colorplay", payload: true, $id });
          }
        }
      });
    }
  },
  beforeUnmount() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.resizeNotificationPort) {
      this.resizeNotificationPort.close();
    }
    if ("cpapi" in window) {
      delete (window as any).cpapi;
    }
  }
});
</script>

<style lang="scss" scoped>
.color-play {
  .color-play-wrapper {
    min-height: 300px;
    padding: 55px 8.064516% 72px;
    overflow: hidden;
    text-align: center;

    .logo-stretch {
      display: inline-block;
      width: 70px; //8.413461%;
      padding-top: 70px; //8.413461%;
      box-sizing: border-box;
      background: url(../../assets/gold-show-diamond.svg) no-repeat center/contain;
      margin-bottom: 10px;
    }

    .section-title {
      color: #000;
      font: 40px/100% $fnt-ev;
      letter-spacing: 0.053em;
    }

    .sub-title {
      color: $red;
      font: 40px/100% $fnt-fh;
    }

    .section-prompt {
      padding: 1em 0;
      font: 500 22px/104.97287% $fnt-cm;
      letter-spacing: -0.04em;
    }

    .color-pickers {
      display: flex;
      justify-content: center;
      align-items: center;

      .color-picker {
        font: 12px/186% $fnt-cm;
        margin: 6px 12px 42px;

        .button {
          cursor: pointer;
          border: 2px solid #c7c7c7;
          border-radius: 50%;
          position: relative;
          width: 65px;
          height: 65px;
          display: flex;
          justify-content: center;
          align-items: center;
          margin: 0 auto 12px;
          transition: background-color 0.25s linear;

          &:not(.has-color) {

            &::before,
            &::after {
              background-color: #c7c7c7;
              position: absolute;
              border-radius: 2px;
            }

            &::before {
              content: "";
              width: 38.4%;
              height: 9.2%;
            }

            &::after {
              content: "";
              width: 9.2%;
              height: 38.4%;
            }
          }

          &.alert {
            animation: 0.4s linear 0s 4 normal none running alert;
          }
        }
      }
    }

    .start-button {
      display: inline-block;
      background-color: $orange;
      padding: 1.2em 10px;
      color: #fff;
      text-transform: uppercase;
      border-radius: 28px;
      font: 14px/117.64285% "EvelethClean", sans-serif;
      letter-spacing: 0.053em;
      min-width: 162px;
      cursor: pointer;
      transition: color 0.2s linear;
      body.epion & {
        background-color: #000;
      }
    }
  }
}

.mode-assigner {
  .start-button.start-button {
    background-image: initial;
    border-radius: 1000px;
    text-transform: capitalize;
    font: 600 14px/150% $fnt-cm;
    padding: 0.8em 2em 0.7em;
    transition: background-color 0.2s linear, color 0.2s linear;
    border: 2px solid #000;

    body:not(.is-touch) &:hover {
      color: $orange;
      background-color: #fff;
    }
  }
}

.generated-wrapper {
  position: relative;
  max-width: 1200px;
  margin: 0 auto;

  @media (max-width: 1200px) {
    width: 100vw;
    right: calc(50vw - 50%);
  }

  transition: height 500ms cubic-bezier(0.165, 0.84, 0.44, 1);
}

.generated-items {
  display: flex;
  flex-wrap: wrap;
  margin: 0 auto;
  gap: 8%;

  &.centered {
    justify-content: center;
  }

  @media (max-width: $large-width) {
    overflow: hidden;
  }

  @media (max-width: $xsmall-width) {
    gap: 3%;
    // flex-direction: column;
    // align-items: center;
  }
}

.generated-item {
  display: block;
  width: 28%;
  margin-bottom: #{"min(75px, 7.5vw)"};

  @media (max-width: $small-width) {
    width: 46%;
  }

  @media (max-width: $xsmall-width) {
    width: 48.5%;
  }

  .generated-items.centered & {
    max-width: 336px;

    @media (min-width: $small-width-up) {
      width: 40%;
    }
  }

  .generated-item-mos {
    display: block;
    position: relative;
    cursor: pointer;
    user-select: none;

    &.hyperlink {
      .cta {
        font: 300 18px/150% $fnt-ev;
        text-transform: uppercase;
        letter-spacing: 0.053em;
        color: #000;
        transition: color 0.2s linear;
        padding-top: 6px;

        @media (max-width: $small-width) {
          font-size: 14px;
        }
      }

      &:hover .cta {
        color: $orange;
      }
    }

    &.assigner {
      .cta {
        font: 600 14px/150% $fnt-cm;
        letter-spacing: -0.025em;
        color: #fff;
        transition: color 0.2s linear, background-color 0.2s linear;
        margin: 1em auto 0;
        border: 2px solid #000;
        background-color: #000;
        padding: 0.8em 2em 0.7em;
        width: fit-content;
        min-width: 92px;
        border-radius: 1000px;

        @media (max-width: $small-width) {
          font-size: 12px;
        }
      }

      &:hover .cta {
        color: $orange;
        background-color: #fff;
      }
    }
  }

  .image-wrap {
    position: relative;
  }

  img {
    height: auto;
    display: block;
    position: relative;
    z-index: 2;
    max-width: 100%;
  }

  .image-loading {
    transition: opacity 0.3s;
    background: url(../../assets/belt-rusto.svg) no-repeat 82% 55%/88% auto;
    position: absolute;
    inset: 0;

    &::after {
      content: "";
      display: block;
      width: 48px;
      height: 48px;
      position: absolute;
      top: calc(40% - 24px);
      left: calc(50% - 24px);
      border: 3px solid $orange;
      border-radius: 50%;
      border-top-color: #0000;
      border-bottom-color: #0000;
      animation: loading-spin 1s linear infinite;
    }
  }

  img[data-loaded]+.image-loading {
    opacity: 0;
  }
}

@keyframes alert {

  0%,
  100% {
    background-color: #fff;
  }

  50% {
    background-color: #ff000054;
  }
}

@keyframes loading-spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}
</style>