<template>
  <header
    :class="{
      simple: configuratorPage != 'build',
      msh: mainSiteHeader && configuratorPage !== 'build',
    }"
    data-component
    v-show="!expandProductStage"
  >
    <div v-if="mainSiteHeader && configuratorPage !== 'build'" class="main-site-header" v-html="mainSiteHeader"></div>
    <div class="left-stuff">
      <div v-if="logoAsset" class="logo-wrapper">
        <BaseImage :src="logoAsset" :class="['logo-asset', { 'nav-home': goHome }]" @click="headOnHome" />
      </div>
      <div v-else class="logo-wrapper">
        <div :class="['logo', { 'nav-home': goHome }]" @click="headOnHome">Show</div>
        <header-options-drop></header-options-drop>
      </div>
      <a href="https://nokona.com" class="nokona-link"></a>
    </div>
    <div class="right-stuff">
      <template v-if="!inStudioMode">
        <!-- These are the buttons for desktop -->
        <DevControls></DevControls>
        <div v-if="!isEmbedded" class="team-share" @click="openSharePopup"></div>
        <div v-if="!isEmbedded" class="share-links">
          <div class="share-cta" @click="openSharePopup">share</div>
          <a
            :href="
              'mailto:?subject=Custom Nokona ' +
              productNameSingular +
              '&body=Check out this custom ' +
              productNameSingular.toLowerCase() +
              ': ' +
              shareURL
            "
            class="email-share share-link"
            @click="saveSessionDataToDB"
          ></a>
          <a
            :href="'https://www.facebook.com/sharer.php?u=' + encodedShareURL"
            class="facebook-share share-link"
            target="_blank"
            @click="saveSessionDataToDB"
          ></a>
          <a
            :href="'https://twitter.com/intent/tweet?url=' + encodedShareURL"
            class="twitter-share share-link"
            target="_blank"
            @click="saveSessionDataToDB"
          ></a>
          <!-- <a class="link-share share-link"></a> -->
        </div>
        <div class="start-over" @click="startOver">start over</div>
        <!-- These are the buttons for mobile -->
        <div class="restart" @click="startOver"></div>
        <div class="share" @click="openSharePopup"></div>
        <div class="price" @click="openCheckout" :class="{ 'show-total': unitPrice && unitTotalLabel }">
          <div class="price-line">
            <span class="price-number-case">
              <span class="price-sizer" ref="priceSizer">{{ sizerPrice }}</span>
              <div class="price-number">{{ formattedPrice }}</div>
            </span>
            <span v-if="!unitPrice" class="buy">&nbsp;buy</span>
            <span v-else class="unit-price-per buy">/{{ unitPriceLabel }}</span>
          </div>
          <div v-if="unitPrice && unitTotalLabel" class="woo-prices-total">{{ unitTotalLabel }}</div>
        </div>
      </template>
      <template v-else>
        <button
          class="studio-menu-btn stage-studio"
          @click="setDisplayStudioControls(true)"
          :class="{ current: displayStudioControls }"
        >
          Stage
        </button>
        <button
          class="studio-menu-btn personalize"
          @click="setDisplayStudioControls(false)"
          :class="{ current: !displayStudioControls }"
        >
          Personalize
        </button>
        <button class="studio-menu-btn save-setup" @click="studioSettingsToFile">Save</button>
      </template>
      <!-- HERE IN THE HEADER DYNAMICALLY LOAD FONTS THAT WILL BE USED BY THE RENDERER -->
      <div v-if="product?.fonts" class="font-loader">
        <div v-for="font in product.fonts" :key="font" :style="{ fontFamily: font }">g</div>
      </div>
    </div>
  </header>
</template>

<script lang="ts">
import HeaderOptionsDrop from "./HeaderOptionsDrop.vue";
import { defineComponent, ref, Ref } from "vue";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
import utils from "@/utils";
import data from "@/data";
import share from "@/share";
import { starters } from "@/store/initialize";
import params from "@/params";
import showglovesLogo from "@/assets/logo-showgloves.svg?url";
import showbeltsLogo from "@/assets/logo-showbelts.svg?url";
import showbatsLogo from "@/assets/logo-showbats.svg?url";
import woocommerce from "@/woocommerce";
import DevControls from "./DevControls.vue";

function getSwipePos(event: any) {
  if (event.constructor == MouseEvent) {
    return event.offsetY;
  } else {
    return event.layerY || event.targetTouches[0].clientY;
  }
}

export default defineComponent({
  name: "Header",
  components: {
    HeaderOptionsDrop,
    DevControls,
  },
  computed: {
    ...mapState([
      "selectedOptions",
      "currentProduct",
      "configuratorPage",
      "expandProductStage",
      "inStudioMode",
      "displayStudioControls",
    ]),
    ...mapGetters({
      product: "getProduct",
      model: "getModel",
      price: "getTotalPrice",
      shareURL: "getShareURL",
      encodedShareURL: "getEncodedShareURL",
      productName: "getProductName",
      wooPrices: "getWooPrices",
      likelyQuantity: "getLikelyQuantity",
    }),
    formattedPrice(): string {
      this.configuratorPage;
      return utils.formatPrice(this.displayPrice);
    },
    goHome(): boolean {
      return this.configuratorPage !== "build" && this.configuratorPage !== "start";
    },
    productNameSingular() {
      if (this.productName) {
        if (this.productName.endsWith("s")) {
          return this.productName.substring(0, this.productName.length - 1);
        }
        return this.productName;
      }
      return "Glove";
    },
    isEmbedded() {
      return params.getBool("embed");
    },
    logoAsset() {
      if (this.currentProduct in this.logoAssets) {
        return this.logoAssets[this.currentProduct as keyof typeof this.logoAssets];
      }
      return "";
    },
    unitPrice() {
      return !!this.model?.unitprice;
    },
    unitPriceLabel() {
      if (this.unitPrice && this.model?.unitpricelabel) {
        return this.model.unitpricelabel;
      }
      return "Each";
    },
    unitTotalLabel() {
      if (this.unitPrice && this.unitTotalPrice) {
        return (this.model?.unittotallabel || "Total").trim() + " " + this.unitTotalPrice;
      }
      return "";
    },
    unitTotalPriceValue(): number | null {
      if (this.unitPrice && this.wooPrices && this.currentProduct) {
        const wooid = woocommerce.getProduct(this.currentProduct);
        let price = 0;
        for (let i = 0; i < this.wooPrices.length; i++) {
          const x = this.wooPrices[i];
          // Check if the main product has a quantity of zero, and if that's the case, just return 0 for the total
          if (x.wooid === wooid && x.quantity <= 0) {
            price = 0;
            break;
          }
          price += x.price * x.quantity;
        }
        if (price > 0) {
          return price;
        }
      }
      return null;
    },
    unitTotalPrice() {
      if (this.unitPrice && this.unitTotalPriceValue !== null) {
        return `$${utils.formatPrice(this.unitTotalPriceValue)}`;
      }
      return "";
    },
    priceValue() {
      if (
        this.unitPrice &&
        this.unitTotalPriceValue !== null &&
        typeof this.likelyQuantity === "number" &&
        this.likelyQuantity > 0
      ) {
        return this.unitTotalPriceValue / this.likelyQuantity;
      }
      return this.price;
    },
  },
  methods: {
    ...mapMutations(["setPrice", "setSpecialPopup", "setConfiguratorPage", "setConfiguratorMode"]),
    ...mapActions(["cleanSlate", "saveSessionData", "proceedToCheckout", "studioSettingsToFile"]),
    startOver() {
      this.setSpecialPopup({
        title: "Start Over?",
        message: `Are you sure you want to start your ${this.productName} customization from the beginning?`,
        confirm: {
          label: "start over",
          callback: this.cleanSlate,
        },
        cancel: {
          label: "continue",
        },
        mode: "startover",
      });
    },
    saveSessionDataToDB() {
      if (share.isSelectionUpdated()) {
        share.newSession();
        this.saveSessionData();
      }
    },
    openSharePopup() {
      if (!starters.dev) {
        this.saveSessionDataToDB();
      }
      this.setSpecialPopup({
        title: "Share Your Design",
        message: "Anyone you share your design with will be able to customize and purchase it.",
        mode: "share",
      });
    },
    openCheckout() {
      this.proceedToCheckout();
    },
    changePriceNumber(newPrice: number) {
      // this.sizerPrice = utils.formatPrice(this.displayPrice);
      // Stop the price loop if one is already running
      if (this.loopControls) {
        this.loopControls.stop();
      }
      let diff = newPrice - this.displayPrice;
      let step = Math.floor(diff / 20) || 1;
      if (Math.abs(step) < 1) {
        step = step / Math.abs(step);
      }
      diff = Math.floor(Math.abs(diff / step));
      this.displayPrice = Math.floor(this.displayPrice) + (newPrice % 1);
      // Start the loop and save the controls
      this.loopControls = utils.timedLoop(
        (i) => {
          if (i + 1 >= diff) {
            this.displayPrice = newPrice;
          } else {
            this.displayPrice += step;
          }
        },
        30,
        diff
      );
      // Now smoothly transition the price element width
      if (this.priceSizer) {
        const startWidth = this.priceSizer.getBoundingClientRect().width + "px";
        this.sizerPrice = utils.formatPrice(newPrice);
        requestAnimationFrame(() => {
          if (this.priceSizer) {
            const endWidth = this.priceSizer.getBoundingClientRect().width + "px";
            this.priceSizer.style.width = startWidth;
            requestAnimationFrame(() => {
              if (this.priceSizer) {
                this.priceSizer.style.width = endWidth;
                setTimeout(() => {
                  if (this.priceSizer) {
                    this.priceSizer.style.width = "";
                  }
                }, 300);
              }
            });
          }
        });
      }
    },
    headOnHome() {
      // If we are one the patterns page and they click the logo
      // at the top, send them to the start page
      if (this.goHome) {
        this.setConfiguratorPage("start");
        this.setConfiguratorMode("");
      }
    },
    /* Methods to handle the XSF (xtra-small functionality) for the header */
    setPullEvent(e: TouchEvent) {
      // The touchmove event listeners are only neccesary when the finger is down,
      // so they are added and removed based on that

      this.xsfPos = getSwipePos(e);
      this.xsfStart = Date.now();
      if (document.body.classList.contains("hide-header") && window.scrollY == 0) {
        window.addEventListener("touchmove", this.onPullDown);
      } else {
        window.addEventListener("touchmove", this.onPullUp);
      }
    },
    removePullEvent() {
      window.removeEventListener("touchmove", this.onPullDown);
      window.removeEventListener("touchmove", this.onPullUp);
    },
    onPullUp(e: TouchEvent) {
      // Handle the touch drag up for hiding the header
      const pos = getSwipePos(e);
      const time = Date.now();
      if (this.xsfPos - pos > 40 && time - this.xsfStart < 800) {
        document.body.classList.add("hide-header");
        this.removePullEvent();
      }
    },
    onPullDown(e: TouchEvent) {
      // Handle the touch drag down for revealing header
      const pos = getSwipePos(e);
      const time = Date.now();
      if (pos - this.xsfPos > 40 && time - this.xsfStart < 800) {
        document.body.classList.remove("hide-header");
        this.removePullEvent();
      }
    },
    handleXSFListeners() {
      // App only will have events for dragging if screen is appropriate size
      if (window.innerHeight <= 500 && window.innerWidth <= 400) {
        if (!this.xsfSet) {
          this.xsfSet = true;
          window.addEventListener("touchstart", this.setPullEvent);
          window.addEventListener("touchend", this.removePullEvent);
          document.body.classList.add("hide-header");
        }
      } else {
        if (this.xsfSet) {
          this.xsfSet = false;
          window.removeEventListener("touchstart", this.setPullEvent);
          window.removeEventListener("touchend", this.removePullEvent);
        }
      }
    },
    setDisplayStudioControls(value: boolean) {
      this.$store.state.displayStudioControls = value;
    },
  },
  setup() {
    const xsfSet: Ref<boolean> = ref(false);
    const xsfPos: Ref<number> = ref(0);
    const xsfStart: Ref<number> = ref(-1);
    const displayPrice: Ref<number> = ref(0);
    const loopControls: Ref<any> = ref(null);
    const toPrice: Ref<string> = ref("0");
    const sizerPrice: Ref<string> = ref("0");
    const priceSizer: Ref<HTMLElement | null> = ref(null);
    const mainSiteHeader: Ref<string> = ref("");
    const logoAssets = ref({
      gloves: showglovesLogo,
      belts: showbeltsLogo,
      bats: showbatsLogo,
      epion: showbeltsLogo,
    });
    return {
      xsfSet,
      xsfPos,
      xsfStart,
      displayPrice,
      loopControls,
      toPrice,
      sizerPrice,
      priceSizer,
      mainSiteHeader,
      logoAssets,
    };
  },
  watch: {
    priceValue(val) {
      this.changePriceNumber(val);
    },
  },
  mounted() {
    window.addEventListener("resize", this.handleXSFListeners);
    this.handleXSFListeners();
    data.fetchMainSiteHeader().then((markup) => {
      this.mainSiteHeader = markup;
      this.$emit("nokona-header", markup);
    });
  },
});
</script>

<style lang="scss" scoped>
header {
  padding-left: 5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 0 6px 0 #00000033;
  border-bottom: 1px solid #000;
  background-color: #fff;
  z-index: $header-z;

  @media (min-width: $xsmall-width-up) {
    padding-left: 15px;
  }

  @media (min-width: $small-width-up) {
    padding-left: 30px;
  }

  .main-site-header {
    display: none;
  }

  .nokona-link {
    display: none;
  }

  &.simple {
    justify-content: center;
    height: 52px;
    padding-left: 0;

    .left-stuff {
      width: 100%;
      height: 100%;
      padding: 0 36px;
      display: flex;
      justify-content: center;
      align-items: center;

      @media (max-width: $small-width) {
        padding: 0 8px;
      }

      @media (max-width: 900px) {
        width: 100%;
        height: 100%;
        padding: 0 36px;
        justify-content: space-between;

        .nokona-link {
          display: block;
          height: 22px;
          width: 76px;
          background: url(https://nokona.com/wp-content/themes/nokona-2019/img/nokona-top.svg) no-repeat center/contain;
        }
      }
    }

    .right-stuff {
      display: none;
    }
  }

  @media (min-width: 901px) {
    &.msh {
      position: relative;
      margin-top: 90px;
      .main-site-header {
        display: block;
        position: absolute;
        height: 90px;
        left: 0;
        bottom: 100%;
        right: 0;
      }
    }
  }
}

.left-stuff,
.right-stuff {
  display: flex;
  align-items: center;
}

.left-stuff {
  width: auto;
  padding-left: 15px;
  justify-content: flex-end;

  @media (min-width: $xsmall-width-up) {
    padding-left: 0;
  }

  .logo-wrapper {
    display: flex;
    align-items: center;
  }
}

.right-stuff {
  width: 169px;

  @media (min-width: $xsmall-width-up) {
    width: 218px;
  }

  @media (min-width: $small-width-up) {
    width: 238px;
  }

  @media (min-width: $medium-width-up) {
    width: auto;
    justify-content: flex-end;
  }

  @media (max-width: $medium-width) {
    align-items: flex-end;
  }
}

.logo {
  width: 76px;
  text-transform: uppercase;
  font-size: 0;
  background: no-repeat center/contain url(../assets/logo.svg);

  &.nav-home {
    cursor: pointer;
  }

  // @media (min-width: $small-width-up) {
  //   width: 96px;
  // }
}

.logo-asset {
  height: 19px;
  width: auto;

  @media (max-width: $small-width) {
    height: 16px;
  }
}

.price {
  color: #fff;
  font: 700 19px/100% $fnt-ev;
  letter-spacing: 0.02em;
  background-color: $orange;
  padding: 17px 16px 16px 28px;
  align-items: flex-end;
  user-select: none;
  cursor: pointer;

  &.show-total {
    padding-block: 11px 10px;
  }

  span.buy {
    display: none;
  }

  .price-number-case {
    position: relative;

    .windows & {
      @media (min-width: 851px) {
        top: 7px;
      }

      @media (max-width: $medium-width) {
        top: 5px;
      }
    }
  }

  .price-number {
    position: absolute;
    top: 0;
    right: 0;

    &:before {
      font: 700 13px/120% $fnt-cm;
      content: "$";
    }
  }

  .price-sizer {
    display: inline-block;
    opacity: 0;
    transition: width 0.3s ease;
  }

  @media (min-width: $xsmall-width-up) {
    span.buy {
      display: inline;
      font: 700 14px/100% $fnt-cm;
      text-transform: uppercase;
    }
  }

  @media (min-width: $medium-width-up) {
    font-size: 27px;

    .price-number::before {
      font-size: 20px;
    }

    span.buy {
      font-size: 22px;
    }
  }

  @media (min-width: $medium-width-up) and (max-width: 850px) {
    display: flex;
  }

  .woo-prices-total {
    font-size: 10px;
    font-weight: 400;
    line-height: 1;
    margin-top: 0.2em;
  }
}

/* Mobile Styles */
.restart,
.share {
  margin-right: 5px;
  box-sizing: border-box;
  flex: 1 1 24px;
  cursor: pointer;
  margin-bottom: 8px;

  @media (min-width: $xsmall-width-up) {
    flex-shrink: 0;
    margin-right: 10px;
  }

  @media (min-width: $small-width-up) {
    margin-right: 15px;
  }

  @media (min-width: $medium-width-up) {
    display: none;
    margin-bottom: 0px;
  }
}

.restart {
  height: 33.315px;
  flex-basis: 33px;
  background: url(../assets/restart.svg) no-repeat left center/contain;
  position: relative;

  @media (max-width: $small-width) {
    margin-right: 10px;
    top: 0px;
  }

  @media (min-width: $xsmall-width-up) {
    margin-left: 10px;
    top: 0.5px;
  }

  @media (min-width: $small-width-up) {
    position: static;
  }

  @media (min-width: $medium-width-up) {
    display: block;
    height: 21px;
    flex-basis: 24px;
    background-image: url(../assets/refresh.svg);
  }

  @media (min-width: 851px) {
    display: none;
  }
}

.share {
  height: 35.25px;
  background: url(../assets/share-2.svg) no-repeat left center/contain;
}

/* Desktop Styles */
.team-share {
  height: 12px;
  width: 104px;
  background: url(../assets/team-share.svg) no-repeat center/contain;
  flex-shrink: 0;
  margin-right: 24px;
  position: relative;
  cursor: pointer;

  &::after {
    content: "";
    background-color: #000;
    width: 1px;
    height: calc(100% + 13px);
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: -24px;
  }

  @media (max-width: 850px) {
    margin-right: 10px;

    &::after {
      right: -10px;
    }
  }
}

.share-links {
  margin: 0 24px;
  display: flex;
  font: 600 11px/120.02% $fnt-cm;
  color: #b4b4b4;
  text-transform: uppercase;
  align-items: center;
  position: relative;
  cursor: pointer;

  &::after {
    content: "";
    background-color: #000;
    width: 1px;
    height: calc(100% + 13px);
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: -24px;
  }

  @media (max-width: 850px) {
    margin-left: 10px;
    margin-right: 10px;

    &::after {
      right: -10px;
    }
  }

  .share-cta {
    position: relative;
    top: 1px;

    .has-sharer & {
      cursor: pointer;
    }
  }

  .share-link {
    width: 13px;
    height: 13px;
    background: no-repeat center/contain;
    margin-left: 12px;
    transition: transform 0.2s ease;
    transform: rotate(360deg);
    cursor: pointer;

    &:first-child {
      margin-left: 17px;
    }

    &:hover {
      transform: rotate(360deg) scale(1.2);
    }

    &.email-share {
      background-image: url(../assets/email.svg);
    }

    &.facebook-share {
      background-image: url(../assets/facebook.svg);
    }

    &.twitter-share {
      background-image: url(../assets/twitter.svg);
    }

    &.link-share {
      background-image: url(../assets/link.svg);
    }
  }
}

.start-over {
  margin: 0 36px 0 24px;
  font: 600 11px/120.02% $fnt-cm;
  color: #b4b4b4;
  text-transform: uppercase;
  cursor: pointer;
}

.team-share,
.share-links,
.dev-controls {
  @media (max-width: $medium-width) {
    display: none;
  }
}

.start-over {
  @media (max-width: 850px) {
    display: none;
  }
}

.font-loader {
  display: contents;

  > div {
    width: 0;
    height: 0;
    opacity: 0;
    font-size: 0px;
    line-height: 100%;
  }
}

.studio-menu-btn {
  background-color: #000;
  border-inline: 2px solid #000;
  border-block: none;
  height: 60px;
  color: #fff;
  font: 700 19px/100% $fnt-ev;
  text-transform: uppercase;
  padding: 6px 16px;
  cursor: pointer;
  transition: background-color 0.3s linear, color 0.3s linear;
  margin-left: 1px;

  &:hover,
  &.current {
    background-color: #fff;
    color: #000;
    border-color: #000;
  }
}
</style>
<style lang="scss">
@media (max-height: 600px) and (max-width: 500px) {
  /* Possible xsmall mobile configuration */
  body header {
    transition: transform 0.3s ease;
  }

  #main {
    transition: height 0.3s ease, margin-top 0.3s ease;
  }

  /* Possible xsmall mobile configuration */
}

@media (max-height: 500px) and (max-width: 400px) {
  /* Possible xsmall mobile configuration */
  body.hide-header header {
    transform: translateY(-53px);
  }

  .hide-header #main {
    height: 100vh;
    margin-top: -53px;
  }

  /* Possible xsmall mobile configuration */
}
</style>
<style lang="scss">
#top-links > form {
  display: none;
}
</style>
