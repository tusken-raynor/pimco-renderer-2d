<template>
  <div class="test-3d-material" :class="{ open }">
    <div class="selection-controls">
      <div class="texture-selections">
        <div v-for="section in sections" :class="['select-texture', 'select-' + section.name]">
          <h2>{{ section.title }}</h2>
          <input 
            type="file" 
            :name="section.name" 
            :id="section.name + '-input'" 
            @change="e => onImageSelect(e, section.name)"
            style="display: none;"
          >
          <div class="select-options">
            <label class="sel-opt" :for="section.name + '-input'">Select from Drive</label>
            <button class="sel-opt" @click="openURLInput(section.name)">Select from URL</button>
          </div>
          <div class="preview">
            <img v-if="previewImages[section.name]" :src="previewImages[section.name]!">
            <button v-if="previewImages[section.name]" class="clear" @click="clearImage(section.name)">Clear Image</button>
          </div>
        </div>
      </div>
      <div class="options">
        <h2><strong>Options</strong></h2>
        <div v-for="option, key in options" class="option">
          <div v-if="typeof option == 'number'" class="number-option">
            <label :for="'option-' + key">{{ key }}: {{ option }}</label><br>
            <input type="range" :id="'option-' + key" min="0" max="2" step="0.01" :value="option" @change="e => updateOptionValue(key, e.target as any, parseFloat)">
          </div>
        </div>
      </div>
    </div>
    <button class="toggle-tab" @click="toggleOpeness">Open/Close</button>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from "vue";
import { type MaterialTextureName } from "../types";
import canvasWorkers from "@/renderer/canvas-workers";
import threedee, { ThreeJSTexture } from "@/threedee";
import utils from "@/utils";

export default defineComponent({
  name: "Test3dMaterial",
  setup() {
    const sections = ref<{ name: MaterialTextureName; title: string; }[]>([
      { name: "albedo", title: "Select Albedo Map" },
      { name: "normal", title: "Select Normal Map" },
      { name: "orm", title: "Select Occlusion/Roughness/Metalness Map" },
      { name: "emissive", title: "Select Emissive Map" },
      { name: "env", title: "Select Environment Map" },
    ]);
    const previewImages = ref<{ [key in MaterialTextureName]: string | null }>({
      albedo: null,
      normal: null,
      orm: null,
      emissive: null,
      env: null,
    });
    // Make the mapStore hold a callback to textures, so that we don't get a Proxy object
    // THREE.js can't use Proxy textures for some reason
    const mapStore = ref<{ [key in MaterialTextureName]: ImageData | (() => ThreeJSTexture) | null }>({
      albedo: null,
      normal: null,
      orm: null,
      emissive: null,
      env: null,
    });
    const options = ref({
      envMapIntensity: 1,
      roughness: 1
    });
    const optionTrottleTimer: any = -1;
    return {
      sections,
      open: ref(false),
      previewImages,
      mapStore,
      options,
      optionTrottleTimer,
    };
  },
  methods: {
    async onImageSelect(event: Event, name: MaterialTextureName) {
      if (!threedee.initialized) {
        throw new Error("Three.js is not initialized yet.");
      }
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) {
        return;
      }
      if (file.name.endsWith(".hdr")) {
        const url = await this.file2BlobURL(file);
        const texture = await threedee.loadHdrTexture(url);
        this.previewImages[name] = url;
        this.mapStore[name] = () => texture!;
      } else {
        const image = await this.file2Image(file);
        this.previewImages[name] = image.src;
        const worker = await canvasWorkers.request(image.width, image.height);
        worker.ctx.drawImage(image, 0, 0);
        const imageData = worker.ctx.getImageData(0, 0, image.width, image.height);
        worker.release();
        this.mapStore[name] = imageData;
      }
      this.submitMaterialTextures();
    },
    file2Image(file: File | string): Promise<HTMLImageElement> {
      return new Promise(res => {
        if (typeof file === "string") {
          const img = new Image();
          img.onload = () => res(img);
          img.src = file;
          return;
        }
        this.file2BlobURL(file).then(url => {
          const img = new Image();
          img.onload = () => res(img);
          img.src = url;
        });
      });
    },
    file2BlobURL(file: File): Promise<string> {
      return new Promise(res => {
        const reader = new FileReader();
        reader.onload = function(e: any) {
          const url = URL.createObjectURL(new Blob([e.target.result]));
          res(url);
        };
        reader.readAsArrayBuffer(file);
      });
    },
    toggleOpeness() {
      this.open = !this.open;
    },
    dispatchMaterialUpdateEvent() {
      const event = new CustomEvent("material-3d-update", {
        detail: this.mapStore,
      });
      document.dispatchEvent(event);
    },
    async openURLInput(name: MaterialTextureName) {
      if (!threedee.initialized) {
        throw new Error("Three.js is not initialized yet.");
      }
      const url = prompt("Enter URL");
      if (!url) {
        return;
      }
      if (url.includes(".hdr")) {
        const texture = await threedee.loadHdrTexture(url);
        this.previewImages[name] = url;
        this.mapStore[name] = () => texture!;
      } else {
        const image = await this.file2Image(url);
        this.previewImages[name] = image.src;
        const worker = await canvasWorkers.request(image.width, image.height);
        worker.ctx.drawImage(image, 0, 0);
        const imageData = worker.ctx.getImageData(0, 0, image.width, image.height);
        worker.release();
        this.mapStore[name] = imageData;
      }
      this.submitMaterialTextures();
    },
    clearImage(name: MaterialTextureName) {
      this.previewImages[name] = null;
      this.mapStore[name] = null;
      this.submitMaterialTextures();
    },
    submitMaterialTextures() {
      // Pull out any textures that are behind a callback
      const textures = utils.mapObject(this.mapStore, (v) => (v && typeof v == "function") ? v() : v);
      // Get rid of the null values
      const filteredTextures = utils.filterObject(textures, (v) => !!v);
      threedee.setMaterialTextures(filteredTextures, this.options);
      this.dispatchMaterialUpdateEvent();
    },
    async updateOptionValue(name: string, input: HTMLInputElement, processor?: (value: any) => any) {
      if (this.optionTrottleTimer !== -1) {
        clearTimeout(this.optionTrottleTimer);
      }
      this.optionTrottleTimer = setTimeout(() => {
        this.optionTrottleTimer = -1;
        this.options[name] = processor ? processor(input.value) : input.value;
        this.submitMaterialTextures();
      }, 500);
    },
  }
});
</script>

<style lang="scss" scoped>
.test-3d-material {
  position: fixed;
  top: 0;
  bottom: 0;
  right: 0;
  z-index: 1000;
  background-color: #fff;
  width: min(400px, 100vw);
  box-sizing: border-box;
  filter: drop-shadow(0 0 10px rgba(0, 0, 0, 0.3));
  text-align: left;
  transform: translateX(100%);
  transition: transform 0.3s ease;
  &.open {
    transform: translateX(0);
  }
}
.selection-controls {
  height: 100%;
  padding: 32px 10px;
  overflow: auto;
  &::after {
    content: "";
    display: block;
    height: 100px;
  }
}
.select-texture {
  margin-bottom: 12px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  h2 {
    margin-bottom: 8px;
    font-weight: 700;
    width: 100%;
    label {
      cursor: pointer;
    }
  }
  input {
    cursor: pointer;
  }
  .preview {
    width: 64px;
    height: 64px;
    background-color: #aaa;
    position: relative;
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .clear {
      font-size: 0;
      width: 20px;
      height: 20px;
      background-color: $orange;
      box-shadow: 0 1px 4px 0 rgba(0, 0, 0, 0.3);
      border: none;
      position: absolute;
      top: 2px;
      right: 2px;
      border-radius: 50%;
      cursor: pointer;
      &::before, &::after {
        content: "";
        position: absolute;
        top: calc(50% - 1px);
        left: 15%;
        height: 2px;
        width: 70%;
        background-color: #fff;
      }
      &::before {
        transform: rotate(45deg);
      }
      &::after {
        transform: rotate(-45deg);
      }
    }
  }
}
.select-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sel-opt {
  cursor: pointer;
  padding: 6px 12px;
  color: #fff;
  font: 500 16px/1 $fnt-cm;
  border: 2px solid #429de3;
  background-color: #429de3;
  border-radius: 6px;
  margin-right: 6px;
  transition: background-color 0.3s linear, color 0.3s linear;
  &:hover {
    background-color: #fff;
    color: #429de3
  }
}
.toggle-tab {
  position: absolute;
  top: 110px;
  right: 100%;
  padding: 24px 34px;
  background-color: #fff;
  font-size: 0;
  border: none;
  cursor: pointer;
  border-radius: 12px 0 0 12px;
  transition: top 0.3s ease;
  .test-3d-material.open & {
    top: 10px;
  }
  @media (max-width: 500px) {
    transition: none;
    .test-3d-material.open & {
      top: 10px;
      right: 0;
    }
  }
  &::before, &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: calc(50% - 0px);
    transform: translate(-50%, -50%);
    background-color: #333;
  }
  &::before {
    width: 20px;
    height: 4px;
  }
  &::after {
    width: 4px;
    height: 20px;
    .test-3d-material.open & {
      display: none;
    }
  }
}
</style>