<template>
  <div
    id="product-checkout-overlay"
    v-if="render"
    :class="{ show }"
    @click="closeOverlay"
  >
    <div class="head-wrap" @click.stop>
      review custom {{ productName }} details
    </div>
    <div class="product-viewer outside" @click.stop>
      <transition name="fade" appear>
        <BaseImage
          v-if="imgUrls[imgNum]"
          :src="imgUrls[imgNum]"
          :style="{
            maxWidth: imageDimensions[0] + 'px',
            maxHeight: imageDimensions[1] + 'px',
          }"
        />
        <div v-else class="loading-message">Loading Image...</div>
      </transition>
      <div class="grad-overlay"></div>
      <div class="product-thumbnails">
        <div
          v-for="(img, i) in imgUrls"
          :key="img"
          :class="['product-thumbnail', { current: i === imgNum }]"
          @click="imgNum = i"
        >
          <BaseImage :src="img" />
        </div>
      </div>
    </div>
    <div :class="['list-wrapper', 'fix-scrollbar']" @click.stop>
      <div class="product-viewer inside">
        <BaseImage v-if="imgUrls[imgNum]" :src="imgUrls[imgNum]" />
        <div v-else class="loading-message">Loading Image...</div>
        <div class="img-arrow prev" @click="decrementImgNum"></div>
        <div class="img-arrow next" @click="incrementImgNum"></div>
      </div>
      <div class="list">
        <div v-if="modelData" class="attribute-model">
          <div class="title-wrap">
            <span class="num">01</span
            ><span class="title">{{ modelData.key }}: </span>
            <span class="value">{{ modelData.value }}</span>
          </div>
        </div>
        <attribute
          v-for="(attr, key, i) in productSelectedOptions"
          :key="key"
          :label="key.toString()"
          :index="i"
          :attribute="attr"
          :offset="modelData ? 2 : 1"
          :data-key="key"
        />
        <div v-if="productPrices.length <= 2" class="total">
          custom {{ productName }} total:
          <span class="price">${{ formattedPrice }}</span>
        </div>
        <div v-else class="order-totals">
          <div
            v-for="(p, i) in productPrices"
            :key="p.name + '-' + i"
            class="order-total-item"
            :class="[p.class || undefined]"
          >
            <span class="name">{{ p.name }}:</span>
            <span class="price">${{ p.price }}</span>
          </div>
        </div>
        <div class="terms">
          <p>
            Because of different screens and viewing devices and natural
            variations in leathers, actual colors may deviate from what you see
            on screen.
          </p>
          <p>
            Changes, refunds, or returns are not permitted.
            <strong>All Show{{ product.name }} sales are final.</strong>
          </p>
          <div
            v-for="cfrm in checkoutConfirmations"
            :key="cfrm"
            class="terms-check"
          >
            <div
              :class="['checkbox', { checked: confirms[cfrm] }]"
              @click="toggleConfirmation(cfrm)"
            ></div>
            <div class="message" v-html="cfrm"></div>
          </div>
        </div>
        <div v-if="!embedContext" class="save-product">
          <div class="tmp-save">Save My {{ singularName }}</div>
          <div
            :class="['opt-save', 'opt-no', { selected: saveProduct === false }]"
            @click="setSaveProduct(false)"
          >No</div>
          <div
            :class="['opt-save', 'opt-yes', { selected: saveProduct === true }]"
            @click="setSaveProduct(true)"
          >Yes, please!</div>
        </div>
      </div>
    </div>
    <form :action="formAction" method="post" :target="isIOSSafari ? undefined : '_blank'" ref="formElement" @submit="saveSession">
      <div class="input-data" v-html="formHTML"></div>
      <button
        type="submit"
        :class="['add-to-cart', { disabled }]"
        ref="formSubmitButton"
        @click.stop
      >{{ addToCartText }}</button>
      <transition name="fade">
        <div v-if="saveProduct" v-show="displaySaveProductForm" class="save-product-form" @click.stop>
          <h2>Save This {{ singularName }}</h2>
          <p>Enter your email below to save this {{ singularName.toLowerCase() }}.</p>
          <input type="email" :name="isValidSaveEmail ? 'mc_nag_email' : undefined" placeholder="Email Address" required v-model="saveProductEmail">
          <div class="continue" @click="toggleSaveProductForm(false)">Continue</div>
          <div class="close-btn" @click="cancelSaveProductForm">
            <div class="x-pattern"></div>
          </div>
        </div>
      </transition>
    </form>
    <div class="close-btn">
      <div class="x-pattern"></div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import { mapActions, mapGetters, mapMutations, mapState } from "vuex";
import Attribute from "./Attribute.vue";
import ProductImages from "@/components/ProductImages.vue";
import utils from "@/utils";
import { ProductImageContributer } from "@/types";
import pimcos from "@/pimcos";
import share from "@/share";
import canvasWorkers from "@/renderer/canvas-workers";
import params from "@/params";
export default defineComponent({
  name: "ReviewOverlay",
  components: {
    Attribute,
    ProductImages,
  },
  computed: {
    ...mapState([
      "renderCheckoutOverlay",
      "selectedOptions",
      "currentProduct",
      "agreedTerms",
      "globalAddToCartState",
      "pimcos",
      "userBrowser",
      "OS",
      "supportsAvif",
    ]),
    ...mapGetters({
      product: "getProduct",
      price: "getTotalPrice",
      checkoutConfirmations: "getCheckoutConfirmations",
      model: "getModel",
      fillers: "getFillerPimcos",
      restrictions: "getRestrictions",
      enablers: "getIndexedEnablers",
      attributes: "getFilteredAttributes",
      productImageContributions: "getPimcoContributers",
      singularName: "getProductName",
      viewCount: "getViewCount",
      frameOrder: "getViewOrder",
      productViews: "getViews",
      productRenderingContext: "getProductRenderingContext",
      wooPrices: "getWooPrices",
    }),
    formattedPrice(): string {
      if (this.wooPrices?.length) {
        const wooid: string | undefined = this.product?.wooid;
        const thisWoo = this.wooPrices.find((p: { wooid: number | string }) => wooid == p.wooid);
        if (thisWoo) {
          return utils.formatPrice(thisWoo.price * (thisWoo.quantity ?? 1));
        }
      }
      return utils.formatPrice(this.price);
    },
    productSelectedOptions(): Record<string, any> {
      if (this.selectedOptions && this.currentProduct && this.model) {
        const attrNames: string[] = this.attributes.map((x: any) => x.name);
        return utils.filterObject(
          this.selectedOptions[this.currentProduct].selections,
          (c, name) => attrNames.includes(name)
        );
      }
      return {};
    },
    productName(): string {
      if (this.product) {
        if (this.product.name.endsWith("s")) {
          return this.product.name.slice(0, -1);
        } else {
          return this.product.name;
        }
      }
      return "";
    },
    modelData(): { key: string; value: string } | null {
      if (this.model && this.product.models.length > 1) {
        return { key: "Pattern", value: this.model.inches || this.model.name };
      }
      return null;
    },
    checked(): boolean {
      if (this.confirms) {
        for (const key in this.confirms) {
          if (Object.prototype.hasOwnProperty.call(this.confirms, key)) {
            if (!this.confirms[key]) {
              return false;
            }
          }
        }
        return true;
      }
      return false;
    },
    disabled(): boolean {
      if (!this.globalAddToCartState) {
        return true;
      }
      if (this.saveProduct === null && !this.embedContext) {
        return true;
      }
      return !this.checked;
    },
    triggerSaveProductForm(): boolean {
      if (this.saveProduct === null) {
        return false;
      }
      return this.checked && this.saveProduct;
    },
    filteredPimcoContributions(): { [key: string]: ProductImageContributer[] } {
      const conts = pimcos.filterContributions(
        this.productImageContributions,
        this.restrictions,
        this.enablers
      );
      return conts;
    },
    imageDimensions(): [number, number] {
      if (this.product?.dimensions && Array.isArray(this.product.dimensions)) {
        return [
          1000,
          (this.product.dimensions[1] / this.product.dimensions[0]) * 1000,
        ];
      }
      return [1000, 1000];
    },
    isIOSSafari(): boolean {
      return this.userBrowser == "Safari" && this.OS == "iOS";
    },
    addToCartText() {
      if (this.addingToCart) {
        return "Adding to Cart...";
      }
      return "Add to Cart";
    },
    embedContext(): string {
      return params.getString("embed");
    },
    isValidSaveEmail(): boolean {
      return utils.validateEmail(this.saveProductEmail);
    },
    productPrices(): Array<{ name: string; price: string; class?: string; }> {
      if (this.formBody?.products?.length && this.formBody.products.length > 1 && this.wooPrices?.length) {
        const prices: Array<{ name: string; price: number }> = Object.values(this.wooPrices.reduce((acc: any, prod: any) => {
          const name = this.formBody.products.find((p: any) => p.id.toString() === prod.wooid.toString())?.name || prod.name || `Product ${prod.wooid}`;
          const key = name.trim() + '-' + prod.wooid;
          if (!(key in acc)) {
            acc[key] = { name: utils.pluralize(name), price: 0 };
          }
          acc[key].price += prod.price * 100 * (prod.quantity ?? 1);
          return acc;
        }, {}));
        // Add a grand total to the end of prices
        return [
          ...prices.map(p => ({ name: p.name, price: utils.formatPrice(p.price / 100) })),
          {
            name: "Grand Total",
            price: utils.formatPrice(prices.reduce((acc, p) => acc + p.price, 0) / 100),
            class: "grand-total"
          }
        ];
      }
      return [];
    },
  },
  methods: {
    ...mapMutations([
      "setCheckoutOverlayRender",
      "setTermsAgreement",
      "setProductView",
      "incrementProductView",
      "setStandardPopup"
    ]),
    ...mapActions(["addToCart", "saveSessionData", "generateProductImages"]),
    closeOverlay() {
      this.setCheckoutOverlayRender(false);
    },
    setFormHTML() {
      if (share.isSelectionUpdated()) {
        share.newSession();
      }
      if (this.formElement) {
        this.addToCart((html: string, action: string, body: any) => {
          this.formHTML = html;
          this.formAction = action;
          if (body) this.formBody = body;
        });
      }
    },
    async saveSession(e: Event) {
      e.preventDefault();
      this.addingToCart = true;
      const embedContext = this.embedContext;
      const blobPromise = this.saveLocalImage(!!embedContext);
      const saveDataPromise = new Promise<{name: string, success: boolean }>((resolve) => {
        this.saveSessionData({
          // number and dataUrls disabled because we are no longer saving
          // images from the client side. Instead we are saving the first image
          // in local storage, which will be used when they view the cart
          // number: 100,
          // dataURLs: this.imgUrls,
          saveImages: false,
          callback: resolve,
        });
      });
      const [blob, context] = await Promise.all([blobPromise, saveDataPromise]);
      // Make sure we are within the correct context and the form element exists
      if (!(context.name == 'sessionData' && this.formElement)) return;
      // Confirmed that the session data has been saved
      if (context.success) {

        // Attempt other add to cart methods depending on configurator embed context
        if (embedContext == 'justbats') {
          await this.addToCart_JustBats(blob);
        } else if (this.formBody) {
          // Add to cart using the form body and sending an ajax json request
          const response = await fetch(
            this.formAction,
            {
              method: 'POST',
              body: JSON.stringify(this.formBody),
              headers: {
                'Content-Type': 'application/json'
              }
            }
          ).then(r => r.json());
          if (response.redirect) {
            // Redirect to the provided url in a new tab
            if (this.isIOSSafari) {
              window.location.href = response.redirect;
            } else {
              window.open(response.redirect, '_blank');
            }
          }
        } else {
          // Use the default add-to-cart method
          // We are now safe to submit the form
          const formElement = this.formElement;
          formElement.submit();
        }
        this.addingToCart = false;

        setTimeout(() => {
          // After 3 seconds from adding to cart, set a new session in case they come back and make changes
          if (share.isSelectionUpdated()) {
            share.newSession();
          }
        }, 3000);
      } else {
        // If the session data failed to save, trigger a popup prompting
        // the user to try again
        this.setStandardPopup({
          title: "Uh Oh!",
          content: "There was an issue processing your selections. Please try again."
        });
      }
    },
    async saveLocalImage(returnBlob: boolean = false) {
      // Save the first image from frames in local storage so that it can be used to render the product in the cart
      const width = 196;
      const worker = await canvasWorkers.request(width, width);
      let blob: Blob | null = null;
      let firstURL = this.imgUrls[0];
      const { type, quality } = this.supportsAvif ?
        { type: 'image/avif', quality: 0.6 } :
        { type: 'image/webp', quality: 0.75 };
      if (firstURL) {
        // Apply the data URL to the canvas
        const img = new Image();
        img.src = firstURL;
        await new Promise((resolve) => {
          img.onload = resolve;
        });
        const proportionalHeight = (img.height / img.width) * width;
        worker.height = proportionalHeight;
        worker.ctx.drawImage(img, 0, 0, width, proportionalHeight);
        // Now we need to convert the canvas to a blob URL
        firstURL = await utils.imageDataOrCanvasToDataURL(worker.canvas, type, quality);
      } else {
        // Grab the blob URL from the main canvas
        const canvas = document.querySelector("#main-canvas") as HTMLCanvasElement;
        if (canvas) {
          const proportionalHeight = (canvas.height / canvas.width) * width;
          worker.height = proportionalHeight;
          worker.ctx.drawImage(canvas, 0, 0, width, proportionalHeight);
          firstURL = await utils.imageDataOrCanvasToDataURL(worker.canvas, type, quality);
        }
      }
      if (returnBlob) {
        blob = await utils.imageDataOrCanvasToBlob(worker.canvas, "image/jpeg", 0.8);
      }

      // Save the blob URL to local storage
      if (firstURL) {
        const sessionID = share.getSessionID();
        localStorage.setItem("localImage-" + sessionID, firstURL);
        localStorage.setItem("localImageTime-" + sessionID, Date.now().toString());
      }
      worker.release();
      
      return returnBlob ? blob : null;
    },
    async addToCart_JustBats(blob: Blob | null) {
      if (!this.formElement) return;
      blob = blob || new Blob();
      const thumbnailType = blob.type;
      const formData = new FormData(this.formElement);
      formData.set("product_id", formData.get("add-to-cart") as string);
      formData.delete("add-to-cart");
      const [response, thumbnail] = await Promise.all([
        fetch(
          'https://nokona.com/wp-json/config-embed/v1/save-item-data/', 
          {
            method: 'POST',
            body: formData,
          }
        ).then(r => r.json()),
        // new Promise<{ data: { item_id: any; } }>(r => setTimeout(() => r({ data: { item_id: -1 } }), 1000)),
        blob.arrayBuffer(),
      ]);
      if (window !== window.parent) {
        window.parent.postMessage({
          item_id: response.data.item_id,
          thumbnail,
          thumbnail_type: thumbnailType,
        }, '*');
      }
      return;
    },
    toggleTermsAgreement() {
      this.setTermsAgreement({ value: this.disabled, id: this.currentProduct });
    },
    toggleConfirmation(string: string) {
      if (string in this.confirms) {
        this.confirms[string] = !this.confirms[string];
      }
    },
    incrementImgNum() {
      this.imgNum = (this.imgNum + 1) % this.imgUrls.length;
    },
    decrementImgNum() {
      this.imgNum =
        (this.imgNum - 1 + this.imgUrls.length) % this.imgUrls.length;
    },
    setSaveProduct(value: boolean | null) {
      this.saveProduct = value;
    },
    toggleSaveProductForm(value?: boolean, delay?: number) {
      setTimeout(() => {
        if (value !== undefined) {
          this.displaySaveProductForm = value;
        } else {
          this.displaySaveProductForm = !this.displaySaveProductForm;
        }
      }, delay || 0);
    },
    cancelSaveProductForm() {
      this.toggleSaveProductForm(false);
      setTimeout(() => {
        this.saveProductEmail = "";
        this.saveProduct = false;
      }, 500);
    },
  },
  setup() {
    const confirms: Ref<{ [key: string]: boolean }> = ref({});
    const imgUrls: Ref<Array<string>> = ref([]);
    const show: Ref<boolean> = ref(false);
    const render: Ref<boolean> = ref(false);
    const imgNum: Ref<number> = ref(0);
    const saveProduct: Ref<boolean | null> = ref(null);
    const displaySaveProductForm: Ref<boolean> = ref(false);
    const saveProductEmail: Ref<string> = ref("");
    const formHTML: Ref<string> = ref("");
    const formAction: Ref<string> = ref("");
    const formBody: Ref<any> = ref(null);
    const formElement: Ref<HTMLFormElement | null> = ref(null);
    const formSubmitButton: Ref<HTMLButtonElement | null> = ref(null);
    const addingToCart: Ref<boolean> = ref(false);
    return {
      show,
      render,
      confirms,
      imgNum,
      imgUrls,
      formHTML,
      formAction,
      formElement,
      formBody,
      saveProduct,
      displaySaveProductForm,
      saveProductEmail,
      formSubmitButton,
      addingToCart,
    };
  },
  watch: {
    renderCheckoutOverlay(val: boolean) {
      if (val) {
        this.render = true;
        requestAnimationFrame(() => {
          // Grab an extra frame for some browsers
          requestAnimationFrame(() => {
            this.show = true;
            this.setFormHTML();
          });
        });
        setTimeout(() => {
          // Let the overlay fully open before render the images
          const options = { type: "webp", quality: 0.85 };
          const imagesPromise = new Promise<string[]>(callback => this.generateProductImages({ callback, size: 1000, ...options }));
          imagesPromise.then((urls) => {
            this.imgUrls = urls;
          });
        }, 500);
      } else {
        this.show = false;
        setTimeout(() => {
          this.render = false;
          this.imgUrls = [];
          this.imgNum = 0;
          this.formHTML = "";
        }, 400);
      }
    },
    checkoutConfirmations(val) {
      this.confirms = {};
      for (let i = 0; i < val.length; i++) {
        const string = val[i];
        this.confirms[string] = false;
      }
    },
    triggerSaveProductForm(value: boolean) {
      if (value) {
        this.toggleSaveProductForm(true, 100);
      }
      if (this.displaySaveProductForm) {
        this.toggleSaveProductForm(false, 100);
      }
    },
  },
});
</script>

<style lang="scss" scoped>
#product-checkout-overlay {
  z-index: 200;
  background-color: #0000008e;
  opacity: 0;
  transition: opacity 0.3s ease 0.25s, height 0.16s ease;
  position: fixed;
  top: 0;
  bottom: 0;
  right: 0;
  left: 0;
  display: flex;
  justify-content: flex-end;
  @media (min-width: 100vh) {
    background-color: #fff;
  }
  &.show {
    opacity: 1;
    transition: opacity 0.3s ease, height 0.16s ease;
  }
  .head-wrap,
  .list-wrapper,
  .add-to-cart {
    max-width: 500px;
    @media (min-width: 100vh) and (max-width: 1190px) {
      max-width: 42vw;
    }
  }
  .head-wrap {
    text-transform: capitalize;
    padding: 15px 10px;
    background-color: #707070;
    color: #fff;
    font: 600 21px/120% $fnt-cm;
    letter-spacing: -0.025em;
    text-align: center;
    position: fixed;
    top: 0;
    right: 0;
    width: 100%;
    z-index: 10;
    opacity: 0;
    box-sizing: border-box;
    transition: opacity 0.2s linear 0.15s, transform 0.2s ease 0.15s;
    transform: translateX(60px);
    @media (max-width: $xsmall-width) {
      text-align: left;
      font-size: 5.25vw;
    }
  }
  .list-wrapper {
    height: 100%;
    width: 100%;
    padding-top: 55px;
    background-color: #fff;
    opacity: 0;
    transform: translateX(60px);
    transition: opacity 0.2s linear 0.15s, transform 0.2s ease 0.15s;
    box-sizing: border-box;
    text-align: left;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    .list {
      border-top: 1px solid #707070;
      padding: 18px 18px 240px;
      @media (max-width: 375px) {
        padding-left: 9.6vw;
        padding-right: 9.6vw;
      }
    }
    .total {
      font: 600 21px/140% $fnt-cm;
      letter-spacing: -0.025em;
      padding: 18px 0 9px;
      text-transform: capitalize;
      border-bottom: 1px solid #dadada;
      .price {
        font-weight: 700;
        font-size: 26px;
      }
    }
    .order-totals {
      border-bottom: 1px solid #dadada;
      padding-top: 14px;
      padding-inline: 6px;
      .order-total-item {
        display: flex;
        justify-content: space-between;
        font: 500 16px/140% $fnt-cm;
        letter-spacing: -0.025em;
        padding: 6px 0;
        .name {
          text-transform: capitalize;
        }
        .price {
          font-weight: 700;
          font-size: 18px;
        }
        &.grand-total {
          font-size: 21px;
          font-weight: 600;
          .price {
            font-size: 26px;
          }
        }
      }
    }
  }
  .attribute-model {
    padding-bottom: 4px;
    position: relative;
    border-bottom: 1px solid #dadada;
    cursor: default;
    &:not(:first-child) {
      padding-top: 22px;
    }
    .titlex-wrap {
      display: flex;
      justify-content: space-between;
    }
    .num {
      font: 500 13px/230% $fnt-cm;
      margin-right: 1em;
      letter-spacing: -0.025em;
    }
    .title {
      font: 600 21px/143% $fnt-cm;
      letter-spacing: -0.025em;
    }
    .value {
      margin-left: 0.9em;
      font-weight: 500;
    }
  }
  .add-to-cart {
    margin-bottom: 0;
    text-transform: uppercase;
    padding: 15px 10px;
    background-color: $orange;
    color: #fff;
    font: 21px/120% $fnt-ev;
    border: 2px solid $orange;
    transition: color 0.2s linear, background-color 0.2s linear,
      border-color 0.2s linear, opacity 0.2s linear 0.15s,
      transform 0.2s ease 0.15s;
    letter-spacing: 0.02em;
    text-align: center;
    position: fixed;
    bottom: 0;
    right: 0;
    width: 100%;
    z-index: 10;
    opacity: 0;
    box-sizing: border-box;
    transform: translateX(60px);
    cursor: pointer;
    user-select: none;
    &.disabled {
      border-color: #d8d6d2;
      background-color: #d8d6d2;
      cursor: not-allowed;
      pointer-events: none;
    }
    @media (min-width: $small-width-up) {
      &:hover:not(.disabled) {
        background-color: #fff;
        color: $orange;
      }
    }
  }
  &.show {
    .list-wrapper,
    .head-wrap,
    .add-to-cart {
      opacity: 1;
      transform: translateX(0);
      transition: opacity 0.2s linear 0.2s, transform 0.2s ease 0.2s;
    }
    .add-to-cart {
      transition: color 0.2s linear, background-color 0.2s linear,
        border-color 0.2s linear, opacity 0.2s linear 0.2s,
        transform 0.2s ease 0.2s;
    }
  }
  .product-viewer {
    min-height: 220px;
    max-height: 390px;
    height: 55vw;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    .imaujee {
      max-width: 100%;
      max-height: 100%;
    }
    &.outside {
      display: none;
      .imaujee {
        object-fit: contain;
        object-position: center;
        width: 73.814%;
        height: 73.814%;
      }
    }
    &.inside {
      .img-arrow {
        position: absolute;
        background: no-repeat center/contain;
        top: calc(50% - 12px);
        height: 24px;
        width: 15px;
        cursor: pointer;
        transition: all 0.3s ease, left 0s linear, right 0s linear;
        &.prev {
          background-image: url("../../assets/left-arrow.svg");
          left: 16px;
        }
        &.next {
          background-image: url("../../assets/right-arrow.svg");
          right: 16px;
        }
      }
    }
    .loading-message {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
    @media (min-width: 100vh) {
      flex: 1;
      height: auto;
      min-height: initial;
      max-height: initial;
      border-right: 2px solid #000;
      transition: opacity 0.2s linear;
      opacity: 0;
      &.inside {
        display: none;
      }
      &.outside {
        display: flex;
      }
    }
    .grad-overlay {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
      background: radial-gradient(#a0a2b400, #a0a2b400, #a0a2b48e);
    }
    .product-thumbnails {
      position: absolute;
      top: 0;
      left: 0;
      width: 98px;
      padding: 6px;
      .product-thumbnail {
        cursor: pointer;
        margin-bottom: 6px;
        position: relative;
        display: flex;
        align-items: center;
        img {
          width: 100%;
        }
        &::before {
          content: "";
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 14px 0 14px 14px;
          border-color: transparent transparent transparent #a5a3a0;
          transition: transform 0.3s cubic-bezier(0.76, 0, 0.24, 1),
            border-color 0.2s linear;
          transform: scaleX(0);
          transform-origin: left;
          position: absolute;
          top: calc(50% - 14px);
          left: -6px;
        }
        &.current::before,
        &:hover::before {
          transform: scaleX(1);
        }
        &.current::before {
          border-left-color: $orange;
        }
        &::after {
          content: "";
          padding-top: 66%;
        }
      }
    }
  }
  &.show {
    @media (min-width: 100vh) {
      .product-viewer {
        opacity: 1;
        transition: opacity 0.2s linear 0.3s;
      }
    }
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
  z-index: 10;
  .x-pattern {
    width: 22px;
    height: 22px;
    &::before,
    &::after {
      background-color: #fff;
    }
  }
}
.save-product {
  display: flex;
}
.tmp-save {
  margin-right: 20px;
  font: 500 21px/1.2 $fnt-cm;
  color: $orange;
  letter-spacing: -0.02em;
}
.opt-save {
  font: 400 14px/1.2 $fnt-cm;
  position: relative;
  padding-left: 1.5714em;
  padding-right: 10px;
  padding-top: 0.4em;
  display: flex;
  align-items: center;
  cursor: pointer;
  &::before {
    content: "";
    width: 0.9285em;
    height: 0.9285em;
    border: 1px solid #bfbfbf;
    position: absolute;
    top: 50%;
    left: 0;
    border-radius: 100px;
    transform: translateY(-50%);
  }
  &::after {
    content: "";
    width: 0.9285em;
    height: 0.9285em;
    background-color: $orange;
    position: absolute;
    top: 50%;
    left: 1px;
    border-radius: 100px;
    transition: transform 0.2s ease;
    transform: translateY(-50%) scale(0);
  }
  &.selected:after {
    transform: translateY(-50%) scale(0.8);
  }
}
.save-product-form {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 200;
  transform: translate(-50%, -50%);
  background-color: #fff;
  padding: 64px 38px 56px;
  box-shadow: 0 0 0 10000px #0007;
  text-align: left;
  box-sizing: border-box;
  max-width: 450px;
  h2 {
    font: 500 28px/120% $fnt-cm;
    letter-spacing: -0.025em;
    margin-bottom: 1em;
  }
  p {
    font: 400 18px/120% $fnt-cm;
    margin-bottom: 1em;
  }
  input {
    border: 1px solid $grey;
    width: 100%;
    font: 600 12px/120% $fnt-cm;
    text-transform: uppercase;
    box-sizing: border-box;
    padding: 1.1em 1em 0.9em;
    margin-bottom: 20px;
    &::placeholder {
      font-weight: 400;
    }
  }
  .continue {
    background-color: $orange;
    color: #fff;
    font: 700 18px/120% $fnt-cm;
    letter-spacing: -0.025em;
    text-transform: uppercase;
    text-align: center;
    width: 100%;
    box-sizing: border-box;
    border: 2px solid $orange;
    padding: 0.9em 0.8em 0.7em;
    cursor: pointer;
    transition: background-color 0.2s linear, color 0.2s linear;
    &:hover {
      background-color: #fff;
      color: $orange;
    }
  }
  .x-pattern {
    &::before,
    &::after {
      background-color: #898a8d;
      width: 3px;
    }
  }
}
</style>

<style lang="scss">
#product-checkout-overlay {
  .terms {
    padding: 12px 8px;
    p {
      margin-bottom: 1em;
    }
    .terms-check {
      display: flex;
      align-items: flex-start;
      padding: 8px 10px 12px;
      a[href] {
        color: $orange;
        text-decoration: underline;
        font-weight: 500;
      }
      .checkbox {
        flex-shrink: 0;
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 1px solid #0e0e0e;
        position: relative;
        cursor: pointer;
        margin: 0 22px 0 0;
        transition: background-color 0.2s linear, border-color 0, 2s linear;
        &::before,
        &::after {
          content: "";
          position: absolute;
          transform-origin: right;
          background-color: $orange;
        }
        &::before {
          width: 12px;
          height: 5px;
          top: 11px;
          left: -2px;
          transform: rotate(40deg) scaleX(0);
          transition: transform 0.1s ease-out, transform-origin 0s;
        }
        &::after {
          width: 20px;
          height: 5px;
          top: -5px;
          left: -1px;
          transform: rotate(-53deg) scaleX(0);
          transition: transform 0.09s ease-in 0.17s, transform-origin 0s;
        }
        &.checked {
          background-color: #fff;
          border-color: #000;
          &::before,
          &::after {
            transform-origin: left;
          }
          &::before {
            transform: rotate(40deg) scaleX(1);
            top: 3px;
            left: 0px;
          }
          &::after {
            transform: rotate(-53deg) scaleX(1);
            top: 11px;
            left: 7px;
          }
        }
      }
      .message {
        max-width: 200px;
      }
    }
  }
}
</style>
