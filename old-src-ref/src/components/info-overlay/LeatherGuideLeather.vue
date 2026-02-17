<template>
  <div class="leather">
    <div class="info-wrapper">
      <div class="info">
        <div class="prefix">
          {{
            leather.bucket.name == leather.name && leather.prefix
              ? leather.prefix
              : leather.bucket.nickname || leather.bucket.name
          }}
        </div>
        <div class="label" v-html="leather.nickname || leather.name"></div>
        <div v-if="leather.info && leather.info.pricepoint" class="pricepoint">
          ({{ leather.info.pricepoint }})
        </div>
        <div v-if="leather.info" class="highlights">
          <div
            v-for="hl in leather.info.highlights"
            :key="hl"
            class="highlight"
            v-html="hl"
          ></div>
        </div>
      </div>
      <div class="swatches">
        <div
          v-for="swatch in swatches"
          :key="swatch.id"
          class="leather-swatch"
          :style="
            swatch.swatchtype == 'color'
              ? { backgroundColor: swatch.swatch }
              : null
          "
          :title="swatch.name"
        >
          <BaseImage
            v-if="swatch.swatchtype == 'image'"
            :data="swatch.swatch"
          />
        </div>
      </div>
      <div v-if="leather.info" class="icon">
        <BaseImage :data="leather.info.icon" />
      </div>
      <div v-if="leather.info" class="buttons">
        <div class="details" @click="addDetailsPage">Details</div>
        <div class="spacer"></div>
        <div class="compare" @click="toggleComparison">
          <div class="fake-checkbox"></div>
          <span>Compare</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { ComplexSwatchOption } from "@/types";
import { defineComponent } from "vue";
import { mapMutations, mapState } from "vuex";
export default defineComponent({
  name: "LeatherGuideLeather",
  props: {
    leather: Object,
  },
  computed: {
    ...mapState(["objectIDMap"]),
    swatches(): Array<ComplexSwatchOption> {
      if (this.leather && this.leather.suboptions) {
        return this.leather.suboptions.options
          .map((id: string) => this.objectIDMap[id])
          .filter((opt: ComplexSwatchOption) => opt);
      }
      return [];
    },
  },
  methods: {
    ...mapMutations(["addLeatherDetailsPage"]),
    toggleComparison() {
      this.$emit("compare", this.leather);
    },
    addDetailsPage() {
      if (this.leather && this.leather.info) {
        this.addLeatherDetailsPage(this.leather.info.id);
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.leather {
  padding: 20px 18px;
  display: flex;
  position: relative;
  border-bottom: 1px solid #d8d6d2;
  &:last-child {
    border-bottom: none;
  }
  &:nth-child(2) {
    padding-top: 32px;
  }
  .info-wrapper {
    position: relative;
    width: 100%;
    padding: 0 50px 0 36px;
    box-sizing: border-box;
    min-height: 156px;
  }
  .info {
    padding-left: 18px;
    font-size: 14px;
    letter-spacing: 0.075em;
    line-height: 121.428%;
    font-weight: 300;
    text-align: left;
    .prefix {
      text-transform: uppercase;
      font-size: 12px;
    }
    .label {
      font-weight: 700;
      margin-bottom: 0.8em;
      text-transform: uppercase;
      letter-spacing: 0.075em;
      display: inline-block;
    }
    .pricepoint {
      display: inline-block;
      margin-left: 7px;
    }
    .highlight {
      padding-left: 16px;
      position: relative;
      margin-bottom: 3px;
      &::before,
      &::after {
        content: "";
        width: 3px;
        height: 9px;
        background-color: #c2c1c1;
        position: absolute;
        top: 1px;
        left: 3px;
      }
      &::after {
        transform: rotate(90deg);
      }
    }
  }
  .swatches {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    width: 36px;
    display: flex;
    flex-direction: column;
    .leather-swatch {
      flex: 1;
      overflow: hidden;
      &:not(:last-child) {
        margin-bottom: 1px;
      }
      img {
        object-fit: cover;
        object-position: center;
        width: 100%;
        height: 100%;
      }
    }
  }
  .icon {
    position: absolute;
    right: 0;
    top: 0;
    max-width: 62px;
    img {
      max-width: 100%;
    }
  }
  .buttons {
    color: $orange;
    text-transform: uppercase;
    display: flex;
    margin-top: 34px;
    padding-left: 18px;
    padding-bottom: 12px;
    box-sizing: border-box;
    @media (max-width: 375px) {
      font-size: 4.266666vw;
    }
    .compare {
      display: flex;
      align-items: center;
      user-select: none;
      cursor: pointer;
      flex-shrink: 0;
    }
    .details {
      user-select: none;
      cursor: pointer;
      flex-shrink: 0;
    }
    .spacer {
      width: 55px;
    }
  }
  .fake-checkbox {
    display: inline-block;
    width: 16px;
    height: 16px;
    background-color: #fff;
    border: 1px solid $orange;
    position: relative;
    margin: -3px 7px 0 0;
    &::before,
    &::after {
      content: "";
      position: absolute;
      transform-origin: right;
      background-color: #000;
      box-shadow: 0 0 0 0.5px #0000005e;
    }
    &::before {
      width: 12px;
      height: 5px;
      top: 11px;
      left: -2px;
      transform: rotate(40deg) scaleX(0);
      transition: transform 0.1s ease-out, transform-origin 0s;
    }
    &::after {
      width: 20px;
      height: 5px;
      top: -5px;
      left: -1px;
      transform: rotate(-53deg) scaleX(0);
      transition: transform 0.09s ease-in 0.17s, transform-origin 0s;
    }
  }
  &.compare .fake-checkbox {
    &::before,
    &::after {
      transform-origin: left;
    }
    &::before {
      transform: rotate(40deg) scaleX(1);
      top: 3px;
      left: 0px;
    }
    &::after {
      transform: rotate(-53deg) scaleX(1);
      top: 11px;
      left: 7px;
    }
  }
}
</style>