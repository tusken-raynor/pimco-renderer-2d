<template>
  <div id="working-indicator" :class="{ working: changingFrames }">
    <svg id="indicator-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 27.68 27.77">
      <path
        d="M.85,16.34a4.18,4.18,0,0,0,.58.75l9.15,9.16.76.58c2,1.52,4,1.2,6.2-1l8.29-8.29a5.7,5.7,0,0,0,1.83-3.49,4.23,4.23,0,0,0-1.44-3.47L17.07,1.45A5.07,5.07,0,0,0,13.19,0c-1.24.12-2,.73-3.08,1.82L1.82,10.13C-.22,12.18-.55,14.24.85,16.34ZM6.41,13,13,6.43a1.07,1.07,0,0,1,.92-.22,1.48,1.48,0,0,1,.91.39l6.24,6.24a1.61,1.61,0,0,1,.42.94,1,1,0,0,1-.23.91l-6.57,6.58a1.09,1.09,0,0,1-.91.25,1.58,1.58,0,0,1-.91-.42L6.58,14.83a1.52,1.52,0,0,1-.42-.91A1.05,1.05,0,0,1,6.41,13Z"
      />
    </svg>
    <svg id="indicator-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 27.68 27.77">
      <path
        d="M.85,16.34a4.18,4.18,0,0,0,.58.75l9.15,9.16.76.58c2,1.52,4,1.2,6.2-1l8.29-8.29a5.7,5.7,0,0,0,1.83-3.49,4.23,4.23,0,0,0-1.44-3.47L17.07,1.45A5.07,5.07,0,0,0,13.19,0c-1.24.12-2,.73-3.08,1.82L1.82,10.13C-.22,12.18-.55,14.24.85,16.34ZM6.41,13,13,6.43a1.07,1.07,0,0,1,.92-.22,1.48,1.48,0,0,1,.91.39l6.24,6.24a1.61,1.61,0,0,1,.42.94,1,1,0,0,1-.23.91l-6.57,6.58a1.09,1.09,0,0,1-.91.25,1.58,1.58,0,0,1-.91-.42L6.58,14.83a1.52,1.52,0,0,1-.42-.91A1.05,1.05,0,0,1,6.41,13Z"
      />
    </svg>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
export default defineComponent({
  name: "WorkingIndicator",
  props: {
    changingFrames: Boolean,
  },
});
</script>

<style lang="scss" scoped>
#working-indicator {
  position: fixed;
  top: 0;
  left: 0;
  width: 0;
  height: 100%;
  overflow: hidden;
  background-repeat: no-repeat;
  background-size: contain;
  background-position: center;
  opacity: 0;
  background: radial-gradient(ellipse at center, rgba(204, 204, 204, 0.5) 0%, rgba(204, 204, 204, 0) 100%);
  z-index: 2000;

  &.working {
    width: 100%;
    transition: opacity 0.2s linear 0.5s;
    opacity: 1;
  }
}
#indicator-1 {
  position: absolute;
  left: calc(50% - 14px);
  top: calc(50% - 14px);
  width: 28px;
  height: 28px;
  animation: rotate 2s linear 1s infinite;
  path {
    fill: #000;
  }
}
#indicator-2 {
  position: absolute;
  left: calc(50% - 14px);
  top: calc(50% - 14px);
  width: 28px;
  height: 28px;
  animation: rotate 2s linear infinite;
  path {
    fill: #fd6a21;
  }
}
@keyframes rotate {
  0% {
    transform: scale(1);
    z-index: 1;
  }
  50% {
    transform: scale(4);
    z-index: 1;
  }
  50.1% {
    z-index: 0;
  }
  100% {
    transform: scale(1);
    z-index: 0;
  }
}
</style>
