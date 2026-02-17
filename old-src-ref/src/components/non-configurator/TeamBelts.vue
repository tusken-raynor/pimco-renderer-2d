<template>
  <!-- Desktop Layout - Team Showbelts -->
  <section v-if="herocheat">

    <div class="hero team-layout-desktop">
      <BaseImage :data="herocheat.desktop_image" class="background-desktop american-made-section" />
      <div class="logo-img-btn-container-team">
        <div class="logo-image-btn-wrapper american-made-size">
          <div class="classic-showbelt-logo">Customize</div>
          <div class="heading">
            <h2>Team<br>Showbelts</h2>
          </div>
          <BaseImage :data="herocheat.epion_belts.image" alt="Animated Selection of Team Showbelts" />
          <a :href="herocheat.url" class="linkie">
            <div role="button" tabindex="0" class="customize-btn orange-btn">Design Yours</div>
          </a>
        </div>
      </div>
    </div>
    <!-- Mobile Layout - Team Showbelts -->
    <div class="hero american-made-layout-mobile">
      <div class="logo-wrapper-mobile american-made hero-mobile">
        <div class="classic-showbelt-logo">Customize</div>
        <div class="heading">
          <h2>Team<br>Showbelts</h2>
        </div>
      </div>
      <BaseImage :data="herocheat.mobile_image" class="background-mobile" />
      <div class="logo-image-btn-wrapper american-made-size">
        <BaseImage class="" :data="herocheat.epion_belts.image" alt="Animated Selection of Team Showbelts" />
        <a :href="herocheat.url" class="linkie">
          <div role="button" tabindex="0" class="customize-btn orange-btn">Design Yours</div>
        </a>
      </div>
    </div>
  </section>

  <section v-if="split" class="showbelts-image-side-content-block">
    <div :class="['full', split.layout]">
      <div class="image-wrapper">
        <BaseImage :data="split.image" />
      </div>
      <div class="content-wrapper">
        <div class="team-program-logo">
          <img src="../../assets/team-program-logo.svg " alt="" class="team-program-img">
          <h2>Team Program</h2>
        </div>
        <h2 class="title" v-html="split.title"></h2>
        <div class="text" v-html="split.copy"></div>
        <div class="bullet-items">
          <div v-for="bullet in split.bullets" class="bullet-item">
            <BaseImage :data="bullet.icon" />
            <span>{{ bullet.text }}</span>
          </div>
        </div>
        <div stlye="margin-top:10px;">
          <a v-if="split.cta" :href="split.cta.url" class="customize-btn extra-padding"><span
              v-html="split.cta.label"></span></a>
        </div>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'TeamBelts',
  props: {
    hero: {
      type: Object
    },
    herocheat: {
      type: Object
    },
    split: {
      type: Object
    }
  }
});
</script>

<style lang="scss">


.showbelts-image-side-content-block {
  .full {

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      margin: 0;
      padding: 0;
    }


    display: flex;
    justify-content: center;
    max-width: 1440px;
    margin-left: auto;
    margin-right: auto;
    text-align: left;
    gap: clamp(30px, 3vw, 144px);
    padding: min(72px, 12vw) 24px;

    @media (min-width: $medium-width-up) {
      &.right {
        flex-direction: row-reverse;
      }
    }

    @media (max-width: $medium-width) {
      gap: 40px;
      flex-direction: column;
      text-align: center;
    }

    .content-wrapper {
      font-size: clamp(24px, 1.94vw, 28px);


      display: flex;
      flex-direction: column;
      gap: min(40px, 3vw);



      @media (min-width: 751px) and (max-width: 915px) {
        gap: clamp(0px, 1.278vw, 30px);

      }

      @media (max-width: $medium-width) {
        padding-top: 0;
        align-self: center;
        width: initial;
        margin: 0 24px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;

      }

      .title {
        font: 900 min(24px, 2.52vw)/148% $fnt_ev;
        text-transform: uppercase;
        margin-top: -20px;

        @media (min-width: 751px) and (max-width: 915px) {
          margin-top: 0px;
        }

        @media (max-width: $medium-width) {
          margin-top: -10px;
          width: 90%;
          text-align: center;
          font-size: 24px;
        }

      }

      .text {
        font: 16px/150% $fnt-cm;
        max-width: 402px;

        @media (max-width: $medium-width) {
          font-size: 14px;
        }
      }

      .bullet-items {
        max-width: 480px;
        display: flex;
        flex-wrap: wrap;
        font-family: $fnt-cm;

        @media (max-width: $medium-width) {
          max-width: 300px;
        }

        .bullet-item {
          display: flex;
          margin-bottom: 1px;
          align-items: center;
          margin-right: 19px;

          @media (max-width: $medium-width) {
            margin-bottom: 7px;
          }

          img {
            width: 24px;
            margin-right: 6px;
          }

          span {
            font-size: 14px;
            font-weight: 700;
            line-height: 139%;
            text-align: center;
          }
        }
      }

      .cta {
        border-radius: 28px;
        max-width: 228px;
        height: 40px;
        display: flex;
        justify-content: center;
        border: solid 1px $orange;
        background: $orange;
        font-size: clamp(14px, 1.11vw, 16px);
        font-weight: 700;
        text-transform: uppercase;
        line-height: 40px;
        color: #fff;
        cursor: pointer;
        transition: all 0.3s ease;

        &:hover {
          border-color: $orange;
          background: #fff;
          color: $orange;
        }

        @media (max-width: $medium-width) {}


      }
    }
  }

  .image-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;

    img {
      width: min(440px, 80.77vw);
    }

    @media (max-width: $medium-width) {
      align-self: center;
      width: initial;
      margin: 0 24px;

    }
  }


}

.full-image-w-gif-header {
  display: flex;

  .background {
    width: 0;
    flex-grow: 0;
    display: flex;

    img {
      max-width: initial !important;
      width: 100vw;
      height: auto;
      object-fit: cover;
      object-position: var(--background-justify);
      display: block;
      user-select: none;
    }
  }
}


.full-image-w-gif-header-cheat {


  .desktop-layout {
    @media (max-width: $medium-width) {
      display: none;
    }
  }

  .mobile-layout {

    display: flex;
    flex-direction: column;
    position: relative;

    @media (min-width: $medium-width-up) {
      display: none;
    }
  }

  .full {
    position: relative;

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      margin: 0;
      padding: 0;
    }

    img {
      display: block;
      width: 100%;

      &.desktop-img {
        @media (max-width: $small-width) {
          display: none;
        }
      }

      &.mobile-img {
        @media (min-width: $small-width-up) {
          display: none;
        }
      }
    }

    .linkie {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
    }
  }
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
    object-position: top;
    object-fit: cover;

    @media (max-width: $medium-width) {
      display: none;

    }

    &.american-made-section {
      object-position: bottom center;
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

  &.team-layout-desktop {
    display: block;

    @media (max-width: $medium-width) {
      display: none;
    }
  }

  &.american-made-layout-mobile {
    position: relative;
    display: none;
    flex-direction: column;

    @media (max-width: $medium-width) {
      display: flex;
    }
  }
}


.logo-img-btn-container-team {

  max-width: 1600px;
  // margin: 0 auto;
  display: flex;
  justify-content: start;
}

.logo-image-btn-wrapper {
  width: 65%;




  &.american-made-size {
    width: min(800px, 56.666vw);
    // margin-right: min(112.5px, 5.5vw);
    margin-left: min(112.5px, 5.5vw);
    margin-bottom: min(65px, 3.642vw);




    @media (max-width: $medium-width) {
      width: 100%;
      height: unset;
      margin-left: 0px;
      margin-bottom: 0px;
      position: absolute;
      bottom: 25px;
      top: unset;
      gap: 50px;

    }
  }

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


  &.less-padding {
    padding: 25px 0px;
  }
}


.logo-img-btn-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 0px;
  width: min(800px, 56.666vw);
  margin-left: min(112.5px, 5.5vw);



  &.mobile {

    @media (max-width: $medium-width) {
      width: unset;
      height: 85%;
      position: absolute;
      top: 90px;
      display: flex;
      flex-direction: column;
      justify-content: end;
      margin-left: unset;
      gap: 100px;
    }
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

.show-logo {
  width: 431px;
  max-width: 100%;
  font-size: 0;
  background: no-repeat center/contain url(../../assets/team-showbelts-type.svg);
  display: flex;
  margin: 0 auto;
  font-size: 0;

  &::before {
    display: block;
    padding-top: 26%;
    content: "";
  }
}

.team-program-logo {

  display: flex;
  margin: 0 auto;
  font-size: 0;

  .team-program-image {
    width: 687px;
    max-width: 100%;



    @media (max-width: $large-width) {
      width: 415px;
      margin: unset
    }

    @media (max-width: $xsmall-width) {
      width: 300px;
    }


  }
}


.customize-btn {
  margin: 0 auto;
  background-color: $orange;
  border-radius: 28px;
  padding: min(1.2em, 1.3vw) 20px min(1.1em, 1.2vw);
  color: #fff;
  text-transform: uppercase;
  font: min(16px, 1.635vw)/0.9 $fnt-ev;
  width: min(217px, 18.083vw);
  cursor: pointer;
  text-align: center;


  @media (max-width: $medium-width) {
    flex: unset;
    padding: min(1.2em, 4.3vw) 20px min(1.1em, 4.2vw);
    font: 16px/0.9 $fnt-ev;
    width: 165px;
  }

}
</style>