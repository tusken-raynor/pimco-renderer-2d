<template>
  <div
    :class="[
      'grand-option',
      'grand-wide-option',
      { selected: option == selected, 'has-image': option.image },
    ]"
  >
    <div v-if="option.image" class="option-image" @click="select">
      <BaseImage :data="option.image" />
    </div>
    <div
      class="option-name"
      @click="select"
      v-html="option.nickname || option.name"
    ></div>
  </div>
</template>

<script>
export default {
  name: "GrandWideOption",
  props: {
    option: Object,
    select: Function,
    selected: Object,
  },
};
</script>

<style lang="scss" scoped>
.grand-wide-option {
  padding-top: 24px;
  margin-bottom: 20px;
  font-size: 16px;
  @media (max-width: $large-width) {
    &.has-image {
      margin-bottom: 10px;
    }
  }
  @media (min-width: $large-width-up) {
    display: inline-block;
    margin-bottom: 0;
  }
  @media (max-width: $large-width) {
    &:last-child {
      margin-bottom: 0;
    }
  }
  @media (max-width: 375px) {
    font-size: 4.266666vw;
  }
  .option-image {
    display: flex;
    justify-content: center;
    padding-bottom: 20px;
    cursor: pointer;
    .imaujee {
      display: block;
      max-width: 100%;
    }
  }
  .option-name {
    border: 1px solid #000;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    user-select: none;
    cursor: pointer;
    height: 50px;
    padding: 0 25px;
    position: relative;
    transition: background-color 0.2s linear;
    @media (min-width: $large-width-up) {
      margin-left: 25px;
      margin-right: 25px;
    }
    @media (max-width: $small-width) {
      padding: 0 0;
    }
  }
  &.selected .option-name {
    background-color: $orange;
    border-color: $orange;
    color: #fff;
    font-weight: 700;
    z-index: 2;
    font-size: 0.9696176em;
  }
}
</style>