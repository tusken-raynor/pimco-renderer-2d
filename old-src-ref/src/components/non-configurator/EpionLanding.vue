<template>
  <div class="epion-landingpage-template">
    <section v-if="content.background" class="background">
      <BaseImage :data="content.background" />
    </section>
    <section class="title">
      <h1>
        <div class="top-main">Team</div>
        <div class="bottom-main">Showbelts</div>
      </h1>
    </section>
    <section 
      v-if="content.animation?.image" 
      class="animation" 
      :style="content.animation.shadow ? { '--shadow': `url(${content.animation.shadow})` } : null"
    >
      <div class="image-wrap" @click="clickCustomize()">
        <BaseImage :data="content.animation.image" />
      </div>
    </section>
    <section class="colorplay">
      <color-play
        :info="content.colorplay.data[currentProduct]"
        :model="content.colorplay.model"
        mode="assigner"
        image-prefix="cp-epion-"
        generate-button-text="Get Started"
        :auto-generate="true"
        @customize="clickCustomize"
        @preview="onGeneratePreviews"
      />
    </section>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from "vue";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
import structure from "@/structure";
import ColorPlay from "./ColorPlay.vue";
import { Model } from "@/types";
import utils from "@/utils";
import uploaded from "@/storage/uploaded";

export default defineComponent({
  name: "EpionLanding",
  components: { ColorPlay },
  computed: {
    ...mapState(["currentProduct", "models", "objectIDMap"]),
    ...mapGetters({
      product: "getProduct",
      content: "getPreConfigData",
    }),
  },
  methods: {
    ...mapMutations([
      "setConfiguratorMode",
      "setConfiguratorPage",
      "setCurrentModel",
      "setSpecialPopup"
    ]),
    ...mapActions(["onDataStepComplete", "switchModelData", "fetchModelData"]),
    clickCustomize(params: { [key: string]: string } = {}) {
      const assignments = utils.filterObject(params, (_, k) => k.startsWith('brc'));
      const steps = [
        // this.goToLogoUploader,
        // this.goToSizeSelector,
        (_: any) => this.goToBuilder(assignments)
      ];
      let currentStep = 0;
      const next = () => {
        const step = steps[currentStep];
        currentStep++;
        if (step) step(next);
      };
      next();
    },
    goToBuilder(assignments: Record<string, string>) {
      this.setConfiguratorMode("blank");
      this.fetchModelData();
      this.onDataStepComplete({
        id: "models",
        callback: () => {
          // Grab the first model since belt will only have one model
          const firstModel: Model = this.models[0];
          if (firstModel) {
            this.setCurrentModel(firstModel.id);
            this.switchModelData();
            this.setConfiguratorPage("build");
            this.onDataStepComplete({
              id: "objects",
              callback: () => this.onInBuilder(assignments),
            });
          }
        },
      });
    },
    goToLogoUploader(next: Function) {
      this.setSpecialPopup({
        title: "Team Logo Upload",
        message: "Preferred file format: transparent PNG",
        payload: {
          validation: "I have the rights to this logo",
          fileInput: this.fileInput,
          accept: "image/*",
          skipable: true
        },
        mode: "fnp_upload-file",
        confirm: {
          callback: next,
        },
        cancel: {
          callback: () => {
            // Clear the file input since they are skipping
            this.fileInput.value = "";
            next();
          },
        }
      });
    },
    goToSizeSelector(next: Function) {
      if (!this.content.sizes) {
        next();
        return;
      }
      this.setSpecialPopup({
        title: "Size Order",
        message: this.content.sizes.description || "",
        payload: {
          ...this.content.sizes,
          onUpdate: (quantities: Record<number, number>) => {
            if (!this.content.sizes?.options?.length) return;
            this.sizeDataMeta = {
              '+preview': Object.entries(quantities).map(([i, q]) => `${this.content.sizes.options[i].name} x ${q}`).join(', '),
              '+sizerun': Object.entries(quantities).map(([i, q]) => `${this.content.sizes.options[i].wcvalue}:::${q}`).join('|||'),
              total: Object.values(quantities).reduce((a, b) => a + b, 0)
            };
          },
          skipable: true
        },
        mode: "fnp_size-run",
        confirm: {
          callback: next,
        },
        cancel: {
          callback: () => {
            // Clear the size data meta since they are skipping
            this.sizeDataMeta = {};
            next();
          },
        }
      });
    },
    onInBuilder(assignments: Record<string, string>) {
      // Loop through the assignments from the color play module and set the casing values
      for (const branchID in assignments) {
        const casing = structure.branch(branchID);
        if (casing) {
          const option = this.objectIDMap[assignments[branchID]];
          if (option) {
            casing.value = option;
            casing.userInteraction = true;
          }
        }
      }
      // If there is a logo to set, do that now
      this.setLogoFile();
      // If there is size data to set, do that now
      if (this.content.sizes.branch) {
        const casing = structure.branch(this.content.sizes.branch);
        if (casing) {
          casing.setMetaData(this.sizeDataMeta);
          casing.userInteraction = true;
          // If we hit the minimum quantity, set the option as the value
          if (!this.content.sizes.minimum || (this.sizeDataMeta.total as number) >= this.content.sizes.minimum) {
            const option = this.objectIDMap[this.content.sizes.option];
            if (option) {
              casing.value = option;
            }
          }
        }
      }
    },
    async setLogoFile() {
      if (!this.content.logos) return;
      const branches: Array<{ id: string; option: string; }> = this.content.logos.branches;
      if (!branches || branches.length === 0) return;
      const urltemplate: string = this.content.logos.urltemplate;
      if (!urltemplate) return;
      // Get the image file and register it with the upload module
      const file = this.fileInput.files?.[0];
      if (file) {
        const { key: hash } = await uploaded.registerImageBlob(file, { resize: [600, 600], reformat: 'webp' });
        const url = urltemplate.replace("$hash$", hash);
        for (const branch of branches) {
          const casing = structure.branch(branch.id);
          if (casing) {
            const option = this.objectIDMap[branch.option];
            if (option) {
              casing.value = option;
              casing.userInteraction = true;
              option['text'] = url;
              casing.setMetaData({
                '+keys': `0:${hash}`,
              });
            }
          }
        }
        // Clear the file input to avoid memory leaks
        this.fileInput.value = "";
      }
    },
    onGeneratePreviews(event: { colors: { color1: any; color2: any }, preventDefault: () => void }) {
      if (!event.colors.color1 && !event.colors.color2) {
        // If no colors are selected, go straight to the builder
        event.preventDefault();
        this.clickCustomize();
      }
    }
  },
  setup() {
    const fileInput = ref<HTMLInputElement>(document.createElement("input"));
    fileInput.value.type = "file";
    fileInput.value.accept = "image/*";
    const sizeDataMeta = ref<{ [key: string]: string | number }>({});
    return {
      fileInput,
      sizeDataMeta  
    };
  }
});
</script>

<style lang="scss" scoped>
.epion-landingpage-template {
  background-color: #fff;
  padding-top: min(100px, 13.3333vw);
  :deep(.color-play-section :is(.logo-stretch, .section-title, .sub-title, .section-prompt)) {
    display: none;
  }
  :deep(.color-play-wrapper) {
    padding-top: 10px;
  }

  :deep(section:not(.background)) {
    position: relative;
    z-index: 1;
  }
}

.background {
  position: absolute;
  inset: 0;
  z-index: 0;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    user-select: none;
  }
}

.title {
  .top-main {
    font: 200 32px/1.2 $fnt-cm;
    text-transform: uppercase;
    letter-spacing: 0.11em;
  }
  .bottom-main {
    font-size: 0;
    width: 312px;
    max-width: 100%;
    aspect-ratio: 8;
    margin-inline: auto;
    background: url(../../assets/logo-showbelts.svg) no-repeat center/contain;
  }
}

.animation {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;

  .image-wrap {
    position: relative;
    z-index: 1;
    width: 1000px;
    max-width: 100%;

    &::before {
      content: "";
      position: absolute;
      inset: 0;
      background: var(--shadow) no-repeat center/100% auto;
    }
  }
  img {
    width: 100%;
    height: auto;
    display: block;
  }
}
</style>
