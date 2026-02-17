<template>
  <div v-if="isLocalDev" class="dev-controls">
    <div class="entry" title="Open Configurator DevTools" @click="toggleControlsList">Open Configurator DevTools</div>
    <div class="controls-list" :class="{ expanded: controlsExpanded }">
      <button class="control-item image-upload" @click="openImageUploader">Image Uploader</button>
      <button v-if="productRenderingContext !== '2D'" class="control-item config-studio" @click="openConfigStudio">
        Configurator Studio
      </button>
      <button class="control-item download-canvas" :disabled="downloading" @click="downloadAllFrames">
        {{ downloading ? "Rendering..." : "Download All Frames" }}
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import avif from "@/avif";
import effects from "@/effects";
import share from "@/share";
import { starters } from "@/store/initialize";
import utils from "@/utils";
import { defineComponent } from "vue";
import { mapGetters } from "vuex";
import resizeShader from "@/shaders/box_resize.frag.glsl?raw";
import { Uniforms } from "webgl-postprocessor";

export default defineComponent({
  name: "DevControls",
  computed: {
    ...mapGetters({
      product: "getProduct",
      productRenderingContext: "getProductRenderingContext",
    }),
    isLocalDev(): boolean {
      return window.location.hostname === "localhost" && starters.dev;
    },
  },
  data() {
    return {
      controlsExpanded: false,
      downloading: false,
    };
  },
  methods: {
    toggleControlsList() {
      this.controlsExpanded = !this.controlsExpanded;
    },
    async openImageUploader() {
      if (!("openImageProcessor" in window)) {
        await utils.loadScript("/showgloves/image-upload.js");
        (window as any).AVIF_encode = avif.encode;
        (window as any).GR_resizeImage = (
          source: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap | ImageData,
          targetWidth: number,
          targetHeight: number,
        ) => {
          const buddy = effects.myWebGLBuddy()?.wake();
          if (!buddy) {
            throw new Error("WebGL2 is not supported in this environment, so image resizing is unavailable.");
          }
          if (!buddy.hasProgram("img_up_resize")) {
            buddy.newProgram("img_up_resize", { fragmentSrc: resizeShader, fragmentKey: "f_box_resize" });
          }
          const imageData = buddy
            .setResolution(targetWidth, targetHeight)
            .useProgram("img_up_resize")
            .setUniforms({
              uInputTex: {
                type: Uniforms.TEXTURE2D,
                value: source,
              },
              uInputResolution: {
                type: Uniforms.FLOAT2,
                value: [source.width, source.height],
              },
              uOutputResolution: {
                type: Uniforms.FLOAT2,
                value: [targetWidth, targetHeight],
              },
            })
            .process();
          buddy.sleep();

          return imageData;
        };
      }
      (window as any).openImageProcessor();
      this.toggleControlsList();
    },
    openConfigStudio() {
      this.$store.state.inStudioMode = !this.$store.state.inStudioMode;
      this.toggleControlsList();
    },
    async downloadAllFrames() {
      if (this.downloading) return;
      this.downloading = true;
      document.body.style.cursor = "wait";
      this.toggleControlsList();
      try {
        if (!("JSZip" in window)) {
          await utils.loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
        }
        const JSZip = (window as any).JSZip;
        const dimensions = this.product?.dimensions;
        const size = this.productRenderingContext === "2D" && Array.isArray(dimensions) ? dimensions[0] : undefined;
        const blobs: Blob[] = await new Promise((callback) =>
          this.$store.dispatch("generateProductImages", {
            callback,
            asBlobs: true,
            type: "png",
            size,
          }),
        );
        const sessionID = share.getSessionID();
        const zip = new JSZip();
        for (let i = 0; i < blobs.length; i++) {
          zip.file(`config-${sessionID}-${i}.png`, blobs[i]);
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `config-${sessionID}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Failed to download frames:", err);
      } finally {
        this.downloading = false;
        document.body.style.cursor = "";
      }
    },
  },
});
</script>

<style lang="scss">
.dev-controls {
  position: relative;
  align-self: stretch;
  display: flex;
  align-items: center;
}
.entry {
  font-size: 0;
  margin-inline: 24px;
  border-right: 1px solid #000;
  padding-right: 24px;
  height: 25px;
  position: relative;
  cursor: pointer;
  &::before {
    content: "";
    display: block;
    width: 32px;
    height: 32px;
    background: url(../assets/dev-tools.png) no-repeat center/contain;
    position: relative;
    top: calc(50% - 16px);
    left: calc(50% - 16px);
    transition: transform 0.2s ease;
  }
  &:hover::before {
    transform: scale(1.15);
  }
}
.controls-list {
  position: absolute;
  top: 100%;
  right: 0;
  background-color: white;
  border: 1px solid #ccc;
  padding-block: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 1000;
  min-width: 180px;
  transform: scaleY(0);
  transition: transform 0.2s ease;
  transform-origin: top;
  > * {
    opacity: 0;
    transition:
      opacity 0.05s linear,
      background-color 0.2s linear;
  }
  &.expanded {
    transform: scaleY(1);
    > * {
      opacity: 1;
      transition:
        opacity 0.2s linear 0.15s,
        background-color 0.2s linear;
    }
  }
}
.control-item {
  text-align: left;
  appearance: none;
  padding: 0.5rem 1rem;
  background-color: #fff;
  border: none;
  cursor: pointer;
  font: 600 13px/1.2 $fnt-cm;
  white-space: nowrap;
  &:hover {
    background-color: #e0e0e0;
  }
}
</style>
