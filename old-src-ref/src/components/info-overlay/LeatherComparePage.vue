<template>
  <div class="leather-compare-list fix-scrollbar" ref="scroller">
    <div class="leather-names c-list">
      <div class="row-title"></div>
      <div
        v-for="leather in leathers"
        :key="leather.id"
        class="name"
        v-html="leather.nickname || leather.name"
      ></div>
    </div>
    <div class="leather-colors c-list">
      <div class="row-title">Colors</div>
      <div
        v-for="leather in leatherColors"
        :key="leather.map((l) => l.id).join()"
        class="swatches"
      >
        <div
          v-for="swatch in leather"
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
    </div>
    <div
      v-for="(type, prop, i) in leatherProps"
      :key="prop"
      :class="['leather-properties', 'c-list', sanitize(prop)]"
    >
      <div class="row-title">{{ prop }}</div>
      <div
        v-for="leather in leathers"
        :key="leather.id"
        :class="['property', type]"
      >
        <div
          v-if="leather.info.properties"
          class="prop-value"
          :data-value="leather.info.properties[i]"
          v-html="
            typeof leather.info.properties[i] !== 'boolean'
              ? leather.info.properties[i]
              : ''
          "
        ></div>
      </div>
    </div>
    <div class="reactive-style" v-html="styleString"></div>
  </div>
</template>

<script lang="ts">
import { ComplexLeatherOption, ComplexSwatchOption } from "@/types";
import { defineComponent, ref, Ref } from "vue";
import { mapState } from "vuex";
import utils from "../../utils";
export default defineComponent({
  name: "LeatherComparePage",
  props: {
    page: Object,
  },
  computed: {
    ...mapState(["objectIDMap", "leatherProps", "windowHeight"]),
    leathers(): Array<ComplexLeatherOption> {
      if (this.page && this.page.leathers) {
        return this.page.leathers
          .map((leather: ComplexLeatherOption | string) => {
            if (typeof leather == "string") {
              leather = this.objectIDMap[leather];
            }
            if (!leather) {
              return null;
            }
            if (typeof leather == "object") {
              if (typeof leather.info == "string") {
                leather.info = this.objectIDMap[leather.info];
              }
            }
            return leather;
          })
          .filter((o: any) => o);
      }
      return [];
    },
    leatherColors(): Array<Array<string>> {
      return this.leathers
        .filter((o) => o.suboptions)
        .map((l) => {
          return l.suboptions.options
            .map((id) => this.objectIDMap[id])
            .filter((o) => o);
        });
    },
    styleString(): string {
      return `<style>
              .leather-compare-list {
                min-height: ${this.windowHeight - 53}px;
              }
              </style>`;
    },
  },
  methods: {
    sanitize: utils.sanitize,
  },
  setup() {
    const scroller: Ref<HTMLElement | null> = ref(null);
    return { scroller };
  },
  mounted() {
    if (this.scroller) {
      utils.scrollPresent(this.scroller, 200);
    }
  },
});
</script>

<style lang="scss" scoped>
.leather-compare-list {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  line-height: 116.6666%;
  // Going to make main sizing metric based off font size for easy scaling
  font-size: 14px;
  transition: min-height 0.2s ease;
  @media (min-width: $xsmall-width-up) {
    font-size: 3.5vw;
  }
  @media (min-width: 630px) {
    font-size: 22px;
  }
  .c-list {
    display: flex;
    flex: 1;
    background-color: #fff;
    &:not(:last-child) {
      border-bottom: 1px solid #bdbdbd;
    }
    &.leather-names {
      font-weight: 600;
      @media (min-width: $medium-width-up) {
        border-bottom: none;
      }
    }
    > * {
      width: 8em;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      padding: 2px 0.5em;
      min-height: 2.8em;
      &:nth-child(even) {
        background-color: #e9e9e9;
      }
      @media (min-width: $xsmall-width-up) and (max-width: 630px) {
        min-height: 9.8vw;
      }
    }
    .row-title {
      width: 9.42857em;
      padding: 2px 1em 2px 1.28571em;
      // height: 4em;
      color: #fff;
      background-color: #454444;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      text-align: left;
      @media (min-width: $medium-width-up) {
        background-color: #fff;
        color: #000;
      }
    }
    .property {
      letter-spacing: -0.03em;
      .prop-value {
        font-size: 0.9285em;
      }
      &.boolean .prop-value[data-value="true"] {
        width: 1.692277em;
        height: 1.692277em;
        position: relative;
        &::before,
        &::after {
          content: "";
          background-color: $orange;
          position: absolute;
          height: 140%;
          width: 2px;
          top: 50%;
          left: 50%;
          border-radius: 1px;
        }
        &::before {
          transform: translate(-50%, -50%) rotate(45deg);
        }
        &::after {
          transform: translate(-50%, -50%) rotate(-45deg);
        }
      }
    }
    .swatches {
      padding: 0;
      display: flex;
      align-items: stretch;
      .leather-swatch {
        flex: 1;
        overflow: hidden;
        img {
          display: block;
          object-fit: cover;
          object-position: center;
          width: 100%;
          height: 100%;
        }
      }
    }
  }
  .leather-colors {
    max-height: 90px;
  }
}
</style>