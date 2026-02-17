<template>
  <video
    class="vidayho"
    :playsinline="computedAutoplay || undefined"
    :preload="computedAutoplay ? 'auto' : undefined"
    :loop="loop || (data && data['loop']) || undefined"
    :width="computedWidth || undefined"
    :height="computedHeight || undefined"
    :poster="computedPoster || undefined"
    @loadstart="onLoadStart"
    ref="video"
  >
    <source v-for="source in sources" :src="addVer(source.src)" :type="source.type">
  </video>
</template>

<script lang="ts">
import data from "@/data";
import { defineComponent, ref, Ref } from "vue";
import { VideoDataSizes, VideoSize, VideoSource } from "../types";
import { starters } from "@/store/initialize";
import utils from "@/utils";

export default defineComponent({
  name: "Image",
  computed: {
    size(): {
      sources: VideoSource[];
      poster?: string;
      width?: number;
      height?: number;
    } {
      if (typeof this.data === "string") {
        const type = this.data.split(".").pop();
        return {
          sources: [{ src: this.data, type: `video/${type}` }]
        };
      }
      const dfltNum = 1_000_000;
      const sizes: VideoDataSizes | null = this.sizes || this.data?.sizes;
      if (sizes) {
        const keys = Object.keys(sizes)
          .map((k) => k == 'default' ? dfltNum : Number(k))
          .sort((a, b) => a - b);
        for (let i = 0; i < keys.length; i++) {
          const width = keys[i];
          if (innerWidth <= width) {
            const key = width === dfltNum ? 'default' : width;
            const poster = sizes[key]['poster'];
            const sources = this.videoSizeOrSourcetoSources(sizes[key]);
            const w = sizes[key]['width'];
            const h = sizes[key]['height'];
            return {
              sources,
              poster,
              width: w,
              height: h,
            };
          }
        }
      }
      return {
        sources: []
      };
    },
    sources(): VideoSource[] {
      return this.size.sources;
    },
    computedPoster(): string | undefined {
      if (this.poster) {
        return this.poster;
      }
      return this.size.poster || this.data?.['poster'];
    },
    computedWidth(): number | undefined {
      return this.width || this.size.width || this.data?.['width'];
    },
    computedHeight(): number | undefined {
      return this.height || this.size.height || this.data?.['height'];
    },
    computedAutoplay(): boolean {
      return this.autoplay || this.data?.['autoplay'];
    },
  },
  methods: {
    videoSizeOrSourcetoSources(size: VideoSize | VideoSource | VideoSource[] | string | string[]): VideoSource[] {
      if (!Array.isArray(size)) {
        if (typeof size === "string") {
          size = [{ src: size }];
        } else if (this.isVideoSource(size)) {
          size = [size];
        } else {
          size = size.sources || [size.source!].filter(Boolean) as any[];
        }
      }
      return size.map((s) => {
        const isString = typeof s === "string";
        const src = isString ? s : s.src;
        const type = isString || !s.type ? `video/${src.split(".").pop()}` : s.type;
        return { src, type };
      });
    },
    isVideoSource(s: VideoSize | VideoSource | VideoSource[] | string | string[]): s is VideoSource {
      return s instanceof Object && 'src' in s;
    },
    onLoaded() {
      this.$emit("load");
      if (this.computedAutoplay) {
        this.video?.play();
      }
    },
    onLoadStart(e: Event) {
      const src = e.target?.['currentSrc'] || e.target?.['src'] || this.video?.currentSrc || this.video?.src;
      if (src) {
        const url = new URL(src);
        if (url.host === location.host) {
          fetch(src).then(this.onLoaded);
          return;
        }
      } 
      if (this.video) {
        this.video.addEventListener("canplaythrough", this.onLoaded);
      }
    },
    addVer(url: string): string {
      const version = utils.getVersion();
      if (url.includes("?")) {
        return `${url}&ver=${version}`;
      }
      return `${url}?ver=${version}`;
    },
  },
  setup() {
    const loaded: Ref<boolean> = ref(false);
    const video: Ref<HTMLVideoElement | null> = ref(null);
    return {
      loaded,
      video,
    };
  },
  mounted() {
    if (starters.dev) {
      this.loaded = true;
    }
    // Set the muted attribute through javascript for some reason
    if (this.video && (this.muted || (this.data && (this.data as any).muted))) {
      this.video.setAttribute("muted", "");
      this.video.muted = true;
    }
  },
  props: {
    data: [Object, String],
    sizes: {
      type: Object,
    },
    autoplay: {
      type: Boolean,
      default: false,
    },
    muted: {
      type: Boolean,
      default: false,
    },
    loop: {
      type: Boolean,
      default: false,
    },
    width: {
      type: Number,
    },
    height: {
      type: Number,
    },
    poster: {
      type: String,
    },
  },
});
</script>