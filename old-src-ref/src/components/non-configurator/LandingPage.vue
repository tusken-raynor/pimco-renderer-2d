<template>
  <div v-if="product" class="landing-page">
    <component v-if="content && template" :is="template"></component>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapGetters, mapState } from "vuex";

import GloveLanding from "./GloveLanding.vue";
import BeltLanding from "./BeltLanding.vue";
import BatLanding from "./BatLanding.vue";
import EpionLanding from "./EpionLanding.vue";

export default defineComponent({
  name: "LandingPage",
  components: {
    GloveLanding,
    BeltLanding,
    BatLanding,
    EpionLanding,
  },
  computed: {
    ...mapState(["preConfigData"]),
    ...mapGetters({
      product: "getProduct",
      content: "getPreConfigData",
    }),
    template() {
      if ((this as any).product?.startpage?.template) {
        // For some reason the interpreter arbitrarily thinks certain
        // properties dont exist any more on the instance
        return (this as any).product.startpage.template;
      }
      return "glove-landing";
    },
  },
});
</script>