<template>
  <edgex-landing v-if="configuratorMode == 'edgex-landing' && content.edgex.page" :content="content.edgex.page"
    :customize="clickEdgeX" />
  <div v-else class="glove-landingpage-template">
    <div class="scratch-section">
      <div v-if="!(content.video && (videoLoaded || content.hero))" class="page-title">
        <h1 v-html="content.title"></h1>
      </div>
      <div v-if="content.video" class="page-hero page-video">
        <h1 v-if="videoLoaded || content.hero" v-html="content.title" :class="{ hide: content.hero }"></h1>
        <BaseImage v-if="content.hero" :data="content.hero" @click="clickBlank" />
        <BaseVideo v-else-if="content.video" :data="content.video" @load="videoLoaded = true" @click="clickBlank"
          playsinline muted />
      </div>
      <!-- hero section -->
      <div class="section-wrapper">
        <!-- mobile -->
        <div class="dtt mobile">
          <div>
            <div class="dtt-1-blue">customize</div>
            <div>
              <img src="../../assets/EdgePrecision.svg" alt="Edge Precision" class="edgex-precision-logo">
              <div v-if="content.content" class="dts-content" v-html="content.content.scratch || content.content"></div>
            </div>
          </div>
          <div class="btn-icon-wrapper">
            <div :class="['start-buttons', { alone: !colorSection }]">
              <div role="button" tabindex="0" class="button blank" @click="clickBlank">customize</div>
              <div v-if="colorSection" class="button color">color play</div>
            </div>
            <div>
              <img src="../../assets/AnimalIcons.svg"
                alt="Animal Icons to show leather options. Cow, kangaroo, calf, alligator, and EdgeX"
                class="animal-icons">
            </div>
          </div>
        </div>
        <!-- desktop -->
        <div class="info-wrapper">
          <div class="info-grouper">
            <div class="dts desktop">
              <div class="dtt">
                <div class="dtt-1-blue">customize</div>
                <div class="edgex-precision-logo">
                  <img src="../../assets/EdgePrecision.svg" alt="Edge Precision">
                </div>
              </div>
              <div v-if="content.content" class="dts-content" v-html="content.content.scratch || content.content"></div>
              <div :class="['start-buttons', { alone: !colorSection }]">
                <div role="button" tabindex="0" class="button blank" @click="clickBlank">customize</div>
                <div v-if="colorSection" class="button color">color play</div>
              </div>
              <div>
                <img src="../../assets/AnimalIcons.svg" alt="Edge Precision">
              </div>
            </div>
          </div>
        </div>
      </div>
      <img src="../../assets/MadeInUSA.svg" alt="Nokona Made In USA" class="nokona-made-in-usa">
    </div>

    <!-- edgeX section -->
    <!-- desktop -->
    <div v-if="content.edgex && content.edgex.section" class="edgex-section">
      <!-- <BaseVideo :data="content.edgex.section.edgexDetail.videoDesktop" class="video desktop" autoplay muted
        playsinline />
      <BaseVideo :data="content.edgex.section.edgexDetail.videoMobile" class="video mobile" autoplay muted
        playsinline /> -->
      <video playsinline preload="auto" loop muted autoplay
        poster="https://nokona.com/show-imgs/startpage/showbat_landing_pastime_poster.webp" class="video">
        <source src="https://media.nokona.com/2025/11/EdgeX-KB-finalv2720P.mp4" media="(max-width <= 800px)">
        <source src="https://media.nokona.com/2025/11/EdgeX-KB-finalv2-1080P.mp4">
      </video>
      <div class="section-wrapper">
        <div class="info-wrapper">
          <div class="info-grouper">
            <div class="dts desktop">
              <div class="dtt">
                <div class="dtt-1-orange">customize</div>
                <div class="edgex-logo">
                  <img src="../../assets/EdgeX.svg" alt="EdgeX Logo" class="edgex-mobile-logo">
                </div>
              </div>
              <div v-if="content.edgex.section.content" class="dts-content" v-html="content.edgex.section.content">
              </div>
              <div class="two-buttons">
                <div role="button" tab-index="0" class="start-buttons alone">
                  <div class="button learn-more-btn blank" v-html="content.edgex.section.learnMore"></div>
                </div>
                <div role="button" tab-index="0" class="start-buttons alone">
                  <div class="button blank" @click="clickEdgeX()">customize</div>
                </div>
              </div>
              <div>
                <img src="../../assets/NokonaLogos.svg" alt="Various Nokona Logos" class="nokona-logos">
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- reviews -->
    <start-page-reviews :class="{ white: !colorSection }" v-if="content.reviews" :reviews="content.reviews" />
    <!-- Second Video -->
    <div class="videos-section">
      <video playsinline preload="auto" loop muted autoplay
        poster="https://nokona.com/show-imgs/startpage/showbat_landing_pastime_poster.webp" class="video">
        <source src="https://media.nokona.com/2025/11/Showgloves-alt-detail-720P.mp4?ver=4.6.33"
          media="(max-width <= 800px)">
        <source src="https://media.nokona.com/2025/11/Showgloves-alt-detail-1080P.mp4?ver=4.6.33">
      </video>
    </div>


    <div v-if="seriesSection" class="series-section">
      <div class="section-wrapper">
        <div class="dtt">
          <div class="dtt-1">design by</div>
          <div class="dtt-2">series</div>
        </div>
        <div v-if="content.series" class="dtt-content" v-html="content.content.series"></div>
      </div>
      <div class="section-content-wrapper">
        <div class="series-list fix-scrollbar" ref="seriesListEl">
          <div class="series-list-item-wrapper" v-for="series in seriesList" :key="series.id">
            <div :class="[
              'series-list-item',
              { selected: selectedSeries && series.id == selectedSeries.id },
            ]" @click="selectSeries(series)">
              <div class="thumbnail">
                <BaseImage :data="series.thumbnail" />
              </div>
              <div class="name">{{ series.name }}</div>
            </div>
          </div>
        </div>
        <div v-if="selectedSeries && selectedSeries.preview" class="series-preview">
          <template v-if="'filescheme' in (selectedSeries['preview'] as any)">
            <spin-image :data="(selectedSeries['preview'] as any)"></spin-image>
            <BaseImage :data="(selectedSeries['preview'] as any).filescheme.replace('$num$', '0')" />
            <div class="spin-indicator"></div>
          </template>
          <BaseImage v-else :data="selectedSeries.preview" />
        </div>
        <div class="start-buttons alone">
          <div class="button series" @click="clickSeriesPath">
            customize {{ selectedSeries ? selectedSeries.name : "" }}
          </div>
        </div>
        <div v-if="selectedSeries" class="series-stats">
          <div class="series-stats-wrapper">
            <div class="series-name">{{ selectedSeries.name }}</div>
            <!-- <div class="stats-list">
              <div class="series-stat">{{ seriesStats.patterns }}</div>
              <div class="series-stat">{{ seriesStats.webs }}</div>
              <div class="series-stat">{{ seriesStats.laces }}</div>
            </div> -->
            <div class="leather-icons">
              <div v-for="icon in seriesStats.icons" :key="icon['src'] || icon" class="leather-icon">
                <BaseImage :data="icon" />
              </div>
            </div>
            <div class="specs-wrapper">
              <leather-specs :breakin="seriesStats.breakin" :weight="seriesStats.weight" size="small"></leather-specs>
              <leather-specs :breakin="seriesStats.breakin" :weight="seriesStats.weight"></leather-specs>
            </div>
            <div class="start-buttons alone">
              <div class="button series" @click="clickSeriesPath">
                customize
                {{ "series" /*selectedSeries ? selectedSeries.name : ""*/ }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="content.info" class="info-section">
      <div class="info-section-wrapper">
        <div class="sides-wrapper">
          <div :class="[
            'content-side',
            'fix-scrollbar',
            { closed: closeSEOContent },
          ]">
            <div v-if="content.info.title" class="title" v-html="content.info.title"></div>
            <div v-if="content.info.content" class="content" v-html="content.info.content"></div>
            <div class="read-more" @click="closeSEOContent = false">
              read more
            </div>
          </div>
          <div v-if="content.info.images" class="carousel-side">
            <!-- <canvas class="carousel-display" ref="carouselCanvas"></canvas> -->
            <BaseImage :data="content.info.mainImage" />
            <!-- <BaseImage :class="[
            'next',
            {
              display: displayNextCarouselImg,
              animate: animateNextCarouselImg,
              },
              ]" :data="content.info.images[
              (carouselFrame + 1) % content.info.images.length
              ]
              " /> -->
          </div>
        </div>
      </div>
    </div>
    <div class="swatches-wrapper">
      <div v-if="content.info.swatches" class="info-section-swatches">
        <div class="swatch" v-for="img in content.info.swatches" :key="img.src || img">
          <BaseImage class="image-cover" :data="img" />
          <div class="sizer"></div>
        </div>
        <div v-for="i in content.info.swatches.length - 2" :key="i" class="swatch dummy"></div>
      </div>
    </div>
    <div class="design-yours-logo">
      <img src="../../assets/DesignYoursLogo.svg" alt="Various Nokona Logos" class="nokona-logos">
    </div>
  </div>
</template>

<script lang="ts">
import data from "@/data";
import { SeriesInfo } from "@/types";
import utils from "@/utils";
import { defineComponent, ref, Ref } from "vue";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
import LeatherSpecs from "../LeatherSpecs.vue";
import SpinImage from "../SpinImage.vue";
import StartPageReviews from "./StartPageReviews.vue";
import ColorPlay from "./ColorPlay.vue";
import EdgexLanding from "./EdgexLanding.vue";

import welcome from "@/assets/welcome-title.svg";

export default defineComponent({
  name: "GloveLanding",
  components: {
    LeatherSpecs,
    SpinImage,
    StartPageReviews,
    ColorPlay,
    EdgexLanding,
  },
  computed: {
    ...mapState(["objectIDMap", "currentProduct", "configuratorMode"]),
    ...mapGetters({
      seriesID: "getSeriesID",
      currentSeries: "getSeries",
      product: "getProduct",
      content: "getPreConfigData",
    }),
    colorSection(): boolean {
      if (this.product && this.product.modes) {
        return this.product.modes.includes("color");
      }
      return false;
    },
    seriesSection(): boolean {
      if (this.product && this.product.modes) {
        return Boolean(
          this.product.modes.includes("series") && this.product.series
        );
      }
      return false;
    },
    seriesList(): Array<SeriesInfo> {
      if (this.seriesSection && this.product!.series?.length) {
        return this.product!.series.map(
          (id: string) => this.objectIDMap[id]
        ).filter((o: SeriesInfo) => o);
      }
      return [];
    },
    seriesStats(): {
      patterns: string;
      webs: string;
      laces: string;
      weight?: number;
      breakin?: number;
      icons?: Array<ImageData | string>;
    } {
      if (
        this.selectedSeries &&
        this.fetchedSeriesStats[this.selectedSeries.id]
      ) {
        return this.fetchedSeriesStats[this.selectedSeries.id];
      }
      return {
        patterns: this.selectedSeries
          ? this.selectedSeries.models.length + " patterns"
          : "",
        webs: "0 webs",
        laces: "0 lace colors",
      };
    },
  },
  data() {
    return {
      spinData: {
        filescheme:
          "/show-imgs/series/american-kip/360-18/AmericanKIP_Gray$num$.jpg",
        count: 18,
      },
      closeSEOContent: true,
      welcome,
      videoLoaded: false,
    };
  },
  methods: {
    ...mapMutations([
      "setConfiguratorMode",
      "setCurrentSeries",
      "setConfiguratorPage",
    ]),
    ...mapActions(["fetchSeriesData"]),
    clickColorPlay() {
      this.setConfiguratorMode("color");
      this.setConfiguratorPage("colorplay");
    },
    clickBlank() {
      this.setConfiguratorMode("blank");
      this.setConfiguratorPage("patterns");
    },
    clickEdgeX() {
      this.setConfiguratorMode("edgex");
      this.setConfiguratorPage("patterns");
    },
    clickSeriesPath() {
      if (this.selectedSeries) {
        this.setConfiguratorMode("series");
        this.setCurrentSeries(this.selectedSeries.id);
        this.setConfiguratorPage("patterns");
      }
    },
    selectSeries(series: SeriesInfo) {
      this.selectedSeries = series;
      if (!(series.id in this.fetchedSeriesStats)) {
        // Grab the numbers for series options
        data.fetchSeriesStats(series.id).then((stats) => {
          this.fetchedSeriesStats[series.id] = stats;
        });
      }
    },
    setListScroll() {
      if (this.seriesListEl) {
        this.seriesListEl.scrollTo({ left: 100 });
        setTimeout(this.checkListInWindow, 500);
      }
    },
    checkListInWindow() {
      if (this.seriesListEl) {
        const rect = this.seriesListEl.getBoundingClientRect();
        if (window.innerHeight >= rect.bottom) {
          utils.smoothScroll({ left: 0, top: 0 }, 300, this.seriesListEl);
          window.removeEventListener("scroll", this.checkListInWindow);
        }
      }
    },
    runCarouselLoop() {
      if (this.runCarousel && this.content!.info?.images) {
        if (window.innerWidth > 600) {
          this.displayNextCarouselImg = true;
          requestAnimationFrame(() => {
            this.animateNextCarouselImg = true;
            setTimeout(() => {
              this.displayNextCarouselImg = false;
              this.animateNextCarouselImg = false;
              this.carouselFrame =
                (this.carouselFrame + 1) % this.content!.info.images.length;
            }, 300);
          });
        }
        setTimeout(this.runCarouselLoop, 2000);
      }
    },
  },
  setup() {
    const designSectionTitleStats: Ref<{
      combos: string;
      webs: string;
      web_icons: Array<string>;
      patterns: string;
      closures: string;
    } | null> = ref(null);
    const fetchedSeries: Ref<boolean> = ref(false);
    const selectedSeries: Ref<SeriesInfo | null> = ref(null);
    const seriesListEl: Ref<HTMLElement | null> = ref(null);
    const fetchedSeriesStats: Ref<any> = ref({});
    const carouselFrame: Ref<number> = ref(0);
    const runCarousel: Ref<boolean> = ref(false);
    const displayNextCarouselImg: Ref<boolean> = ref(false);
    const animateNextCarouselImg: Ref<boolean> = ref(false);
    const carouselCanvas: Ref<HTMLCanvasElement | null> = ref(null);
    const carouselCanvasResizeObserver: Ref<ResizeObserver | null> = ref(null);
    return {
      designSectionTitleStats,
      fetchedSeries,
      selectedSeries,
      seriesListEl,
      fetchedSeriesStats,
      carouselFrame,
      runCarousel,
      displayNextCarouselImg,
      animateNextCarouselImg,
      carouselCanvas,
      carouselCanvasResizeObserver,
    };
  },
  watch: {
    seriesSection(val) {
      if (val && !this.fetchedSeries) {
        this.fetchSeriesData();
        this.fetchedSeries = true;
      }
    },
    seriesList(val: Array<SeriesInfo>) {
      if (this.seriesSection && val[0] && !this.selectedSeries) {
        this.selectSeries(val[0]);
        this.setListScroll();
      }
    },
    runCarousel(val: boolean) {
      if (val) {
        this.runCarouselLoop();
      }
    },
  },
  mounted() {
    // Grab the numbers for scratch options
    // data.fetchScratchStats(this.currentProduct).then((stats) => {
    //   this.designSectionTitleStats = stats;
    // });
    requestAnimationFrame(() => {
      if (this.seriesSection && !this.fetchedSeries) {
        this.fetchSeriesData();
        this.fetchedSeries = true;
      }
    });
    const contentSetup = () => {
      // Grab the list of series if applicaable
      if (this.seriesList.length) {
        // If the list is already populated, stop this madness
        this.fetchedSeries = true;
        if (this.seriesSection && !this.selectedSeries) {
          // Set the first series to be 'selected'
          this.selectSeries(this.seriesList[0]);
          this.setListScroll();
        }
      } else {
        // try again in half a second
        setTimeout(contentSetup, 500);
      }
    };
    setTimeout(contentSetup, 500);
    // Watch the position of the list to present scrollness
    window.addEventListener("scroll", this.checkListInWindow);
    this.checkListInWindow();
    setTimeout(() => {
      // Let's run the carousel
      this.runCarousel = true;
    }, 2000);
    if (this.carouselCanvas) {
      this.carouselCanvasResizeObserver = new ResizeObserver(() => {
        if (this.carouselCanvas) {
          const rect = this.carouselCanvas.getBoundingClientRect();
          this.carouselCanvas.width = rect.width;
          this.carouselCanvas.height = rect.height;
        }
      });
    }
    requestAnimationFrame(() => {
      if (this.carouselCanvas && this.carouselCanvasResizeObserver) {
        const rect = this.carouselCanvas.getBoundingClientRect();
        this.carouselCanvas.width = rect.width;
        this.carouselCanvas.height = rect.height;
        this.carouselCanvasResizeObserver.observe(this.carouselCanvas);
      }
    });
  },
  beforeUnmount() {
    window.removeEventListener("scroll", this.checkListInWindow);
    this.runCarousel = false;
    if (this.carouselCanvasResizeObserver) {
      this.carouselCanvasResizeObserver.disconnect();
    }
  },
});
</script>

<style lang="scss" scoped>
.glove-landingpage-template {
  .page-title {
    color: #000;
    font: 0px/114.5577% $fnt-ev;
    letter-spacing: 0.053em;
    // padding: 30px 0 34px;
    position: relative;

    @media (max-width: 900px) {
      // padding: 4vw 0 4.533333vw;
      font-size: 0px;
    }

    .graphic-title {
      img {
        max-width: 100%;
        height: auto;
        display: block;
        margin-inline: auto;
      }
    }

    h1 {
      font-size: 0px;
      opacity: 0;
      position: absolute;
    }
  }

  .page-hero {
    h1.hide {
      opacity: 0;
    }

    img {
      max-width: 100%;
      margin: 0 auto;
    }
  }

  .page-video {
    margin: -50px -18px 50px;
    position: relative;

    h1 {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 12px;
    }

    video {
      position: relative;
      max-width: 100%;
      margin: 0 auto;
    }
  }

  .scratch-section,
  .series-section {
    height: 750px;
    position: relative;
    padding: 50px 18px;
    margin-bottom: 10px;

    @media (max-width: 900px) {
      padding: 18px 10px;
      display: flex;
      justify-content: center;
    }

    .section-wrapper {

      .dtt {
        text-transform: lowercase;
        font-size: 52px;

        .dtt-1 {
          color: $orange;
          font: 1em/100% $fnt-fh;
          padding: 0.6em 10px 0.4em;
        }

        .dtt-1-blue {
          color: $blue;
          font: 1.25em/100% $fnt-fh;
          padding: 0.6em 10px 0.4em;

          @media (max-width: 900px) {
            padding: 0.2em 10px;
            font-size: 0.6em;
          }
        }

        .dtt-2 {
          color: #000;
          font: 1em/100% $fnt-ev;
          letter-spacing: 0.053em;
          padding-bottom: 16px;
        }

        .dtt-2-logo {
          width: min(582px, 47.2vw);
          max-width: 100%;
          font-size: 0;
          background: no-repeat center/contain url(../../assets/EdgePrecision.svg);
          display: flex;
          margin: 0 auto;
          font-size: 0;
          padding-bottom: 16px;

        }

        .dts-content {
          color: #FFFFFF;
          max-width: 510px;
          font: 500 22px/131.25% $fnt-cm;
          text-transform: initial;
          text-wrap: pretty;

          @media (max-width: 900px) {
            font-size: 14px;
          }
        }

        &.mobile {
          display: none;


          @media (max-width: 900px) {
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
          }
        }

        &.desktop {
          display: block;

          @media (max-width: 900px) {
            display: none;
          }
        }

        .edgex-precision-logo {
          padding-bottom: 25px;

          @media (max-width: 900px) {
            width: 150px;
            padding-bottom: 10px;
          }
        }

        .animal-icons {
          @media (max-width: 900px) {
            width: 165px;
          }
        }

        .btn-icon-wrapper {

          @media (max-width: 900px) {
            margin-bottom: 25px;
          }
        }
      }

      .info-wrapper {
        max-width: 1440px;
        margin: 0 auto;
      }
    }

    .nokona-made-in-usa {
      position: absolute;
      bottom: -52px;
      z-index: 1;

      @media (max-width: 900px) {
        bottom: -41px;
        width: 70px;
      }

    }

    .info-grouper {
      .section-image {
        max-height: 475px;

        img {
          max-height: 475px;
          max-width: 100%;
        }
      }

      @media (min-width: $medium-width-up) {
        display: flex;
        justify-content: space-between;
        margin-left: min(125px, 2.5vw);
      }
    }

    .dts {
      font: 300 13px/120% $fnt-ev;
      color: #FFFFFF;
      padding: 5px;
      // text-transform: uppercase;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;

      @media (max-width: $small-width) {
        padding-bottom: 28px;
      }

      @media (min-width: $medium-width-up) {
        min-width: 320px;
      }

      .dts-item {
        margin-bottom: 5px;
        padding-left: 9px;
        position: relative;

        &::before {
          content: "•";
          color: #000;
          display: inline-block;
          margin-right: 0.3em;
          font-size: 1.2em;
          line-height: 100%;
        }
      }

      .dts-content {
        max-width: 510px;
        font: 500 22px/131.25% $fnt-cm;
        // text-transform: initial;
        text-wrap: pretty;
      }

      .web-icons {
        display: flex;
        align-items: center;
        justify-content: center;

        .web-icon {
          max-width: 41px;
          margin: 10px 6px 18px;

          img {
            max-width: 100%;
          }
        }
      }

      &.mobile {
        display: none;

        @media (max-width: 900px) {
          display: block;
        }
      }

      &.desktop {
        display: block;

        @media (max-width: 900px) {
          display: none;
        }
      }
    }

    .section-image {
      img {
        max-width: 100%;
      }
    }

    .start-buttons {
      display: flex;
      justify-content: center;
      padding: 28px 14px 10px;
      width: 100%;
      box-sizing: border-box;

      @media (min-width: 900px) {
        padding: 40px 0 28px;
      }

      &.alone .button {
        flex-grow: 0;
        min-width: 155px;
      }
    }

    .button {
      flex: 1 1;
      background-color: $blue;
      border-radius: 28px;
      padding: 1.2em 10px 1.1em;
      color: #fff;
      text-transform: uppercase;
      box-sizing: border-box;
      font: 14px/117.64285% $fnt-ev;
      letter-spacing: 0.053em;
      max-width: 210px;
      cursor: pointer;

      &:not(:last-child) {
        margin-right: 0.8em;
      }

      @media (min-width: $small-width-up) {
        transition: color 0.2s linear;
      }

      @media (max-width: 360px) {
        font-size: 11px;
      }

      // &.blank {
      //   background: #000 url("../../assets/blank-gradient.svg") no-repeat 100% 100%/27px;
      // }

      &.color {
        background: #000 url("../../assets/color-gradient.svg") no-repeat 100% 100%/27px;
      }

      &.series {
        background: #000 url("../../assets/series-gradient.svg") no-repeat 100% 100%/27px;
      }
    }
  }

  .scratch-section {
    height: 750px;
    background: #fff url("https://media.nokona.com/2025/11/Precision-Edge-Field-Gif.gif") no-repeat left 65%/cover;

    @media (max-width: 900px) {
      background-position: 67% 65%;
    }

  }

  .series-section {
    padding-bottom: 82px;

    .dtt {
      @media (min-width: $medium-width-up) {
        padding-top: 30px;
        display: flex;
        justify-content: center;
        margin-bottom: 6px;

        .dtt-1.dtt-1 {
          padding: 0 0.3em 0 0;
        }
      }
    }

    .dtt-content {
      padding-bottom: 32px;
      max-width: 545px;
      margin: 0 auto;
      font: 500 14px/150% $fnt-cm;
    }

    .section-content-wrapper {
      @media (min-width: 900px) {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;

        .series-list,
        .series-stats {
          width: 31.7%;
          flex-shrink: 0;
        }

        .series-list {
          padding-top: 16px;
          margin: 0;
          overflow: initial;
          border: none;
          flex-wrap: wrap;

          .series-list-item-wrapper.series-list-item-wrapper {
            padding: 0;
            width: 33%;

            .series-list-item {
              width: 100%;
              max-width: 90px;
              margin: 0 auto;
              box-sizing: border-box;

              &::before {
                border: 1px solid $orange;
                width: calc(100% - 2px);
                height: calc(100% - 2px);
                top: 0;
                left: 0;
                transform: initial;
                opacity: 0;
                transition: opacity 0.1s linear;
              }

              &.selected {
                z-index: 12;

                &::before {
                  opacity: 1;
                  transition: opacity 0.1s linear 0.1s;
                }

                .name {
                  color: #000;
                }
              }

              .name {
                font-weight: 600;
              }
            }
          }
        }

        .series-preview {
          max-width: 36.6%;
        }

        .series-stats {
          .start-buttons {
            display: flex;
            padding-top: 0;
            justify-content: flex-start;
          }
        }

        .series-list,
        .series-stats {
          max-width: 320px;
        }
      }

      @media (min-width: 1300px) {
        justify-content: center;
      }
    }

    .series-list {
      display: flex;
      border-top: 1px solid $orange;
      margin: 20px -18px 0;
      overflow: auto;
      -webkit-overflow-scrolling: touch;

      .series-list-item-wrapper {
        &:first-child {
          padding-left: 24px;
        }

        &:last-child {
          padding-right: 24px;
        }

        .series-list-item {
          width: 78px;
          padding: 18px 6px 8px;
          cursor: pointer;
          user-select: none;
          flex-shrink: 0;
          position: relative;

          .thumbnail {
            width: 100%;

            img {
              max-width: 100%;
            }
          }

          .name {
            font: 10px/120% $fnt-cm;
            color: #000;
            letter-spacing: 0.03em;
            text-transform: uppercase;
            transition: color 0.2s linear;
          }

          &::before {
            content: "";
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%) scaleY(0);
            transform-origin: top;
            border-style: solid;
            border-width: 10px 8px 0 8px;
            border-color: #ff6b00 transparent transparent transparent;
            transition: transform 0.2s ease;
          }

          &.selected {
            .name {
              color: $orange;
              font-weight: 700;
            }

            &::before {
              transform: translateX(-50%) scaleY(1);
            }
          }

          @media (min-width: $small-width-up) {
            &:hover .name {
              color: $orange;
            }
          }
        }
      }
    }

    .series-preview {
      position: relative;
      display: inline-block;

      img {
        max-width: 100%;
        display: block;
      }

      .spin-image {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
      }

      .spin-indicator {
        width: 150px;
        height: 15px;
        background: url(../../assets/rotation-tip.svg) no-repeat center/contain;
        position: absolute;
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
      }
    }

    .start-buttons {
      @media (min-width: $medium-width-up) {
        display: none;
      }
    }

    .series-stats {
      padding-top: 35px;
      padding-left: 32px;
      box-sizing: border-box;
      display: flex;
      align-items: flex-start;

      .series-stats-wrapper {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
      }

      .series-name {
        font: 24px/120% $fnt-ev;
        letter-spacing: 0.073em;
        text-transform: uppercase;
        text-align: left;
      }

      .stats-list {
        padding: 10px 0;
        font: 300 13px/120% $fnt-ev;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        display: flex;
        flex-direction: column;
        align-items: center;

        .series-stat {
          margin-bottom: 5px;
          padding-left: 9px;
          position: relative;

          &::before {
            content: "•";
            color: #000;
            display: inline-block;
            margin-right: 0.3em;
            font-size: 1.2em;
            line-height: 100%;
          }
        }

        @media (min-width: $medium-width-up) {
          align-items: flex-start;
          text-align: left;

          .series-stat {
            padding-left: 0px;
          }
        }
      }

      .leather-icons {
        .leather-icon {
          padding: 10px 4px;

          img {
            width: 200px;
          }
        }
      }

      .specs-wrapper {
        .specs.normal {
          display: none;
        }
      }

      @media (min-width: $small-width-up) and (max-width: $medium-width) {
        .specs-wrapper {
          .specs.normal {
            display: block;
          }

          .specs.small {
            display: none;
          }
        }
      }

      @media (min-width: $medium-width-up) {
        align-items: flex-start;
      }

      .start-buttons {
        @media (max-width: $medium-width) {
          display: none;
        }
      }
    }
  }

  .design-yours-logo {
    padding: 50px 0px 80px;

    @media (max-width: $medium-width) {
      img {
        width: 200px;
      }
    }

  }


}



.edgex-section {

  height: 750px;
  position: relative;

  @media (max-width: 900px) {
    display: flex;
    justify-content: center;
  }

  .section-wrapper {
    height: 750px;
    width: 100%;
    position: absolute;
    top: 0;

    .info-wrapper {
      max-width: 1440px;
      margin: 0 auto;
      padding: 50px 0px;

      @media (max-width: 900px) {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0px;
        height: 100%;
      }

    }

    .dtt {
      text-transform: lowercase;
      font-size: 52px;

      .dtt-1 {
        color: $orange;
        font: 1em/100% $fnt-fh;
        padding: 0.6em 10px 0.4em;
      }

      .dtt-1-orange {
        color: $orange;
        font: 1.25em/100% $fnt-fh;
        padding: 0.6em 10px 0.4em;

        @media (max-width: 900px) {
          padding: 0.2em 10px;
          font-size: 0.6em;
        }
      }

      .dtt-2 {
        color: #000;
        font: 1em/100% $fnt-ev;
        letter-spacing: 0.053em;
        padding-bottom: 16px;
      }

      .dtt-2-logo {
        width: min(582px, 47.2vw);
        max-width: 100%;
        font-size: 0;
        background: no-repeat center/contain url(../../assets/EdgePrecision.svg);
        display: flex;
        margin: 0 auto;
        font-size: 0;
        padding-bottom: 16px;

      }

      .dts-content {
        color: #FFFFFF;
        max-width: 510px;
        font: 500 22px/131.25% $fnt-cm;
        text-transform: initial;
        text-wrap: pretty;

        @media (max-width: 900px) {
          font-size: 14px;
        }
      }

      &.mobile {
        display: none;


        @media (max-width: 900px) {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
        }
      }

      &.desktop {
        display: flex;

        @media (max-width: 900px) {
          display: none;
        }
      }

      .edgex-logo {
        padding-bottom: 25px;

        @media (max-width: 900px) {
          padding-bottom: 10px;
        }

        .edgex-mobile-logo {
          @media (max-width: 900px) {
            width: 225px;
          }
        }
      }

      .btn-icon-wrapper {

        @media (max-width: 900px) {
          margin-bottom: 25px;
        }
      }
    }


  }

  .nokona-made-in-usa {
    position: absolute;
    bottom: -52px;
    z-index: 1;

    @media (max-width: 900px) {
      bottom: -41px;
      width: 70px;
    }

  }

  .info-grouper {
    display: flex;
    justify-content: center;
    align-items: center;

    .section-image {
      max-height: 475px;


      img {
        max-height: 475px;
        max-width: 100%;
      }
    }

    @media (min-width: 901px) {
      display: flex;
      flex-direction: row-reverse;
      justify-content: space-between;
      margin-right: min(125px, 2.5vw);
    }
  }

  .dts {
    font: 300 13px/120% $fnt-ev;
    color: #FFFFFF;
    padding: 5px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;

    @media (max-width: 900px) {
      padding: 10px;
    }

    @media (min-width: $medium-width-up) {
      min-width: 320px;
    }

    .dts-item {
      margin-bottom: 5px;
      padding-left: 9px;
      position: relative;

      &::before {
        content: "•";
        color: #000;
        display: inline-block;
        margin-right: 0.3em;
        font-size: 1.2em;
        line-height: 100%;
      }
    }

    .dts-content {
      max-width: 510px;
      font: 500 22px/131.25% $fnt-cm;
      // text-transform: initial;
      text-wrap: pretty;

      @media (max-width: 900px) {
        font-size: 14px;
      }

    }

    .web-icons {
      display: flex;
      align-items: center;
      justify-content: center;

      .web-icon {
        max-width: 41px;
        margin: 10px 6px 18px;

        img {
          max-width: 100%;
        }
      }
    }


    &.desktop {
      display: flex;
    }

    .two-buttons {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;

      @media (max-width: 900px) {
        gap: 0px;
      }
    }

    .nokona-logos {
      @media (max-width: 900px) {
        width: 238px;
      }
    }
  }

  .section-image {
    img {
      max-width: 100%;
    }
  }

  .start-buttons {
    display: flex;
    justify-content: center;
    padding: 28px 5px 10px;
    width: 100%;
    box-sizing: border-box;

    @media (min-width: 900px) {
      padding: 40px 0 28px;
    }

    &.alone .button {
      flex-grow: 0;
      min-width: 155px;
    }
  }

  .button.button {
    flex: 1 1;
    background-color: $orange;
    border-radius: 28px;
    padding: 1.2em 10px 1.1em;
    color: #fff;
    text-transform: uppercase;
    box-sizing: border-box;
    font: 14px/117.64285% $fnt-ev;
    letter-spacing: 0.053em;
    max-width: 210px;
    cursor: pointer;

    &.learn-more-btn {
      background-color: #FFFFFF;
      color: #000;

    }

    a {
      text-decoration: none;
      color: #000
    }
  }


  .section-image {
    align-self: center;

    img {
      display: block;
      max-width: min(500px, 100%);
      width: auto;
    }
  }

  .video {
    height: 100%;
    width: 100%;
    object-fit: cover;
    filter: brightness(0.5);

    &.mobile {
      display: none;


      @media (max-width: 900px) {
        display: block;
      }

    }

    &.desktop {
      display: block;

      @media (max-width: 900px) {
        display: none;
      }
    }
  }
}

.videos-section {
  height: 750px;
  position: relative;


  .video {
    height: 100%;
    width: 100%;
    object-fit: cover;

    &.mobile {
      display: none;


      @media (max-width: 900px) {
        display: block;
      }

    }

    &.desktop {
      display: block;

      @media (max-width: 900px) {
        display: none;
      }
    }
  }

}
</style>
<style lang="scss">
.glove-landingpage-template {
  .review-section.white {
    background-color: #fff;

    .review-wrapper::after {
      background-image: linear-gradient(#ffffff00, #fff);
    }
  }

  .specs .break-in-spec[data-v-5741da1f] {
    padding: 28px 0px 2px;
  }

  .specs .weight-spec[data-v-5741da1f] {
    padding: 2px 0px 28px;
  }

  .info-section {
    background-color: #f1f2f2;
    color: #000;
    text-align: left;
    font-size: 14px;

    .title {
      font: 700 clamp(1rem, 0.856rem + 0.577vw, 1.375rem)/127% $fnt-cm;
      letter-spacing: 0.03em;
      margin-bottom: 1em;
      text-align: center;
      text-wrap: pretty;
    }

    p {
      margin-bottom: 1em;
    }

    ul {
      list-style-type: none;

      li {
        font-size: 0.8571em;
        margin-bottom: 1em;

        &::before {
          content: "";
          display: inline-block;
          margin-right: 0.3em;
          font-size: 1.2em;
          line-height: 100%;
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background-color: #000;
          margin-bottom: 0.2em;
        }
      }
    }

    .info-section-wrapper {
      padding: 64px 80px 42px;
      max-width: 1200px;
      margin: 0 auto;
      box-sizing: border-box;

      @media (max-width: 1200px) {
        padding-left: 15.755463%;
        padding-right: 15.755463%;
      }
    }

    .sides-wrapper {
      padding-top: 50%;
      position: relative;

      @media (max-width: $small-width) {
        padding-top: 0;
      }

      &::before,
      &::after {
        position: absolute;
        content: "";
        left: 0;
        right: calc(50% + 10px);
        z-index: 3;

        @media (max-width: $small-width) {
          display: none;
        }
      }

      &::before {
        background-image: linear-gradient(to bottom,
            hsl(0, 0%, 100%) 0%,
            hsla(0, 0%, 100%, 0.994) 16.6%,
            hsla(0, 0%, 100%, 0.975) 30.5%,
            hsla(0, 0%, 100%, 0.945) 42%,
            hsla(0, 0%, 100%, 0.904) 51.4%,
            hsla(0, 0%, 100%, 0.854) 59%,
            hsla(0, 0%, 100%, 0.795) 65.2%,
            hsla(0, 0%, 100%, 0.728) 70%,
            hsla(0, 0%, 100%, 0.653) 74%,
            hsla(0, 0%, 100%, 0.572) 77.3%,
            hsla(0, 0%, 100%, 0.486) 80.3%,
            hsla(0, 0%, 100%, 0.395) 83.2%,
            hsla(0, 0%, 100%, 0.3) 86.3%,
            hsla(0, 0%, 100%, 0.202) 90%,
            hsla(0, 0%, 100%, 0.102) 94.4%,
            hsla(0, 0%, 100%, 0) 100%);
        top: 0;
        height: 90px;
      }

      &::after {
        background-image: linear-gradient(to top,
            hsl(0, 0%, 100%) 0%,
            hsla(0, 0%, 100%, 0.994) 16.6%,
            hsla(0, 0%, 100%, 0.975) 30.5%,
            hsla(0, 0%, 100%, 0.945) 42%,
            hsla(0, 0%, 100%, 0.904) 51.4%,
            hsla(0, 0%, 100%, 0.854) 59%,
            hsla(0, 0%, 100%, 0.795) 65.2%,
            hsla(0, 0%, 100%, 0.728) 70%,
            hsla(0, 0%, 100%, 0.653) 74%,
            hsla(0, 0%, 100%, 0.572) 77.3%,
            hsla(0, 0%, 100%, 0.486) 80.3%,
            hsla(0, 0%, 100%, 0.395) 83.2%,
            hsla(0, 0%, 100%, 0.3) 86.3%,
            hsla(0, 0%, 100%, 0.202) 90%,
            hsla(0, 0%, 100%, 0.102) 94.4%,
            hsla(0, 0%, 100%, 0) 100%);
        bottom: 0;
        height: 75px;
      }
    }

    .content-side,
    .carousel-side {
      position: absolute;
      width: 50%;
      height: 100%;
      top: 0;

      @media (max-width: $small-width) {
        top: initial;
        left: 0;
        width: 100%;
        height: unset;
        position: relative;
      }

      img {
        @media (max-width: $small-width) {
          object-fit: cover;
        }
      }
    }

    .content-side {
      background-color: #fff;
      left: 0;
      overflow: auto;
      padding: 90px 40px;
      box-sizing: border-box;

      .read-more {
        display: none;
      }

      @media (max-width: $small-width) {
        left: initial;
        top: 0;
        padding: 35px 40px;
        max-height: 2000px;
        transition: max-height 0.4s ease;

        &::after {
          position: absolute;
          content: "";
          left: 0;
          width: 100%;
          z-index: 3;
          background-image: linear-gradient(to top,
              hsl(0, 0%, 100%) 0%,
              hsla(0, 0%, 100%, 0.994) 16.6%,
              hsla(0, 0%, 100%, 0.975) 30.5%,
              hsla(0, 0%, 100%, 0.945) 42%,
              hsla(0, 0%, 100%, 0.904) 51.4%,
              hsla(0, 0%, 100%, 0.854) 59%,
              hsla(0, 0%, 100%, 0.795) 65.2%,
              hsla(0, 0%, 100%, 0.728) 70%,
              hsla(0, 0%, 100%, 0.653) 74%,
              hsla(0, 0%, 100%, 0.572) 77.3%,
              hsla(0, 0%, 100%, 0.486) 80.3%,
              hsla(0, 0%, 100%, 0.395) 83.2%,
              hsla(0, 0%, 100%, 0.3) 86.3%,
              hsla(0, 0%, 100%, 0.202) 90%,
              hsla(0, 0%, 100%, 0.102) 94.4%,
              hsla(0, 0%, 100%, 0) 100%);
          bottom: 0;
          height: 0;
          transition: height 0.2s ease;
        }

        .read-more {
          display: block;
          transition: opacity 0.2s linear;
          position: absolute;
          bottom: 12px;
          left: 50%;
          transform: translateX(-50%);
          opacity: 0;
          z-index: 4;
          text-transform: uppercase;
        }

        &.closed {
          max-height: 350px;
          overflow: hidden;

          &::after {
            height: 55px;
          }

          .read-more {
            opacity: 1;
          }
        }
      }
    }

    .carousel-side {
      left: 50%;
      overflow: hidden;

      @media (max-width: $small-width) {
        left: unset;

      }

      img {
        width: 100%;
        height: 100%;

        &.next {
          display: none;
          opacity: 0;
          position: absolute;
          top: 0;
          left: 0;
          transform: translateX(32px);

          &.display {
            display: block;
          }

          &.animate {
            animation: bring-in 0.3s ease-out forwards;
          }
        }
      }
    }

    .carousel-display {
      width: 100%;
      height: 100%;
    }

  }
}

.swatches-wrapper {
  background-color: #f1f2f2;
  width: 100%;

  .info-section-swatches {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    padding: 20px 10px;
    max-width: 1200px;
    box-sizing: border-box;
    margin: 0 auto;

    .swatch {
      position: relative;
      margin-bottom: 6px;

      @media (min-width: $medium-width-up) {
        width: 8.1562%;

        &.dummy {
          display: none;
        }
      }

      &.dummy {
        margin-bottom: 0;
      }

      @media (max-width: $medium-width) {
        width: 68px;
        margin-bottom: 0px;
      }

      img {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }

      .sizer {
        padding-top: 100%;
      }
    }

    @media (max-width: $medium-width) {
      justify-content: center;
      gap: 10px
    }
  }

  @keyframes bring-in {
    0% {
      transform: translateX(32px);
      opacity: 0;
    }

    100% {
      transform: translateX(0);
      opacity: 1;
    }
  }
}
</style>
