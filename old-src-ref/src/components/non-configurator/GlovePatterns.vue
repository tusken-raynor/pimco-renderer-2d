<template>
  <transition name="fade" appear>
    <div v-if="renderInterface == 'position'" class="content-wrapper" :class="renderInterface">
      <div class="head">select from</div>
      <div class="back-button" @click="headOnHome()">back</div>
      <div class="position-list">
        <div
          v-for="pos in positions"
          :key="pos.alias"
          :class="['single-pos', { selected: position?.alias == pos.alias }]"
          @click="setPosition(pos)"
        >
          <div class="position-name">{{ pos.alias }}</div>
          <div class="position-image">
            <BaseImage :data="pos.image" />
          </div>
        </div>
      </div>
      <div class="to-configurator-wrapper">
        <div :class="['to-configurator', { disabled: !position }]" @click="clickNext">next</div>
      </div>
    </div>
    <div v-else-if="renderInterface == 'pattern'" class="content-wrapper fix-scrollbar" :class="renderInterface">
      <div :class="['head', { 'no-cstr': !multipleConstructions }]">
        <div class="drt-wrap">
          <span :class="['drt-1', { show: altConstruction === null && multipleConstructions }]"
            >select construction</span
          >
          <transition name="fade-patterns">
            <span v-if="altConstruction !== null || !multipleConstructions" class="drt-2">select patterns</span>
          </transition>
        </div>
      </div>
      <div
        class="back-button"
        @click="() => (configuratorMode == 'edgex' ? headOnHome() : previousInterface('position'))"
      >
        back
      </div>
      <div
        :class="['model-list-head', { show: showPatterns, 'show-bigger': !multipleConstructions }]"
        :data-title="patternsTitle"
      ></div>
      <div v-if="multipleConstructions && content.construction" class="construction-selector fix-scrollbar">
        <div class="construction-type primary">
          <div
            class="construction-name"
            v-html="content.construction.primary.title"
            @click="altConstruction === false ? (altConstruction = null) : (altConstruction = false)"
          ></div>
          <div
            :class="['construction-image', { selected: altConstruction === false }]"
            @click="altConstruction === false ? (altConstruction = null) : (altConstruction = false)"
          >
            <BaseImage :data="content.construction.primary.image" />
          </div>
          <MarkupWrapper
            class="construction-content"
            :markup="content.construction.primary.content"
            :onload="onMarkupLoad"
          />
        </div>
        <div class="construction-type alternative">
          <div
            class="construction-name"
            v-html="content.construction.alternative.title"
            @click="altConstruction === true ? (altConstruction = null) : (altConstruction = true)"
          ></div>
          <div
            :class="['construction-image', { selected: altConstruction === true }]"
            @click="altConstruction === true ? (altConstruction = null) : (altConstruction = true)"
          >
            <BaseImage :data="content.construction.alternative.image" />
          </div>
          <MarkupWrapper
            class="construction-content"
            :markup="content.construction.alternative.content"
            :onload="onMarkupLoad"
          />
        </div>
      </div>
      <transition name="fade-patterns">
        <transition-group
          v-if="showPatterns || !multipleConstructions"
          tag="div"
          name="pattern"
          class="model-list"
          ref="modelList"
        >
          <div
            v-for="model in filteredModels"
            :key="model.id"
            :class="['model', { selected: selectedModel == model }]"
            :data-id="model.id"
            @click="setModel(model)"
          >
            <div class="thumbnail">
              <div class="image-wrapper">
                <BaseImage :data="model.thumbnail" />
              </div>
            </div>
            <div class="name">
              {{ model.inches || model.nickname || model.name }}
            </div>
            <div v-if="model.classes.Size" class="size">
              {{ model.classes.Size instanceof Array ? model.classes.Size[0] : model.classes.Size }}
            </div>
            <div class="more-info" title="more info" @click.stop="checkModelInfo(model.id)">info</div>
          </div>
          <div v-if="!filteredModels.length" class="no-model-message">
            There are no patterns that match the selection.
          </div>
        </transition-group>
      </transition>
      <div :class="['to-configurator-wrapper', { respace: altConstruction !== null }]">
        <div :class="['to-configurator', { disabled: !selectedModel }]" @click="clickNext">next</div>
      </div>
    </div>
    <div v-else-if="renderInterface == 'origin'" class="content-wrapper fix-scrollbar" :class="renderInterface">
      <div class="head cnstrn">select from</div>
      <div class="pair-wrapper">
        <div class="pair-container">
          <div class="pair-cell made-in-usa">
            <div class="cell-content fix-scrollbar">
              <div class="cell-title" v-html="content.origin.usa.title"></div>
              <div class="cell-type" v-html="content.origin.usa.content"></div>
              <div class="price-point">
                Starting at
                <div class="baseprice">${{ getBasePrice(selectedModel) }}</div>
              </div>
              <div class="production-options">
                {{ content.origin.usa.production.label }}
                <div class="time">{{ content.origin.usa.production.time }}</div>
              </div>
            </div>
            <div class="select-pattern" @click="hardSelect(selectedModel)">select</div>
          </div>
          <div v-if="heritageModel" class="pair-cell merican-heritage">
            <div class="cell-content fix-scrollbar">
              <div class="cell-title" v-html="content.origin.heritage.title"></div>
              <div class="cell-type" v-html="content.origin.heritage.content"></div>
              <div class="price-point">
                Starting at
                <div class="baseprice">${{ getBasePrice(heritageModel) }}</div>
              </div>
              <div class="production-options">
                {{ content.origin.heritage.production.label }}
                <div class="time">
                  {{ content.origin.heritage.production.time }}
                </div>
              </div>
            </div>
            <div class="select-pattern" @click="hardSelect(heritageModel)">select</div>
          </div>
          <div class="timeframe-note mobile-only">*Timeframes do not include shipping.</div>
        </div>
      </div>
      <div class="back-button" @click="previousInterface('pattern')">back</div>
      <div class="timeframe-note">*Timeframes do not include shipping.</div>
    </div>
    <div v-else class="content-wrapper blank"></div>
  </transition>
</template>

<script lang="ts">
import { ImageData, Model, Product, StandardPopupInfo } from "@/types";
import utils from "@/utils";
import { defineComponent, ref, Ref } from "vue";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
import MarkupWrapper from "../MarkupWrapper.vue";
export default defineComponent({
  name: "GlovePatterns",
  computed: {
    ...mapState(["objectIDMap", "configuratorMode", "currentProduct"]),
    ...mapGetters({
      classes: "getModelClasses",
      product: "getProduct",
      currentModel: "getModel",
      series: "getSeries",
      content: "getPreConfigData",
    }),
    filterPairs(): Array<string> {
      return this.pairMapClasses(this.filters);
    },
    primaryClass(): string {
      if (this.product) {
        return (this.product as Product).primaryclass;
      }
      return "";
    },
    patternsTitle(): string {
      if (this.content?.construction) {
        if (this.altConstruction === null && this.configuratorMode != "edgex") {
          return this.multipleConstructions
            ? ""
            : utils.escapeHtml(this.content.construction.primary.title) + " Patterns";
        }
        return (
          utils.escapeHtml(
            this.altConstruction === true || this.configuratorMode == "edgex"
              ? this.content.construction.alternative.title
              : this.content.construction.primary.title,
          ) + " Patterns"
        );
      }
      return "";
    },
    positions(): {
      alias: string;
      Sport: string[];
      Position: string[];
      image?: ImageData | string;
    }[] {
      return [
        {
          alias: "Glove",
          Sport: [],
          Position: ["Infield", "Pitcher", "Outfield"],
          image: {
            src: "/show-imgs/patterns/pattern-400-ep.avif",
            srcset: "/show-imgs/patterns/pattern-400-ep.avif 1x, /show-imgs/patterns/pattern-400-ep@2x.avif 1.5x",
            width: 363,
            height: 363,
          },
        },
        {
          alias: "First Base",
          Sport: [],
          Position: ["Firstbase"],
          image: {
            src: "/show-imgs/patterns/pattern-N80.jpg",
            srcset: "/show-imgs/patterns/pattern-N80.jpg 1x, /show-imgs/patterns/pattern-N80@2x.jpg 1.5x",
            width: 363,
            height: 363,
          },
        },
        {
          alias: "Catcher",
          Sport: ["Baseball"],
          Position: ["Catcher"],
          image: {
            src: "/show-imgs/patterns/pattern-3400.jpg",
            srcset: "/show-imgs/patterns/pattern-3400.jpg 1x, /show-imgs/patterns/pattern-3400@2x.jpg 1.5x",
            width: 363,
            height: 363,
          },
        },
        {
          alias: "FP Catcher",
          Sport: ["Fastpitch"],
          Position: ["Catcher"],
          image: {
            src: "/show-imgs/patterns/pattern-F3350.jpg",
            srcset: "/show-imgs/patterns/pattern-F3350.jpg 1x, /show-imgs/patterns/pattern-F3350@2x.jpg 1.5x",
            width: 363,
            height: 363,
          },
        },
      ];
    },
    multipleConstructions(): boolean {
      if (this.configuratorMode == "series") {
        return false;
      }
      if (
        this.altConstruction ||
        this.filteredModels.find(
          (m) => m.pair && (m.pair as any).edgex,
          // this.product.models.includes(m.pair.construction)
        )
      ) {
        return true;
      }
      return false;
    },
    reducedModels(): Array<Model> {
      // Reduced models is the first filtering step
      // That factors in series as well as product
      if (this.product && this.product.models && this.objectIDMap) {
        const models: Model[] = this.product.models.map((id: string) => this.objectIDMap[id]);
        return models.filter((m) => {
          if (!m) {
            return false;
          }
          if (this.configuratorMode == "series" && this.series && !this.series.models.includes(m.id)) {
            return false;
          }
          return true;
        });
      }
      return [];
    },
    compiledModels(): Array<Model> {
      // Compiles all the models refernceed in the product by pairs
      // Pairs are determined by the 'pair' attribute on the model
      const pairTracker: Array<string> = [];
      return this.reducedModels.filter((m) => {
        if (!m || pairTracker.includes(m.id)) {
          return false;
        } else if (m.pair) {
          pairTracker.push(...(Object.values(m.pair) as Array<string>));
        }
        return true;
      });
    },
    filteredModels(): Array<Model> {
      if (this.configuratorMode == "edgex") {
        // Do the same thing as in the alt construction block later on, but before and models are filtered out
        return (
          this.compiledModels
            // .filter(
            //   (m) =>
            //     m.pair &&
            //     m.pair.construction &&
            //     this.product.models.includes(m.pair.construction)
            // )
            // .map((m) => this.objectIDMap[m.pair!.construction!] || null)
            .filter((m) => m.pair && (m.pair as any).edgex)
            .map((m) => this.objectIDMap[(m.pair as any)!.edgex!] || null)
            .filter((x) => x)
        );
      }
      // This filter method uses filters interface on the patterns page.
      // Filters applied from within the same row are additive
      // Filters applied accross different rows are subtractive
      if (this.position) {
        const models = this.compiledModels.filter((m) => {
          const keys = ["Sport", "Position"] as const;
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (key in m.classes && m.classes) {
              const pkey = this.position![key];
              if (pkey.length) {
                const klass = m.classes[key];
                if (klass instanceof Array) {
                  if (!klass.find((x) => pkey.includes(x))) {
                    return false;
                  }
                } else {
                  if (!pkey.includes(klass)) {
                    return false;
                  }
                }
              }
            }
          }
          return true;
        });
        if (this.altConstruction) {
          return (
            models
              // .filter(
              //   (m) => m.pair && m.pair.construction &&
              //   this.product.models.includes(m.pair.construction)
              // )
              // .map(
              //   (m) => this.objectIDMap[m.pair!.construction!] || null
              // )
              .filter((m) => m.pair && (m.pair as any).edgex)
              .map((m) => this.objectIDMap[(m.pair as any)!.edgex!] || null)
              .filter((x) => x)
          );
        }
        return models;
      }
      return [];
    },
    heritageModel(): Model | null {
      if (this.selectedModel?.pair?.origin && this.product) {
        if (this.product.models.includes(this.selectedModel.pair.origin)) {
          return this.objectIDMap[this.selectedModel.pair.origin] || null;
        }
      }
      return null;
    },
  },
  methods: {
    ...mapMutations([
      "setConfiguratorPage",
      "setCurrentModel",
      "setConfiguratorMode",
      "setSizeEditPopup",
      "setCurrentSeries",
      "setStandardPopup",
    ]),
    ...mapActions(["switchModelData"]),
    clickNext() {
      if (this.selectedModel) {
        if (
          this.selectedModel.pair?.origin &&
          this.heritageModel &&
          this.reducedModels.map((m) => m.id).includes(this.selectedModel.pair.origin) &&
          this.renderInterface == "pattern"
        ) {
          this.renderInterface = "origin";
        } else {
          // Slip to blank page while transitioning for better user experience
          this.renderInterface = "";
          if (this.configuratorMode == "edgex") {
            setTimeout(() => {
              this.setConfiguratorMode("blank");
            }, 100);
          }
          requestAnimationFrame(this.goToConfigurator);
        }
      } else if (this.position) {
        this.renderInterface = "pattern";
      }
    },
    previousInterface(name: "pattern" | "origin" | "position") {
      this.setModel(this.previousSelectedModels.pop() || null);
      this.renderInterface = name;
    },
    goToConfigurator() {
      if (this.selectedModel) {
        this.setCurrentModel(this.selectedModel.id);
        this.switchModelData();
        this.setConfiguratorPage("build");
      }
    },
    setModel(model: Model | null) {
      this.selectedModel = model;
    },
    checkModelInfo(id: string) {
      this.setSizeEditPopup(id);
    },
    hardSelect(model: Model | null) {
      if (this.selectedModel) {
        this.previousSelectedModels.push(this.selectedModel);
      }
      this.setModel(model);
      this.clickNext();
    },
    checkSelection() {
      if (!this.compiledModels.includes(this.selectedModel as any)) {
        this.selectedModel = null;
      }
    },
    pairMapClasses(classes: { [key: string]: string | Array<string> }) {
      const pairs: Array<string> = [];
      for (const key in classes) {
        if (Object.prototype.hasOwnProperty.call(classes, key)) {
          let filterList = classes[key];
          if (!(filterList instanceof Array)) {
            filterList = [filterList];
          }
          pairs.push(...filterList.map((name) => key + ":" + name));
        }
      }
      return pairs;
    },
    headOnHome() {
      // If we are one the patterns page and they click the logo
      // at the top, send them to the start page
      this.setConfiguratorPage("start");
      this.setConfiguratorMode("");
      this.setCurrentSeries("");
    },
    getBasePrice(object: Model | null): number {
      if (object) {
        const baseprice = utils.getBasePrice(object, this.currentProduct);
        if (baseprice) {
          return baseprice;
        }
        if (this.product?.baseprice) {
          return this.product.baseprice;
        }
      }
      return 0;
    },
    setPosition(pos: { alias: string; Sport: string[]; Position: string[] }) {
      if (this.position && this.position.alias == pos.alias) {
        this.position = null;
      } else {
        this.position = pos;
      }
    },
    onMarkupLoad(wrap: HTMLElement) {
      wrap.querySelectorAll<HTMLAnchorElement>('a[href="#standard-popup"]').forEach((link) => {
        const title = link.getAttribute("data-title");
        if (title) {
          const content = link.getAttribute("data-content");
          const image = link.getAttribute("data-image");
          const index = link.getAttribute("data-index");
          const delay = link.getAttribute("data-delay");
          const data: StandardPopupInfo = { title };
          if (content) {
            data.content = content;
          }
          if (image) {
            data.image = image;
          }
          if (index) {
            data.index = index;
          }
          if (delay) {
            data.delay = parseInt(delay);
          }
          link.addEventListener("click", (e) => {
            e.preventDefault();
            this.setStandardPopup(data);
          });
        }
      });
    },
  },
  setup() {
    const filters: Ref<{
      [key: string]: Array<string>;
    }> = ref({});
    const selectedModel: Ref<Model | null> = ref(null);
    const previousSelectedModels: Ref<Array<Model>> = ref([]);
    const modelList: Ref<any | null> = ref(null);
    const renderInterface: Ref<"position" | "pattern" | "origin" | ""> = ref("position");
    const position: Ref<{
      alias: string;
      Sport: string[];
      Position: string[];
    } | null> = ref(null);
    const altConstruction: Ref<boolean | null> = ref(null);
    const showPatterns: Ref<boolean> = ref(false);
    return {
      filters,
      selectedModel,
      modelList,
      renderInterface,
      previousSelectedModels,
      position,
      altConstruction,
      showPatterns,
    };
  },
  watch: {
    filteredModels(list: Array<Model>) {
      // If the filter is hiding the model that as selected, unselect it
      if (this.selectedModel && !list.includes(this.selectedModel)) {
        this.selectedModel = null;
      }
    },
    altConstruction(val: boolean | null) {
      if (val === null) {
        this.showPatterns = false;
      } else if (this.showPatterns === false) {
        setTimeout(() => {
          if (this.altConstruction !== null) {
            this.showPatterns = true;
          }
        }, 300);
      }
    },
    position() {
      this.altConstruction = null;
    },
  },
  mounted() {
    setTimeout(() => {
      if (this.modelList?.$el) {
        utils.scrollPresent(this.modelList.$el, 100, 0, 200);
      }
    }, 300);
    if (this.configuratorMode == "edgex") {
      this.renderInterface = "pattern";
    }
  },
  components: { MarkupWrapper },
});
</script>

<style lang="scss" scoped>
.content-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  position: relative;
  &.origin {
    padding-bottom: 40px;
    box-sizing: border-box;
    .timeframe-note {
      font: 10px/157.0238% $fnt-cm;
      position: absolute;
      left: 50%;
      transform: translate(-50%);
      bottom: 26px;
      &.mobile-only {
        padding: 15px 0;
        display: none;
      }
    }
    @media (max-width: 500px) {
      .timeframe-note {
        display: none;
        position: static;
        transform: none;
        &.mobile-only {
          display: block;
        }
      }
    }
  }
  &.pattern {
    @media (max-height: 736px) and (max-width: 650px) {
      > * {
        flex-shrink: 0;
      }
    }
    .to-configurator-wrapper {
      margin-top: auto;
      margin-bottom: 50px;
      transition: margin-bottom 0.2s;
      &.respace {
        margin-bottom: 0;
      }
    }
    .construction-selector + .model-list + .to-configurator-wrapper {
      margin-bottom: 0;
    }
    :not(.construction-selector) + .model-list + .to-configurator-wrapper {
      margin-top: 0;
    }
    .head {
      &:not(.no-cstr) {
        @media (max-height: 736px) {
          height: 45px;
          flex-grow: 0;
        }
      }
    }
    .drt-wrap {
      position: relative;
    }
    .drt-1 {
      opacity: 0;
      transition: 0.3s linear 0.3s;
      &.show {
        opacity: 1;
        transition: 0.13s linear;
      }
    }
    .drt-2 {
      position: absolute;
      inset: 0;
    }
  }
  .back-button {
    font: 14px/157.142% $fnt-cm;
    letter-spacing: 0.072em;
    position: absolute;
    top: 12px;
    left: 12px;
    padding: 10px;
    text-transform: uppercase;
    cursor: pointer;
    @media (min-width: $medium-width-up) {
      transition: color 0.2s linear;
      &:hover {
        color: $orange;
      }
    }
  }
}
.head {
  font: 40px/110% $fnt-fh;
  color: $orange;
  max-height: 72px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  flex: 1;
  &.cnstrn {
    min-height: 70px;
  }
}
.model-list {
  display: flex;
  align-items: center;
  min-height: 170px;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  margin-bottom: auto;
  order: 3;
  .construction-selector + & {
    margin-bottom: 0;
  }
  @media (max-height: 500px) {
    flex: 1;
  }
  @media (min-width: 651px) and (max-height: 920px) {
    height: 197px;
  }
  .model {
    padding: 11px 5px 5px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    animation: slide-in 0.6s cubic-bezier(0.25, 1, 0.5, 1) forwards;
    &:first-child {
      padding-left: 48px;
    }
    &:last-child {
      padding-right: 48px;
    }
    @media (max-width: $small-width) {
      &:first-child {
        padding-left: 22px;
      }
      &:last-child {
        padding-right: 22px;
      }
    }
    .thumbnail {
      position: relative;
      &::after {
        position: absolute;
        content: "";
        width: 52px;
        height: 3px;
        border-radius: 3px;
        background-color: #fff;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        transition: background-color 0.2s linear;
      }
    }
    .name {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2px 10px 0;
      border-radius: 10px;
      background-color: #fff;
      box-sizing: border-box;
      font: 400 19px/120% $fnt-ev;
      color: #000;
      letter-spacing: 0.05em;
      user-select: none;
      margin: 7px 0px 0;
      transition: background-color 0.2s linear;
      @media (max-height: 650px) {
        font-size: 14px;
        margin-top: 4px;
      }
    }
    .size {
      text-transform: uppercase;
      font: 12px/120% $fnt-cm;
      @media (max-height: 650px) {
        font-size: 10px;
      }
    }
    .more-info {
      // width: 16px;
      // height: 28px;
      // background: url("../../assets/three-dots.svg") no-repeat center/13px 2px;
      text-transform: uppercase;
      font-size: 10px;
      margin-top: 0.5em;
      color: $orange;
      transition: transform 0.2s ease;
      &:hover {
        transform: scale(1.2);
      }
      @media (max-height: 600px) {
        height: 16px;
      }
    }
    @media (min-width: $small-width-up) {
      &:hover {
        .thumbnail::after {
          background-color: #f0f0f0;
        }
      }
    }
    &.selected .thumbnail {
      &::after {
        background-color: $orange;
      }
    }
    .thumbnail {
      width: 100%;
      position: relative;
      width: 90px;
      height: 90px;
      @media (max-height: 500px) {
        height: 80px;
        width: 80px;
      }
      .image-wrapper {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
        display: flex;
        align-items: flex-end;
      }
      img {
        max-width: 100%;
      }
    }
  }
  // The scroll bar stuff
  scrollbar-color: black #e6e6e6;
  &::-webkit-scrollbar {
    height: 10px;
    width: 10px;
  }
  &::-webkit-scrollbar-track {
    background-color: #e6e6e6;
    border-radius: 4px;
    margin: 0 6px;
  }
  &::-webkit-scrollbar-thumb {
    background-color: rgb(0, 0, 0);
    border-radius: 4px;
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
.no-model-message {
  padding: 10px 26px 20px;
  box-sizing: border-box;
  width: 100%;
}
.more-questions {
  padding-top: 12px;
  font: 300 10px/120% $fnt-ev;
  text-transform: uppercase;
}
.to-configurator-wrapper {
  order: 3;
  max-height: 114px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  flex: 1;
}
.to-configurator {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  max-height: 68px;
  width: calc(100% - 48px);
  max-width: 400px;
  box-sizing: border-box;
  margin: 8px auto 16px;
  font: 24px/100% $fnt-ev;
  color: #fff;
  background-color: $orange;
  border: 2px solid $orange;
  padding: 8px 10px 5px;
  text-transform: uppercase;
  user-select: none;
  cursor: pointer;
  &.disabled {
    border-color: #d8d6d2;
    background-color: #d8d6d2;
    cursor: not-allowed;
  }
  @media (min-width: $small-width-up) {
    transition:
      color 0.2s linear,
      background-color 0.2s linear;
    &:not(.disabled):hover {
      color: $orange;
      background-color: #fff;
    }
  }
}
.pair-wrapper {
  position: relative;
  height: 100%;
}
.pair-container {
  display: flex;
  justify-content: space-between;
  position: absolute;
  padding: 30px 5.24138%;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  &::before {
    position: absolute;
    top: 30px;
    left: 50%;
    width: 1px;
    height: calc(100% - 86px);
    background-color: #000;
    content: "";
  }
  @media (max-width: 500px) {
    flex-direction: column;
    align-items: center;
    &::before {
      display: none;
    }
  }
  .pair-cell {
    width: calc(50% - 16px);
    position: relative;
    padding-bottom: 56px;
    @media (max-width: 500px) {
      width: 100%;
    }
    &::after {
      content: "";
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 60px;
      background: linear-gradient(to bottom, #ffffff00 0%, #ffffff 6.6%, #ffffff 100%);
    }
    .cell-content {
      max-height: 100%;
      overflow: auto;
    }
    .cell-title ::v-deep {
      padding-bottom: 16px;
      .top,
      .bottom {
        display: block;
      }
      .top {
        font: 700 18px/184.3333% $fnt-ev;
        letter-spacing: 0.053em;
        text-transform: uppercase;
      }
      .bottom {
        font: 700 28.2px/117.6596% $fnt-ev;
        letter-spacing: 0.053em;
        text-transform: uppercase;
      }
      .red {
        color: $red;
      }
      .white {
        color: #c7c8ca;
      }
      .blue {
        color: #002856;
      }
    }
    .cell-image {
      padding-top: 1em;
      img {
        max-width: 100%;
        margin: 0 auto;
      }
    }
    .cell-type ::v-deep {
      margin-bottom: 0.8em;
      font-size: 13.5px;
      @media (max-width: $medium-width) {
        font-size: 13px;
      }
      p {
        margin-bottom: 1.2em;
      }
      ul {
        text-align: left;
        list-style-type: disc;
        list-style-position: inside;
      }
      ol {
        text-align: left;
        list-style-type: decimal;
        list-style-position: inside;
      }
      ul ul,
      ol ul {
        list-style-type: circle;
        list-style-position: inside;
        margin-left: 15px;
      }
      ol ol,
      ul ol {
        list-style-type: lower-latin;
        list-style-position: inside;
        margin-left: 15px;
      }
      ul > li {
        margin-bottom: 0.5em;
        padding-left: 0.4em;
      }
    }
    .price-point {
      margin-bottom: 0.8em;
    }
    .price-point,
    .production-options {
      color: $red;
      .baseprice,
      .time {
        color: #000;
      }
      @media (max-width: $medium-width) {
        font-size: 13px;
      }
    }
    .select-pattern {
      padding: 12px;
      font: 700 11px/117.6416% $fnt-ev;
      letter-spacing: 0.053em;
      box-sizing: border-box;
      display: inline-block;
      min-width: 112px;
      text-align: center;
      color: #fff;
      border: 2px solid;
      transition:
        background-color 0.2s linear,
        color 0.2s linear;
      position: absolute;
      bottom: 0;
      left: 50%;
      z-index: 2;
      transform: translateX(-50%);
      box-sizing: border-box;
    }
  }
  .made-in-usa,
  .standard {
    @media (max-width: 500px) {
      margin-bottom: 50px;
      &::after {
        position: absolute;
        bottom: -25px;
        left: 0;
        height: 1px;
        width: 100%;
        background-color: #000;
        content: "";
      }
    }
    .select-pattern {
      border-color: $red;
      background-color: $red;
      @media (min-width: $medium-width-up) {
        cursor: pointer;
        &:hover {
          background-color: #fff;
          color: $red;
        }
      }
    }
  }
  .merican-heritage,
  .edge {
    .select-pattern {
      border-color: #000;
      background-color: #000;
      @media (min-width: $medium-width-up) {
        cursor: pointer;
        &:hover {
          background-color: #fff;
          color: #000;
        }
      }
    }
  }
}
.fade-enter-from {
  opacity: 0;
  position: absolute;
}
.fade-enter-to {
  transition: opacity 0.15s linear 0.15s;
}
.fade-leave-active {
  transition: opacity 0.15s linear;
  position: absolute !important;
}
.fade-leave-to {
  opacity: 0;
}
.fade-patterns-enter-from {
  opacity: 0;
}
.fade-patterns-enter-to {
  transition: opacity 0.3s linear 0.15s;
}
.fade-patterns-leave-active {
  transition: opacity 0.3s linear;
}
.fade-patterns-leave-to {
  opacity: 0;
}
.pattern-enter-from {
  opacity: 0;
  width: 0;
  padding-left: 0 !important;
  padding-right: 0 !important;
  &:first-child {
    padding-left: 43px !important;
  }
  &:last-child {
    padding-right: 43px !important;
  }
}
.pattern-enter-to {
  transition:
    all 0.4s ease,
    opacity 0.13s linear 0.27s;
  width: 90px;
  padding-left: 5px !important;
  padding-right: 5px !important;
  &:first-child {
    padding-left: 48px !important;
  }
  &:last-child {
    padding-right: 48px !important;
  }
}
.pattern-leave-active {
  transition:
    all 0.4s ease,
    opacity 0.13s linear;
  width: 90px;
  padding-left: 5px !important;
  padding-right: 5px !important;
  &:first-child {
    padding-left: 48px !important;
  }
  &:last-child {
    padding-right: 48px !important;
  }
}
.pattern-leave-to {
  opacity: 0;
  width: 0;
  padding-left: 0 !important;
  padding-right: 0 !important;
  &:first-child {
    padding-left: 43px !important;
  }
  &:last-child {
    padding-right: 43px !important;
  }
}

.position-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 5%;
  max-width: 400px;
  padding: 50px 24px 0;
  margin: 0 auto;
  @media (max-height: 472px) {
    padding-top: max(calc(100vh - 422px), 20px);
  }
}
.single-pos {
  width: 46.7576%;
  max-width: 150px;
  display: flex;
  flex-direction: column-reverse;
  justify-content: center;
  cursor: pointer;
  padding: 3%;
  border: 2px solid #f1f2f2;
  border-radius: 10%;
  box-sizing: border-box;
  aspect-ratio: 1;
  margin-bottom: 5%;
  transition: border-color 0.4s linear;
  &.selected {
    border-color: $orange;
    transition: border-color 0.1s linear;
  }
  @media (min-width: $small-width-up) {
    &:not(.selected):hover {
      border-color: #818181;
    }
  }
}
.position-name {
  font: 700 13px/115.384% $fnt-ev;
  letter-spacing: 0.049em;
  text-transform: uppercase;
  color: #000;
}
.position-image {
  padding-bottom: 8px;
  img {
    max-width: 100%;
    height: auto;
  }
}
.construction-selector {
  display: flex;
  padding-top: 40px;
  justify-content: center;
  gap: 3%;
  @media (min-width: 651px) and (max-height: 920px) {
    flex: 1;
    overflow: auto;
    padding-top: 16px;
  }
  .construction-type {
    max-width: 158px;
    flex: 1;
    @media (min-width: 651px) and (max-height: 920px) {
      padding-bottom: 30px;
      height: fit-content;
    }
  }
  .construction-name {
    font: 700 17px/141.176% $fnt-ev;
    letter-spacing: 0.093em;
    text-transform: uppercase;
    color: #000;
    margin-bottom: 0.4em;
  }
  .construction-image {
    border: 2px solid #f1f2f2;
    border-radius: 18%;
    overflow: hidden;
    transition: border-color 0.4s linear;
    cursor: pointer;
    &.selected {
      border-color: $orange;
      transition: border-color 0.1s linear;
    }
    @media (min-width: $small-width-up) {
      &:not(.selected):hover {
        border-color: #a1a1a1;
      }
    }
    img {
      max-width: 100%;
      height: auto;
      display: block;
    }
  }
  .construction-content {
    font: 13px/130.769% $fnt-cm;
    padding-top: 16px;
    ::v-deep {
      p {
        margin-bottom: 0.5em;
        &:last-child {
          margin-bottom: 0;
        }
      }
      .orange {
        color: $orange;
      }
      a[href] {
        color: $orange;
        text-decoration: underline;
        transition: text-decoration-color 0.2s linear;
        &:not(:hover) {
          text-decoration-color: #0000;
        }
      }
    }
  }
}
.model-list-head {
  position: relative;
  order: 2;
  height: 8px;
  margin-top: auto;
  z-index: 3;
  opacity: 0;
  transition: opacity 0.3s;
  &.show {
    opacity: 1;
  }
  &.show-bigger {
    height: 30px;
    opacity: 1;
  }
  &::before {
    content: "";
    position: absolute;
    background-color: #000;
    height: 1px;
    top: 11px;
    left: 0;
    right: 0;
  }
  &::after {
    content: attr(data-title);
    position: absolute;
    top: 11px;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: #fff;
    font: 700 13px/100% $fnt-cm;
    text-transform: uppercase;
    letter-spacing: 0.053em;
    padding: 0 0.8em;
  }
  &:not(.show-bigger)::before {
    @media (min-width: 651px) and (max-height: 920px) {
      height: 30px;
      background: linear-gradient(to top, #fff 0%, #fff0 100%);
      top: initial;
      bottom: 100%;
    }
  }
}

@keyframes slide-in {
  0% {
    transform: translateX(-200px);
  }
  100% {
    transform: none;
  }
}
</style>
