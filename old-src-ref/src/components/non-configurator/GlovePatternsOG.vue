<template>
  <transition name="fade" appear>
    <div
      v-if="renderInterface == 'pattern'"
      class="content-wrapper"
      :class="renderInterface"
    >
      <div class="head">select from</div>
      <div
        v-for="(cls, key) in sortedClasses"
        :key="key"
        :class="[
          'classes-list',
          'fix-scrollbar',
          { primary: key == primaryClass },
        ]"
      >
        <div class="class">
          <div v-for="name in cls" :key="name" class="class-name-wrap">
            <div
              :class="[
                'class-name',
                { selected: filterPairs.includes(key + ':' + name) },
              ]"
              @click="addFilter(key, name)"
            >
              {{ name }}
            </div>
          </div>
        </div>
      </div>
      <transition-group
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
            {{
              model.classes.Size instanceof Array
                ? model.classes.Size[0]
                : model.classes.Size
            }}
          </div>
          <div
            class="more-info"
            title="more info"
            @click.stop="checkModelInfo(model.id)"
          >
            info
          </div>
        </div>
        <div v-if="!filteredModels.length" class="no-model-message">
          There are no patterns that match the selection.
        </div>
      </transition-group>
      <!-- <div class="more-questions">Questions? <strong>Learn More</strong></div> -->
      <div class="to-configurator-wrapper">
        <div
          :class="['to-configurator', { disabled: !selectedModel }]"
          @click="clickNext"
        >
          next
        </div>
      </div>
    </div>
    <div
      v-else-if="renderInterface == 'origin'"
      class="content-wrapper fix-scrollbar"
      :class="renderInterface"
    >
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
            <div class="select-pattern" @click="hardSelect(selectedModel)">
              select
            </div>
          </div>
          <div v-if="heritageModel" class="pair-cell merican-heritage">
            <div class="cell-content fix-scrollbar">
              <div
                class="cell-title"
                v-html="content.origin.heritage.title"
              ></div>
              <div
                class="cell-type"
                v-html="content.origin.heritage.content"
              ></div>
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
            <div class="select-pattern" @click="hardSelect(heritageModel)">
              select
            </div>
          </div>
          <div class="timeframe-note mobile-only">
            *Timeframes do not include shipping.
          </div>
        </div>
      </div>
      <div class="back-button" @click="previousInterface('pattern')">back</div>
      <div class="timeframe-note">*Timeframes do not include shipping.</div>
    </div>
    <div
      v-else-if="renderInterface == 'construction'"
      class="content-wrapper fix-scrollbar"
      :class="renderInterface"
    >
      <div class="head">construction</div>
      <div class="pair-wrapper">
        <div class="pair-container">
          <div class="pair-cell standard">
            <div class="cell-content fix-scrollbar">
              <div class="cell-image">
                <BaseImage
                  :data="{
                    src: '/show-imgs/construction-standard.jpg',
                    srcset:
                      '/show-imgs/construction-standard.jpg 1x, /show-imgs/construction-standard@2x.jpg 1.5x',
                  }"
                />
              </div>
              <div class="cell-title">Standard</div>
            </div>
            <div class="select-pattern" @click="hardSelect(selectedModel)">
              select
            </div>
          </div>
          <div v-if="edgeModel" class="pair-cell edge">
            <div class="cell-content fix-scrollbar">
              <div class="cell-image">
                <BaseImage
                  :data="{
                    src: '/show-imgs/construction-edge.jpg',
                    srcset:
                      '/show-imgs/construction-edge.jpg 1x, /show-imgs/construction-edge@2x.jpg 1.5x',
                  }"
                />
              </div>
              <div class="cell-title">Edge</div>
            </div>
            <div class="select-pattern" @click="hardSelect(edgeModel)">
              select
            </div>
          </div>
        </div>
      </div>
      <div class="back-button" @click="previousInterface('origin')">back</div>
    </div>
    <div v-else class="content-wrapper blank"></div>
  </transition>
</template>

<script lang="ts">
import { Model } from "@/types";
import utils from "@/utils";
import { defineComponent, ref, Ref } from "vue";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
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
        return this.product.primaryclass;
      }
      return "";
    },
    sortedClasses(): { [key: string]: Array<string> } {
      const classes: { [key: string]: Array<string> } = {};
      if (this.classes && this.product) {
        const keys = Object.keys(this.classes).sort((key) =>
          key === this.primaryClass ? -1 : 1
        );
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          classes[key] = this.classes[key];
        }
      }
      return classes;
    },
    reducedModels(): Array<Model> {
      // Reduced models is the first filtering step
      // That factors in series as well as product
      if (this.product && this.product.models && this.objectIDMap) {
        const models: Model[] = this.product.models.map(
          (id: string) => this.objectIDMap[id]
        );
        return models.filter((m) => {
          if (!m) {
            return false;
          }
          if (
            this.configuratorMode == "series" &&
            this.series &&
            !this.series.models.includes(m.id)
          ) {
            return false;
          }
          return true;
        });
      }
      return [];
    },
    compiledModels(): Array<Model> {
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
      // This filter method uses filters interface on the patterns page.
      // Filters applied from within the same row are additive
      // Filters applied accross different rows are subtractive
      return this.compiledModels.filter((m) => {
        if (Object.keys(this.filters).length) {
          for (const key in m.classes) {
            if (Object.prototype.hasOwnProperty.call(m.classes, key)) {
              let array =
                m.classes[key] instanceof Array
                  ? m.classes[key]
                  : ([m.classes[key]] as string[]);
              const fArray = this.filters[key];
              let ev = false;
              if (fArray) {
                for (let io = 0; io < array.length; io++) {
                  const filter = array[io];
                  if (fArray.includes(filter)) {
                    ev = true;
                    break;
                  }
                }
              } else {
                ev = true;
              }
              if (!ev) {
                return false;
              }
            }
          }
          return true;
        } else {
          return true;
        }
      });
    },
    heritageModel(): Model | null {
      if (this.selectedModel?.pair?.origin && this.product) {
        if (this.product.models.includes(this.selectedModel.pair.origin)) {
          return this.objectIDMap[this.selectedModel.pair.origin] || null;
        }
      }
      return null;
    },
    edgeModel(): Model | null {
      if (this.selectedModel?.pair?.construction && this.product) {
        if (this.product.models.includes(this.selectedModel.pair.origin)) {
          return this.objectIDMap[this.selectedModel.pair.construction] || null;
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
    ]),
    ...mapActions(["switchModelData"]),
    addFilter(key: string, name: string) {
      // if (this.filters[key] === name) {
      //   delete this.filters[key];
      // } else {
      //   this.filters[key] = name;
      // }
      // requestAnimationFrame(this.checkSelection);
      if (key in this.filters) {
        const index = this.filters[key].indexOf(name);
        if (index > -1) {
          this.filters[key].splice(index, 1);
          if (!this.filters[key].length) {
            delete this.filters[key];
          }
        } else {
          this.filters[key].push(name);
        }
      } else {
        this.filters[key] = [name];
      }
    },
    clickNext() {
      if (this.selectedModel) {
        if (
          this.selectedModel.pair?.origin &&
          this.heritageModel &&
          this.reducedModels
            .map((m) => m.id)
            .includes(this.selectedModel.pair.origin) &&
          this.renderInterface == "pattern"
        ) {
          this.renderInterface = "origin";
        } else if (
          this.selectedModel.pair?.construction &&
          this.edgeModel &&
          this.reducedModels
            .map((m) => m.id)
            .includes(this.selectedModel.pair.construction) &&
          (this.renderInterface == "pattern" ||
            this.renderInterface == "origin")
        ) {
          this.renderInterface = "construction";
        } else {
          // Slip to blank page while transitioning for better user experience
          this.renderInterface = "";
          requestAnimationFrame(this.goToConfigurator);
        }
      }
    },
    previousInterface(name: "pattern" | "origin") {
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
    hardSelect(model: Model) {
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
    getBasePrice(object: Model): number {
      const baseprice = utils.getBasePrice(object, this.currentProduct);
      if (baseprice) {
        return baseprice;
      }
      if (this.product?.baseprice) {
        return this.product.baseprice;
      }
      return 0;
    },
  },
  setup() {
    const filters: Ref<{ [key: string]: Array<string> }> = ref({});
    const selectedModel: Ref<Model | null> = ref(null);
    const previousSelectedModels: Ref<Array<Model>> = ref([]);
    const modelList: Ref<any | null> = ref(null);
    const renderInterface: Ref<"pattern" | "origin" | "construction" | ""> =
      ref("pattern");
    return {
      filters,
      selectedModel,
      modelList,
      renderInterface,
      previousSelectedModels,
    };
  },
  watch: {
    filteredModels(list: Array<Model>) {
      // If the filter is hiding the model that as selected, unselect it
      if (this.selectedModel && !list.includes(this.selectedModel)) {
        this.selectedModel = null;
      }
    },
  },
  mounted() {
    setTimeout(() => {
      if (this.modelList?.$el) {
        utils.scrollPresent(this.modelList.$el, 100, 0, 200);
      }
    }, 300);
  },
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
  &.construction {
    .pair-container .pair-cell .cell-title {
      font: 18px/184.3333% $fnt-ev;
      letter-spacing: 0.053em;
      padding-bottom: 0;
    }
  }
  .back-button {
    font: 14px/157.142% $fnt-cm;
    letter-spacing: 0.072em;
    position: absolute;
    top: 22px;
    left: 22px;
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
.classes-list {
  text-align: center;
  border-bottom: 1px solid #d1d3d4;
  max-height: 94px;
  width: 100%;
  flex: 1;
  margin: 0 auto;
  overflow: auto;
  @media (min-width: 651px) and (min-height: 651px) {
    width: calc(100% - 46px);
  }
  @media (max-height: 500px) {
    flex-grow: 0.6;
  }
}
.class {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  padding: 8px 0;
  height: 100%;
  box-sizing: border-box;
  -webkit-overflow-scrolling: touch;
  @media (max-height: 500px) {
    padding: 0;
  }
  .class-name-wrap {
    display: flex;
    padding-right: 10px;
    max-width: 180px;
    height: 65%;
    max-height: 50px;
    min-height: 30px;
    &:first-child {
      padding-left: 10px;
    }
  }
  .class-name {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
    padding: 6px 18px;
    border: 1px solid #d1d3d4;
    border-radius: 10px;
    background-color: #fff;
    box-sizing: border-box;
    font: 300 15px/120% $fnt-ev;
    color: #000;
    letter-spacing: 0.05em;
    cursor: pointer;
    min-width: 60px;
    text-transform: uppercase;
    transition: all 0.2s linear;
    user-select: none;
    @media (min-width: $small-width-up) {
      &:hover {
        background-color: #f5f5f5;
      }
    }
    &.selected {
      background-color: #000;
      color: #fff;
      font-weight: 500;
    }
  }
}
.classes-list.primary {
  .class {
    padding: 6px 0 10px;
    width: fit-content;
    .class-name-wrap {
      display: block;
    }
    .class-name {
      font: 20px/120% $fnt-ev;
      border-radius: 13px;
      border: 2px solid #000;
      padding: 5px 40px;
      @media (max-width: $xsmall-width) {
        padding-left: calc((100vw - 240px) / 4);
        padding-right: calc((100vw - 240px) / 4);
      }
    }
    @media (max-height: 500px) {
      height: 42px;
    }
  }
}
.model-list {
  display: flex;
  align-items: center;
  min-height: 136px;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  @media (max-height: 500px) {
    flex: 1;
  }
  .model {
    padding: 11px 5px 16px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    @media (max-height: 650px) {
      padding-top: 5px;
      padding-bottom: 5px;
    }
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
    transition: color 0.2s linear, background-color 0.2s linear;
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
      background: linear-gradient(
        to bottom,
        #ffffff00 0%,
        #ffffff 6.6%,
        #ffffff 100%
      );
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
      transition: background-color 0.2s linear, color 0.2s linear;
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
  position: absolute;
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
  transition: all 0.4s ease, opacity 0.13s linear 0.27s;
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
  transition: all 0.4s ease, opacity 0.13s linear;
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
</style>
