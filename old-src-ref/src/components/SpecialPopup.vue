<template>
  <transition name="fade" appear>
    <div
      v-if="popup"
      id="special-popup"
      :class="['shadow', 'type-' + popup.mode]"
      @click="closePopup"
    >
      <div class="modal-wrapper">
        <spec-popup-plus
          v-if="popup.mode?.startsWith('fnp_')"
          class="modal"
          :popup="popup"
          @click.stop
        >
          <div class="exit-btn x-pattern" @click="closePopup"></div>
        </spec-popup-plus>
        <div v-else class="modal" @click.stop>
          <div class="title">{{ popup.title }}</div>
          <div v-if="popup.message" class="message" v-html="popup.message"></div>
          <div v-if="popup.mode == 'share'" class="share-wrapper">
            <div class="social-buttons">
              <a
                :href="'https://www.facebook.com/sharer.php?u=' + encodedShareURL"
                class="facebook-share share-icon"
                target="_blank"
              ></a>
              <a
                :href="'https://twitter.com/intent/tweet?url=' + encodedShareURL"
                class="twitter-share share-icon"
                target="_blank"
              ></a>
              <a
                :href="
                  'mailto:?subject=Custom Nokona ' +
                  productNameSingular +
                  '&body=Check out this custom ' +
                  productNameSingular.toLowerCase() +
                  ': ' +
                  defaultShareURL
                "
                class="email-share share-icon"
              ></a>
            </div>
            <div class="copy-wrapper">
              <div class="share-url" ref="shareUrl">{{ shortShareURL }}</div>
              <div :class="['copy-btn', { copied }]" @click="shareUrlCall">
                {{ copied ? "copied" : "copy" }}
              </div>
            </div>
          </div>
          <div v-else-if="popup.mode == 'startover'" class="share-wrapper">
            <div class="buttons">
              <div class="cancel-btn" @click="cancel">
                {{ popup.cancel?.label || "cancel" }}
              </div>
              <div class="confirm-btn" @click="confirm">
                {{ popup.confirm?.label || "confirm" }}
              </div>
            </div>
            <div v-if="!embedContext">
              <div class="to-save-message">
                If you would like to save this design, copy the link below.
              </div>
              <div class="copy-wrapper">
                <div class="share-url" ref="shareUrl">{{ shortShareURL }}</div>
                <div :class="['copy-btn', { copied }]" @click="copyAndSaveUrl">
                  {{ copied ? "copied" : "copy" }}
                </div>
              </div>
            </div>
          </div>
          <div
            v-else-if="popup.mode == 'colorplay' && popup.payload"
            class="color-play-popup"
          >
            <div
              v-for="color in popup.payload.colors"
              :key="color.name"
              :style="{ backgroundColor: color.hex }"
              :class="['color-option', { selected: color == selection }]"
              @click="setSelection(color, true)"
            ></div>
            <div
              class="select-confirm"
              @click="selectionPass(popup.payload.select)"
            >
              select
            </div>
          </div>
          <div v-else class="buttons">
            <div v-if="!popup.cancel?.hide" class="cancel-btn" @click="cancel">
              {{ popup.cancel?.label || "cancel" }}
            </div>
            <div class="confirm-btn" @click="confirm">
              {{ popup.confirm?.label || "confirm" }}
            </div>
          </div>
          <div
            v-if="popup.mode == 'share' && undyingShare"
            class="dev-undying-save"
          >
            <label for="dev-undying-share">
              <input
                type="checkbox"
                id="dev-undying-share"
                v-model="undyingShareSelected"
              />
              <span>Session shall not expire for a millenia</span>
            </label>
          </div>
          <div class="exit-btn x-pattern" @click="closePopup"></div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script lang="ts">
import share from "@/share";
import { starters } from "@/store/initialize";
import { SpecialPopupInfo } from "@/types";
import utils from "@/utils";
import { defineComponent, ref, Ref } from "vue";
import { mapState, Computed, mapMutations, mapGetters, mapActions } from "vuex";
import SpecPopupPlus from "./spec-popup-plus/SpecPopupPlus.vue";
import params from "@/params";
export default defineComponent({
  components: { SpecPopupPlus },
  name: "SpecialPopup",
  computed: {
    ...mapState({ popup: "specialPopupInfo" }),
    ...mapGetters({
      shortShareURL: "getShortShareURL",
      defaultShareURL: "getShareURL",
      encodedShareURL: "getEncodedShareURL",
      productName: "getProductName",
    }),
    productNameSingular() {
      if (this.productName) {
        if (this.productName.endsWith("s")) {
          return this.productName.substring(0, this.productName.length - 1);
        }
        return this.productName;
      }
      return "Glove";
    },
    undyingShare(): boolean {
      return !!starters.dev;
    },
    embedContext(): string {
      return params.getString("embed");
    }
  },
  methods: {
    ...mapMutations(["removeSpecialPopup"]),
    ...mapActions(["saveSessionData", "storeData", "generateProductImages"]),
    closePopup() {
      this.undyingShareSelected = false;
      this.removeSpecialPopup();
    },
    cancel() {
      if (this.popup && this.popup.cancel && this.popup.cancel.callback) {
        this.popup.cancel();
      }
      this.closePopup();
    },
    confirm() {
      if (this.popup && this.popup.confirm && this.popup.confirm.callback) {
        this.popup.confirm.callback();
      }
      this.closePopup();
    },
    copyUrl() {
      if (this.shareUrl && !this.copied) {
        utils.copyToClipboard(this.defaultShareURL);
        this.copied = true;
        setTimeout(() => {
          this.copied = false;
        }, 4000);
      }
    },
    copyAndSaveUrl() {
      if (share.isSelectionUpdated()) {
        share.newSession();
        this.saveDataAndImages();
      }
      // Wait one frame for the input to rerender with the new session id
      requestAnimationFrame(() => {
        this.copyUrl();
      });
    },
    shareUrlCall() {
      // If we are showing the resilient session controls
      // then the session data hasn't been pushed to the server yet
      if (this.undyingShare) {
        this.saveDataAndImages();
      }
      this.copyUrl();
    },
    saveDataAndImages() {
      this.generateProductImages({
        number: 1,
        size: 1000,
        callback: (urls: string[]) => {
          this.saveSessionData({ dataURLs: urls });
        }
      });
    },
    setSelection(value: any, toggle = false) {
      if (toggle && this.selection == value) {
        this.selection = null;
      } else {
        this.selection = value;
      }
    },
    selectionPass(callback?: (selection: any) => void) {
      if (callback) {
        callback(this.selection);
      }
      this.closePopup();
    },
    onKeyPress(e: KeyboardEvent) {
      if (e.keyCode === 27) {
        // Hit the escape key
        this.cancel();
      } else if (e.keyCode === 13) {
        // Hit the enter key
        this.confirm();
      }
    },
  },
  setup() {
    const shareUrl: Ref<HTMLElement | null> = ref(null);
    const copied: Ref<boolean> = ref(false);
    const selection: Ref<any> = ref(null);
    const undyingShareSelected: Ref<boolean> = ref(false);
    return { shareUrl, copied, selection, undyingShareSelected };
  },
  watch: {
    popup(popup: SpecialPopupInfo) {
      const open = Boolean(popup);
      if (!open) {
        this.selection = null;
      } else if (popup.mode == "colorplay") {
        this.selection = popup.payload.current;
      }
    },
    undyingShareSelected(val: boolean) {
      if (val) {
        share.createResilientSession();
      } else {
        share.resetResilientSession();
      }
      this.storeData();
    },
  },
  mounted() {
    document.addEventListener("keyup", this.onKeyPress);
  },
  beforeUnmount() {
    document.removeEventListener("keyup", this.onKeyPress);
  },
});
</script>

<style lang="scss">
#special-popup {
  background-color: rgba(0, 0, 0, 0.808);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 200;
  overflow: auto;
  .modal-wrapper {
    min-height: 100%;
    min-width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .modal {
    position: relative;
    border: 1px solid #707070;
    border-radius: 4px;
    background-color: #fff;
    padding: 18px 35px;
    text-align: left;
    width: calc(100% - 15px);
    max-width: 340px;
    box-sizing: border-box;
    @media (min-width: $small-width-up) {
      max-width: 460px;
    }
    .title {
      font: 500 20px/120% $fnt-cm;
      margin-right: 20px;
      border-bottom: 1px solid #d8d6d2;
      display: inline-block;
      min-width: 214px;
      margin-bottom: 15px;
      padding-bottom: 10px;
      @media (min-width: $small-width-up) {
        font-size: 28px;
        padding-right: 30px;
        margin-bottom: 20px;
      }
    }
    .message,
    .to-save-message {
      font: 300 12px/133.333% $fnt-cm;
      @media (min-width: $small-width-up) {
        font-size: 17px;
      }
      .orange {
        color: $orange;
      }
    }
    .to-save-message {
      padding: 1.5em 0 1em;
    }
    .buttons {
      display: flex;
      justify-content: center;
      margin: 28px -13px 0;
      .confirm-btn,
      .cancel-btn {
        font: 14px/164.857% $fnt-ev;
        border: 2px solid;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1 1;
        text-transform: uppercase;
        color: #fff;
        transition: background-color 0.2s linear, color 0.2s linear;
        cursor: pointer;
      }
      .confirm-btn {
        background-color: $orange;
        border-color: $orange;
        margin-left: 8px;
        @media (min-width: $small-width-up) {
          &:hover {
            background-color: #fff;
            color: $orange;
          }
        }
      }
      .cancel-btn {
        background-color: #d8d6d2;
        border-color: #d8d6d2;
        margin-right: 8px;
        @media (min-width: $small-width-up) {
          &:hover {
            background-color: #fff;
            color: #d8d6d2;
          }
        }
      }
    }
    .share-wrapper {
      .social-buttons {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px 0 25px;
        .share-icon {
          width: 36px;
          height: 36px;
          margin: 0 5px;
          border-radius: 8px;
          cursor: pointer;
          @media (min-width: $small-width-up) {
            width: 52px;
            height: 52px;
            box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
            transition: box-shadow 0.2s linear, filter 0.2s linear;
            &:hover {
              box-shadow: 0 0 6px 1px rgba(0, 0, 0, 0.438);
            }
          }
        }
        .facebook-share {
          background: url("../assets/facebook-lrg.svg") no-repeat center/contain;
        }
        .twitter-share {
          background: url("../assets/twitter-lrg.svg") no-repeat center/contain;
        }
        .email-share {
          background: url("../assets/email-lrg.svg") no-repeat center/contain;
        }
      }
      .copy-wrapper {
        height: 40px;
        display: flex;
        margin-bottom: 12px;
        .share-url {
          flex-grow: 1;
          border: 1px solid #707070;
          border-right: none;
          font: 12px/20px $fnt-cm;
          color: #d8d6d2;
          padding: 3px 6px;
          display: flex;
          align-items: center;
          white-space: nowrap;
          overflow: hidden;
          @media (min-width: $small-width-up) {
            font-size: 16px;
          }
        }
        .copy-btn {
          padding: 8px;
          min-width: 96px;
          text-align: center;
          background-color: $orange;
          border: 2px solid $orange;
          font: 14px/164.857142% $fnt-ev;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: #fff;
          cursor: pointer;
          user-select: none;
          transition: background-color 0.2s linear, color 0.2s linear;
          &.copied {
            background-color: #fff;
            color: $orange;
          }
          @media (min-width: $small-width-up) {
            &:hover {
              background-color: #fff;
              color: $orange;
            }
          }
          @media (max-width: 350px) {
            min-width: calc((100vw - 254px));
          }
          @media (max-width: 300px) {
            min-width: initial;
          }
        }
      }
      .buttons {
        margin-left: 0;
        margin-right: 0;
      }
    }
    .color-play-popup {
      box-sizing: border-box;
      display: flex;
      flex-wrap: wrap;
      .color-option {
        width: 12.6%;
        padding-top: 12.6%;
        height: 0;
        border-radius: 50%;
        margin: 2%;
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        transition: transform 0.25s ease-in-out;
        @media (max-width: $small-width) {
          width: 21%;
          padding-top: 21%;
        }
        cursor: pointer;
        &::after {
          content: "";
          width: 50%;
          padding-top: 50%;
          background-color: #fff;
          position: absolute;
          top: 25%;
          border-radius: 50%;
          transform: scale(0);
          transition: all 0.2s cubic-bezier(0.6, -0.28, 0.735, 0.045);
        }
        &.selected:after {
          transform: scale(1);
          transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
      }
      .select-confirm {
        height: 40px;
        width: 110px;
        border: 2px solid $red;
        background-color: $red;
        color: #fff;
        padding-top: 3px;
        box-sizing: border-box;
        margin: 7.4% calc(50% - 57px) 2.7%;
        font: 700 16px/133% $fnt-cm;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        cursor: pointer;
        text-transform: uppercase;
        @media (min-width: $medium-width-up) {
          transition: color 0.2s linear, background-color 0.2s linear;
          &:hover {
            background-color: #fff;
            color: $red;
          }
        }
      }
    }
    .exit-btn {
      position: absolute;
      top: 14px;
      right: 18px;
      width: 16px;
      height: 16px;
      cursor: pointer;
      @media (min-width: $small-width-up) {
        width: 25px;
        height: 25px;
        &::before,
        &::after {
          transition: background-color 0.2s ease;
        }
        &:hover {
          &::before,
          &::after {
            background-color: $orange;
          }
        }
      }
    }
  }
  &.fade-enter-to {
    transition: opacity 0.2s ease;
  }

  &.type-fnp_email-default,
  &.type-fnp_thankyou-default {
    @media (max-width: $small-width) {
      flex-direction: column;
      justify-content: flex-start;
      padding: 36px 0;
    }
    .modal {
      padding: 0;
      max-width: 800px;
      @media (max-width: $small-width) {
        max-width: 436px;
      }
    }
    .exit-btn {
      @media (min-width: $small-width-up) {
        width: 16px;
        height: 16px;
      }
      top: 8px;
      right: 8px;
    }
  }
}

.dev-undying-save label {
  display: flex;
  align-items: center;
  cursor: pointer;
  > input {
    margin-right: 10px;
    filter: hue-rotate(180deg) saturate(400%);
    cursor: pointer;
  }
  > span {
    margin-top: 4px;
  }
}
</style>
