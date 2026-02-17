<template>
  <div
    v-if="popup?.payload?.fileInput"
    class="upload-file"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
    :class="{ 'is-dragover': isDragOver }"
  >
    <h2 v-if="popup.title">{{ popup.title }}</h2>
    <p v-if="popup.message">{{ popup.message }}</p>
    <div v-if="blobUrl" class="preview showz">
      <BaseImage :src="blobUrl" alt="File preview" />
      <button class="remove x-pattern" @click="removeFile"></button>
    </div>
    <label v-else :for="'temp_' + popup.payload.fileInput.id" class="cta showz">Drag file here <span>or <u>choose file</u></span></label>
    <input
      type="file"
      ref="tempFileInput"
      :id="'temp_' + popup.payload.fileInput.id"
      @change="onFileSelect"
      :accept="popup.payload.accept"
      hidden
    />
    <div
      v-if="popup.payload.validation"
      @click="userValidated = !userValidated"
      class="validation"
      :class="{ checked: userValidated }"
    >{{ popup.payload.validation && typeof popup.payload.validation == 'string' ? popup.payload.validation : 'I claim valid use of this file.' }}</div>
    <button class="confirm" :class="{ disabled: !isValidated }" @click="uploadFile">Upload</button>
    <div v-if="popup.payload.skipable" class="skip" @click="skipUpload">Skip</div>
  </div>
</template>

<script lang="ts">
import { SpecialPopupInfo } from "@/types";
import { defineComponent, ref } from "vue";
import { mapMutations } from "vuex";

export default defineComponent({
  name: "UploadFile",
  props: {
    popup: Object as () => SpecialPopupInfo | null,
  },
  computed: {
    isValidated() {
      if (this.popup?.payload?.validation ?? false) {
        return this.userValidated && !!this.file;
      }
      return !!this.file;
    }
  },
  data() {
    return {
      isDragOver: false,
      userValidated: false,
      file: null as File | null,
      blobUrl: null as string | null
    };
  },
  methods: {
    ...mapMutations(["setSpecialPopup"]),
    onDragOver() {
      this.isDragOver = true;
    },
    onDragLeave() {
      this.isDragOver = false;
    },
    onDrop(event: any) {
      this.isDragOver = false;
      this.handleFiles(event.dataTransfer.files);
    },
    onFileSelect(event: any) {
      this.handleFiles(event.target.files);
    },
    handleFiles(files: FileList) {
      const file = files[0] || null;
      if (!file) return;
      if (file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        this.blobUrl = url;
      }
      this.file = file;
    },
    removeFile() {
      this.file = null;
      if (this.blobUrl) {
        URL.revokeObjectURL(this.blobUrl);
        this.blobUrl = null;
      }
      if (this.tempFileInput) {
        this.tempFileInput.value = '';
      }
    },
    uploadFile() {
      if (!this.isValidated) return;
      if (!this.file) return;
      if (!this.popup?.payload?.fileInput) return;
      const fileInput = this.popup.payload.fileInput;

      const dt = new DataTransfer();
      dt.items.add(this.file);
      fileInput.files = dt.files;

      this.removeFile();
      const callback = this.popup.confirm?.callback;
      // Trigger the file input change event
      this.$nextTick(() => {
        fileInput.dispatchEvent(new Event("change"));
        this.setSpecialPopup(null);
        if (callback) callback();
      });
    },
    skipUpload() {
      const callback = this.popup?.cancel?.callback;
      this.setSpecialPopup(null);
      if (callback) callback();
    }
  },
  setup() {
    const tempFileInput = ref<HTMLInputElement | null>(null);
    return {
      tempFileInput,
    };
  },
  beforeUnmount() {
    if (this.tempFileInput) {
      // Clear the file input to avoid memory leaks
      this.tempFileInput.value = '';
    }
  }
});
</script>

<style scoped lang="scss">
.upload-file {
  text-align: center;
}
h2 {
  text-align: left;
  font: 500 20px/120% $fnt-cm;
  margin-right: 20px;
  min-width: 214px;
  margin-bottom: 15px;
  padding-bottom: 10px;
  @media (min-width: $small-width-up) {
    font-size: 28px;
    padding-right: 30px;
    margin-bottom: 20px;
  }
}
p {
  font: 500 16px/1.2 $fnt-cm;
  letter-spacing: 0.04em;
  margin-bottom: 0.8em;
}
.showz {
  border: 2px dashed #888;
  border-radius: 8px;
  padding: 20px;
  display: inline-flex;
  flex-direction: column;
  box-sizing: border-box;
  position: relative;
  width: 164px;
  max-width: 100%;
  font: 400 12px/1.2 $fnt-cm;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 2em 2em 1.5em;
  color: $orange;
  text-align: center;
  transition: background-color 0.2s linear;
  .is-dragover &.cta {
    background: #{$orange}36;
    border-color: #33f;
  }

  &.cta::before {
    content: "";
    display: block;
    margin-inline: auto;
    margin-bottom: 1em;
    width: 5.333em;
    aspect-ratio: 1;
    background: $orange url(../../assets/upload.svg) no-repeat center/64% auto;
    border-radius: 8px;
    transition: background-color 0.2s linear;
    flex-shrink: 0;
  }
  @media (min-width: 600px) {
    &:hover::before {
      background-color: #{$orange}ab;
    }
  }
}
.validation {
  margin-block: 20px;
  display: flex;
  margin-inline: auto;
  align-items: center;
  justify-content: center;
  gap: 1em;
  text-align: left;
  font: 500 12px/1.2 $fnt-cm;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  width: fit-content;
  cursor: pointer;
  user-select: none;
  position: relative;
  &::before {
    content: "";
    width: 1.5em;
    height: 1.5em;
    border: 1px solid #000;
    flex-shrink: 0;
  }
  &::after {
    content: "";
    width: calc(1.5em - 4px);
    height: calc(1.5em - 4px);
    background-color: $orange;
    flex-shrink: 0;
    position: absolute;
    top: calc(50% + 2px - 0.75em);
    left: 3px;
    transform: scale(0);
    transition: transform 0.2s ease;
  }
  &.checked::after {
    transform: scale(1);
  }
}

.cta {
  cursor: pointer;
}
.preview {
  position: relative;
  padding: 2px;
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: inherit;
    max-height: 256px;
  }
  .remove {
    position: absolute;
    top: 4px;
    right: 4px;
    background-color: $orange;
    appearance: none;
    padding: 0;
    width: 16px;
    height: 16px;
    border: none;
    border-radius: 100px;
    transition: transform 0.2s ease;
    cursor: pointer;
    &::before, &::after {
      height: 74%;
    }
    @media (min-width: 600px) {
      &:hover {
        transform: scale(1.2);
      }
    }
  }
}
.confirm {
  appearance: none;
  background-color: $orange;
  border: 2px solid $orange;
  display: inline-block;
  color: #fff;
  transition: background-color 0.2s linear, color 0.2s linear, border-color 0.2s linear;
  border-radius: 1000px;
  font: 500 14px/1 $fnt-cm;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.7em 1.2em 0.5em;
  min-width: 150px;
  box-sizing: border-box;
  cursor: pointer;
  &.disabled {
    background-color: #d1d3d4;
    border-color: #d1d3d4;
    cursor: not-allowed;
  }
  body:not(.is-touch) &:not(.disabled):hover {
    background-color: #fff;
    color: $orange;
  }

  @media (min-width: $small-width-up) {
    font-size: 18px;
  }
}
.skip {
  font: 500 14px/1 $fnt-cm;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: $orange;
  width: max-content;
  margin-inline: auto;
  margin-top: 1em;
  cursor: pointer;
  text-decoration: underline #fff0;
  transition: text-decoration-color 0.2s linear;
  body:not(.is-touch) &:hover {
    text-decoration-color: $orange;
  }
  @media (min-width: $small-width-up) {
    font-size: 18px;
  }
}
</style>
