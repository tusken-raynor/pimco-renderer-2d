<template>
  <div class="grand-selector fix-scrollbar">
    <div class="sub-attributes">
      <grand-sub-attribute
        v-for="(sub, i) in subattributes"
        :key="sub.id"
        :sub="sub"
        :open="i == openSection"
        :select="() => clickDropdown(i)"
        :class="{ last: i == subattributes.length - 1 }"
        :index="i"
        @start-transition="busy = true"
        @end-transition="busy = false"
      />
    </div>
    <div class="next-button" @click="nextStep">{{ nextLabel }}</div>
    <div class="reactive-style" v-html="styleString"></div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { GrandAttribute, GrandSubAttribute } from "@/types";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
import GrandSubAttributeComp from "./GrandSubAttribute.vue";
import { OptionCasing } from "@/structure";
import restrictions from "@/restrictions";
import utils from "@/utils";
import { getApplicationValue } from "@/store/mutations";
export default defineComponent({
  name: "GrandSelector",
  components: {
    "grand-sub-attribute": GrandSubAttributeComp,
  },
  computed: {
    ...mapState([
      "objectIDMap",
      "windowHeight",
      "currentAttribute",
      "selectedOptions",
      "currentProduct",
    ]),
    ...mapGetters({
      attribute: "getAttribute",
      product: "getProduct",
      productComplete: "getProductCompletionMinimal",
      model: "getModel",
      restrictions: "getRestrictions",
      enablers: "getIndexedEnablers",
    }),
    subattributes(): Array<GrandSubAttribute> {
      if (this.attribute && this.attribute.attributes && this.objectIDMap) {
        return this.attribute.attributes
          .map((id: string) => this.objectIDMap[id])
          .filter((o: GrandSubAttribute) => {
            const isEnabled = utils.standardAttributeFilter(o, this.restrictions, this.enablers);
            const isVisible = !o.hidden;
            return isEnabled && isVisible;
          });
      }
      return [];
    },
    nextLabel(): string {
      if (this.model && this.currentAttribute && this.selectedOptions) {
        if (
          this.currentAttribute == this.model.attributes.length - 1 &&
          this.productComplete
        ) {
          return "review " + this.singularProductName;
        }
      }
      return "next";
    },
    singularProductName(): string {
      if (this.product) {
        if (this.product.name.endsWith("s")) {
          return this.product.name.slice(0, -1);
        } else {
          return this.product.name;
        }
      }
      return "";
    },
    styleString(): string {
      return `<style>
              .grand-selector {
                height: ${this.windowHeight - 120}px;
              }
              @media (max-width: 600px) {
                .grand-selector {
                  height: ${this.windowHeight - 112}px;
                }
                .hide-header .grand-selector {
                  height: ${this.windowHeight - 59}px;
                }
              }
              </style>`;
    },
  },
  data() {
    return {
      openSection: -1,
      busy: false,
    };
  },
  methods: {
    ...mapMutations([
      "setCompletionOverlayRender",
      "setCheckoutOverlayRender",
      "setSpecialPopup",
      "setStandardPopup",
      "setProductView",
      "setIncompletionShow",
    ]),
    ...mapActions(["incrementCurrentAttribute"]),
    setOpenDropdown(index: number) {
      this.openSection = index;
      const sub = this.subattributes[index];
      if (sub) {
        if (sub.notify) {
          this.setStandardPopup(sub.notify);
        }
        if ("viewset" in sub && sub.viewset !== undefined) {
          const viewset = getApplicationValue(utils.unpackViewset(sub.viewset), this.$store.state);
          if (viewset !== null) {
            this.setProductView({ view: viewset, asIndex: false });
          }
        }
      }
    },
    clickDropdown(index: number) {
      if (!this.busy) {
        if (index == this.openSection) {
          this.setOpenDropdown(-1);
        } else {
          this.setOpenDropdown(index);
        }
      }
    },
    nextStep() {
      if (
        this.openSection == this.subattributes.length - 1 ||
        this.productComplete
      ) {
        this.setOpenDropdown(-1);
        if (this.currentAttribute !== this.model.attributes.length - 1) {
          this.incrementCurrentAttribute();
        } else if (this.productComplete) {
          this.setCheckoutOverlayRender(true);
        } else {
          // Throw a notification to let the user know the are
          // other atributers that need to be filled
          this.setSpecialPopup({
            title: "Unfinished Business",
            message:
              "There are required attributes that have not been addressed. " +
              "Do you want to see which steps remain unfilled?",
            confirm: {
              label: "show me",
              callback: () => {
                this.setCompletionOverlayRender(true);
                this.setIncompletionShow(true);
              },
            },
          });
        }
      } else {
        this.setOpenDropdown(this.openSection + 1);
      }
    },
  },
});
</script>

<style lang="scss" scoped>
.grand-selector {
  background-color: #fff;
  transition: height 0.3s ease;
  padding: 75px 80px 0;
  box-sizing: border-box;
  text-align: left;
  position: relative;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  @media (max-width: $small-width) {
    padding: 50px 22px 0;
  }
  @media (max-width: 375px) {
    padding: 13.33333vw 5.866666vw 0;
  }
  .next-button {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 55px;
    color: #fff;
    z-index: 10;
    background-color: $orange;
    border: 2px solid $orange;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 700 19px/100% $fnt-ev;
    text-transform: uppercase;
    box-sizing: border-box;
    padding-top: 6px;
    cursor: pointer;
    @media (min-width: $small-width-up) {
      font-size: 27px;
      transition: all 0.3s ease;
      &:hover {
        background-color: #fff;
        color: $orange;
        border-color: #000;
      }
    }
  }
}
</style>