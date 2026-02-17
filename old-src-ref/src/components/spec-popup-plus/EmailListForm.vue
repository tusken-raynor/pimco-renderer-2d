<template>
  <div v-if="popup?.payload" class="email-list-form-wrap">
    <div class="image">
      <BaseImage :data="imageData" />
    </div>
    <div
      class="content"
      :data-icon-top="popup.payload.top_icon || null"
      :data-icon-bottom="popup.payload.bottom_icon || null"
    >
      <div class="title" v-html="popup.title"></div>
      <div class="message" v-html="popup.message"></div>
      <div
        v-if="popup.payload.mailchimp_url"
        class="form"
        :action="popup.payload.mailchimp_url"
        method="post"
        target="_blank"
      >
        <input
          type="email"
          value=""
          placeholder="EMAIL ADDRESS"
          name="EMAIL"
          required
          ref="emailInput"
        />
        <button @click="onSubmit">{{ popup.payload.btn_label }}</button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { ImageData, SpecialPopupInfo } from "@/types";
import { defineComponent, ref, Ref } from "vue";
import jsonp from "@/jsonp";
import { mapMutations } from "vuex";

export default defineComponent({
  name: "SpecPopupPlus",
  props: {
    popup: Object as () => SpecialPopupInfo | null,
  },
  computed: {
    imageData(): ImageData | null {
      if (this.popup?.payload?.image) {
        return {
          src: this.popup.payload.image.url,
          srcset: {
            "1x": this.popup.payload.image.url,
            "1.5x": this.popup.payload.image.url2x,
          },
          alt: this.popup.payload.image.alt || "",
        };
      }
      return null;
    },
  },
  methods: {
    ...mapMutations(["setSpecialPopup"]),
    onSubmit() {
      if (!this.popup?.payload?.mailchimp_url) return;
      if (!this.emailInput) return;

      // Extract the url params from from the action url
      const url = new URL(
        this.urlJSONPConform(this.popup.payload.mailchimp_url)
      );
      const queryparams = new URLSearchParams(url.search);
      const u = queryparams.get("u");
      const id = queryparams.get("id");
      const f_id = queryparams.get("f_id");
      const tags = queryparams.get("tags");

      if (!u || !id) return;

      const params: { [key: string]: string } = {
        u,
        id,
        EMAIL: this.emailInput.value,
        subscribe: "Subscribe",
      };
      if (f_id) params.f_id = f_id;
      if (tags) params.tags = tags;
      // Now make the request
      jsonp
        .request(url.origin + url.pathname, {
          callbackKey: "c",
          params,
        })
        .catch(console.error)
        .then(() => {
          if (this.popup?.payload?.next_popup) {
            // Render the next popup
            this.setSpecialPopup(this.popup.payload.next_popup);
          } else {
            this.setSpecialPopup(null);
          }
        });
    },
    urlJSONPConform(url: string) {
      if (
        url.includes("/subscribe/post/") ||
        url.includes("/subscribe/post?")
      ) {
        return url.replace("/subscribe/post", "/subscribe/post-json");
      }
      return url;
    },
  },
  setup() {
    const emailInput: Ref<HTMLInputElement | null> = ref(null);
    return {
      emailInput,
    };
  },
  mounted() {
    setTimeout(() => {
      console.log(this.popup);
    }, 200);
  },
});
</script>

<style lang="scss" scoped>
.email-list-form-wrap {
  display: flex;
  flex-wrap: wrap-reverse;
}
.image,
.content {
  width: 50%;
  @media (max-width: $small-width) {
    width: 100%;
  }
}
.image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 24px;
  box-sizing: border-box;
  font-size: 1px;

  @media (max-width: 850px) and (min-width: $small-width-up) {
    font-size: 0.117647vw;
  }
  @media (max-width: 375px) {
    font-size: 0.26666vw;
  }

  &[data-icon-top]:not([data-icon-top="none"])::before,
  &[data-icon-bottom]:not([data-icon-bottom="none"])::after {
    content: "";
    display: block;
  }
  &[data-icon-top="flag"]::before,
  &[data-icon-bottom="flag"]::after {
    background: no-repeat center/contain url(../../assets/t-flag.svg);
    width: 68px;
    height: 25px;
  }
  &[data-icon-top="nokona"]::before,
  &[data-icon-bottom="nokona"]::after {
    background: no-repeat center/contain url(../../assets/nokona.svg);
    width: 116px;
    height: 21px;
  }
  &[data-icon-top]::before {
    margin: 12em 0 24em;
  }
  &[data-icon-top]::after {
    margin: 24em 0 12em;
  }
}
.title,
.message {
  max-width: 302px;
}
.title {
  #special-popup .modal &.title.title {
    font: 300 44em/105% $fnt-ev;
    color: $grey;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding-bottom: 6px;
    padding-right: 0;
    margin-bottom: 0;
    margin-right: 0;
    border-bottom: initial;
  }
  .type-fnp_email-default & {
    margin-top: auto;
  }
  #special-popup.type-fnp_thankyou-default &.title.title {
    font-size: 55em;
    margin-top: auto;
  }
}
.message {
  #special-popup .modal &.message.message {
    color: #000;
    font: 300 16em/120% $fnt-cm;
    letter-spacing: -0.011em;
    padding-top: 0.75em;
  }
  .type-fnp_email-default & {
    padding-bottom: 12px;
  }
  .type-fnp_thankyou-default & {
    margin-bottom: auto;
  }
  > p {
    text-align: inherit;
    margin-bottom: 1em;
    &:last-child {
      margin-bottom: 0;
    }
  }
}

.form {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  margin-top: 6%;
  font: 300 12em/100% $fnt-ev;

  .type-fnp_email-default & {
    margin-bottom: auto;
  }
  input[type="email"] {
    max-width: 100%;
    min-width: 202px;
    padding: 0.9em 1em 0.7em;
    font: inherit;
    border: 1px solid $grey;
    box-sizing: border-box;
    margin-bottom: 9%;
    &::placeholder {
      color: #6b6c6c;
      font: inherit;
      font-size: 0.8em;
    }
  }
  button {
    max-width: 100%;
    min-width: 202px;
    padding: 1em;
    font: inherit;
    border: solid 1px #000;
    background: #000;
    cursor: pointer;
    text-transform: uppercase;
    color: #fff;
    transition: all 0.3s ease;
    &:hover {
      border-color: $orange;
      background: #fff;
      color: $orange;
    }
  }
}
</style>
