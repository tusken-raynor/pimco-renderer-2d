<template>
  <div
    v-if="option"
    :class="['complex-uploader-option']"
  >
    <div class="input-wrapper">
      <label class="label" :for="option.id" @click="triggerPopup" v-html="option.nickname || option.name"></label>
      <input
        type="file"
        :name="option.name"
        :id="option.id"
        ref="fileInput"
        :accept="accept"
        @change="handleFileChange"
      />
    </div>
    <div class="uploaded-list">
      <div 
        class="uploaded-option dflt-option" 
        :class="{'selected': selectedKey == -1}"
        @click="selectImageOption(null)"
        v-html="option.nonelabel || 'None'"
      ></div>
      <div
        v-for="({ url, key }, i) in imageUrls"
        :key="key"
        :class="['uploaded-option', { selected: selectedKey === i }]"
        @click="selectImageOption(key)"
      >
        <BaseImage :src="url" :alt="key.startsWith('file|') ? `Server saved image ${key.split('|')[1]}` : `Uploaded image ${key}`" />
        <button class="remove x-pattern" @click.stop="removeImageOption(key)">Remove</button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import {
  ComplexUploaderOption,
} from "@/types";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
import { OptionCasing } from "@/structure";
import uploaded from "@/storage/uploaded";
import utils from "@/utils";

export default defineComponent({
  name: "ComplexUploaderOption",
  props: {
    option: Object as () => ComplexUploaderOption,
    selected: Object as () => ComplexUploaderOption | null,
    select: Function,
    subAttribute: String,
    optionName: String,
    subOptionName: String,
    onUnselected: Function,
    casing: Object as () => OptionCasing,
  },
  computed: {
    ...mapState(["objectIDMap", "currentProduct", "selectedOptions"]),
    ...mapGetters({
      attribute: "getAttribute",
      restrictions: "getRestrictions",
      enablers: "getIndexedEnablers",
    }),
    images() {
      return this.listedImageKeys.map(key => this.imageKeyToFilename(key));
    },
    local() {
      return location.hostname == 'localhost';
    }
  },
  data() {
    return {
      accept: "image/*",
      timerID: -1 as any,
      filename: "",
      selectedKey: -1,
      listedImageKeys: [] as string[],
      imageUrls: [] as Array<{ url: string; key: string; }>,
    };
  },
  methods: {
    ...mapMutations(["addProductImageContributer", "setSpecialPopup"]),
    ...mapActions(["storeData"]),
    imageKeyToFilename(key: string | number): string {
      if (typeof key === "number") {
        key = this.listedImageKeys[key];
      }
      return utils.imageKeyToFilename(key);
    },
    createMetaDataString(): string {
      return `${this.selectedKey > -1 ? this.selectedKey : ''}:${this.listedImageKeys.join(",")}`;
    },
    async handleFileChange(e: Event) {
      if (!this.casing) return;
      // Get the image file and register it with the upload module
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const { key } = await uploaded.registerImageBlob(file, { resize: [600, 600], reformat: 'webp' });
        this.listedImageKeys = Array.from(new Set([...this.listedImageKeys, key]));
        this.selectImageOption(key);
      }
    },
    clearFileInput() {
      if (this.fileInput) {
        this.fileInput.value = "";
      }
    },
    selectImageOption(key: string | number | null) {
      if (typeof key == "string") {
        this.selectedKey = this.listedImageKeys.indexOf(key);
      } else if (typeof key == "number") {
        this.selectedKey = key >= 0 && key < this.listedImageKeys.length ? key : -1;
      } else {
        this.selectedKey = -1;
      }
    },
    removeImageOption(key: string | number) {
      if (typeof key == "string") {
        key = this.listedImageKeys.indexOf(key);
      }
      this.listedImageKeys = this.listedImageKeys.filter((_, i) => i !== key);
      if (this.selectedKey === key) {
        this.selectedKey = -1;
      } else if (this.selectedKey > key) {
        this.selectedKey--;
      }
    },
    getImageUrlAndTag(key: number): [string | undefined, string | undefined] {
      const url = this.imageUrls[key]?.url;
      if (!url) {
        return [undefined, undefined];
      }
      const tag = `<img src="${url}" alt="${this.option?.name}" style="max-width: min(100%, 100px); max-height: min(100%, 72px); width: auto; height: auto; display: block;" />`;
      return [url, tag];
    },
    async onOptionChange() {
      // Parse the metadata and set the image keys and filenames
      const metadata = await utils.parseMetaData(this.casing?.getMetaData('+keys') || '');
      this.listedImageKeys = metadata.keys;
      this.selectedKey = metadata.currentKey;
    },
    triggerPopup(e: MouseEvent) {
      if (this.option?.popup && this.fileInput) {
        e.preventDefault();
        this.setSpecialPopup({
          title: this.option.popup.title,
          message: this.option.popup.message,
          payload: {
            ...this.option.popup,
            fileInput: this.fileInput,
            accept: this.accept
          },
          mode: "fnp_upload-file"
        });
      }
    }
  },
  watch: {
    option() {
      this.onOptionChange();
    },
    selectedKey(value) {
      if (this.casing) {
        this.casing.setMetaData("+keys", this.createMetaDataString());
      }
      this.filename = this.imageKeyToFilename(value);
    },
    async listedImageKeys(newValue: string[], oldValue: string[]) {
      if (!this.casing) return;
      const branchID = this.casing.branchID;
      this.casing.setMetaData('+keys', this.createMetaDataString());
      const imageUrls = await Promise.all(newValue.map(key => {
        if (key.startsWith('file|')) {
          return Promise.resolve(this.imageKeyToFilename(key));
        } else {
          return uploaded.getBlobUrl(key, branchID)
        }
      }));
      this.imageUrls = imageUrls.map((url, index) => ({ url: url as string, key: newValue[index] })).filter(x => !!x.url);

      const removedKeys = oldValue.filter(key => !newValue.includes(key) && !key.startsWith('file|'));
      for (const key of removedKeys) {
        await uploaded.deleteBlob(key, this.casing.branchID);
      }
    },
    filename(value) {
      if (this.option) {
        this.option.text = value;
        if (!this.option.text) {
          delete this.option.text;
        }
        requestAnimationFrame(this.storeData);

        if (this.casing) {
          this.casing.value = value ? this.option : null;
        }
      }
    }
  },
  setup() {
    const fileInput: Ref<HTMLInputElement | null> = ref(null);
    return { fileInput };
  },
  mounted() {
    // console.log(this.casing);
    this.onOptionChange();
  },
});
</script>

<style lang="scss" scoped>
.complex-uploader-option {
  display: flex;
  height: 100%;
  width: 100%;

  input[type=file] {
    display: none;
  }
}
.input-wrapper {
  display: flex;
  align-items: center;
  padding: 8px 16px;
}
.label {
  cursor: pointer;
  display: flex;
  align-items: center;
  font: 600 16px/1.2 $fnt-cm;
  text-align: left;
  max-width: 110px;
  &::before {
    content: "";
    display: inline-block;
    width: 44px;
    height: 44px;
    background: $orange url(../../../assets/upload.svg) no-repeat center/64% auto;
    border-radius: 8px;
    margin-right: 8px;
    transition: background-color 0.2s linear;
    flex-shrink: 0;
  }
  @media (min-width: 600px) {
    &:hover::before {
      background-color: #{$orange}ab;
    }
  }
}
.uploaded-list {
  display: flex;
  align-items: center;
}
.uploaded-option {
  cursor: pointer;
  user-select: none;
  margin-inline: 10px;
  height: 58px;
  border: 2px solid #0000;
  position: relative;
  color: #a8aaad;
  font: 400 14px/1.4 $fnt-ev;
  display: flex;
  align-items: center;
  justify-content: center;

  &::after {
    content: "";
    position: absolute;
    inset: -2px;
    border: 2px solid #818386;
    transition: border-color 0.2s linear;
  }

  &.selected::after {
    border-color: $orange;
  }
  &.dflt-option {
    aspect-ratio: 38/29;
  }
  &:hover {
    &:not(.selected)::after {
      border-color: #c6cad2;
    }
    .remove.remove.remove {
      opacity: 1;
      pointer-events: initial;
    }
  }

  img {
    width: auto;
    height: 100%;
    display: block;
    object-fit: contain;
    min-width: 38px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  }

  .remove {
    position: absolute;
    top: 2px;
    right: 2px;
    z-index: 2;
    background-color: rgba(0, 0, 0, 0.3);
    border: 4px solid transparent;
    cursor: pointer;
    font-size: 0px;
    padding: 4px;
    border-radius: 100px;
    transition: background-color 0.2s linear, opacity 0.1s linear;
    body:not(.is-touch) & {
      opacity: 0;
      pointer-events: none;
    }

    &::before, &::after {
      background-color: #ccc;
    }

    &:hover {
      background-color: rgba(0, 0, 0, 0.7);
    }
  }
}
</style>