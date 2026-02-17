<template>
  <div
    :class="[
      'leather-guide-btn',
      { 'show-tip': show },
      { 'display-tip': display },
      { highlite },
    ]"
    @click="goToLeatherGuide"
  >
    <div class="blanket" @click.stop="closeTipBlanket">
      <div class="exit x-pattern"></div>
      <div :class="['tip', { hidetip }]">
        <div class="title">tip</div>
        <div class="text">
          Our leather guide Is here to highlight the strengths and performance
          features of each Nokona leather.
        </div>
      </div>
      <div class="close">close</div>
    </div>
    <div :class="['btn-wrapper', { showcase, notrans, present }]">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="29"
        height="31"
        viewBox="0 0 29 31"
        ref="btn"
      >
        <g transform="translate(-747.592 -1382.312)">
          <g transform="translate(747.592 1382.312)">
            <path
              class="a shield"
              d="M774.98,1383.09a.845.845,0,0,0-.838-.778h-24.1a.845.845,0,0,0-.838.778l-1.609,17.7a.851.851,0,0,0,.224.651,66.557,66.557,0,0,0,6.4,5.933c3.181,2.6,6.133,4.839,7.372,5.766a.829.829,0,0,0,1,0c1.239-.927,4.191-3.164,7.372-5.766a66.633,66.633,0,0,0,6.4-5.933.851.851,0,0,0,.224-.651Z"
              transform="translate(-747.592 -1382.312)"
            />
            <g class="lg-el">
              <g transform="translate(6.07 3.618)">
                <path
                  class="b"
                  d="M763.187,1398.113H753.64V1385.93h3.028v9.265h6.519Z"
                  transform="translate(-753.64 -1385.93)"
                />
              </g>
            </g>
            <g class="lg-gee">
              <path
                class="b"
                d="M765.406,1395.195h-.048v2.918h2.028a3.34,3.34,0,0,1-3.038,1.761,3.548,3.548,0,0,1-.018-7.095,2.81,2.81,0,0,1,2.7,1.531h3.255c-.632-2.729-3.134-4.308-6.028-4.308a6.278,6.278,0,0,0-6.5,6.468,6.176,6.176,0,0,0,6.485,6.217,4.738,4.738,0,0,0,3.852-1.72l.126,1.469h2.257v-7.241h-5.069Z"
                transform="translate(-747.549 -1382.144)"
              />
            </g>
          </g>
          <rect
            class="a rects"
            width="9.24"
            height="0.805"
            transform="translate(757.172 1394.549)"
          />
          <rect
            class="a rects"
            width="9.24"
            height="0.788"
            transform="translate(757.172 1398.321)"
          />
        </g>
      </svg>
    </div>
    <div class="reactive-style" v-html="styleString"></div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import { mapMutations, mapState } from "vuex";
export default defineComponent({
  name: "LeatherGuideButton",
  props: {
    tip: {
      type: Boolean,
      default: false,
    },
    text: String,
    timeout: {
      type: Number,
      default: 1000,
    },
    buckets: Array,
  },
  computed: {
    ...mapState(["windowHeight"]),
    styleString(): string {
      return `<style>
              .leather-guide-btn .btn-wrapper.showcase {
                height: ${this.windowHeight}px;
              }
              .leather-guide-btn .blanket {
                height: ${this.windowHeight}px;
              }
              </style>`;
    },
  },
  data() {
    return {
      display: false,
      show: false,
      highlite: false,
      showcase: false,
      busy: true,
      notrans: false,
      hidetip: false,
      present: false,
      cancelPresentation: false,
    };
  },
  methods: {
    ...mapMutations(["addLeatherGuidePage", "setLeatherGuideTippedStatus"]),
    openTipBlanket() {
      this.display = true;
      const btn = this.btn;
      this.busy = true;
      if (btn) {
        this.hidetip = true;
        requestAnimationFrame(() => {
          this.show = true;
          const rect = btn.getBoundingClientRect();
          this.showcase = true;
          this.notrans = true;
          this.present = true;
          requestAnimationFrame(() => {
            const rect2 = btn.getBoundingClientRect();
            btn.style.height = rect2.height + "px";
            btn.style.width = rect2.width + "px";
            setTimeout(() => {
              this.notrans = false;
              btn.style.top = rect.top + "px";
              btn.style.left = rect.left + "px";
              btn.style.height = rect.height + "px";
              btn.style.width = rect.width + "px";
              btn.style.transform = `translate(0, 0)`;
              this.hidetip = false;
              setTimeout(() => {
                btn.style.removeProperty("top");
                btn.style.removeProperty("left");
                btn.style.removeProperty("height");
                btn.style.removeProperty("width");
                btn.style.removeProperty("transform");
                requestAnimationFrame(() => {
                  this.showcase = false;
                  this.busy = false;
                });
              }, 600);
            }, 1400);
          });
          setTimeout(() => {
            this.present = false;
          }, 1100);
        });
      } else {
        requestAnimationFrame(() => {
          this.show = true;
          setTimeout(() => this.blinkButton(12), 400);
          this.busy = false;
        });
      }
    },
    closeTipBlanket() {
      if (!this.busy) {
        this.show = false;
        this.setLeatherGuideTippedStatus();
        this.showcase = false;
        setTimeout(() => {
          this.display = false;
        }, 400);
      }
    },
    goToLeatherGuide() {
      if (!this.present) {
        this.cancelPresentation = true;
        if (this.show) {
          this.closeTipBlanket();
          setTimeout(() => {
            this.openLeatherGuide();
          }, 400);
        } else {
          this.openLeatherGuide();
        }
      }
    },
    openLeatherGuide() {
      if (this.buckets && this.buckets.length) {
        this.addLeatherGuidePage({ buckets: this.buckets });
      } else {
        this.addLeatherGuidePage();
      }
    },
    blinkButton(times: number, count: number = 0) {
      if (count < times && this.display) {
        this.highlite = true;
        setTimeout(() => {
          this.highlite = false;
          setTimeout(() => {
            this.blinkButton(times, count + 1);
          }, 200);
        }, 200);
      }
    },
  },
  setup() {
    const btn: Ref<HTMLElement | null> = ref(null);
    return { btn };
  },
  mounted() {
    if (this.tip) {
      setTimeout(() => {
        if (!this.cancelPresentation) {
          this.openTipBlanket();
        }
      }, this.timeout);
    }
  },
});
</script>

<style lang="scss" scoped>
.leather-guide-btn {
  background-color: $orange;
  width: 64px;
  height: 55px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  .blanket {
    position: fixed;
    z-index: 99;
    background-color: rgba(0, 0, 0, 0.822);
    opacity: 0;
    display: none;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    top: 0;
    left: 0;
    width: 100vw;
    transition: opacity 0.4s ease;
    .exit {
      width: 73px;
      height: 73px;
      margin-left: calc(100% - 73px);
      cursor: pointer;
      &::before,
      &::after {
        height: 28px;
        background-color: $orange;
        transition: transform 0.2s ease;
      }
      @media (min-width: $small-width-up) {
        &:hover {
          &::before {
            transform: translate(-50%, -50%) rotate(45deg) scale(1.15);
          }
          &::after {
            transform: translate(-50%, -50%) rotate(-45deg) scale(1.15);
          }
        }
      }
    }
    .tip {
      color: #fff;
      font: 300 20px/150% $fnt-cm;
      letter-spacing: 0.1em;
      text-align: center;
      padding: 20px 11.5vw;
      max-width: 375px;
      transition: opacity 0.2s linear 0.1s;
      &.hidetip {
        opacity: 0;
      }
      .title {
        font-weight: bold;
        text-transform: uppercase;
        margin-bottom: 14px;
      }
    }
    .close {
      text-transform: uppercase;
      color: #fff;
      cursor: pointer;
      margin-bottom: 40px;
      font: 700 13px/100% $fnt-cm;
      display: inline-block;
      transition: color 0.2s ease;
      user-select: none;
      &:hover {
        color: $orange;
      }
    }
  }
  .btn-wrapper {
    // style
    width: 45.3125%;
    z-index: 100;
    display: flex;
    justify-content: center;
    align-items: center;
    &.showcase {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      svg {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        transition: all 0.6s ease, opacity 0.2s,
          top 0.6s cubic-bezier(0.31, 0, 0.41, 1),
          left 0.6s cubic-bezier(0.69, 0, 0.59, 1);
      }
      &.notrans svg {
        transition: all 0.6s ease, opacity 0.2s, transform 0s;
      }
    }
  }
  svg {
    position: relative;
    transition: opacity 0.2s;
    height: auto;
    width: 100%;
    max-width: 180px;
    .a,
    .b {
      transition: fill 0.3s ease;
    }
    .a {
      fill: #040505;
    }
    .b {
      fill: #fff;
    }
  }
  @media (min-width: $small-width-up) {
    &:hover svg {
      .a {
        fill: #fff;
      }
      .b {
        fill: #040505;
      }
    }
  }
  &.display-tip {
    .blanket {
      display: flex;
    }
    svg {
      cursor: pointer;
      .a {
        fill: #040505;
      }
      .b {
        fill: #fff;
      }
    }
  }
  &.show-tip {
    cursor: default;
    .blanket {
      opacity: 1;
    }
    svg {
      cursor: pointer;
      .a {
        fill: $orange;
      }
      .b {
        fill: #fff;
      }
      @media (min-width: $small-width-up) {
        &:hover {
          .a {
            fill: #fff;
          }
          .b {
            fill: $orange;
          }
        }
      }
    }
  }
  &.show-tip.highlite {
    svg {
      opacity: 0;
    }
  }
  .btn-wrapper.present {
    // Run the fancy animation that presents the leather guide
    svg {
      .lg-el {
        transform: translate(-15%, 0%);
        opacity: 0;
        animation: show-el 0.3s ease-out 0.3s forwards;
      }
      .lg-gee {
        transform: translate(15%, 0%);
        opacity: 0;
        animation: show-gee 0.3s ease-out 0.45s forwards;
      }
      .rects,
      .shield {
        opacity: 0;
        animation: fade-in 0.2s linear 0.85s forwards;
      }
    }
  }
}
@keyframes show-el {
  0% {
    opacity: 0;
    transform: translate(-15%, 0%);
  }
  100% {
    opacity: 1;
    transform: translate(0%, 0%);
  }
}
@keyframes show-gee {
  0% {
    opacity: 0;
    transform: translate(15%, 0%);
  }
  100% {
    opacity: 1;
    transform: translate(0%, 0%);
  }
}
@keyframes fade-in {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
</style>