<template>
  <div
    :class="['config-studio-orthograph']"
    :style="{
      '--lh-directional': `url(${lhDirectional})`,
      '--lh-point': `url(${lhPoint})`,
      '--lh-hemisphere': `url(${lhHemisphere})`,
      '--lh-ambient': `url(${lhAmbient})`,
    }"
  >
    <div class="rodeo-box">
      <div v-if="positionedLights.length" class="light-layout" :data-active-light-prop="activeLightName">
        <div 
          v-for="light in positionedLights" 
          :class="['light', 'type-' + className(light.type), { active: light.name == activeLight }]"
          @click="clickLight(light.name)"
          :style="{
            left: `{(light.position[0] - bounds[0]) / (bounds[1] - bounds[0]) * 100}%`,
            top: `{(light.position[1] - bounds[2]) / (bounds[3] - bounds[2]) * 100}%`,
            transform: `translate(-50%, -50%)`,
          }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { FixedSizeArray, Light3DReference } from "@/types";
import utils from "@/utils";
import { defineComponent, ref, Ref } from "vue";
import { mapState } from "vuex";
import lhDirectional from "@/assets/light-h-directional.webp";
import lhPoint from "@/assets/light-h-point.webp";
import lhHemisphere from "@/assets/light-h-hemisphere.webp";
import lhAmbient from "@/assets/light-h-ambient.webp";

const viewTransforms: FixedSizeArray<number, 2>[] = [
  [0, 1],
  [2, 1],
  [1, 2]
];

export default defineComponent({
  name: "ConfigStudioOrthograph",
  props: {
    activeLightName: {
      type: String,
      default: "",
    },
  },
  computed: {
    ...mapState(['studioLighting']),
    activeLight(): string {
      return this.activeLightName;
    },
    positionedLights(): Array<Light3DReference & { name: string; }> {
      return this.studioLighting?.filter((light: any) => ('position' in light)) || [];
    },
    bounds(): FixedSizeArray<number, 4> {
      return [-1, 1, -1, 1].map((v, i) => v / this.zoom + this.origin[i >> 1]) as any as FixedSizeArray<number, 4>;
    },
  },
  data() {
    return {
      lhAmbient,
      lhDirectional,
      lhHemisphere,
      lhPoint,
    };
  },
  setup() {
    const origin: Ref<FixedSizeArray<number, 2>> = ref([0.0, 0.0]);
    const zoom: Ref<number> = ref(1.0);
    const viewTransform = ref(viewTransforms[0]);
    return {
      origin,
      zoom,
      viewTransform,
    };
  },
  methods: {
    className(str: string) {
      return utils.sanitize(utils.toKebobCase(str));
    },
    clickLight(name: string) {
      name = name === this.activeLight ? "" : name;
      this.$emit("light-selected", name);
    },
    getLayoutPercentage(pos: number, index: number, transform: FixedSizeArray<number, 2>) {
      
    },
  }
});
</script>

<style lang="scss" scoped>
.rodeo-box {
  position: relative;
  aspect-ratio: 1;
  background-color: #fff2;
}
.light-layout {
  position: absolute;
  inset: 0;
}
.light {
  background-color: #fff;
  width: 64px;
  aspect-ratio: 1;
  opacity: 0.7;
  cursor: pointer;
  transition: background-color 0.2s linear;
  $mask: no-repeat center center / contain;
  -webkit-mask: $mask;
  mask: $mask;
  position: absolute;
  left: 50%;
  top: 50%;
  image-rendering: pixelated;
  &.active {
    background-color: #0ff;
  }
  &.type-directional_light {
    -webkit-mask-image: var(--lh-directional);
    mask-image: var(--lh-directional);
  }
  &.type-point_light {
    -webkit-mask-image: var(--lh-point);
    mask-image: var(--lh-point);
  }
  &.type-hemisphere_light {
    -webkit-mask-image: var(--lh-hemisphere);
    mask-image: var(--lh-hemisphere);
  }
  &.type-ambient_light {
    -webkit-mask-image: var(--lh-ambient);
    mask-image: var(--lh-ambient);
  }
}
</style>