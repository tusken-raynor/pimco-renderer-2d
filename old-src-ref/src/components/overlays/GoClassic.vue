<template>
  <transition name="fade">
    <div v-if="goClassicPopup" class="go-classic-popup fix-scrollbar">
      <div class="subtitle">building your</div>
      <div class="title">showglove</div>
      <div class="diamonds">
        <div v-for="i in 10" :key="i" class="diamond"></div>
        <div
          :class="['diamond', 'rainbow', { 'svg-alt': svgFetchFailed }]"
          v-html="showDiamondHTML"
        ></div>
      </div>
    </div>
  </transition>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapGetters, mapMutations, mapState } from "vuex";
import diamondShow from "@/assets/show-diamond.svg";
import data from "@/data";
export default defineComponent({
  name: "SizeEditComponent",
  computed: {
    ...mapState(["goClassicPopup", "objectIDMap"]),
    ...mapGetters({
      product: "getProduct",
    }),
  },
  data() {
    return {
      showDiamondHTML: "",
      svgFetchFailed: false,
    };
  },
  mounted() {
    data
      .fetch(diamondShow)
      .catch((e) => {
        console.error(e);
        this.svgFetchFailed = true;
      })
      .then((res) => {
        if (res?.data) {
          this.showDiamondHTML = res.data;
        } else {
          this.svgFetchFailed = true;
        }
      });
  },
});
</script>

<style lang="scss" scoped>
.go-classic-popup {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 201;
  background-color: #fff;
  padding: 50px 18px 40px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}

.subtitle {
  font: 10px/120% $fnt-ev;
  padding-bottom: 0.4em;
  text-transform: uppercase;
}
.title {
  font: 35px/120% $fnt-ev;
  letter-spacing: 0.05em;
  padding-bottom: 0.6em;
  text-transform: uppercase;
}

.diamonds {
  display: flex;
  justify-content: center;
  gap: 20px;
  padding-bottom: 70px;
  min-width: 700px;
  width: 100%;
}
.diamond {
  width: min(7.6923%, 100px);
  aspect-ratio: 1;
  order: 3;
  animation: wave 2000ms linear infinite;
  &:not(.rainbow) {
    background: url(../../assets/show-diamond-hollow.svg) no-repeat
      center/contain;
  }
  &.svg-alt {
    background: url(../../assets/show-diamond.svg) no-repeat center/contain;
  }
  &:nth-child(1),
  &:nth-child(2),
  &:nth-child(3),
  &:nth-child(4),
  &:nth-child(5) {
    order: 1;
  }
  &.rainbow {
    order: 2;
    animation-delay: 0.5s;
  }
  &:nth-child(3),
  &:nth-child(8) {
    opacity: 0.75;
  }
  &:nth-child(2),
  &:nth-child(9) {
    opacity: 0.5;
  }
  &:nth-child(1),
  &:nth-child(10) {
    opacity: 0.25;
  }

  &:nth-child(1) {
    animation-delay: 0s;
  }
  &:nth-child(2) {
    animation-delay: 0.1s;
  }
  &:nth-child(3) {
    animation-delay: 0.2s;
  }
  &:nth-child(4) {
    animation-delay: 0.3s;
  }
  &:nth-child(5) {
    animation-delay: 0.4s;
  }
  &:nth-child(6) {
    animation-delay: 0.6s;
  }
  &:nth-child(7) {
    animation-delay: 0.7s;
  }
  &:nth-child(8) {
    animation-delay: 0.8s;
  }
  &:nth-child(9) {
    animation-delay: 0.9s;
  }
  &:nth-child(10) {
    animation-delay: 1s;
  }

  ::v-deep svg {
    max-width: 100%;
    max-height: 100%;
    overflow: hidden;
    image {
      transform-origin: center;
      animation: spin-gradient 1800ms linear infinite;
    }
  }
}

@keyframes wave {
  0%,
  100% {
    transform: scale(1);
  }
  15% {
    transform: scale(1.18);
  }
  30% {
    transform: scale(1);
  }
}
@keyframes spin-gradient {
  0% {
    transform: rotate(0);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>