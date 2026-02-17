<template>
  <div class="navigation-dots">
    <button 
      v-for="v, i in views" 
      :key="i"
      :class="{active: i == currentView}"
      @click="setProductView({ view: v, unit: 'radians' })"
    >View {{ i + 1 }}</button>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapGetters, mapMutations } from 'vuex';
import threedee from '@/threedee';
import utils from '@/utils';

export default defineComponent({
  name: 'NavigationDots',
  computed: {
    ...mapGetters({
      view: 'getProductView',
      views: 'getViews',
      renderContext: 'getProductRenderingContext',
    }),
    currentView(): number {
      if (this.renderContext !== '2D' && threedee.initialized) {
        const viewIndex = this.views.findIndex((v: [number, number, number]) => {
          const diff = threedee.getRotationDistance(v, this.currentRotation3D);
          return diff < 0.028;
        });
        return viewIndex;
      }
      if (typeof this.view == 'number') {
        return this.view;
      }
      const stringViews = this.views.map((v: number[]) => v.map(x => x / 180 * Math.PI).join?.() || v);
      return stringViews.indexOf(this.view.join() || this.view);
    }
  },
  data() {
    const currentRotation3D = [0, 0, 0] as [number, number, number];
    const throttledRotationUpdate = null as Function | null;
    return {
      currentRotation3D,
      throttledRotationUpdate,
    };
  },
  methods: {
    ...mapMutations([
      "setProductView",
    ]),
    track3DTransformations() {
      if (!this.throttledRotationUpdate && this.renderContext !== '2D') {
        this.throttledRotationUpdate = utils.toThrottled((d: { rotation: [number, number, number] }) => {
          // console.log('rotation', d.rotation);
          this.currentRotation3D = d.rotation;
        }, 200);
        threedee.onTransformationChange(this.throttledRotationUpdate as any);
      }
    },
    clone(val: any) {
      if (!('structuredClone' in window)) {
        return JSON.parse(JSON.stringify(val));
      }
      return structuredClone(val);
    }
  },
  watch: {
    renderContext() {
      this.track3DTransformations();
    }
  },
  mounted() {
    this.track3DTransformations();
  },
  beforeMount() {
    threedee.offTransformationChange(this.throttledRotationUpdate as any);
    this.throttledRotationUpdate = null;
  }
});
</script>

<style lang="scss" scoped>
.navigation-dots {
  display: flex;
  padding-bottom: 12px;
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  button {
    background-color: #0000;
    border: none;
    margin: 0;
    appearance: none;
    font-size: 0;
    padding: 12px;
    cursor: pointer;
    &::before {
      content: '';
      display: block;
      width: 16px;
      height: 16px;
      background-color: #fffa;
      transition: background-color 0.2s linear;
      border-radius: 100px;
      box-shadow: 0 0 8px 0 #0005;
      @media (max-width: $small-width) {
        width: 15px;
        height: 15px;
      }
      @media (max-width: $xsmall-width) {
        width: 14px;
        height: 14px;
      }
    }
    &:hover::before {
      background-color: #fff;
    }
    &.active::before {
      background-color: $orange;
    }
  }
}
</style>