<template>
  <template v-if="!usingImageRegenerationAPI">
    <v-header v-if="!hideHeader" @nokona-header="hasNokonaHeader = true"></v-header>
    <transition name="fade" appear>
      <main v-if="page == 'start'" id="main" class="start-page-content">
        <landing-page />
      </main>
      <main v-else-if="page == 'colorplay'" id="main" class="color-play-page-content">
        <color-play-page />
      </main>
      <main v-else-if="page == 'patterns'" id="main" class="patterns-page-content">
        <patterns-page />
      </main>
      <main v-else id="main" class="configurator-content">
        <template v-if="!test3dMaterial">
          <floating-tab
            v-if="productID == 'gloves'"
            id="size-selector"
            :image="model?.thumbnail || null"
            :text="modelText"
            :task="openSizeChangePopup"
          ></floating-tab>
          <floating-tab
            v-if="productID == 'bats' || productID == 'bats-testing'"
            id="bat-construction"
            class="bat-construction"
            :text="constructionText"
            :task="openConstructionChangePopup"
          ></floating-tab>
          <floating-tab
            v-for="(tab, i) in constructionTabs"
            :key="tab.id"
            :id="tab.id"
            class="construction-tab"
            :style="{
              '--desktop-top': `${i * 65 + 30}px`,
              '--mobile-top': `${i * 70 + 8}px`,
            }"
            :data-id="tab.model"
            :image="tab.image"
            side="right"
            :task="tab.task"
            :renderPlus="false"
          ></floating-tab>
          <floating-tab
            v-if="productRenderingContext !== '2D'"
            id="controls-3d"
            class="controls-3d"
            side="right"
            :text="'<span id=\'tips-icon\'><span>Tips</span></span>'"
            :task="open3DControlsGuide"
          ></floating-tab>
          <div id="threedee-extras" v-if="productRenderingContext !== '2D'">
            <div id="tips-icon-m" class="controls-3d" @click="open3DControlsGuide"><span>Tips</span></div>
            <div
              v-if="productID == 'bats' || productID == 'bats-testing'"
              id="bat-construction-m"
              class="bat-construction"
              v-html="constructionText.replaceAll('<br>', ' / ')"
              @click="openConstructionChangePopup"
            ></div>
          </div>
        </template>
        <product-stage
          :interfaceType="interfaceType"
          id="product-images"
          :class="{ edgex: isEdgeX }"
          :data-is-edgex="isEdgeX"
        />
        <attr-selector-tool></attr-selector-tool>
      </main>
    </transition>
    <!-- ADD ANY NEW OVERLAYS HERE -->
    <completion-overlay />
    <information-overlay />
    <checkout-overlay />
    <standard-popup />
    <special-popup />
    <pimco-editor />
    <size-edit-popup />
    <go-classic />
    <go-edgex />
    <test3d-material v-if="test3dMaterial" />
    <controls3-d-turtorial v-if="render3DTutotial" />
    <config-studio-controls v-if="displayStudioControls" />
    <!-- ADD ANY NEW OVERLAYS HERE -->
    <div id="mobile-landscape-warning">
      <div class="title">attention</div>
      <div class="message">This website is best viewed in a vertical orientation.</div>
    </div>
    <div class="reactive-style" v-html="styleString"></div>
  </template>
  <div v-else style="text-align: left; margin: 16px; line-height: 1.15">
    <h1 style="margin-bottom: 14px; font-size: 1.3em; font-weight: 800">Welcome to the Image Regeneration API</h1>
    <div v-if="product?.fonts">
      Loading fonts...<br />
      <div v-for="font in product.fonts" :key="font" :style="{ fontFamily: font, paddingLeft: '10px' }">
        Loaded {{ font }}
      </div>
    </div>
    <div style="margin-top: 28px; font-size: 1.3em">
      Regenerating images...
      <div
        v-if="regeneratedImagesDetails"
        style="margin-top: 28px; font-size: 0.8em"
        v-html="regeneratedImagesDetails"
      ></div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
import woocommerce from "./woocommerce";
import utils from "./utils";
import Header from "./components/Header.vue";
import FloatingTab from "./components/FloatingTab.vue";
import ProductStage from "./components/ProductStage.vue";
import InformationOverlay from "./components/info-overlay/InformationOverlay.vue";
import CompletionOverlay from "./components/completion-overlay/CompletionOverlay.vue";
import CheckoutOverlay from "./components/checkout-overlay/ProductCheckoutOverlay.vue";
import AttrSelectorTool from "./components/attribute-selectors/AttributeSelectorTool.vue";
import PatternsPage from "@/components/non-configurator/PatternsPage.vue";
import LandingPage from "@/components/non-configurator/LandingPage.vue";
import ColorPlayPage from "@/components/non-configurator/ColorPlayPage.vue";
import StandardPopup from "@/components/StandardPopup.vue";
import SpecialPopup from "@/components/SpecialPopup.vue";
import SizeEditPopup from "@/components/SizeEditPopup.vue";
import GoClassic from "@/components/overlays/GoClassic.vue";
import GoEdgex from "@/components/overlays/GoEdgeX.vue";
import Test3dMaterial from "@/components/Test3dMaterial.vue";
import { Model, Product } from "./types";
import axios from "axios";
import data from "@/data";
import goClassic from "./assets/go-classic-ban.svg";
import goEdgeX from "./assets/go-edgex-ban.svg";
import goEdge from "./assets/go-edge-ban.svg";
import { OptionCasing } from "./structure";
import { starters } from "./store/initialize";
import PimcoEditor from "./components/PimcoEditor.vue";
import params from "./params";
import Controls3DTurtorial from "./components/Controls3DTurtorial.vue";
import ConfigStudioControls from "./components/ConfigStudioControls.vue";

export default defineComponent({
  name: "App",
  components: {
    "v-header": Header,
    FloatingTab,
    ProductStage,
    InformationOverlay,
    AttrSelectorTool,
    CompletionOverlay,
    CheckoutOverlay,
    PatternsPage,
    LandingPage,
    ColorPlayPage,
    StandardPopup,
    SpecialPopup,
    SizeEditPopup,
    GoClassic,
    GoEdgex,
    Test3dMaterial,
    PimcoEditor,
    Controls3DTurtorial,
    ConfigStudioControls,
  },
  computed: {
    ...mapState({
      windowHeight: "windowHeight",
      page: "configuratorPage",
      models: "models",
      productID: "currentProduct",
      selectedOptions: "selectedOptions",
      attribute: "currentAttribute",
      imgExpand: "expandProductStage",
      render3DTutotial: "showControls3DTutorial",
      hideHeader: "hideHeader",
      displayStudioControls: "displayStudioControls",
      objectIDMap: "objectIDMap",
    }),
    ...mapGetters({
      restrictions: "getRestrictions",
      model: "getModel",
      series: "getSeries",
      product: "getProduct",
      incompleted: "getProductCompletionBlocker",
      viewCount: "getViewCount",
      productRenderingContext: "getProductRenderingContext",
      viewInterfaceType: "getViewInterfaceType",
    }),
    interfaceType(): Product["interface"] {
      if (this.viewInterfaceType !== "default") {
        return this.viewInterfaceType;
      }
      if (this.viewCount < 2) {
        return "none";
      }
      if (this.viewCount === 2) {
        return "front-back";
      }
      return "arrows";
    },
    patternsPageStyle(): string {
      let headeroffset = 0;
      if (this.hasNokonaHeader) {
        headeroffset = -50;
      }
      return `.patterns-page-content {
                height: ${this.windowHeight - 53 + headeroffset}px;
              }
              @media (max-width: 900px) {
                .patterns-page-content {
                  height: ${this.windowHeight - 53}px;
                }
              }`;
    },
    styleString(): string {
      if (this.imgExpand || this.hideHeader) {
        return `<style>
              .configurator-content,
              #mobile-landscape-warning {
                height: 100vh;
              }
              </style>`;
      } else {
        return `<style>
              .configurator-content {
                height: ${this.windowHeight - 53}px;
              }
              #mobile-landscape-warning {
                height: ${this.windowHeight}px;
              }
              @media (min-width: 601px) {
                .configurator-content, .patterns-page-content {
                  height: ${this.windowHeight - 63}px;
                }
              }
              ${this.patternsPageStyle}
              </style>`;
      }
    },
    usingImageRegenerationAPI(): boolean {
      return params.getBool("image-reset");
    },
    modelText(): string {
      const model: Model = this.model;
      if (model && model.classes?.Size) {
        const size = model.classes.Size;
        return (size instanceof Array ? size[0] : size) + "<br />" + (model.inches || model.nickname || model.name);
      }
      return "";
    },
    isEdgeX(): string {
      // This is an edgex construction
      for (let i = 0; i < this.models.length; i++) {
        const model = this.models[i] as Model;
        if (model.pair?.edgex && model.pair?.edgex == this.selectedOptions[this.productID]?.model) {
          return model.id;
        }
      }
      return "";
    },
    hasEdgeX(): string {
      // If a series is selected, edgex is unavailable
      if (this.series) {
        return "";
      }
      // Current model has edgex construction available
      for (let i = 0; i < this.models.length; i++) {
        const model = this.models[i] as Model;
        if (model.pair?.edgex && model.id == this.selectedOptions[this.productID]?.model) {
          return model.pair.edgex;
        }
      }
      return "";
    },
    constructionTabs(): Array<{ id: string; task: Function; image: string; model: string }> {
      if (
        this.product?.models.length &&
        this.model &&
        !this.series &&
        (this.productID == "gloves" || this.productID == "gloves-test")
      ) {
        const modelIndex = (this.product as Product).models.indexOf(this.model.id);
        if (modelIndex === -1) {
          return [];
        }
        // Get the pairing definition for the current model, even if it lives on another model
        let pairDefinition: NonNullable<Model["pair"]> = {};
        const models = (this.product as Product).models
          .map((id) => this.objectIDMap[id])
          .filter(Boolean)
          .toReversed() as Model[];
        for (let i = 0; i < models.length; i++) {
          const model = models[i] as Model;
          if (model.pair && (model.id == this.model.id || Object.values(model.pair).includes(this.model.id))) {
            pairDefinition = Object.assign({}, pairDefinition, model.pair);
          }
        }
        // console.log("Pair definition:", pairDefinition);
        // If there is a missing key, and one of the model IDs isn't in the pair defininition, then assume
        // the first missing model fills the role of the missing pair key
        const allKeys = ["edge", "classic", "edgex"] as const;
        const missingKeys = allKeys.filter((key) => !pairDefinition[key]);
        const pairDefValues = Object.values(pairDefinition);
        const unusedModels = (this.product as Product).models.filter((id) => {
          const model = this.objectIDMap[id] as Model;
          if (!model.pair) return false;
          const currentPairValues = Object.values(model.pair);
          return (
            model && pairDefValues.indexOf(id) === -1 && pairDefValues.some((pdv) => currentPairValues.includes(pdv))
          );
        });
        const minCount = Math.min(missingKeys.length, unusedModels.length);
        for (let i = 0; i < minCount; i++) {
          pairDefinition[missingKeys[i]] = unusedModels[i];
        }

        const tabs: Array<{ id: string; task: Function; image: string; model: string }> = [];
        for (const key of allKeys) {
          const modelID = pairDefinition[key as keyof typeof pairDefinition];
          if (modelID == this.model.id || !modelID) {
            continue;
          }
          tabs.push({
            id: key + "-popup",
            task: () => {
              this.switchConstruction(modelID!, key);
            },
            image: this.constructionTabImages[key],
            model: modelID!,
          });
        }

        return tabs;
      }
      return [];
    },
    test3dMaterial(): boolean {
      return params.get("m") == "3d-material-test" && starters.dev;
    },
    constructionText(): string {
      const materialType =
        this.$store.state.selectedOptions[this.productID]?.selections["Options"]?.["Material"]?.["Material"]?.value
          ?.name || "Maple";
      const turnType =
        this.$store.state.selectedOptions[this.productID]?.selections["Options"]?.["Turn"]?.["Turn"]?.value?.name ||
        "N-243";
      const batLength =
        this.$store.state.selectedOptions[this.productID]?.selections["Options"]?.["Length"]?.["Length"]?.value?.name ||
        '33"';
      return `${turnType}<br>${batLength}<br>${materialType}`;
    },
  },
  data() {
    return {
      hasNokonaHeader: false,
      regeneratedImagesDetails: "",
      constructionTabImages: {
        edgex: goEdgeX,
        classic: goClassic,
        edge: goEdge,
      } as Record<string, string>,
    };
  },
  methods: {
    ...mapGetters(["getOrderedPimcos", "getProductRenderingContext", "getMaterialPimcos3D"]),
    ...mapMutations([
      "setCurrentModel",
      "setSizeEditPopup",
      "setStandardPopup",
      "setSpecialPopup",
      "setGoClassicPopup",
      "setGoEdgeXPopup",
    ]),
    ...mapActions([
      "setCurrentAttribute",
      "switchModelData",
      "onDataStepComplete",
      "fetchConfiguratorData",
      "loadStudioSettings",
    ]),
    openSizeChangePopup() {
      this.setSizeEditPopup();
    },
    openConstructionChangePopup() {
      this.setSpecialPopup({
        title: "Change Construction",
        mode: "fnp_bat-construction",
        payload: {
          branches: ["brcY179409250", "brcQ1046408638", "brcY101307298"],
        },
      });
    },
    incompletedNavFuncs(path: string[]): Array<{ func: (next: () => void) => void; index: number }> {
      let selections = this.selectedOptions[this.productID].selections;
      if (selections) {
        const callbacks: any[] = [];
        // Limit the specificity to 2
        path = path.slice(0, 2);
        while (path.length) {
          const key = path.shift()!;
          const keys = Object.keys(selections);
          const index = keys.indexOf(key);
          selections = selections[key];
          if (index > -1 && selections) {
            if (!callbacks.length) {
              callbacks.push({
                func: (next) => {
                  this.setCurrentAttribute(index);
                  setTimeout(next, 500);
                },
                index,
              });
            } else {
              callbacks.push({
                func: () => {
                  const clickable = document.querySelector<HTMLElement>(
                    `#attribute-selector-tool [data-name="${key}"]`,
                  );
                  if (clickable) {
                    clickable.click();
                  }
                },
                index,
              });
            }
          }
        }
        return callbacks;
      }
      return [];
    },
    edgeClassicSwitch() {
      let modelID = "";
      let mode = "";
      if (this.isEdgeX) {
        modelID = this.isEdgeX;
        mode = "to-classic";
      } else if (this.hasEdgeX) {
        modelID = this.hasEdgeX;
        mode = "to-edgex";
      }
      if (modelID && mode) {
        if (mode == "to-edgex") {
          this.setGoEdgeXPopup(true);
        } else {
          this.setGoClassicPopup(true);
        }
        // Do the model switch thing

        setTimeout(
          () => {
            this.setCurrentModel(modelID);
            this.switchModelData();
            setTimeout(() => {
              this.fetchConfiguratorData();
              setTimeout(() => {
                this.onDataStepComplete({
                  id: "objects",
                  callback: () => {
                    if (mode == "to-edgex") {
                      this.setGoEdgeXPopup(false);
                    } else {
                      this.setGoClassicPopup(false);
                    }
                  },
                });
              }, 200);
            }, 17);
          },
          mode == "to-edgex" ? 6000 : 3500,
        );
      }
    },
    switchConstruction(modelID: string, type: string) {
      const mode = "to-" + type;
      if (modelID && mode) {
        if (mode == "to-edgex") {
          this.setGoEdgeXPopup(true);
        } else {
          this.setGoClassicPopup(true);
        }
        // Do the model switch thing

        setTimeout(
          () => {
            this.setCurrentModel(modelID);
            this.switchModelData();
            setTimeout(() => {
              this.fetchConfiguratorData();
              setTimeout(() => {
                this.onDataStepComplete({
                  id: "objects",
                  callback: () => {
                    if (mode == "to-edgex") {
                      this.setGoEdgeXPopup(false);
                    } else {
                      this.setGoClassicPopup(false);
                    }
                  },
                });
              }, 200);
            }, 17);
          },
          mode == "to-edgex" ? 6000 : 3500,
        );
      }
    },
    open3DControlsGuide() {
      this.$store.state.showControls3DTutorial = true;
    },
  },
  watch: {
    incompleted(val: OptionCasing | null) {
      if (!starters.dev && val && val.required) {
        const funcs = this.incompletedNavFuncs(val.getPath());
        if (funcs?.[0].index < this.attribute) {
          this.setSpecialPopup({
            title: "Selection Changed",
            message:
              "A selection that was previously filled has been emptied. " +
              "This is likely due to that selection no longer being available. " +
              "Would you like to revisited that step and fill in the selection?",
            mode: "confirm",
            confirm: {
              callback: () => {
                let i = 0;
                const fCall = () => {
                  if (funcs[i]) {
                    funcs[i].func(fCall);
                  }
                  i++;
                };
                fCall();
              },
              label: "Yes",
            },
            cancel: {
              label: "No",
            },
          });
        }
      }
    },
  },
  mounted() {
    // Fetch the external styles file to apply any dynamic styles
    data.fetchExternalStyles();
    // Add a global accessor for the state's object ID map
    (window as any).getObjectIDMap = () => {
      return this.$store.state.objectIDMap;
    };
    // These global methods are used for convenience while building and debugging the configurator
    (window as any).logState = (returnVal: boolean = false) => {
      if (returnVal) {
        return this.$store.state;
      } else {
        console.log(this.$store.state);
      }
      return;
    };
    (window as any).randomKey = (length = 32, prefix = "") => {
      let result = prefix;
      const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      return result;
    };
    (window as any).leatherID = () => {
      let result = "leather";
      const characters = "0123456789";
      for (let i = 0; i < 4; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      return result;
    };
    (window as any).seriesID = () => {
      let result = "series";
      const characters = "0123456789";
      for (let i = 0; i < 4; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      return result;
    };
    (window as any).logRestrictions = () => {
      console.log(this.restrictions);
    };
    (window as any).woocommerce = woocommerce;
    // For debugging only. Make sure to remove state import statement above as well
    (window as any).getPimcos = () =>
      this.productRenderingContext == "2D" ? this.getOrderedPimcos() : this.getMaterialPimcos3D();
    (window as any).getImage = (dataURL?: string) => {
      const mainCanvas = document.querySelector("#main-canvas") as HTMLCanvasElement;
      if (dataURL) {
        this.setStandardPopup({
          title: "Product Image",
          image: dataURL,
        });
        return;
      }
      if (mainCanvas) {
        mainCanvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            this.setStandardPopup({
              title: "Product Image",
              image: url,
            });
          }
        });
      }
    };
    (window as any).post = (url: string, data: any) => {
      const formData = new FormData();
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          const value = data[key];
          formData.append(key, value);
        }
      }
      return axios.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    };
    (window as any).forceInteractions = () => {
      utils.forceInteractions(this.$store.state.selectedOptions);
    };
    if (params.has("film-grain")) {
      const app = document.getElementById("app");
      if (app) {
        app.insertAdjacentHTML(
          "beforebegin",
          '<div style="position: fixed;inset: 0;background-color:rgb(78,50,25);background:rgb(78,50,25) url(/showgloves/film-grain.gif) repeat center/contain"></div><div style="position:fixed;inset:0;background-color:rgb(78,50,25);mix-blend-mode:screen;"></div>',
        );
        app.style.backgroundColor = "#ffffff";
        app.style.mixBlendMode = "screen";
      }
    }
    if (this.usingImageRegenerationAPI) {
      window.addEventListener("images-saved", (event) => {
        const detail = (event as CustomEvent).detail as { success: Array<string | false> };

        this.regeneratedImagesDetails = detail.success
          .map((success, i) => {
            return `<strong>Image #${i + 1}</strong>: ${success ? success : "Failed to regenerate image."}`;
          })
          .join("<br>");
      });
    }
    this.onDataStepComplete({
      id: "objects",
      callback: () => {
        const openControls3dTutorial = !sessionStorage.getItem("__viewedControls3dTutorial");
        if (openControls3dTutorial && this.productRenderingContext !== "2D" && params.has("embed")) {
          this.$store.state.showControls3DTutorial = true;
          sessionStorage.setItem("__viewedControls3dTutorial", "1");
        }
      },
    });
    // Rig up the event listener for studio mode
    if (starters.dev) {
      window.addEventListener("keydown", (event) => {
        if (
          this.productRenderingContext !== "2D" &&
          event.key === "s" &&
          (event.ctrlKey || event.metaKey) &&
          event.shiftKey
        ) {
          event.preventDefault();
          this.$store.state.inStudioMode = !this.$store.state.inStudioMode;
        }
      });
      this.loadStudioSettings();
    }
  },
});
</script>

<style lang="scss">
@import "./css/_reset.scss";
@import "./css/_fonts.scss";

#app {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
}
body {
  background-color: #fff;
  font: 16px/120% $fnt-cm;
  color: #040505;
  &.no-scroll {
    overflow: hidden;
  }
}
.configurator-content {
  // transition: height 0.18s ease;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.fixed-header {
  header {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    box-sizing: border-box;
    z-index: $header-z;
  }
  .configurator-content {
    margin-top: 53px;
    @media (min-width: $small-width-up) {
      margin-top: 63px;
    }
  }
}
body main {
  position: relative;
}
.floating-dropdown {
  body.studio-controls & {
    display: none;
  }
}
#size-selector {
  @media (min-width: $large-width-up) {
    top: 60px;
  }
}
#flag-popup {
  @media (min-width: $large-width-up) {
    top: 130px;
  }
  @media (max-width: $large-width) {
    display: none;
  }
}
#flag-popup-m {
  @media (min-width: $large-width-up) {
    display: none;
  }
}
.construction-tab.construction-tab {
  top: var(--desktop-top, 30px);
  @media (max-width: $large-width) {
    top: var(--mobile-top, 8px);
  }

  img {
    width: 124px;
    object-fit: contain;
    object-position: center;
  }
}
#bat-construction,
#controls-3d {
  top: 32px;
  @media (max-width: 800px) {
    display: none;
  }
}
#tips-icon,
#tips-icon-m {
  display: flex;
  align-items: center;
  > span {
    display: block;
    height: 12px;
  }
  &::before {
    content: "";
    display: inline-block;
    width: 16px;
    aspect-ratio: 1;
    background: url(./assets/info.svg) no-repeat center/contain;
    margin-right: 5px;
  }
}
#threedee-extras {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px 0;
  color: #fff;
  text-transform: uppercase;
  font: 500 14px/1.2 $fnt-cm;
  box-sizing: border-box;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 12;
  @media (min-width: 801px) {
    display: none;
  }
  @media (max-width: 600px) {
    font-size: 13px;
  }
  @media (max-width: 400px) {
    font-size: 11px;
  }
  #tips-icon-m {
    &::before {
      height: 1em;
      background: #fff;
      $mask: url(./assets/info.svg) no-repeat center/contain;
      -webkit-mask: $mask;
      mask: $mask;
    }
    > span {
      height: 1em;
    }
  }
  #bat-construction-m {
    display: flex;
    align-items: center;
    &::after {
      content: "";
      // Creat a white triangle pointing down
      display: inline-block;
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-top: 8px solid #fff;
      margin-left: 5px;
      margin-bottom: 0.3em;
    }
  }
}
#mobile-landscape-warning {
  display: none;
  position: fixed;
  width: 100vw;
  z-index: $shrowder-z;
  top: 0;
  left: 0;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  background-color: #000;
  color: #fff;
  font: 18px/155% $fnt-cm;
  @media (orientation: landscape) and (max-height: 500px) and (max-width: 800px) {
    display: flex;
  }
  .title {
    font-weight: 700;
    text-transform: uppercase;
    padding-bottom: 6px;
  }
  .message {
    max-width: 250px;
  }
}
.x-pattern {
  position: relative;
  &::before,
  &::after {
    content: "";
    background-color: #000;
    position: absolute;
    height: 141%;
    width: 2px;
    top: 50%;
    left: 50%;
    border-radius: 1px;
  }
  &::before {
    transform: translate(-50%, -50%) rotate(45deg);
  }
  &::after {
    transform: translate(-50%, -50%) rotate(-45deg);
  }
}
.fade-enter-from {
  opacity: 0;
}
.fade-enter-to {
  transition: opacity 0.2s linear 0.2s;
}
.fade-leave-active {
  transition: opacity 0.2s linear;
}
.fade-leave-to {
  opacity: 0;
}
.reactive-style {
  display: none;
}
img[height] {
  height: auto;
}
img.image-cover {
  object-fit: cover;
  object-position: center center;
  width: 100%;
  height: 100%;
}
img.image-contain {
  object-fit: contain;
  object-position: center center;
  width: 100%;
  height: 100%;
}
@media (min-width: $large-width-up) {
  body.windows,
  body.windows .fix-scrollbar {
    // Add in style support for ugly scroll-bars
    scrollbar-color: black #e6e6e6;
    &::-webkit-scrollbar {
      height: 0px;
      width: 0px;
    }
    &:hover::-webkit-scrollbar {
      height: 4px;
      width: 4px;
    }
    &::-webkit-scrollbar-track {
      background-color: #e6e6e6;
      border-radius: 2px;
    }
    &::-webkit-scrollbar-thumb {
      background-color: rgb(0, 0, 0);
      border-radius: 2px;
    }
    &::-webkit-scrollbar-thumb:active {
      background-color: rgba(0, 0, 0, 0.5);
    }
    &::-webkit-scrollbar-thumb:vertical {
      min-height: 1.5rem;
    }
    &::-webkit-scrollbar-thumb:horizontal {
      min-width: 1.5rem;
    }
  }
  body.windows::-webkit-scrollbar {
    height: 4px;
    width: 4px;
  }
}
.font-cm {
  font-family: $fnt-cm;
}
.font-ev {
  font-family: $fnt-ev;
}
.product-stage.edgex {
  background-color: #000;
  background-image: url(/show-imgs/misc/stage-background/EdgeX_Master_Background.svg);
}
.config-image-uploader {
  position: fixed;
  bottom: 16px;
  right: 16px;
  background-color: #000;
  color: #fff;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  z-index: 10000;
}
</style>
