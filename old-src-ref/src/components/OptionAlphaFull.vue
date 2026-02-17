<template>
  <div class="full-option" data-component>
    <div class="swatch">
      <img
        src="/show-imgs/webs/closed.png"
        alt="Closed"
        srcset="/show-imgs/webs/closed@2x.png 2x, /show-imgs/webs/closed.png 1x"
      />
    </div>
    <div class="info">
      <div class="label">MODIFIED TRAP</div>
      <div class="description">Popular among pitchers and outfielders.</div>
    </div>
  </div>
</template>

<script>
export default {
  name: "OptionAlphaFull",
};
</script>

<style lang="scss" scoped>
.full-option {
  margin: 0 18px;
  padding: 20px 18px;
  display: flex;
  position: relative;
  border-top: 1px solid #d8d6d2;
}
.full-option::before,
.full-option::after {
  position: absolute;
  top: 20px;
  content: "";
  width: 2px;
  height: 8px;
  background-color: #707070;
}
.full-option::before {
  right: 22px;
  transform: rotate(-45deg);
}
.full-option::after {
  right: 17px;
  transform: rotate(45deg);
}
.full-option .swatch {
  margin-right: 20px;
}
.full-option .info {
  font-size: 14px;
  letter-spacing: 0.075em;
  line-height: 121.428%;
  font-weight: 300;
}
.full-option .info .label {
  font-weight: 700;
}
</style>
