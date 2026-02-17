<template>
  <div class="test-thingy"></div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";

type Taco = {
  meat: "chicken" | "steak" | "groundbeef" | "fish";
  cheese: boolean;
  lettuce: boolean;
  tomatoes: boolean;
  shell: "hard" | "soft";
};

export default defineComponent({
  setup() {
    const tacos: Ref<Taco[]> = ref([]);
    return {
      tacos,
    };
  },
  computed: {
    chickenTacos(): Taco[] {
      return this.tacos.filter((taco) => taco.meat == "chicken");
    },
  },
  methods: {
    clearTacos() {
      this.tacos.length = 0;
    },
  },
});
</script>
