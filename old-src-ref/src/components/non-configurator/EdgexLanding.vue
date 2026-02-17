<template>
  <div v-if="content" class="edgex-landingpage-template">
    <div class="page-title">
      <h1 v-html="content.title"></h1>
      <div v-if="content.logo" class="landing-logo">
        <BaseImage :data="content.logo" />
      </div>
    </div>
    <div v-if="content.image" class="section scratch-section">
      <BaseImage :data="content.image" />
      <div class="button" @click="clickCustomize">customize</div>
    </div>
    <div class="section edgex-main-content" v-html="content.content"></div>
    <div v-if="content.triad" class="section edgex-triad-wrap">
      <div class="triad" v-for="t in content.triad" :key="t.head">
        <h2>{{ t.head }}</h2>
        <p>{{ t.body }}</p>
      </div>
    </div>
    <div v-if="content.video" class="section edgex-video">
      <iframe
        :src="content.video"
        frameborder="0"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
    </div>
    <div
      v-if="content.gallery && content.gallery.length"
      class="section edgex-gallery"
    >
      <BaseImage v-for="img in content.gallery" :key="img" :data="img" />
    </div>
    <div v-if="content.info" class="section info-section">
      <div class="info-section-wrapper">
        <div class="sides-wrapper">
          <div
            :class="[
              'content-side',
              'fix-scrollbar',
              { closed: closeSEOContent },
            ]"
          >
            <div
              v-if="content.info.title"
              class="title"
              v-html="content.info.title"
            ></div>
            <div
              v-if="content.info.content"
              class="content"
              v-html="content.info.content"
            ></div>
            <div class="read-more" @click="closeSEOContent = false">
              read more
            </div>
          </div>
          <div v-if="content.info.images" class="carousel-side">
            <BaseImage :data="content.info.images[carouselFrame]" />
            <BaseImage
              :class="[
                'next',
                {
                  display: displayNextCarouselImg,
                  animate: animateNextCarouselImg,
                },
              ]"
              :data="
                content.info.images[
                  (carouselFrame + 1) % content.info.images.length
                ]
              "
            />
          </div>
        </div>
        <div v-if="content.info.swatches" class="info-section-swatches">
          <div
            class="swatch"
            v-for="img in content.info.swatches"
            :key="img.src || img"
          >
            <BaseImage class="image-cover" :data="img" />
            <div class="sizer"></div>
          </div>
          <div
            v-for="i in content.info.swatches.length - 2"
            :key="i"
            class="swatch dummy"
          ></div>
        </div>
      </div>
    </div>
    <start-page-reviews v-if="content.reviews" :reviews="content.reviews" />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import StartPageReviews from "./StartPageReviews.vue";

export default defineComponent({
  name: "EdgexLanding",
  components: {
    StartPageReviews,
  },
  props: {
    content: Object,
    customize: Function,
  },
  data() {
    return {
      closeSEOContent: true,
    };
  },
  methods: {
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
    clickCustomize() {
      if (this.customize) {
        this.customize();
        history.replaceState({}, location.pathname, "/showgloves/");
      }
    },
  },
  setup() {
    const carouselFrame: Ref<number> = ref(0);
    const runCarousel: Ref<boolean> = ref(false);
    const displayNextCarouselImg: Ref<boolean> = ref(false);
    const animateNextCarouselImg: Ref<boolean> = ref(false);
    return {
      carouselFrame,
      runCarousel,
      displayNextCarouselImg,
      animateNextCarouselImg,
    };
  },
  watch: {
    runCarousel(val: boolean) {
      if (val) {
        this.runCarouselLoop();
      }
    },
  },
  mounted() {
    setTimeout(() => {
      // Let's run the carousel
      this.runCarousel = true;
    }, 2000);
    // Tweak the document name to be unique from the normal glove landing page
    document.title = document.title + " - EdgeX";
  },
  beforeUnmount() {
    document.title = document.title.replace(" - EdgeX", "");
  },
});
</script>

<style lang="scss" scoped>
$grey: #818181;
.edgex-landingpage-template {
  background-color: #000;
  color: #fff;
  .page-title {
    background-color: #000;
    color: #000;
    font: 24px/114.5577% $fnt-ev;
    letter-spacing: 0.053em;
    padding: min(90px, 12vw) 0 min(50px, 7vw);
    position: relative;
    @media (max-width: $medium-width) {
      padding: max(4vw, 20px) 10px max(4.533333vw, 16px);
      font-size: 3.2vw;
    }
    h1 {
      color: #000;
      position: absolute;
      top: 0;
      left: 0;
    }
    .landing-logo {
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      img {
        width: 704px;
        max-width: calc(100% - 20px);
      }
    }
  }
}
.scratch-section {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 2px 0 50px;
  img {
    position: relative;
    width: 844px;
    height: auto;
    max-width: calc(100% - 20px);
    display: block;
  }
  .button {
    position: absolute;
    top: 38%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
}

.button {
  background-color: #000;
  padding: 1em 1.7em 0.9em;
  color: #fff;
  border: 1px solid #fff;
  text-transform: uppercase;
  box-sizing: border-box;
  font: 27px/117.64285% $fnt-ev;
  letter-spacing: 0.053em;
  cursor: pointer;
  &:not(:last-child) {
    margin-right: 0.8em;
  }
  @media (max-width: $small-width) {
    font-size: 21px;
  }
  @media (min-width: $small-width-up) {
    transition: color 0.2s linear;
    &:hover {
      color: $orange;
    }
  }
  @media (max-width: $xsmall-width) {
    font-size: 16px;
  }
  &.blank {
    background: #000 url("../../assets/blank-gradient.svg") no-repeat 100% 100%/27px;
  }
  &.color {
    background: #000 url("../../assets/color-gradient.svg") no-repeat 100% 100%/27px;
  }
  &.series {
    background: #000 url("../../assets/series-gradient.svg") no-repeat 100% 100%/27px;
  }
}

.edgex-main-content {
  color: $grey;
  font: 28px/132.142% $fnt-cm;
  max-width: 780px;
  padding: 0 18px min(75px, 10vw);
  margin: 0 auto;
  @media (max-width: $small-width) {
    font-size: 21px;
  }
  ::v-deep {
    p {
      margin: 0 0 1.5em;
      &:last-child {
        margin-bottom: 0;
      }
    }
  }
}

.edgex-triad-wrap {
  display: flex;
  gap: 26px;
  max-width: 908px;
  padding: 0 18px;
  margin: 0 auto min(75px, 10vw);
  text-align: left;
  @media (max-width: 500px) {
    flex-direction: column;
  }
  .triad {
    flex: 1;
    font-size: 16px;
    @media (max-width: $small-width) {
      font-size: 14px;
    }
  }
  h2 {
    color: $grey;
    font: 700 1em/140% $fnt-ev;
    letter-spacing: 0.09em;
    margin-bottom: 1em;
  }
  p {
    font: 1em/120% $fnt-cm;
  }
}

.edgex-video {
  max-width: 908px;
  width: 100%;
  padding-bottom: 40px;
  margin: 0 auto;
  iframe {
    width: 100%;
    aspect-ratio: 16/9;
  }
}

.edgex-gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 26px;
  max-width: 908px;
  padding: 0 18px;
  margin: 0 auto min(75px, 10vw);
  @media (max-width: 500px) {
    gap: 2vw;
  }
  img {
    display: block;
    width: calc(33.333333% - 17.5px);
    @media (max-width: 500px) {
      width: calc(50% - 1vw);
    }
  }
}

.info-section {
  text-align: left;
  font-size: 14px;
  .title {
    font: 700 22px/127% $fnt-cm;
    letter-spacing: 0.03em;
    margin-bottom: 1em;
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
      padding-left: 9.755463%;
      padding-right: 9.755463%;
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
      background-image: linear-gradient(
        to bottom,
        hsl(0, 0%, 0%) 0%,
        hsla(0, 0%, 0%, 0.994) 16.6%,
        hsla(0, 0%, 0%, 0.975) 30.5%,
        hsla(0, 0%, 0%, 0.945) 42%,
        hsla(0, 0%, 0%, 0.904) 51.4%,
        hsla(0, 0%, 0%, 0.854) 59%,
        hsla(0, 0%, 0%, 0.795) 65.2%,
        hsla(0, 0%, 0%, 0.728) 70%,
        hsla(0, 0%, 0%, 0.653) 74%,
        hsla(0, 0%, 0%, 0.572) 77.3%,
        hsla(0, 0%, 0%, 0.486) 80.3%,
        hsla(0, 0%, 0%, 0.395) 83.2%,
        hsla(0, 0%, 0%, 0.3) 86.3%,
        hsla(0, 0%, 0%, 0.202) 90%,
        hsla(0, 0%, 0%, 0.102) 94.4%,
        hsla(0, 0%, 0%, 0) 100%
      );
      top: 0;
      height: 90px;
    }
    &::after {
      background-image: linear-gradient(
        to top,
        hsl(0, 0%, 0%) 0%,
        hsla(0, 0%, 0%, 0.994) 16.6%,
        hsla(0, 0%, 0%, 0.975) 30.5%,
        hsla(0, 0%, 0%, 0.945) 42%,
        hsla(0, 0%, 0%, 0.904) 51.4%,
        hsla(0, 0%, 0%, 0.854) 59%,
        hsla(0, 0%, 0%, 0.795) 65.2%,
        hsla(0, 0%, 0%, 0.728) 70%,
        hsla(0, 0%, 0%, 0.653) 74%,
        hsla(0, 0%, 0%, 0.572) 77.3%,
        hsla(0, 0%, 0%, 0.486) 80.3%,
        hsla(0, 0%, 0%, 0.395) 83.2%,
        hsla(0, 0%, 0%, 0.3) 86.3%,
        hsla(0, 0%, 0%, 0.202) 90%,
        hsla(0, 0%, 0%, 0.102) 94.4%,
        hsla(0, 0%, 0%, 0) 100%
      );
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
      position: relative;
    }
  }
  .content-side {
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
        background-image: linear-gradient(
          to top,
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
          hsla(0, 0%, 100%, 0) 100%
        );
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
      display: none;
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
  .info-section-swatches {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    padding: 40px 0;
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
  }
}

.review-section {
  background-color: #000;
  ::v-deep {
    .review-wrapper::after {
      background-image: linear-gradient(rgba(255, 255, 255, 0), #000);
    }
    .arrow::before,
    .arrow::after {
      background-color: #fff;
    }
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
</style>
