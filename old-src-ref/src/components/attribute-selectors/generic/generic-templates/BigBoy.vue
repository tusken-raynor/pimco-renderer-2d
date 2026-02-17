<template>
  <div
    v-if="option1 && option2"
    :class="[
      'generic-template',
      'big-boy',
      'fix-scrollbar',
      sanitize(attribute!.name),
      sanitize(subattribute!.name),
    ]"
  >
    <h2 class="d-title" v-html="data.title"></h2>
    <div class="cta">{{ data.cta }}</div>
    <div class="pointers"><span>select one</span></div>
    <div class="option-container">
      <div
        v-for="(option, i) in options"
        :key="option.id"
        :class="[
          'option',
          'option-' + (i + 1),
          { selected: option == selected },
        ]"
      >
        <div class="info" @click="clickOption(option)">
          <div class="inches">{{ option.genericmeta.inches }}</div>
          <div class="name">{{ option.nickname || option.name }}</div>
          <div class="price">{{ metaPrice(option) }}</div>
        </div>
        <div class="graphic-wrap">
          <BaseImage :data="option.genericmeta.sizeGraphic" />
        </div>
        <div class="image-wrap">
          <BaseImage :data="option.genericmeta.image" class="img" />
          <span
            class="height"
            :style="{ '--belt-height': num(option.genericmeta.inches) }"
            >{{ option.genericmeta.inches }}</span
          >
        </div>
      </div>
    </div>
    <div :class="['next-button', { disabled: !selected }]" @click="nextStep">
      next
    </div>
    <div class="reactive-style" v-html="styleString"></div>
  </div>
  <div v-else class="generic-template big-boy fail">
    You forgot to reference two generic options
  </div>
</template>

<script lang="ts">
import { OptionCasing } from "@/structure";
import { GenericAttribute, GenericOption, GenericSubAttribute } from "@/types";
import structure from "@/structure";
import utils from "@/utils";
import { defineComponent } from "vue";
import { mapActions, mapGetters, mapState } from "vuex";

export default defineComponent({
  props: {
    attribute: Object as () => GenericAttribute<
      { [key: string]: any }
    >,
    select: Function as any as () => (
      o: GenericOption | null,
      subAttribute: string,
      section: string
    ) => void,
    casingNest: Object,
  },
  computed: {
    ...mapState(["objectIDMap", "windowHeight", "currentProduct"]),
    ...mapGetters({ modMap: "getWoocommerceMods", basePrice: "getBasePrice" }),
    subattribute(): GenericSubAttribute | null {
      if (this.attribute?.attributes[0]) {
        return this.objectIDMap[this.attribute.attributes[0]] || null;
      }
      return null;
    },
    subattributeName(): string {
      if (this.subattribute) {
        return this.subattribute.name;
      }
      return "";
    },
    data(): Record<string, any> {
      if (this.attribute?.generic) {
        const obj: any = { ...this.attribute.generic };
        delete obj.template;
        return obj;
      }
      return {};
    },
    option1(): GenericOption | null {
      if (this.subattribute?.options.options[0]) {
        return this.objectIDMap[this.subattribute.options.options[0]] || null;
      }
      return null;
    },
    option2(): GenericOption | null {
      if (this.subattribute?.options.options[1]) {
        return this.objectIDMap[this.subattribute.options.options[1]] || null;
      }
      return null;
    },
    options(): GenericOption[] {
      if (this.option1 && this.option2) {
        return [this.option1, this.option2];
      }
      return [];
    },
    selections(): Array<GenericOption | null> {
      if (this.casingNest && this.casingNest[this.subattributeName]) {
        const group = this.casingNest[this.subattributeName];
        return Object.keys(group)
          .filter((k) => k != "x-data")
          .map((k) => group[k].value);
      }
      return [];
    },
    selected(): GenericOption | null {
      return this.selections[0] || null;
    },
    styleString(): string {
      return `<style>
              .generic-template.big-boy {
                height: ${this.windowHeight - 120}px;
              }
              @media (max-width: 600px) {
                .generic-template.big-boy {
                  height: ${this.windowHeight - 112}px;
                }
                .hide-header .generic-template.big-boy {
                  height: ${this.windowHeight - 59}px;
                }
              }
              </style>`;
    },
  },
  methods: {
    ...mapActions(["incrementCurrentAttribute"]),
    num(string: string) {
      return parseFloat(string);
    },
    sanitize(subject: string): string {
      return utils.sanitize(subject);
    },
    clickOption(option: GenericOption) {
      if (this.select && this.subattribute) {
        this.select(
          option,
          this.subattributeName,
          this.subattribute.options.key
        );
      }
    },
    nextStep() {
      if (this.options.includes(this.selected as any)) {
        this.incrementCurrentAttribute();
      }
    },
    metaPrice(option: GenericOption) {
      if (option.genericmeta.price) {
        return option.genericmeta.price;
      }
      if (this.casingNest) {
        let casing: OptionCasing | null = null;
        structure.traverse(this.casingNest, (c) => {
          if (!casing) casing = c;
        });
        if (casing) {
          const upcharge = Number(
            utils.getOptionUpcharge(
              option,
              casing,
              this.currentProduct,
              this.basePrice,
              this.modMap
            )
          );
          if (upcharge < 0) {
            return `-$${upcharge}`;
          } else if (upcharge > 0) {
            return `+$${upcharge}`;
          }
        }
      }
      return "";
    },
  },
});
</script>

<style lang="scss" scoped>
.generic-template {
  overflow: auto;
  display: flex;
  flex-direction: column;
  --belt-height: 1.5;
}

.d-title {
  font: 40px/105% $fnt-fh;
  color: $orange;
  padding-top: 40px;
  padding-bottom: 24px;
  @media (max-width: $small-width) {
    padding-top: 6.666vw;
    padding-bottom: 4vw;
  }
  @media (max-width: $xsmall-width) {
    font-size: 10vw;
  }
}

.cta {
  font: 500 16px/120% $fnt-cm;
  margin: 0 auto;
  padding: 0 14px 22px;
  max-width: 360px;
  @media (max-width: $small-width) {
    padding-bottom: 3.666vw;
  }
  @media (max-width: $xsmall-width) {
    max-width: 200px;
  }
}

.pointers {
  flex-shrink: 0;
  border: 1px solid #000;
  border-bottom: none;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  width: 240px;
  height: 17px;
  margin: 0 auto 0.85em;
  position: relative;
  @media (max-width: $small-width) {
    width: 40vw;
  }
  span {
    text-transform: uppercase;
    background-color: #fff;
    padding: 0 5px;
    line-height: 120%;
    width: max-content;
    position: absolute;
    top: -0.5em;
    left: 50%;
    transform: translateX(-50%);
    @media (max-width: $small-width) {
      font-size: 13px;
    }
    @media (max-width: $xsmall-width) {
      font-size: 10px;
    }
  }
  &::before,
  &::after {
    content: "";
    width: 4px;
    height: 4px;
    border: 1px solid #000;
    border-top: none;
    border-left: none;
    transform: rotate(45deg);
    position: absolute;
    bottom: 0;
  }
  &::before {
    left: -3px;
  }
  &::after {
    right: -3px;
  }
}

.option-container {
  display: flex;
  justify-content: center;
  gap: 1.3333em;
  flex-grow: 1;
  font-size: 20px;
  @media (max-width: $small-width) {
    font-size: 3.333vw;
  }
}

.option {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 11.4em;
}

.info {
  border: 1px solid #000;
  border-radius: 16px;
  padding: 0.7143em;
  position: relative;
  z-index: 2;
  user-select: none;
  overflow: hidden;
  cursor: pointer;
  background-color: $orange;
  transition: border-color 0.2s;
  .option:not(.selected) &:hover {
    border-color: $orange;
  }

  > * {
    position: relative;
  }
  &::before {
    content: "";
    background-color: #fff;
    position: absolute;
    width: 125%;
    padding-top: 125%;
    top: 50%;
    left: 50%;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    transition: transform 0.3s;
    .selected & {
      transform: translate(-50%, -50%) scale(0);
    }
  }
}
.name {
  text-transform: uppercase;
  color: $orange;
  font: 700 1em/120% $fnt-hv;
  transition: color 0.55s linear 0.2s;
  .selected ::v-deep & {
    color: #fff;
    transition: color 0.06s linear;
  }
}

.graphic-wrap {
  margin-top: -1.7143em;
  position: relative;
  :deep(img) {
    width: 100%;
  }
}

.image-wrap {
  width: 100%;
  padding-top: 1.3em;
  display: flex;
  align-items: flex-end;
  .option-1 & {
    flex-direction: row-reverse;
  }
}
.img {
  width: 100%;
  .option-1 &[src*="belt-image-classic"] {
    margin-top: 1.3em;
  }
}
.height {
  font: 500 0.8571em / calc(var(--belt-height) * 166.666%) $fnt-cm;
  border-top: 1px solid #000;
  border-bottom: 1px solid #000;
  position: relative;
  min-width: 2em;
  margin-bottom: calc(3.4em / var(--belt-height));
  &::before,
  &::after {
    content: "";
    width: 1px;
    height: calc(var(--belt-height) * 0.2666em);
    position: absolute;
    left: 50%;
    background-color: #000;
  }
  &::before {
    top: 0;
  }
  &::after {
    bottom: 0;
  }
}

.next-button {
  background-color: $orange;
  border: 2px solid $orange;
  cursor: pointer;
  user-select: none;
  padding: 20px 18px 16px;
  font: 700 24px/28px $fnt-ev;
  text-transform: uppercase;
  color: #fff;
  box-sizing: border-box;
  margin: 26px auto;
  width: calc(100% - 56px);
  max-width: 450px;
  transition: background-color 0.2s, color 0.2s;
  @media (max-width: $small-width) {
    margin-top: 4.333vw;
    margin-bottom: 4.333vw;
  }
  &:not(.disabled):hover {
    background-color: #fff;
    color: $orange;
  }
  &.disabled {
    background-color: #efefef;
    border-color: #efefef;
    cursor: not-allowed;
  }
}
</style>
