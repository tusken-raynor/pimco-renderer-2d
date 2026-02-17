<template>
  <div class="bat-landingpage-template">
    <section class="hero">
      <div v-if="content.hero.background" class="background">
        <BaseImage :data="content.hero.background" />
      </div>
      <h1 @contextmenu="e => e.preventDefault()">
        <div class="title-pre">Nokona</div>
        <div class="title-paz">Showbats</div>
      </h1>
      <div class="hero-actions" v-if="content.hero.actions?.length">
        <h2 v-if="content.hero['call-to-action']" class="call-to-action">{{ content.hero['call-to-action'] }}</h2>
        <div class="actions">
          <template v-for="action in content.hero.actions">
            <a 
              v-if="action.action == 'hyperlink'" 
              :href="action.href" 
              :target="action.target" 
              :class="['action', 'style-' + (action.style || 'fill'), { ['color-' + action.color]: !!action.color }]"
              :key="action.href"
            >{{ action.label }}</a>
            <button 
              v-else 
              @click="processAction(action)"
              :class="['action', 'style-' + (action.style || 'fill'), { ['color-' + action.color]: !!action.color }]"
              :key="action.target"
            >{{ action.label }}</button>
          </template>
        </div>
      </div>
      <div class="hero-media image" v-if="content.hero.media.type == 'image'" @contextmenu="e => e.preventDefault()">
        <BaseImage :data="content.hero.media.data" />
      </div>
      <div class="hero-media video" v-else-if="content.hero.media.type == 'video'" @contextmenu="e => e.preventDefault()">
        <BaseVideo :data="content.hero.media.data" />
      </div>
    </section>
    <section class="sizes" id="sizes">
      <div 
        class="sizes-wrap" 
        :class="{'is-narrower-than-view': selectionMenuIsNarrow, 'is-start': sizesListAtStart, 'is-end': sizesListAtEnd}"
      >
        <div class="sizes-list fix-scrollbar" ref="sizesList">
          <div class="size-card" v-for="turn in content.sizes" :key="turn.option">
            <h3 class="turn">{{ turn.turn }}</h3>
            <div class="details" v-html="turn.details"></div>
            <div class="preview">
              <BaseImage :data="turn.preview" />
            </div>
            <div class="lengths">
              <div class="lengths-cta">Select length</div>
              <div class="lengths-list">
                <template v-for="length in turn.lengths" :key="length.option || length">
                  <div v-if="typeof length == 'string'" class="length-message" v-html="length"></div>
                  <div v-else class="length">
                    <input 
                      type="radio" 
                      :id="length.option + '-' + turn.option" 
                      name="bat-size" 
                      :value="length.option + '-' + turn.option" 
                      @change="setSelectedSizeData(turn.option, length.option, turn['turn-branch'], turn['length-branch'])"
                    />
                    <label :for="length.option + '-' + turn.option">{{ length.label }}</label>
                  </div>
                </template>
              </div>
            </div>
            <button v-if="turn.info" class="info" @click="openInfoPopup(turn.info)">Info</button>
          </div>
        </div>
        <button class="size-nav prev" @click="sizeListNav(0)">Previous</button>
        <button class="size-nav next" @click="sizeListNav(1)">Next</button>
      </div>
    </section>
    <section v-if="content.torpedo_media" id="torpedo-media" class="big-image">
      <div class="media">
        <BaseImage v-if="content.torpedo_media.type == 'image'" :data="content.torpedo_media.data" />
        <BaseVideo v-else-if="content.torpedo_media.type == 'video'" :data="content.torpedo_media.data" />
      </div>
    </section>
    <section v-if="content.left_cta" class="text-cta-side-media left">
      <div class="text-cta">
        <div v-if="content.left_cta.subtitle" class="sub-title" v-html="content.left_cta.subtitle"></div>
        <div v-if="content.left_cta.title" class="title" v-html="content.left_cta.title"></div>
        <div v-if="content.left_cta.copy" class="copy" v-html="content.left_cta.copy"></div>
        <button v-if="content.left_cta.cta" @click="processAction(content.left_cta.cta)" class="action">{{ content.left_cta.cta.label }}</button>
        <div v-if="content.left_cta.sticker" class="sticker">
          <BaseImage :data="content.left_cta.sticker" />
        </div>
      </div>
      <div class="side-media">
        <BaseImage v-if="content.left_cta.media.type == 'image'" :data="content.left_cta.media.data" />
        <BaseVideo v-else-if="content.left_cta.media.type == 'video'" :data="content.left_cta.media.data" />
      </div>
    </section>
    <section v-if="content.bat_spectrum" :class="['big-image', 'bat_spectrum', {'has-bg': content.bat_spectrum.background}]">
      <template v-if="content.bat_spectrum.image">
        <BaseImage v-if="content.bat_spectrum.background" :data="content.bat_spectrum.background" class="background" />
        <BaseImage :data="content.bat_spectrum.image" class="image" />
      </template>
      <template v-else-if="content.bat_spectrum.video">
        <BaseVideo :data="content.bat_spectrum.video" class="video" />
      </template>
      <a v-if="content.bat_spectrum.url" :href="content.bat_spectrum.url"></a>
    </section>
    <section v-if="content.right_cta" class="text-cta-side-media right">
      <div class="text-cta">
        <div v-if="content.right_cta.subtitle" class="sub-title" v-html="content.right_cta.subtitle"></div>
        <div v-if="content.right_cta.title" class="title" v-html="content.right_cta.title"></div>
        <div v-if="content.right_cta.copy" class="copy" v-html="content.right_cta.copy"></div>
        <button v-if="content.right_cta.action" @click="processAction(content.right_cta.action)" class="action style-outline" style="color: #000;">{{ content.right_cta.action.label }}</button>
        <button v-if="content.right_cta.cta" @click="processAction(content.right_cta.cta)" class="action">{{ content.right_cta.cta.label }}</button>
        <div v-if="content.right_cta.sticker" class="sticker">
          <BaseImage :data="content.right_cta.sticker" />
        </div>
      </div>
      <div class="side-media">
        <BaseImage v-if="content.right_cta.media.type == 'image'" :data="content.right_cta.media.data" />
        <BaseVideo v-else-if="content.right_cta.media.type == 'video'" :data="content.right_cta.media.data" />
      </div>
    </section>
    <section v-if="content.americas_pastime" :class="['big-image', 'americas_pastime', {'has-bg': content.americas_pastime.background}]">
      <template v-if="content.americas_pastime.image">
        <BaseImage v-if="content.americas_pastime.background" :data="content.americas_pastime.image" class="background" />
        <BaseImage :data="content.americas_pastime.image" class="image" />
      </template>
      <template v-else-if="content.americas_pastime.video">
        <BaseVideo :data="content.americas_pastime.video" class="video" />
      </template>
      <a v-if="content.americas_pastime.url" :href="content.americas_pastime.url"></a>
    </section>
    <section v-if="content.quad_media" class="quad-medias">
      <div 
        v-for="media, i in content.quad_media" 
        :class="[
          'quad-media', 
          'media-alt-' + ((i + 1 >> 1) & 1), 
          {'no-margin': i + 1 + (i & 1 ^ 1) >= content.quad_media.length}
        ]"
      >
        <BaseImage v-if="media.type == 'image'" :data="media.data" />
        <BaseVideo v-else-if="media.type == 'video'" :data="media.data" />
      </div>
    </section>
    <section v-if="content.stupid_cta" class="stupid-cta">
      <div v-if="content.stupid_cta.background" class="background">
        <BaseImage class="mobile-img" :data="content.stupid_cta.background.mobile || content.stupid_cta.background.desktop" />
        <BaseImage class="desktop-img" :data="content.stupid_cta.background.desktop" />
      </div>
      <div class="content">
        <div 
          v-if="content.stupid_cta.title" 
          class="title" 
          v-html="content.stupid_cta.title"
        ></div>
        <button v-if="content.stupid_cta.action" @click="processAction(content.stupid_cta.action)" class="action">{{ content.stupid_cta.action.label }}</button>
      </div>
      <div v-if="content.stupid_cta.sticker" class="sticker">
        <BaseImage :data="content.stupid_cta.sticker" />
      </div>
    </section>
    <start-page-reviews
      :class="{ white: true }"
      v-if="content.reviews"
      :reviews="content.reviews"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from "vue";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
import { StandardPopupInfo, Option } from "@/types";
import utils from "@/utils";
import structure from "@/structure";
import StartPageReviews from "./StartPageReviews.vue";

type ComponentScrollBits = {
  sizesListAtStart: boolean;
  sizesListAtEnd: boolean;
  sizesList: HTMLElement;
};
const onSizeMenuScroll = utils.toThrottled((self: ComponentScrollBits) => { 
  const { x } = utils.getScrollAlpha(self.sizesList);
  self.sizesListAtStart = x <= 0.0;
  self.sizesListAtEnd = x >= 1.0;
}, 200);

export default defineComponent({
  name: "BatLanding",
  components: {
    StartPageReviews,
  },
  computed: {
    ...mapState(["currentProduct", "models", "objectIDMap"]),
    ...mapGetters({
      product: "getProduct",
      content: "getPreConfigData",
    }),
  },
  data() {
    return {
      selectedTurn: "",
      selectedLength: "",
      turnBranch: "",
      lengthBranch: "",
      selectionMenuIsNarrow: false,
      selectionMenuSizeTracker: null as Function | null,
      selectionMenuScrollTracker: null as Function | null,
      sizesListAtStart: false,
      sizesListAtEnd: false,
    };
  },
  methods: {
    ...mapMutations([
      "setConfiguratorMode",
      "setConfiguratorPage",
      "setCurrentModel",
      "setStandardPopup",
    ]),
    ...mapActions(["onDataStepComplete", "switchModelData", "fetchModelData"]),
    processAction(action: { action: string; target: string; href?: string; label: string; style?: string; title?: string; content?: string }) {
      if (action.action == "scroll") {
        const targetEl = document.querySelector(action.target);
        if (!targetEl) return;
        targetEl.scrollIntoView({ behavior: "smooth" });
      } else if (action.action == "navigate") {
        if (action.target == "build") {
          this.goStraightToConfigurator();
          this.onDataStepComplete({
            id: "objects",
            callback: () => {
              // Automatically open the size selection popup
              setTimeout(() => {
                const openControls3dTutorial = !sessionStorage.getItem("__viewedControls3dTutorial");
                if (openControls3dTutorial) {
                  this.$store.state.showControls3DTutorial = true;
                  sessionStorage.setItem("__viewedControls3dTutorial", "1");
                } else {
                  document.querySelector("#bat-construction")?.dispatchEvent(new MouseEvent("click"));
                }
              }, 400);
            },
          });
        }
      } else if (action.action == "popup") {
        this.setStandardPopup({
          title: action.title,
          content: action.content,
        });
      }
    },
    setSelectedSizeData(turn: string, length: string, turnBranch: string, lengthBranch: string) {
      this.selectedTurn = turn;
      this.selectedLength = length;
      this.turnBranch = turnBranch;
      this.lengthBranch = lengthBranch;
      // Wait a few frames and then jump to the configurator
      setTimeout(this.customizeSelectedSize, 200);
    },
    openInfoPopup(info: StandardPopupInfo) {
      this.setStandardPopup(info);
    },
    async goStraightToConfigurator() {
      const model = this.product.models[0];
      if (model) {
        this.setCurrentModel(model);
        this.switchModelData();
        this.setConfiguratorMode("blank");
        this.setConfiguratorPage("build");
      }
    },
    sizeListNav(offset: number) {
      if (!this.sizesList) return;
      const children = Array.from(this.sizesList.children);
      let eclipsedCardIndex = -1;
      for (let i = children.length - 1; i >= 0; i--) {
        const rect = children[i].getBoundingClientRect();
        if (offset > 0 ? rect.left <= 0 : rect.left < 0) {
          eclipsedCardIndex = i;
          break;
        }
      }
      const targetIndex = eclipsedCardIndex + offset;
      if (targetIndex < 0) {
        utils.smoothScroll({ left: 0, top: 0 }, 400, this.sizesList);
      } else {
        const targetCard = this.sizesList.children[eclipsedCardIndex + offset];
        if (!targetCard) return;
        utils.smoothScroll(targetCard, 400, this.sizesList);
      }
    },
    customizeSelectedSize() {
      if (!this.selectedTurn || !this.selectedLength || !this.turnBranch || !this.lengthBranch) return; 
      const selectedTurn = this.selectedTurn;
      const selectedLength = this.selectedLength;
      const turnBranch = this.turnBranch;
      const lengthBranch = this.lengthBranch;
      if (this.product.models.length < 2) {
        // Wait till the objects are loaded, then set the size options into the configurator
        this.onDataStepComplete({
          id: "objects",
          callback: () => {
            const objectIDMap = this.$store.state.objectIDMap;
            // Now grab the casing by using the branch ID and set it's value
            const turnCasing = structure.branch(turnBranch);
            const lengthCasing = structure.branch(lengthBranch);
            if (
              turnCasing && 
              objectIDMap[selectedTurn] && 
              lengthCasing && 
              objectIDMap[selectedLength]
            ) {
              turnCasing.value = objectIDMap[selectedTurn] as Option;
              turnCasing.userInteraction = true;
              lengthCasing.value = objectIDMap[selectedLength] as Option;
              lengthCasing.userInteraction = true;
            }
            // Automatically open the controls tutorial
            setTimeout(() => {
              const openControls3dTutorial = !sessionStorage.getItem("__viewedControls3dTutorial");
              if (openControls3dTutorial) {
                this.$store.state.showControls3DTutorial = true;
                sessionStorage.setItem("__viewedControls3dTutorial", "1");
              }
            }, 200);
          },
        });
        this.goStraightToConfigurator();
      } else {
        console.warn("You need to add a menu for selecting models");
      }
    },
    onSizeMenuScroll() {
      onSizeMenuScroll(this as any);
    }
  },
  setup() {
    const sizesList = ref<HTMLElement | null>(null);
    return {
      sizesList,
    };
  },
  mounted() { 
    // Track when the size menu is narrower than the viewport
    // so that the scrol arrows don't need to be shown
    this.selectionMenuSizeTracker = utils.toThrottled(() => {
      const rect = this.sizesList?.getBoundingClientRect();
      if (rect && rect.width < innerWidth) {
        this.selectionMenuIsNarrow = true;
      } else {
        this.selectionMenuIsNarrow = false;
      }
    }, 400);
    window.addEventListener('resize', this.selectionMenuSizeTracker as any);
    this.selectionMenuSizeTracker();
    // Observe the sizes list to determine if we are at one end
    // or the other so we can hide unecessary arrows
    if (this.sizesList) {
      this.sizesList.addEventListener('scroll', this.onSizeMenuScroll);
      this.onSizeMenuScroll();
    }
  },
  beforeUnmount() {
    // Remove the event listener that tracks if the sizes menu is
    // narrower than the viewport
    if (this.sizesList && this.selectionMenuSizeTracker) {
      window.removeEventListener('resize', this.selectionMenuSizeTracker as any);
    }
    // End observing if we are at either scroll end of the sizes
    // menu list
    if (this.sizesList) {
      this.sizesList.removeEventListener('scroll', this.onSizeMenuScroll);
    }
  }
});
</script>

<style lang="scss" scoped>
.bat-landingpage-template {
  opacity: 1;
  background-color: #f3f3f3;
  display: flex;
  flex-direction: column;
  & :deep(img) {
    max-width: 100%;
    display: block;
  }
}

.action {
  border: 2px solid $orange;
  border-radius: 1000px;
  color: #fff;
  font: 700 14px/1em $fnt-ev;
  letter-spacing: 0.053em;
  padding: 1.1em 1.4em 0.9em;
  min-width: 210px;
  background-color: $orange;
  appearance: none;
  cursor: pointer;
  user-select: none;
  text-transform: uppercase;
  box-shadow: 0 2px 4px 0px #0000;
  transition: box-shadow 0.22s linear;
  &.style-outline {
    background-color: #fff;
    color: $orange;
  }
  &.color-blue {
    background-color: $blue;
    border-color: $blue;
    &.style-outline {
      background-color: #fff;
      color: $blue;
    }
  }
  @media (min-width: $small-width-up) {
    &:hover {
      box-shadow: 0 2px 6px 0px #0005;
    }
  }
}

.hero {
  padding: 50px 0;
  position: relative;
  @media(max-width: $small-width) {
    padding: 36px 0;
  }

  > * {
    position: relative;
  }
  .background {
    position: absolute;
    inset: 0;
    background-color: #000;
    display: flex;
    justify-content: center;
    img {
      display: block;
      object-fit: cover;
    }
  }

  h1 {
    margin-bottom: 16px;
    color: #fff;
    position: relative;
  }
  .title-pre {
    font: 400 21px/1em $fnt-cm;
    letter-spacing: 0.17em;
    text-transform: uppercase;
    margin-right: 0.3em;
    font-size: 1px;
    color: #0000;
    position: absolute;
  }
  .title-paz {
    width: 364px;
    max-width: calc(100% - 24px);
    aspect-ratio: 391/140;
    display: inline-block;
    font-size: 1px;
    color: #0000;
    background: no-repeat center / contain url(../../assets/showbats-logo-dumb.svg);
    margin-inline: 12px;
  }
  .hero-media {
    width: 1715px;
    margin-inline: auto;
    margin-top: 16px;
    @media (max-width: 2000px) {
      width: 85.7vw;
    }
    @media (max-width: 900px) {
      width: 90vw;
    }
    @media (max-width: 800px) {
      width: 96vw;
    } 
    &.video {
      $mask: linear-gradient(180deg, #0000 0%, #000 10%, #000 90%, #0000 100%);
      -webkit-mask: $mask;
      mask: $mask;
    }
    img {
      margin: 0 auto;
    }
    video {
      max-width: 100%;
      display: block;
      width: 100%;
      height: auto;
      $mask: linear-gradient(90deg, #0000 0%, #000 3%, #000 97%, #0000 100%);
      -webkit-mask: $mask;
      mask: $mask;
      aspect-ratio: 7;
      object-fit: cover;
    }
  }
  .hero-actions {
    color: #fff;
  }
  .call-to-action {
    font: 400 12px/1.25em $fnt-cm;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .actions {
    padding-top: 18px;
    display: flex;
    justify-content: center;
    gap: 10px;
  }
}

.sizes {
  background-color: #000;

  .sizes-wrap {
    width: fit-content;
    max-width: 100%;
    margin-inline: auto;
    position: relative;
    padding-top: 44px;
    padding-bottom: 48px;
    @media (max-width: $small-width) {
      padding-top: 24px;
      padding-bottom: 24px;
    }
  }

  .size-nav {
    border: none;
    background-color: #a7a9ac85;
    font-size: 0;
    padding: 0;
    margin: 0;
    appearance: none;
    cursor: pointer;
    width: 36px;
    aspect-ratio: 1;
    position: relative;
    border-radius: 50%;
    transition: background-color 0.22s;
    position: absolute;
    top: calc(50% - 18px);
    --hor-pos: 25px;
    @media (min-width: $small-width-up) {
      --hor-pos: 16px;
      &:hover {
        background-color: #a7a9ac;
      }
    }

    &::before {
      content: "";
      position: absolute;
      inset: 0;
      background-color: #000;
      $mask: var(--arrow) no-repeat var(--arrow-pos) 50% / 33.333% auto;
      -webkit-mask: $mask;
      mask: $mask;
    }
    &.prev {
      --arrow: url(../../assets/left-arrow.svg);
      --arrow-pos: 40%;
      left: var(--hor-pos);
    }
    &.next {
      --arrow: url(../../assets/right-arrow.svg);
      --arrow-pos: 60%;
      right: var(--hor-pos);
    }
  }
  .is-narrower-than-view .size-nav,
  .sizes-wrap.is-start .size-nav.prev,
  .sizes-wrap.is-end .size-nav.next {
    display: none;
  }
  .sizes-list {
    display: flex;
    overflow: auto;
    padding: 0 42px;
    gap: 20px;
    @media (max-width: $small-width) {
      padding: 0 32px;
      gap: 12px;
    }
  }
  .size-card {
    width: 276px;
    flex-shrink: 0;
    display: grid;
    border: 7px solid #fff;
    padding-bottom: 15px;
    position: relative;
    grid-template-rows: auto auto 1fr auto;
    grid-template-columns: 24px 68px 1fr 24px;
    column-gap: 0;
    box-sizing: border-box;
    background-color: #fff;
    border-radius: 19px;
    .turn {
      grid-column: 1/5;
      grid-row: 1/2;
      font: 700 40px/1em $fnt-jb;
      background-color: #000;
      color: #fff;
      border-top-left-radius: 14px;
      border-top-right-radius: 14px;
      padding: 20px 8px 12px;
      margin-bottom: 16px;
    }
    .details {
      grid-column: 3/4;
      grid-row: 2/3;
      font: 300 10px/1.25em $fnt-cm;
      letter-spacing: 0em;
      color: #000;
      text-transform: uppercase;
      margin-top: 1.4em;
      :deep(a) {
        color: $orange;
        text-decoration: underline;
      }
      :deep(ul) {
        list-style: none;
        line-height: 1.4;
        li::before {
          content: "•";
          display: inline-block;
          width: 1em;
          margin-left: -1em;
        }
      }
    }
    .lengths {
      grid-column: 3/4;
      grid-row: 3/4;
      padding-top: 20px;
      display: flex;
      flex-direction: column;
      .lengths-cta {
        font: 400 26px/1.2em $fnt-fh;
        letter-spacing: 0em;
        text-transform: lowercase;
        color: $orange;
        margin-bottom: 8px;
        order: 1;
      }
      &::before {
        content: "";
        display: block;
        width: 110px;
        height: 10px;
        border: 1px solid #000;
        border-bottom: none;
        margin: 0 auto 8px;
        order: 2;
      }
      .lengths-list {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        order: 3;
        padding-top: 4px;
      }
      .length {
        width: calc((100% - 20px) / 3);
        aspect-ratio: 1;
        background-color: $orange;
        box-sizing: border-box;
        border-radius: 50%;
        font: 900 12px/1em $fnt-ev;
        box-shadow: 0 2px 4px 0px #0000;
        transition: box-shadow 0.22s linear;
        body:is(.browser-safari, .browser-mobile-safari) & {
          position: relative;
          aspect-ratio: initial;
          &::before {
            content: "";
            display: block;
            padding-top: 100%;
          }
        }
        @media (min-width: $small-width-up) {
          &:hover {
            box-shadow: 0 2px 6px 0px #0005;
          }
        }

        input {
          display: none;
        }
        label {
          display: flex;
          width: 100%;
          height: 100%;
          padding-top: 1px;
          box-sizing: border-box;
          justify-content: center;
          align-items: center;
          color: #fff;
          cursor: pointer;
          position: relative;
          isolation: isolate;
          user-select: none;
          body:is(.browser-safari, .browser-mobile-safari) & {
            position: absolute;
            inset: 0;
          }
          &::before {
            content: "";
            position: absolute;
            z-index: -1;
            inset: 2px;
            background-color: #fff;
            border-radius: 50%;
            transform: scale(0);
            transition: transform 0.22s;
          }
        }
        input:checked + label {
          color: $orange;
          &::before {
            transform: scale(1);
          }
        }
      }
      .length-message {
        font: 400 10px/1.2 $fnt-ev;
        text-transform: uppercase;
        letter-spacing: 0.053em;
        color: #000;
        text-align: center;
        width: 100%;
      }
    }
    .preview {
      grid-column: 2/3;
      grid-row: 2/5;
      display: flex;
      justify-content: center;
      margin-right: 20px;
    }
    .customize {
      margin-top: 12px;
      max-height: 0px;
      overflow: hidden;
      transition: max-height 0.22s ease 0.1s, opacity 0.12s linear;
      opacity: 0;
      grid-column: 3/4;
      grid-row: 4/5;
      &.visible {
        max-height: 42px;
        opacity: 1;
        transition: max-height 0.2s ease, opacity 0.3s linear 0.2s;
      }

      button {
        margin-bottom: 6px;
      }
    }
    .info {
      border: none;
      appearance: none;
      background-color: initial;
      position: absolute;
      top: 14px;
      right: 14px;
      width: 16px;
      height: 16px;
      background-color: #fff;
      $mask: url(../../assets/info.svg) no-repeat center / contain;
      -webkit-mask: $mask;
      mask: $mask;
      font-size: 0;
      cursor: pointer;
    }
  }
}

.stupid-cta {
  position: relative;
  background-color: #000;
  display: flex;
  flex-direction: column;
  padding: 110px 40px 44px;
  min-height: min(100vw, 1000px);
  box-sizing: border-box;
  @media (max-width: $small-width) {
    padding: calc(66px + 7.33vw) 6.666vw 7.33vw;
  }

  > * {
    position: relative;
    z-index: 1;
  }

  .background {
    position: absolute;
    inset: 0;
    z-index: 0;
    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .desktop-img {
      display: none;
      @media (min-width: $large-width-up) {
        display: block;
      }
    }
    .mobile-img {
      display: block;
      @media (min-width: $large-width-up) {
        display: none;
      }
    }
  }

  .content {
    flex-grow: 1;
    padding-bottom: 24px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    flex-direction: column; 
    justify-content: center;
  }
  .title {
    font: 500 90px/1em $fnt-nk;
    letter-spacing: 0.065em;
    color: #fff;
    @media (max-width: $medium-width) {
      font-size: 12vw;
    }
    @media (max-width: $xsmall-width) {
      font-size: 48px;
    }
    :deep(.ttm) {
      font-family: $fnt-cm;
      font-weight: 700;
    }
  }
  .action {
    margin-top: 16px;
    color: $orange;
    background-color: #fff;
    border-color: #fff;
  }

  .sticker {
    img {
      height: 66px;
      width: auto;
      display: block;
    }
  }
}

.quad-medias {
  max-width: 1000px;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  padding: min(7.2%, 72px) max(min(7.2%, 72px), 50vw - 500px);

  .quad-media {
    padding-top: 42.1545%;
    position: relative;
    margin-bottom: 2.5765%;
    &.media-alt-0 {
      width: 42.1545%;
    }
    &.media-alt-1 {
      width: 55.269%;
    }
    &.no-margin {
      margin-bottom: 0;
    }
    img, video {
      position: absolute;
      top: 0;
      left: 0;
      display: block;
      object-fit: cover;
      width: 100%;
      height: 100%;
    }
  }
}

.big-image {
  position: relative;
  overflow: hidden;

  img, video {
    display: block;
    width: 100%;
  }

  .background {
    position: absolute;
    top: -14px;
    left: -14px;
    width: calc(100% + 28px);
    height: calc(100% + 28px);
    object-fit: cover;
    filter: blur(7px) brightness(0.6);
    max-width: initial;
  }
  .image, .video {
    height: auto;
    position: relative;
  }
  &.has-bg {
    background-color: #000;
    .image {
      max-width: 1000px;
      margin-inline: auto;
    }
  }

  a {
    position: absolute;
    inset: 0;
    cursor: pointer;
  }
}

.text-cta-side-media {
  display: flex;
  padding-inline: calc(50vw - 500px);
  background-color: #d8d9d9;
  &.right {
    @media (min-width: $medium-width-up) {
      flex-direction: row-reverse;
    }
  }

  @media (max-width: $medium-width) {
    flex-direction: column-reverse;
  }

  .text-cta {
    width: 45.2%;
    padding: 7.6%;
    box-sizing: border-box;
    text-align: left;
    display: flex;
    flex-direction: column;
    @media (max-width: $medium-width) {
      width: 100%;
      padding-top: 3%;
    }
  }
  .sub-title {
    font: 700 16px/1.25 $fnt-cm;
    letter-spacing: 0.065em;
    text-transform: uppercase;
  }
  .title {
    font: 500 38px/1 $fnt-nk;
    letter-spacing: 0.065em;
    text-transform: uppercase;
  }
  .copy {
    font: 300 14px/1.2 $fnt-cm;
  }
  .action {
    margin-top: 24px;
    align-self: flex-start;
  }
  .sticker {
    margin-top: auto;
    padding-top: 24px;
    img {
      height: 66px;
      width: auto;
      display: block;
    }
  }
  .side-media {
    width: 54.8%;
    align-self: center;
    @media (max-width: $medium-width) {
      width: 100%;
      max-width: 548px;
      align-self: flex-end;
      .right {
        align-self: flex-start;
      }
    }
  }
  @media (max-width: $medium-width) {
    &.right .side-media {
      align-self: flex-start;
    }
  }
}

#torpedo-media {
  background-color: #000;
  img, video {
    display: block;
    width: 100%;
    height: auto;
  }
}
</style>
