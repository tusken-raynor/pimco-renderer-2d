<template>
  <transition name="fade">
    <div
      v-if="sizeChangePopup && model"
      :data-value="sizeChangePopup"
      class="size-edit-popup fix-scrollbar"
    >
      <div class="model-info-wrapper">
        <div class="model-image">
          <BaseImage :data="modelImage" />
        </div>
        <div class="model-title">
          {{
            (model.inches || model.name) +
            (model.classes?.Size ? " - " + model.classes.Size : "")
          }}
        </div>
        <div v-if="modelWebIcons.length" class="web-option-count">
          {{ modelWebIcons.length }} web options
        </div>
        <div v-if="modelWebIcons.length" class="web-option-icons">
          <div
            v-for="icon in modelWebIcons"
            :key="(icon as any).src || icon"
            class="web-icon"
          >
            <BaseImage :data="icon" />
          </div>
        </div>
        <div
          v-if="model.info"
          class="model-info"
          v-html="model.info?.content"
        ></div>
        <div class="action-wrapper reverse-sticky">
          <div v-if="sizeChangePopup === true" class="action" @click="editSize">
            edit size
          </div>
          <div v-else class="action" @click="closeSizeChangePopup">close</div>
        </div>
      </div>
      <div class="exit-btn x-pattern" @click="closeSizeChangePopup"></div>
    </div>
  </transition>
</template>

<script lang="ts">
import { Attribute, Attributes, ComplexSubAttribute, Model } from "@/types";
import { computed, defineComponent } from "vue";
import { mapGetters, mapMutations, mapState } from "vuex";
import { ImageData } from "@/types";
import data from "@/data";
import utils from "@/utils";
export default defineComponent({
  name: "SizeEditComponent",
  computed: {
    ...mapState(["sizeChangePopup", "objectIDMap"]),
    ...mapGetters({
      storeModel: "getModel",
      product: "getProduct",
      seriesID: "getSeriesID",
    }),
    productName(): string {
      if (this.product) {
        if (this.product.name.endsWith("s")) {
          return this.product.name.slice(0, -1).toLowerCase();
        }
        return this.product.name.toLowerCase();
      }
      return "";
    },
    model(): Model | null {
      if (
        typeof this.sizeChangePopup == "string" &&
        this.objectIDMap[this.sizeChangePopup]
      ) {
        return this.objectIDMap[this.sizeChangePopup];
      } else if (this.storeModel) {
        return this.storeModel;
      }
      return null;
    },
    modelImage(): ImageData | string {
      if (this.model && this.model.preview) {
        return this.model.preview;
      }
      return "";
    },
    modelWebIcons(): Array<ImageData | string> {
      if (this.fetchedModelWebIcons.length) {
        // Has it's own fetched batch of icons from the api
        return this.fetchedModelWebIcons;
      } else if (this.model) {
        // No personal collection of web icons on hand, so
        // let's try to make some from the data we have
        // const attributes = this.model.attributes
        //   .map((id) => this.objectIDMap[id])
        //   .filter((o) => o) as Attributes;
        // if (attributes.length) {
        //   // So we found all the attribute objects
        //   let web = attributes.find((atr) => atr.name.toLowerCase() == "web");
        //   if (!web) {
        //     // If it couldn't find the web, be a little more lax
        //     web = attributes.find((atr) =>
        //       atr.name.toLowerCase().includes("web")
        //     );
        //   }
        //   if (!web) {
        //     // If we still can't find the web, return an empty array
        //     return [];
        //   }
        //   if ("attributes" in web && web.attributes?.length) {
        //     const sub = this.objectIDMap[
        //       web.attributes[0]
        //     ] as ComplexSubAttribute;
        //     if (sub && sub.options?.options.length) {
        //       const icons = sub.options.options
        //         .map((id) => this.objectIDMap[id]?.graphic)
        //         .filter((o) => o);
        //       if (sub.options.options.length == icons.length) {
        //         return icons;
        //       }
        //     }
        //   } else if (web.type == "BasicAttribute" && web.options?.length) {
        //     const icons = web.options
        //       .map((id) => this.objectIDMap[id]?.graphic)
        //       .filter((o) => o);
        //     if (web.options.length == icons.length) {
        //       return icons;
        //     }
        //   }

        // Since we can't generate icons from the data, let's request it from the api
        if (this.seriesID) {
          data
            .fetch(
              `${this.requestOrigin}/configurator-api/?c=model-webs&model=${this.model.id}&series=${this.seriesID}`
            )
            .then((res) => {
              if (res) {
                this.fetchedModelWebIcons = res.data;
              }
            });
        } else {
          data
            .fetch(
              `${this.requestOrigin}/configurator-api/?c=model-webs&model=${this.model.id}`
            )
            .then((res) => {
              if (res) {
                this.fetchedModelWebIcons = res.data;
              }
            });
        }
      }
      return [];
    },
  },
  data() {
    const fetchedModelWebIcons: Array<ImageData | string> = [];
    return {
      fetchedModelWebIcons,
      requestOrigin: utils.getDataOrigin()
    };
  },
  methods: {
    ...mapMutations(["setSizeEditPopup", "setConfiguratorPage"]),
    closeSizeChangePopup() {
      this.setSizeEditPopup(false);
    },
    editSize() {
      this.setConfiguratorPage("patterns");
      setTimeout(this.closeSizeChangePopup, 300);
    },
    fetchNewModelIcons() {
      if (this.model) {
        if (this.seriesID) {
          data
            .fetch(
              `${this.requestOrigin}/configurator-api/?c=model-webs&model=${this.model.id}&series=${this.seriesID}`
            )
            .then((res) => {
              if (res) {
                this.fetchedModelWebIcons = res.data;
              }
            });
        } else {
          data
            .fetch(
              `${this.requestOrigin}/configurator-api/?c=model-webs&model=${this.model.id}`
            )
            .then((res) => {
              if (res) {
                this.fetchedModelWebIcons = res.data;
              }
            });
        }
      }
    },
  },
  watch: {
    model() {
      this.fetchNewModelIcons();
    },
    seriesID() {
      this.fetchNewModelIcons();
    },
  },
});
</script>

<style lang="scss" scoped>
.size-edit-popup {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 201;
  background-color: #fff;
  padding: 50px 18px 40px;
  overflow: auto;
  .model-info-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    min-height: 100%;
  }
  .model-image {
    width: 363px;
    max-width: 80vw;
    margin: 0 auto;
    .imaujee {
      max-width: 100%;
    }
  }
  .model-title {
    font: 600 26px/103.846% $fnt-cm;
    letter-spacing: 0.05em;
    max-width: 220px;
    margin: 0 auto;
    padding: 5px 0 15px;
  }
  .web-option-count {
    padding: 14px 0;
    font: 700 13px/138.461% $fnt-cm;
    letter-spacing: -0.03em;
  }
  .web-option-icons {
    display: flex;
    flex-wrap: wrap;
    padding-bottom: 30px;
    .web-icon {
      padding: 0 6px;
    }
  }
  .model-info {
    max-width: 600px;
    margin: 0 auto 2em;
  }
  .model-message {
    font: 300 13px/138.461% $fnt-cm;
    padding: 0 20px;
    max-width: 600px;
    margin: 0 auto;
  }
  .action {
    font: 15px/120% $fnt-ev;
    letter-spacing: 0.073em;
    color: $orange;
    transition: color 0.2s linear;
    padding: 25px 0 75px;
    cursor: pointer;
    @media (min-width: $small-width-up) {
      &:hover {
        color: hsl(0, 0%, 0%);
      }
    }
  }
  .exit-btn {
    position: fixed;
    top: 16px;
    right: 16px;
    width: 25px;
    height: 25px;
    cursor: pointer;
    &::after,
    &::before {
      width: 1px;
    }
  }
}
</style>