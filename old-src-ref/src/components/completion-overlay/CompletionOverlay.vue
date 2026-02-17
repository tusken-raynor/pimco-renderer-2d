<template>
  <div
    id="completion-overlay"
    v-if="render"
    :class="{ show }"
    @click="closeOverlay"
  >
    <div
      :class="[
        'list-wrapper',
        'fix-scrollbar',
        { show, 'show-incomplete': showIncompleted },
      ]"
      @click.stop
    >
      <attribute
        v-for="(attr, key, i) in productSelectedOptions"
        :key="key"
        :label="key"
        :index="i"
        :attribute="attr"
      />
    </div>
    <div class="close-btn">
      <div class="x-pattern"></div>
    </div>
  </div>
</template>

<script lang="ts">
import utils from "@/utils";
import { defineComponent } from "vue";
import { mapGetters, mapMutations, mapState } from "vuex";
import Attribute from "./Attribute.vue";
export default defineComponent({
  name: "CompletionOverlay",
  components: {
    Attribute,
  },
  computed: {
    ...mapState([
      "renderCompletionOverlay",
      "selectedOptions",
      "currentProduct",
      "showIncompleted",
    ]),
    ...mapGetters({
      attributes: "getFilteredAttributes",
    }),
    productSelectedOptions(): any {
      if (this.selectedOptions && this.currentProduct) {
        const attrNames: string[] = this.attributes.map((x: any) => x.name);
        return utils.filterObject(
          this.selectedOptions[this.currentProduct].selections,
          (c, name) => attrNames.includes(name)
        );
      }
      return {};
    },
  },
  data() {
    return {
      show: false,
      render: false,
    };
  },
  methods: {
    ...mapMutations(["setCompletionOverlayRender"]),
    closeOverlay() {
      this.setCompletionOverlayRender(false);
    },
  },
  watch: {
    renderCompletionOverlay(val) {
      if (val) {
        this.render = true;
        requestAnimationFrame(() => {
          // Grab an extra frame for some browsers
          requestAnimationFrame(() => {
            this.show = true;
          });
        });
      } else {
        this.show = false;
        setTimeout(() => {
          this.render = false;
        }, 400);
      }
    },
  },
});
</script>

<style lang="scss" scoped>
#completion-overlay {
  z-index: 200;
  background-color: #0000008e;
  opacity: 0;
  transition: opacity 0.3s ease 0.1s, height 0.16s ease;
  position: fixed;
  top: 0;
  bottom: 0;
  right: 0;
  left: 0;
  &.show {
    opacity: 1;
    transition: opacity 0.3s ease, height 0.16s ease;
  }
  .list-wrapper {
    position: absolute;
    right: 0;
    top: 0;
    height: 100%;
    width: 100%;
    max-width: 430px;
    background-color: #fff;
    opacity: 0;
    transform: translateX(60px);
    transition: opacity 0.2s linear, transform 0.2s ease;
    padding: 34px 36px 62px;
    box-sizing: border-box;
    text-align: left;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    @media (max-width: 375px) {
      padding-left: 9.6vw;
      padding-right: 9.6vw;
    }
    &.show {
      opacity: 1;
      transform: translateX(0);
      transition: opacity 0.2s linear 0.2s, transform 0.2s ease 0.2s;
    }
  }
  .close-btn {
    position: absolute;
    top: 0;
    right: 0;
    width: 56px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    .x-pattern {
      width: 22px;
      height: 22px;
    }
  }
}
</style>