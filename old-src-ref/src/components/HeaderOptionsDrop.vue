<template>
  <div
    :class="['product-options-drop', { expanded, 'no-others': true }]"
    @click="toggleExpand"
    @mouseenter="cancelAutoClose"
    @mouseleave="autoClose"
  >
    <div class="lable">{{ productName || currentProduct }}</div>
    <div v-if="false" :class="['product-options-list']">
      <ul @click.stop>
        <li
          v-for="product in otherProducts"
          :key="product.id"
          class="prod-opt"
          @click="clickOtherProduct(product.id, product.name)"
        >
          {{ product.name }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import { mapState, mapMutations, mapGetters, mapActions } from "vuex";

export default defineComponent({
  name: "HeaderOptionsDrop",
  computed: {
    ...mapState(["products", "currentProduct", "inStudioMode"]),
    ...mapGetters({ prod: "getProduct", singularName: "getProductName" }),
    otherProducts(): any {
      if (this.products) {
        const prods = this.products.filter(
          (p: any) => !(p.id == this.currentProduct)
        );
        return prods;
      }
      return [];
    },
    productName() {
      if (this.inStudioMode) {
        return "STUDIO";
      }
      if (this.prod) {
        return (this as any).prod.name;
      }
      return "";
    }
  },
  methods: {
    ...mapMutations(["setCurrentProduct", "setSpecialPopup"]),
    ...mapActions(["switchProduct"]),
    toggleExpand() {
      this.expanded = !this.expanded;
    },
    clickOtherProduct(id: string, name: string) {
      if (name.endsWith("s")) {
        name = name.slice(0, -1);
      }
      this.setSpecialPopup({
        title: "Change Product?",
        message: `Are you sure you want to switch from working on your ${this.singularName} and start working on your ${name}?`,
        confirm: {
          label: "proceed",
          callback: () => this.setConfiguratorProduct(id),
        },
      });
    },
    setConfiguratorProduct(id: string) {
      this.expanded = false;
      this.switchProduct(id);
    },
    autoClose() {
      // Auto close the dropdown when no longer having mouse over
      this.closeTimer = setTimeout(() => {
        this.expanded = false;
        this.closeTimer = null;
      }, 400);
    },
    cancelAutoClose() {
      if (this.closeTimer) {
        clearTimeout(this.closeTimer);
        this.closeTimer = null;
      }
    },
  },
  setup() {
    const expanded: Ref<boolean> = ref(false);
    const hovering: Ref<boolean> = ref(false);
    const closeTimer: Ref<any> = ref(null);
    return { expanded, hovering, closeTimer };
  }
});
</script>

<style lang="scss" scoped>
.product-options-drop {
  color: #707070;
  margin: 5px;
  margin-right: 20px;
  position: relative;
  cursor: pointer;
  @media (min-width: $small-width-up) {
    margin-top: 8px;
  }
  &:not(.no-others) {
    &::before,
    &::after {
      content: "";
    }
  }
  &::before,
  &::after {
    position: absolute;
    top: calc(50% - 2px);
    width: 2px;
    height: 8px;
    background-color: #707070;
    @media (min-width: $small-width-up) {
      width: 3px;
      height: 10px;
    }
  }
  &::before {
    right: -6px;
    transform: translateY(-50%) rotate(-45deg);
    @media (min-width: $small-width-up) {
      right: -11px;
    }
  }
  &::after {
    right: -11px;
    transform: translateY(-50%) rotate(45deg);
    @media (min-width: $small-width-up) {
      right: -16px;
    }
  }
  .lable {
    text-transform: uppercase;
    font: 700 13px/120% $fnt-ev;
    letter-spacing: 0em;
    text-align: left;
    @media (min-width: $small-width-up) {
      font-size: 16px;
    }
  }
  .product-options-list {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: $header-z;
    min-width: calc(100% + 24px);
    background-color: #fff;
    transform: scaleY(0);
    box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
    transition: box-shadow 0.2s ease, transform 0.3s ease 0.12s;
    transform-origin: top;
    ul {
      text-align: left;
      padding: 0 6px;
      opacity: 0;
      transition: opacity 0.17s linear;
      list-style-type: none;
      li {
        padding: 8px 0;
        font: 700 15px/120% $fnt-cm;
        color: #a8a8a8;
        transition: all 0.2s ease;
        &:not(:last-child) {
          border-bottom: 1px solid #f5f5f5;
        }
        &:hover {
          color: $orange;
        }
      }
    }
  }
  &.expanded {
    .product-options-list {
      transform: scaleY(1);
      box-shadow: 0 3px 3px 0 rgba(0, 0, 0, 0.164);
      transition: box-shadow 0.2s ease, transform 0.2s ease;
      ul {
        opacity: 1;
        transition: opacity 0.17s linear 0.12s;
      }
    }
  }
}
</style>