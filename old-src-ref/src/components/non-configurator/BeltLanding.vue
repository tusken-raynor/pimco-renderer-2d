<template>
  <div class="belt-landingpage-template">
    <h1>Nokona Showbelts, The I In Team</h1>
    <!-- Desktop Layout - Hero -->
    <div class="hero desktop">
      <BaseImage :data="content.hero.background" class="background-desktop" />
      <div class="logo-image-btn-wrapper">
        <h2 class="show-logo">Nokona Showbelts, The I In Team</h2>
        <div>
          <BaseImage :data="content.hero.image" class="animation" alt="Animated Selection of Pro Showbelts" />
          <div role="button" tabindex="0" class="customize-btn" @click="clickBlank"> Design Yours</div>
        </div>
      </div>
    </div>
    <!-- Mobile Layout - Hero -->
    <div class="hero mobile">
      <div class="logo-wrapper-mobile">
        <h2 class="show-logo">Nokona Showbelts, The I In Team</h2>
      </div>
      <BaseImage :data="content.hero.background.mobile_image" class="background-mobile" />
      <div class="logo-image-btn-wrapper hero-mobile">
        <BaseImage :data="content.hero.image" class="animation" alt="Animated Selection of Pro Showbelts" />
        <div role="button" tabindex="0" class="customize-btn" @click="clickBlank">Design Yours</div>
      </div>
    </div>

    <TeamBelts :split="content.teams.split" :hero="content.teams.hero" :herocheat="content.teams.herocheat" />
    <start-page-reviews v-if="content.reviews" :reviews="content.reviews" />
    <div class="video-block">
      <BaseVideo :data="content.seenOnTheField.video" class="video" muted playsinline />
      <div class="logo-container">
        <div>
          <img src="../../assets/seen-us-on-the-field.svg" alt="">
        </div>
      </div>
    </div>
    <div v-if="content.probelts" class="pro-belt-templates">
      <a v-for="belt in content.probelts.probelts" :key="belt.id" :href="shareUrl(belt.id)" class="pro-belt-design">
        <BaseImage :src="shareImage(belt.id)" :alt="`${belt.city} Pro Belt`" />
      </a>
    </div>
    <div class="color-play-block" v-if="content.colorplay">
      <div class="color-play-image">
        <BaseImage :data="colorPlayRenderImg" alt="A Simple Customizable Showbelt" />
      </div>
      <color-play :info="content.colorplay.data[currentProduct]" :model="content.colorplay.model" />
    </div>
    <div class="video-block hide-video-mobile">
      <BaseVideo :data="content.showbeltDetail.video" class="video" muted playsinline />
    </div>
    <div class="leather-specs">
      <div class="image-wrapper">
        <BaseImage :data="content.leatherspecs.image" alt="Two leather showbelts" />
      </div>
      <div class="text-content">
        <h2 class="title">{{ content.leatherspecs.title }}</h2>
        <div class="text" v-html="content.leatherspecs.content"></div>
      </div>
      <div role="button" tabindex="0" class="customize-btn orange-btn" @click="clickBlank">Design Yours</div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
import structure from "@/structure";
import ColorPlay from "./ColorPlay.vue";
import StartPageReviews from "./StartPageReviews.vue";
import { Model } from "@/types";
import TeamBelts from "./TeamBelts.vue";

export default defineComponent({
  name: "BeltLanding",
  components: { StartPageReviews, ColorPlay, TeamBelts },
  computed: {
    ...mapState(["currentProduct", "models", "objectIDMap"]),
    ...mapGetters({
      product: "getProduct",
      content: "getPreConfigData",
    }),
    colorPlayRenderImg() {
      const containsParam = location.search.includes("color-play-graphic");
      if (containsParam) {
        const paramValue =
          location.search.match(/color-play-graphic=([^=&]+)/)?.[1] || "";
        if (paramValue == "coil-gif") {
          return "/show-imgs/startpage/Showbelts_Baseball_Animations_Fp.gif";
        }
      }
      return this.content?.colorplay?.image || "";
    },
  },
  methods: {
    ...mapMutations([
      "setConfiguratorMode",
      "setConfiguratorPage",
      "setCurrentModel",
    ]),
    ...mapActions(["onDataStepComplete", "switchModelData", "fetchModelData"]),
    clickColorPlay() {
      this.setConfiguratorMode("color");
      this.setConfiguratorPage("colorplay");
    },
    clickBlank() {
      this.setConfiguratorMode("blank");
      this.setConfiguratorPage("patterns");
    },
    clickPro() {
      this.setConfiguratorMode("blank");
      this.fetchModelData();
      this.onDataStepComplete({
        id: "models",
        callback: () => {
          // Grab the pro model, if its not there grab the first model
          const firstModel: Model = this.models.find((m: Model) => m.id == "modPWnaIppRDJy") || this.models[0];
          if (firstModel) {
            this.setCurrentModel(firstModel.id);
            this.switchModelData();
            this.setConfiguratorPage("build");
            this.onDataStepComplete({
              id: "objects",
            });
          }
        },
      });
    },
    clickTeam() {
      this.setConfiguratorMode("blank");
      this.fetchModelData();
      this.onDataStepComplete({
        id: "models",
        callback: () => {
          // Grab the first model since belt will only have one model
          const firstModel: Model = this.models[0];
          if (firstModel) {
            this.setCurrentModel(firstModel.id);
            this.switchModelData();
            this.setConfiguratorPage("build");
            this.onDataStepComplete({
              id: "objects",
              callback: () => {
                // Now grab the casing by using the branch ID and set it's user
                // interaction to true
                const sizeCasing = structure.branch(
                  this.content?.configuratorSizeBranchID
                );
                // So here we are automatically setting the team purchase
                // option to yes since that's what they clicked
                const teamPurchaseCasing = structure.branch(
                  this.content?.configuratorTeamPurchaseBranchID
                );
                if (sizeCasing && teamPurchaseCasing) {
                  sizeCasing.userInteraction = true;
                  const teamPurchaseOption =
                    this.objectIDMap[
                    [...teamPurchaseCasing.allowedValues.values()][0]
                    ];
                  if (teamPurchaseOption) {
                    teamPurchaseCasing.value = teamPurchaseOption;
                  }
                }
              },
            });
          }
        },
      });
    },
    shareUrl(id: string) {
      return location.pathname + "?id=" + id;
    },
    shareImage(id: string) {
      return `https://nokona.com/wp-content/uploads/configurator-images/${id}-0.jpg`;
    },
  },
});
</script>

<style lang="scss" scoped>
.belt-landingpage-template {
  opacity: 1;

  & :deep(img) {
    max-width: 100%;
  }
}

h1 {
  position: absolute;
  font-size: 0;
  opacity: 0.01;
  color: #fff1;
}

.hero {
  position: relative;
  padding: 98px 24px 114px;

  @media (max-width: $large-width) {
    padding: 9.8% 24px 11.4%;
  }


  @media (max-width: $medium-width) {
    padding: unset;

  }

  >* {
    position: relative;
  }

  h3 {
    font: 700 25px/100% $fnt-ev;
    text-transform: uppercase;
    color: #000;
    letter-spacing: 0.2em;
    padding-top: 1.2em;

    @media (max-width: $xsmall-width) {
      letter-spacing: 0.08em;
    }
  }

  .customize-btn {
    margin-top: 22px;
  }

  .background-desktop {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-position: bottom center;
    object-fit: cover;

    @media (max-width: $medium-width) {
      display: none;

    }

  }

  &.desktop {

    @media (max-width: $medium-width-up) {
      display: none;

    }

  }

  &.mobile {

    display: none;

    @media (max-width: $medium-width) {
      display: flex;
      flex-direction: column;

    }
  }


  .background-mobile {
    position: relative;
    top: 0;
    left: 0;
    width: 100%;
    max-height: 940px;
    object-position: top;
    object-fit: cover;
    display: none;

    @media (max-width: $medium-width) {
      display: block;
    }
  }

}

.logo-wrapper-mobile {

  background-color: #000;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  padding: 45px 0px;

}


.show-logo {
  width: min(582px, 47.2vw);
  max-width: 100%;
  font-size: 0;
  background: no-repeat center/contain url(../../assets/the-i-in-team.svg);
  display: flex;
  margin: 0 auto;
  font-size: 0;

  &::before {
    display: block;
    padding-top: 26%;
    content: "";
  }

  @media (max-width: $medium-width) {
    width: min(582px, 70.5vw);
    margin-top: unset;
    padding: 10px 30px;
  }

}

.classic-showbelt-logo {
  width: min(300px, 16.667vw);
  max-width: 100%;
  font-size: 0;
  background: no-repeat center/contain url(../../assets/customize.svg);
  display: flex;
  margin: 0 auto;
  margin-bottom: 10px;

  &::before {
    display: block;
    padding-top: 26%;
    content: "";
  }

  @media (max-width: $small-width-up) {
    width: 115px;
    margin-top: 15px;

  }
}



.animation.imaujee {
  margin-top: 10px;
}

.customize-btn {
  margin: 0 auto;
  background-color: $blue;
  border-radius: 28px;
  padding: min(1.2em, 1.3vw) 20px min(1.1em, 1.2vw);
  color: #fff;
  text-transform: uppercase;
  font: min(16px, 1.635vw)/0.9 $fnt-ev;
  width: min(217px, 18.083vw);
  cursor: pointer;

  &.orange-btn {
    background-color: $orange;
    margin-top: 20px;
  }

  @media (min-width: $small-width-up) {
    transition: color 0.2s linear;
  }

  @media (max-width: 360px) {
    font-size: 12px;
  }

  @media (max-width: $medium-width) {
    flex: unset;
    padding: min(1.2em, 4.3vw) 20px min(1.1em, 4.2vw);
    font: 16px/0.9 $fnt-ev;
    width: 165px;
  }



  &.color {
    background: #000 url("../../assets/color-gradient.svg") no-repeat 100% 100%/27px;
  }

  &.series {
    background: #000 url("../../assets/series-gradient.svg") no-repeat 100% 100%/27px;
  }
}

.logo-img-btn-container {

  max-width: 1600px;
  margin: 0 auto;
  display: flex;
  justify-content: end;
}

.logo-image-btn-wrapper {
    
    width: min(800px, 56.666vw);
    margin-left: min(112.5px, 5.5vw);
    margin-bottom: min(65px, 3.642vw);


  @media (max-width: $medium-width) {
    width: unset;
    height: 100%;
    position: absolute;
    top: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-around;

    &.hero-mobile {
      justify-content: end;
      top: unset;
      bottom: 25px;
      height: unset;
      gap: 100px;
      margin: 0 auto;
    }
  }
}

.heading {
  font-family: $fnt-ev;
  font-weight: 900;
  font-size: min(54px, 3.857vw);
  color: #fff;
  letter-spacing: 0.05em;
  line-height: 1;

  @media (max-width: $small-width-up) {

    padding: 0px 15px 30px;
    font-size: 24px;

  }

}


.video-block {
  position: relative;
  height: 100dvh;



  @media (max-width: $medium-width) {

    height: 50dvh;

  }

}

.video {

  height: 100%;
  width: 100%;
  object-fit: cover;
}


.logo-container {
  width: 100%;
  font-size: 0;
  display: flex;
  justify-content: center;
  margin: 0 auto;
  position: absolute;
  bottom: 0;
  margin-bottom: 25px;


  @media (max-width: $medium-width) {
    display: none;
  }
}


.player-promo {
  cursor: pointer;

  .desktop-image {
    display: block;
    position: relative;

    @media (max-width: $small-width) {
      display: none;
    }
  }

  .mobile-image {
    display: none;

    @media (max-width: $small-width) {
      display: block;
    }
  }

  img {
    width: 100%;
    height: auto;
    display: block;
  }
}

.team-belts-customize {
  background-color: #000;
  color: #fff;
  padding-top: 62px;
  position: relative;

  @media (max-width: $large-width) {
    padding-top: 6.2%;
  }

  &::after {
    content: "";
    bottom: 0;
    left: 0;
    right: 0;
    padding-top: #{"min(128px, 13%)"};
    display: block;
    background-image: linear-gradient(to bottom, #0000, #0007);
  }

  .title,
  .subtitle,
  .steps {
    width: calc(100vw - 48px);
    max-width: 430px;
    margin: 0 auto;
  }

  .title {
    max-width: 548px;
  }

  .subtitle {
    text-transform: uppercase;
    font: 600 27px/130% $fnt-cm;
    letter-spacing: 0.03em;
    color: $orange;

    @media (max-width: $xsmall-width) {
      font-size: 6.75vw;
    }
  }

  .steps {
    font: 19px/105.263% $fnt-cm;
    padding-top: 1.3684em;
  }

  .team-step:not(:last-child) {
    margin-bottom: 0.6em;
  }

  .num {
    color: $orange;
    font-weight: 700;
  }

  .background {
    width: 100%;
    height: auto;
    margin: 72px auto 0;
    max-width: $large-width;
  }

  .customize-btn {
    margin-top: 45px;
    border: 1px solid #fff;
  }
}

.leather-specs {
  // background: url(../../assets/nokona-tile.svg) repeat center/400px auto;
  padding: 94px 24px 130px;

  @media (max-width: $large-width) {
    padding: 9.4% 24px 13%;
  }

  @media (max-width: $medium-width) {
    background-size: 53.3333% auto;
  }

  .image-wrapper {
    max-width: 625px;
    margin: 0 auto;

    & :deep(img) {
      display: block;
    }
  }

  .text-content {
    max-width: 773px;
    margin: 0 auto;
    text-align: center;
  }

  .title {
    font: 700 32px/113.636% $fnt-cm;
    text-transform: uppercase;
    padding-top: 3.2em;
  }

  .text {
    font: 16px/125% $fnt-cm;

    @media (max-width: $small-width) {
      font-size: 13px;
    }

    padding-top: 18px;

    & :deep(ul) {
      padding-left: 1em;
    }

    & :deep(li) {
      padding-bottom: 0.4em;
    }
  }
}

.color-play-block {
  padding: 116px 0 52px;
  background: url(../../assets/nokona-tile.svg) repeat center/400px auto;


  @media (max-width: $medium-width) {
    background-size: 53.3333% auto;
  }

  .imaujee {
    width: 820px;
    margin: 0 auto -72px;
  }
}

.color-play-image {
  max-width: calc(100vw - 48px);
  margin: 0 auto;
}

.pro-belt-templates {
  padding: 0px 20px;
  display: flex;
  flex-wrap: wrap;
  max-width: 1200px;
  margin: 128px auto;
  gap: 8%;

  @media (max-width: $large-width) {
    overflow: hidden;
  }

  @media (max-width: $xsmall-width) {
    gap: 3%;
    display: none;
  }

  @media (max-width: $medium-width) {
    display: none;
  }

  .pro-hero {
    width: 100vw;
    margin-bottom: #{"min(85px,8.5vw)"};
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;

    @media (min-width: 1201px) {
      margin: 0 calc(-50vw + 600px) 85px;
    }

    &::before,
    &::after {
      content: "";
      padding-top: 41%;

      @media (min-width: $large-width-up) {
        padding-top: 410px;
      }
    }
  }

  .background {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    position: absolute;
    top: 0;
    left: 0;
  }

  .type {
    width: 518px;
    height: auto;
    position: relative;
    max-width: calc(100% - 48px);
    max-height: 75%;
  }
}

.pro-belt-design {
  display: block;
  width: 28%;
  margin-bottom: #{"min(75px, 7.5vw)"};

  @media (max-width: $small-width) {

    width: 46%;
  }

  @media (max-width: $xsmall-width) {

    width: 48.5%;
    // max-width: 336px;
  }



  &::after {
    display: block;
    content: "customize";
    font: 300 18px/150% $fnt-ev;
    text-transform: uppercase;
    letter-spacing: 0.053em;
    color: #000;
    transition: color 0.2s linear;
    padding-top: 6px;

    @media (max-width: $small-width) {
      font-size: 14px;
    }
  }

  &:hover::after {
    color: $orange;
  }
}
</style>
