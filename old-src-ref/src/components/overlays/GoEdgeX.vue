<template>
  <transition name="fade">
    <div v-if="goEdgeXPopup" class="go-edgex-popup fix-scrollbar">
      <div class="subtitle">building your</div>
      <div class="title">edge</div>
      <EdgexLoader />
      <div class="fr-images">
        <div
          v-for="img in images"
          :key="img['src'] || img"
          class="edgex-image"
          ref="imgEls"
        >
          <BaseImage :data="img" />
        </div>
      </div>
    </div>
  </transition>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import { mapGetters, mapState } from "vuex";
import data from "@/data";
import EdgexLoader from "../EdgexLoader.vue";
import utils from "@/utils";
export default defineComponent({
  name: "SizeEditComponent",
  components: { EdgexLoader },
  props: {
    onDataLoaded: Function,
  },
  computed: {
    ...mapState(["goEdgeXPopup"]),
    ...mapGetters({
      product: "getProduct",
    }),
  },
  data() {
    return {
      showDiamondHTML: "",
      images: [] as Array<ImageData | string>,
      runAnimation: false,
    };
  },
  methods: {
    wait(time = 0): Promise<void> {
      if (time > 16) {
        return new Promise((r) => setTimeout(r, time));
      } else {
        return new Promise((r) => requestAnimationFrame(r as any));
      }
    },
    async animateImages(imgEls: HTMLElement[]) {
      this.runAnimation = true;
      let i = 0;
      let lastEl: HTMLElement | null = null;
      while (this.runAnimation) {
        const el = imgEls[i];
        const angle = Math.random() * 2 * Math.PI;
        const scaleX = (Math.random() * 8 + 4) * (Math.random() < 0.5 ? -1 : 1);
        const scaleY = (Math.random() * 8 + 4) * (Math.random() < 0.5 ? -1 : 1);
        const x = Math.cos(angle) * scaleX;
        const y = Math.sin(angle) * scaleY;
        if (lastEl) {
          lastEl.style.zIndex = "";
        }
        if (!el) break;
        el.style.zIndex = "2";
        el.style.transition = "none";
        el.style.transform = `translate(-50%, -50%) translate(${x}%, ${y}%)`;
        await this.wait(100);
        if (!this.runAnimation) break;
        el.style.transition = "";
        await this.wait();
        if (!this.runAnimation) break;
        el.style.opacity = "1";
        el.style.transform = "";
        await this.wait(1800);
        if (!this.runAnimation) break;
        if (lastEl) {
          lastEl.style.transition = "none";
          lastEl.style.opacity = "";
        }
        lastEl = el;
        i = (i + 1) % imgEls.length;
      }
    },
  },
  setup() {
    const imgEls: Ref<HTMLElement[]> = ref([]);
    return { imgEls };
  },
  watch: {
    imgEls(els: HTMLElement[]) {
      if (els.length) {
        this.animateImages(els);
      }
    },
    goEdgeXPopup(val) {
      requestAnimationFrame(() => {
        if (val && this.imgEls.length) {
          this.animateImages(this.imgEls);
        } else {
          this.runAnimation = false;
        }
      });
    },
  },
  mounted() {
    if (this.imgEls.length) {
      this.animateImages(this.imgEls);
    } else {
      data
        .fetch("/showgloves/config/preconfig-data/edgex.json")
        .catch(console.error)
        .then((res) => {
          if (res?.data?.switchimages) {
            this.images = utils.shuffle(res.data.switchimages);
          }
        });
    }
  },
  beforeUnmount() {
    this.runAnimation = false;
  },
});
</script>

<style lang="scss" scoped>
.go-edgex-popup {
  position: fixed;
  inset: 0;
  z-index: 201;
  background-color: #000;
  padding: 50px 18px 40px;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: #fff;
  @media (max-width: 630px) {
    justify-content: flex-end;
  }
}

.subtitle,
.title,
.edgex-loader {
  position: relative;
  z-index: 3;
  filter: drop-shadow(0 2px 4px #000);
}
.subtitle {
  font: 10px/120% $fnt-ev;
  padding-bottom: 0.4em;
  text-transform: uppercase;
}
.title {
  font: max(35px, min(48px, 4vw)) / 100% $fnt-ev;
  margin-bottom: 0.08em;
  text-transform: uppercase;
  position: relative;
  color: #0000;
  background: url(../../assets/edge-just-edge.svg) no-repeat top/100% auto;
}

.edgex-loader {
  width: max(188px, min(258px, 21.5vw));
  height: auto;
}

.fr-images {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.edgex-image {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.7s, transform 1.6s ease-out;
  width: 100%;
  height: auto;
  max-width: min(100vw, 750px);
  @media (max-width: 630px) {
    top: 40%;
  }
  img {
    width: 100%;
  }
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background-image: radial-gradient(#0000, #0000, #0000, #000, #000);
  }
}
</style>