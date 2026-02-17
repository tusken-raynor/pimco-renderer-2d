<template>
  <div v-if="type == 'front-back'" class="nav-interface">
    <teleport to="#nav-outer-alt">
      <div class="front-back">
        <span
          :class="['front-button', { selected: view == 0 }]"
          @click="setProductView(0)"
          >front</span
        >
        /
        <span
          :class="['back-button', { selected: view == 1 }]"
          @click="setProductView(1)"
          >back</span
        >
      </div>
    </teleport>
  </div>
  <template v-else-if="type == 'arrows'">
    <div class="nav-interface prev-button img-arrow" @click="decrementProductView"></div>
    <div class="nav-interface next-button img-arrow" @click="incrementProductView"></div>
  </template>
  <navigation-dots v-else-if="type == 'dots'" class="nav-interface"></navigation-dots>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapGetters, mapMutations } from 'vuex';
import NavigationDots from './NavigationDots.vue';

export default defineComponent({
  name: 'ViewInterface',
  props: {
    type: {
      type: String,
      required: true,
    },
  },
  components: {
    NavigationDots
  },
  computed: {
    ...mapGetters({
      view: 'getProductView',
    }),
  },
  data() {
    return {};
  },
  methods: {
    ...mapMutations([
      "setProductView",
      "incrementProductView",
      "decrementProductView",
    ]),
  },
});
</script>

<style lang="scss" scoped>

.img-arrow {
  position: absolute;
  background: no-repeat center 53%/15px 24px;
  top: 0;
  height: 100%;
  width: 46px;
  cursor: pointer;
  transition: all 0.3s ease, left 0s linear, right 0s linear,
    background-color 0.05s linear, box-shadow 0.05s linear;
  @media (min-width: $medium-width-up) {
    transition: all 0.3s ease, left 0s linear, right 0s linear,
      background-color 0.2s linear 0.2s, box-shadow 0.2s linear 0.2s;
    background: no-repeat center/contain;
    top: 53%;
    width: 36px;
    height: 36px;
    padding: 11px;
    background-size: 22px;
    background-color: #fff;
    border-radius: 50%;
    box-shadow: 0 0 9px 0 #00000017;
  }
}
.prev-button {
  background-image: url(../assets/left-arrow.svg);
  left: 0;
  @media (min-width: $medium-width-up) {
    left: calc(50vw - 365px);
    background-position-x: calc(50% - 2px);
    &:hover {
      background-position-x: calc(50% - 6px);
    }
  }
  @media (min-width: 962px) {
    left: 116px;
  }
}
.next-button {
  background-image: url(../assets/right-arrow.svg);
  right: 0;
  @media (min-width: $medium-width-up) {
    right: calc(50vw - 365px);
    background-position-x: calc(50% + 2px);
    &:hover {
      background-position-x: calc(50% + 6px);
    }
  }
  @media (min-width: 962px) {
    right: 116px;
  }
}
.front-back {
  font-size: 13px;
  letter-spacing: 0.05em;
  line-height: 104%;
  font-weight: 400;
  color: #707070;
  text-transform: uppercase;
  padding-bottom: min(calc(var(--stage-height, 570px) * 0.07), 40px);
  .selected {
    font-weight: 700;
  }
  .front-button,
  .back-button {
    cursor: pointer;
    user-select: none;
  }
}
</style>