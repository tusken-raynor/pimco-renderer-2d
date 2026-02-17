<template>
  <div :class="['specs', size]">
    <div v-if="breakin && breakin > 0" class="break-in-spec">
      <span class="mfs">Game Ready</span>
      <div class="meter" :title="'Level ' + breakin">
        <div v-for="i in 4" :key="i" :class="['marker', { 'this-one': i == breakin }]"></div>
      </div>
      <span class="mes">Break-In Required</span>
    </div>
    <div v-if="weight && weight > 0" class="weight-spec">
      <span class="mfs">Light-Weight</span>
      <div class="meter" :title="'Level ' + weight">
        <div v-for="i in 4" :key="i" :class="['marker', { 'this-one': i == weight }]"></div>
      </div>
      <span class="mes">Heavier</span>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
export default defineComponent({
  name: "LeatherSpecs",
  props: {
    breakin: Number,
    weight: Number,
    size: {
      type: String,
      default: "normal",
    },
  },
});
</script>

<style lang="scss" scoped>
.specs {
  .break-in-spec {
    padding: 28px 18px 12px;
    @media (max-width: 365px) {
      padding-left: 0;
      padding-right: 0;
    }
  }
  .weight-spec {
    padding: 12px 18px 28px;
    @media (max-width: 365px) {
      padding-left: 0;
      padding-right: 0;
    }
  }
  .break-in-spec,
  .weight-spec {
    display: flex;
    align-items: center;
    justify-content: space-between;
    .mfs,
    .mes {
      width: calc(50% - 85px);
      text-transform: uppercase;
      font: 300 12px/130% $fnt-ev;
      @media (max-width: $xsmall-width) {
        font-size: 3vw;
      }
    }
    .mfs {
      text-align: left;
    }
    .mes {
      text-align: right;
    }
    .meter {
      width: 120px;
      height: 29px;
      position: relative;
      margin: 0 25px;
      flex-shrink: 0;
      &::before {
        content: "";
        position: absolute;
        width: 100%;
        height: 1px;
        top: 14px;
        left: 0;
        background-color: #d8d6d2;
      }
    }
    .marker {
      position: absolute;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      top: 50%;
      background-color: #000;
      transform: translate(-50%, -50%);
      &:first-child {
        left: 0;
      }
      &:nth-child(2) {
        left: 33.3333%;
      }
      &:nth-child(3) {
        left: 66.6666%;
      }
      &:last-child {
        left: 100%;
      }
      &.this-one {
        width: 29px;
        height: 29px;
        border-radius: 0;
        background: transparent url("../assets/diamond.svg") no-repeat center/contain;
      }
    }
  }
  &.small {
    max-width: 225px;
    .break-in-spec,
    .weight-spec {
      @media (min-width: 366px) {
        padding-left: 0;
        padding-right: 0;
      }
      .mfs,
      .mes {
        font-size: 9px;
        width: calc(50% - 35px);
      }
    }
    .meter {
      width: 88px;
      margin: 0 0px;
    }
    .marker {
      width: 5px;
      height: 5px;
      &.this-one {
        width: 16px;
        height: 16px;
      }
    }
  }
}
</style>
