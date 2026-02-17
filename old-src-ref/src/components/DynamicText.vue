<template>
  <svg
    v-if="text"
    xmlns="http://www.w3.org/2000/svg"
    :viewBox="`0 0 ${viewBoxX} ${viewBoxY}`"
    :width="viewBoxX * devicePixelRatio"
    :height="viewBoxY * devicePixelRatio"
    class="svg-dynamic-text"
    ref="svg"
  >
    <defs v-html="defs"></defs>
    <text :id="id || null" :x="0" :y="3.9" ref="text">
      {{ text }}
    </text>
  </svg>
</template>

<script>
import { mapState } from "vuex";
export default {
  name: "DynamicText",
  props: {
    text: String,
    color: {
      type: String,
      default: "#000",
    },
  },
  computed: {
    defs() {
      if (this.id) {
        return `<style>
              #${this.id} {
                fill: ${this.color};
                font-size: 21px;
                font-family: Campton, sans-serif;
                letter-spacing: -.025em;
                transform-origin: center;
                alignment-baseline: hanging;
                dominant-baseline: hanging;
              }
            </style>`;
      }
      return "<style></style>";
    },
  },
  data() {
    return {
      id: "",
      viewBoxX: 10000,
      viewBoxY: 10000,
      devicePixelRatio,
    };
  },
  methods: {
    sizeText() {
      const text = this.$refs.text;
      const svg = this.$refs.svg;
      const svgRect = svg.getBoundingClientRect();
      this.viewBoxX = svgRect.width;
      this.viewBoxY = svgRect.height;
      requestAnimationFrame(() => {
        const textRect = text.getBoundingClientRect();
        this.viewBoxX = textRect.width;
        this.viewBoxY = textRect.height;
      });
    },
  },
  watch: {
    text() {
      this.sizeText();
    },
  },
  mounted() {
    this.id = "r" + Math.floor(Math.random() * 10000);
    this.sizeText();
  },
};
</script>