<template>
  <img
    class="imaujee"
    :loading="loading"
    :src="source"
    :alt="altText"
    :sizes="compiledSizes || undefined"
    :srcset="compiledSrcset || undefined"
    :width="widthAttr || undefined"
    :height="heightAttr || undefined"
  />
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { ImageData, ImageDataSrcset, ImageDataSizes } from "../types";
import utils from "@/utils";

export default defineComponent({
  name: "Image",
  computed: {
    source(): string {
      const data: ImageData | string = this.data as any;
      if (this.src) {
        return utils.setVersionParam(this.src);
      } else if (data instanceof Object && data.src) {
        return utils.setVersionParam(data.src);
      } else if (typeof data == "string") {
        return utils.setVersionParam(data);
      }
      return "";
    },
    compiledSizes(): string | null {
      const sizes: ImageDataSizes =
        (this as any).sizes || (this as any).data
          ? (this as any).data.sizes
          : null;
      if (sizes instanceof Object) {
        let sizeList: string[] = [];
        if (sizes.default) {
          sizeList.push(sizes.default);
        }
        for (const key in sizes) {
          if (sizes.hasOwnProperty(key) && key !== "default") {
            const size = sizes[key];
            sizeList.unshift(key + " " + size);
          }
        }
        return sizeList.join(",");
      }
      return sizes;
    },
    compiledSrcset(): string | null {
      const srcset: ImageDataSrcset =
        (this as any).srcset || (this as any).data
          ? (this as any).data.srcset
          : null;
      if (srcset instanceof Object) {
        let sourceList: string[] = [];
        for (const key in srcset) {
          if (srcset.hasOwnProperty(key)) {
            const src = utils.setVersionParam(srcset[key]);
            sourceList.push(src + " " + key);
          }
        }
        return sourceList.join(",");
      }
      return srcset;
    },
    altText(): string {
      if (this.alt) {
        return this.alt;
      }
      if (this.data && (this.data as any).alt) {
        return (this.data as any).alt;
      }
      return "";
    },
    widthAttr(): string | number {
      const data: ImageData | string = this.data as any;
      if (this.width !== "") {
        return this.width;
      } else if (data instanceof Object && data.width) {
        return data.width;
      }
      return "";
    },
    heightAttr(): string | number {
      const data: ImageData | string = this.data as any;
      if (this.height !== "") {
        return this.height;
      } else if (data instanceof Object && data.height) {
        return data.height;
      }
      return "";
    },
    loading(): "lazy" | "eager" | undefined {
      if (this.data instanceof Object && 'loading' in this.data) {
        return this.data.loading;
      }
      return this.lazyload ? "lazy" : undefined;
    },
  },
  props: {
    lazyload: {
      type: Boolean,
      default: true,
    },
    data: [Object, String],
    src: {
      type: String,
      default: "",
    },
    alt: {
      type: String,
      default: "",
    },
    srcset: {
      type: [String, Object],
      default: "",
    },
    sizes: {
      type: [String, Object],
      default: "",
    },
    width: {
      type: [String, Number],
      default: "",
    },
    height: {
      type: [String, Number],
      default: "",
    },
  },
});
</script>