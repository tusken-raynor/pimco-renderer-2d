<template>
  <transition name="fade" appear>
    <div v-if="popup" id="standard-popup" class="shadow" @click="closePopup">
      <div class="modal-wrapper">
        <div :class="['modal', { 'no-title': !popup.title }]" @click.stop>
          <div class="title" v-html="popup.title"></div>
          <div v-if="popup.title || popup.image" :class="[popup.image ? 'image' : 'separator']">
            <BaseImage v-if="popup.image" :data="popup.image" />
          </div>
          <div
            v-if="popup.content"
            class="content"
            v-html="popup.content"
          ></div>
          <div class="exit-btn x-pattern" @click="clickExitBtn"></div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapState, mapMutations } from "vuex";
export default defineComponent({
  name: "StandardPopup",
  computed: {
    ...mapState({ popup: "standardPopupInfo" }),
  },
  methods: {
    ...mapMutations(["removeStandardPopup"]),
    closePopup() {
      this.removeStandardPopup();
    },
    clickExitBtn() {
      if (this.popup.onClose) {
        this.popup.onClose();
      } else {
        this.closePopup();
      }
    },
    onKeyPress(e: KeyboardEvent) {
      if (e.keyCode === 27 || e.keyCode === 13) {
        // Hit the escape key or enter key
        this.closePopup();
      }
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
#standard-popup {
  background-color: rgba(0, 0, 0, 0.808);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 200;
  overflow: auto;
  .modal-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100%;
    min-width: 100%;
  }
  .modal {
    position: relative;
    border: 1px solid #707070;
    border-radius: 4px;
    background-color: #fff;
    padding: 18px 18px 30px;
    text-align: left;
    width: 66.666666%;
    min-width: 220px;
    max-width: 600px;
    box-sizing: border-box;
    &.no-title {
      padding-top: 38px;
    }
    @media (max-width: $small-width) {
      width: 400px;
      max-width: 100%;
    }
    @media (min-width: $large-width) {
      padding: 40px 32px 36px;
      &.no-title {
        padding-top: 48px;
      }
    }
    .title {
      font: 500 20px/120% $fnt-cm;
      padding-right: 20px;
      @media (min-width: $small-width-up) {
        font-size: 28px;
        padding-right: 30px;
      }
    }
    .separator {
      border-bottom: 1px solid #d8d6d2;
      margin: 10px 0 18px;
      @media (min-width: $small-width-up) {
        margin: 15px 0 27px;
      }
    }
    .image {
      margin: 12px 0 28px;
      img {
        max-width: 100%;
        display: block;
        margin: 0 auto;
      }
    }
    .content {
      font: 300 12px/133.333% $fnt-cm;
      @media (min-width: $small-width-up) {
        font-size: 17px;
      }
      .orange {
        color: $orange;
      }
      p {
        margin-bottom: 1.2em;
      }
      h2,
      h3,
      h4 {
        font-weight: 700;
        line-height: 120%;
        margin-bottom: 0.5em;
      }
      h2 {
        font-size: 20px;
      }
      h3 {
        font-size: 18px;
      }
      h4 {
        font-size: 16px;
      }
      a[href] {
        color: $orange;
        text-decoration: underline #0000;
        transition: text-decoration-color 0.2s linear;
        &:hover {
          text-decoration-color: $orange;
        }
      }
      img {
        max-width: 100%;
        display: block;
        margin: 0 auto;
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
}
</style>