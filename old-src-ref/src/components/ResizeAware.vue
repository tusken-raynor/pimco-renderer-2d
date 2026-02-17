<template>
  <div ref="wrapper">
    <slot />
  </div>
</template>

<script lang="ts">
import { defineComponent, Ref, ref } from 'vue';

export default defineComponent({
  name: 'ResizeAware',
  emits: ['resize'],
  setup() {
    const wrapper: Ref<HTMLElement | null> = ref(null);
    return {
      wrapper,
    };
  },
  methods: {
    observeResize(element: HTMLElement) {
      let resizeObserver: ResizeObserver = (window as any).__uvm_resize_observer__;
      if (!resizeObserver) {
        resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            entry.target['__vue_instance__'].$emit('resize', entry);
          }
        });
        (window as any).__uvm_resize_observer__ = resizeObserver;
      }
      
      element['__vue_instance__'] = this;
      resizeObserver.observe(element);
    },
    unobserveResize(element: HTMLElement) {
      const resizeObserver = (window as any).__uvm_resize_observer__;
      if (resizeObserver) {
        delete element['__vue_instance__'];
        resizeObserver.unobserve(element);
      }
    }
  },
  watch: {
    wrapper(element: HTMLElement | null, oldElement: HTMLElement | null) {
      if (oldElement) {
        this.unobserveResize(oldElement);
      }
      if (element) {
        this.observeResize(element);
      }
    }
  },
  mounted() {
    if (this.wrapper) {
      this.observeResize(this.wrapper);
    }
  },
  beforeUnmount() {
    if (this.wrapper) {
      this.unobserveResize(this.wrapper);
    }
  }
});
</script>