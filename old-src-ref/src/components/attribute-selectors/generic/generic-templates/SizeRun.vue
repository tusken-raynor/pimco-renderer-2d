<template>
  <div
    v-if="option1"
    :class="[
      'generic-template',
      'size-run',
      'fix-scrollbar',
      sanitize(attribute!.name),
      sanitize(subattribute!.name),
    ]"
  >
    <div class="head">
      <div class="title" @click="subattribute?.info ? setStandardPopup(subattribute.info) : null">
        <h2>{{ subattributeName }}</h2>
        <div v-if="subattribute?.info" class="info"></div>
      </div>
      <div v-if="minQuantity > 1" class="min-qty">Min Qty: {{ minQuantity }}</div>
      <div v-if="meta.discountInfo" class="discount" @click="setStandardPopup(meta.discountInfo)">
        <span>Volume Discount</span>
        <div class="info"></div>
      </div>
    </div>
    <div class="body">
      <div class="sizes">
        <div class="size" v-for="(size, index) in sizes" :key="index">
          <span class="name">
            <span class="sizer" aria-hidden="true">{{ longestSizeName }}</span>
            <span class="value">{{ size.name }}</span>
          </span>
          <span class="sub">{{ size.sub }}</span>
          <span class="qty">
            <select :name="size.name + ' quantity'" @change="e => updateQuantity(index, e?.target?.['value'])" :value="quantities[index] || '0'">
              <option v-for="n in (size.qtyHi - size.qtyLo + 1)" :key="n + size.qtyLo - 1" :value="n + size.qtyLo - 1">{{ n + size.qtyLo - 1 }}</option>
            </select>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { OptionCasing } from "@/structure";
import { GenericAttribute, GenericOption, GenericSubAttribute } from "@/types";
import utils from "@/utils";
import woocommerce from "@/woocommerce";
import { defineComponent } from "vue";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";

export default defineComponent({
  name: "SizeRun",
  props: {
    attribute: Object as () => GenericAttribute<
      { [key: string]: any }
    >,
    select: Function as any as () => (
      o: GenericOption | null,
      subAttribute: string,
      section: string
    ) => void,
    currentSubattribute: {
      type: Number,
      required: true,
    },
    casingNest: Object,
  },
  computed: {
    ...mapState(["objectIDMap", "windowHeight", "currentProduct"]),
    ...mapGetters({ modMap: "getWoocommerceMods", basePrice: "getBasePrice" }),
    subattribute(): GenericSubAttribute | null {
      if (this.attribute?.attributes[this.currentSubattribute]) {
        return this.objectIDMap[this.attribute.attributes[this.currentSubattribute]] || null;
      }
      return null;
    },
    subattributeName(): string {
      if (this.subattribute) {
        return this.subattribute.name;
      }
      return "";
    },
    casing(): OptionCasing<GenericOption | null> | null {
      if (this.subattribute?.options?.key && this.casingNest?.[this.subattributeName]?.[this.subattribute.options.key]) {
        return this.casingNest[this.subattributeName][this.subattribute.options.key];
      }
      return null;
    },
    meta(): Record<string, any> {
      if (this.subattribute?.genericmeta) {
        return this.subattribute.genericmeta;
      }
      return {};
    },
    option1(): GenericOption | null {
      if (this.subattribute?.options.options[0]) {
        return this.objectIDMap[this.subattribute.options.options[0]] || null;
      }
      return null;
    },
    optionMeta(): Record<string, any> {
      if (this.option1?.genericmeta) {
        return this.option1.genericmeta;
      }
      return {};
    },
    minQuantity(): number {
      if (this.meta?.minQuantity) {
        return Math.max(this.meta.minQuantity, 1);
      }
      return 1;
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
    sizes(): Array<{ name: string; sub: string; qtyLo: number; qtyHi: number; option: string; }> {
      if (this.optionMeta.sizes && Array.isArray(this.optionMeta.sizes)) {
        return this.optionMeta.sizes;
      }
      return [];
    },
    sizeOptions(): Record<string, GenericOption> {
      return this.sizes.map(s => this.objectIDMap[s.option]).filter(o => !!o && o.wcvalue).reduce((obj, o) => {
        obj[o.id] = o;
        return obj;
      }, {} as Record<string, GenericOption>);
    },
    longestSizeName(): string {
      return this.sizes.reduce((name, x) => x.name.length > name.length ? x.name : name, "");
    },
    totalQuantity(): number {
      return this.quantities.reduce((total, qty) => total + qty, 0);
    },

  },
  data() {
    return {
      quantities: [] as number[],
      isOpen: false,
    };
  },
  methods: {
    ...mapMutations(["setStandardPopup"]),
    ...mapActions(["incrementCurrentAttribute", "onDataStepComplete"]),
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
    updateQuantity(index: number, value: number) {
      this.quantities[index] = value;
      this.quantities = this.quantities.map(Number);
    },
    manageTheSelection() {
      if (!this.casing) return;
      if (this.selected !== this.option1 && this.totalQuantity >= this.minQuantity) {
        // Apply the option to the branch
        this.casing.value = this.option1;
      } else if (this.selected == this.option1 && this.totalQuantity < this.minQuantity) {
        this.casing.value = null;
      }
      this.casing.userInteraction = true;
    },
    setInitialQuantities() {
      this.onDataStepComplete({ id: "objects", callback: () => {
        if (!this.casing) return;
        const sizerun: string = this.casing.getMetaData('+preview');
        if (!sizerun) return;
        sizerun.split(', ').forEach(d => {
          const [name, qty] = d.split(' x ');
          const index = this.sizes.findIndex(s => s.name === name);
          if (index !== -1) {
            this.quantities[index] = qty ? parseInt(qty, 10) : 0;
          }
        });
      }});
    }
  },
  watch: {
    casing() {
      this.setInitialQuantities();
    },
    totalQuantity() {
      this.manageTheSelection();
    },
    quantities(value: number[]) {
      if (!this.casing || !this.casing.woocommerceName) return;
      let valueString = '';
      let previewString = '';
      for (let i = 0; i < value.length; i++) {
        const qty = value[i];
        if (!qty) continue;
        const size = this.sizes[i];
        const sizeOption = this.sizeOptions[size.option];
        if (!sizeOption) continue;
        const wcValue = woocommerce.getOption(sizeOption.wcvalue!, this.casing.woocommerceName, this.currentProduct);
        if (!wcValue) continue;
        valueString += (valueString ? '|||' : '') + `${wcValue}:::${qty}`;
        previewString += (previewString ? ', ' : '') + `${size.name} x ${qty}`;
      }
      if (valueString) {
        this.casing.setMetaData('+sizerun', valueString);
      } else {
        this.casing.removeMetaData('+sizerun');
      }
      if (previewString) {
        this.casing.setMetaData('+preview', previewString);
      } else {
        this.casing.removeMetaData('+preview');
      }
    }
  },
  mounted() {
    this.manageTheSelection();

    // Read the meta data on the casing and set the initial quantities
    requestAnimationFrame(this.setInitialQuantities);
  }
});
</script>

<style lang="scss" scoped>
.generic-template {
  overflow: auto;
  display: flex;
  flex-direction: column;
  --belt-height: 1.5;
  padding: 25px 36px 45px;
  width: 485px;
  max-width: 100%;
  box-sizing: border-box;
}
.head {
  padding-bottom: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  font: 400 13px/1.2 $fnt-cm;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  @media (max-width: $xsmall-width) {
    font-size: 11px;
  }
}
.title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  cursor: pointer;
  @media (max-width: $xsmall-width) {
    font-size: 12px;
  }
  h2 {
    font: inherit;
  }
}
.discount {
  display: flex;
  align-items: center;
  cursor: pointer;
}
.info {
  aspect-ratio: 1;
  height: 1.1em;
  background: url(../../../../assets/info.svg) no-repeat center / contain;
  transition: transform 0.2s ease;
  cursor: pointer;
  opacity: 1;
  margin-left: 0.3em;
  margin-bottom: 0.2em;
  :is(.discount, .title):hover & {
    transform: scale(1.2);
  }
}
.title, .min-qty, .discount {
  white-space: nowrap;
}

.body {
  border-top: 1px solid #000;
  padding: 12px 12px 0 4px;
}
.sizes {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}

.size {
  display: flex;
  align-items: center;
  gap: 1em;
  font: 400 14px/1.2 $fnt-cm;
  text-align: left;
  @media (max-width: $xsmall-width) {
    font-size: 12px;
  }
}
.name {
  font: 600 30px/1.2 $fnt-cm;
  letter-spacing: -0.025em;
  text-transform: uppercase;
  position: relative;
  .value {
    position: absolute;
    inset: 0;
  }
  .sizer {
    visibility: hidden;
    user-select: none;
    pointer-events: none;
  }
}
.sub {
  font-weight: 600;
  text-transform: uppercase;
}
.qty {
  margin-left: 4px;
  border: 1px solid #bcbec0;
  padding-right: 0.2em;

  select {
    border: none;
    padding: 0.3em 0.3em;
    background-color: #fff0;
    outline: none;
    cursor: pointer;
    border-radius: 0;
    font: 500 16px/1 $fnt-cm;
    color: #58595b;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
  }
}
</style>
