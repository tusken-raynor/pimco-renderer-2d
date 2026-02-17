<template>
  <div v-if="fetchedComments.length" class="review-section">
    <!-- <div class="section-title">reviews</div> Removed from design updated 10/2025 -->
    <div class="reviews-container">
      <div :class="['review-wrapper', { open }]" :style="height ? { height: height + 'px' } : null" ref="wrap">
        <div v-for="(review, i) in fetchedComments" :key="review.id" :id="review.id + '-review'" :class="[
          'review',
          {
            current: i == reviewNum,
            'current-2': i == (reviewNum + 1) % fetchedComments.length,
            'current-3': i == (reviewNum + 2) % fetchedComments.length,
          },
        ]" ref="reviewEl">
          <div class="rating">
            <template v-for="s in review.rating" :key="s">&#11089;</template>
          </div>
          <div class="review-content" v-html="'&#8220;' + review.content + '&#8221;'"></div>
          <div class="author-date">
            <strong>&#8211; <span v-html="review.author"> </span></strong><br> {{
              new Date(review.date).toLocaleDateString()
            }}
          </div>
        </div>
      </div>
      <div class="review-opener" @click="toggleReview">
        {{ open ? "read less" : "read more" }}
      </div>
    </div>
    <div role="button" tabindex="0" class="previous-review arrow" @click="previousReview"></div>
    <div role="button" tabindex="0" class="next-review arrow" @click="nextReview"></div>
    <a :href="writeReviewURL" target="_blank" class="write-review">write a review</a>
  </div>
</template>

<script lang="ts">
import data from "@/data";
import { WoocommerceReview } from "@/types";
import woocommerce from "@/woocommerce";
import { defineComponent, ref, Ref } from "vue";
import { mapGetters } from "vuex";

export default defineComponent({
  name: "StartPageReviews",
  props: {
    reviews: Object as () =>
      | Array<string>
      | { wooid: string | number; count?: number },
  },
  computed: {
    ...mapGetters({ product: "getProduct" }),
    writeReviewURL(): string {
      if (this.product) {
        const wooID = woocommerce.getProduct(this.product.id);
        if (wooID) {
          return `https://nokona.com/?p=${wooID}&write-review`;
        }
      }
      return "";
    },
    reviewID(): string {
      if (this.fetchedComments.length) {
        return this.fetchedComments[this.reviewNum].id + "-review";
      }
      return "";
    },
    tallestReviewEl(): HTMLElement | null {
      if (this.fetchedComments?.length && this.wrap) {
        if (window.innerWidth <= 750) {
          return document.getElementById(this.reviewID);
        } else {
          const reviews = [
            this.wrap.children[this.reviewNum],
            this.wrap.children[
            (this.reviewNum + 1) % this.wrap.children.length
            ],
            this.wrap.children[
            (this.reviewNum + 2) % this.wrap.children.length
            ],
          ];
          let max = reviews[0].getBoundingClientRect().height;
          let chosenReview = reviews[0];
          for (let i = 1; i < reviews.length; i++) {
            const height = reviews[i].getBoundingClientRect().height;
            if (height > max) {
              max = height;
              chosenReview = reviews[i];
            }
          }
          return chosenReview as HTMLElement;
        }
      }
      return null;
    },
  },
  methods: {
    incrementReviewNum() {
      if (this.reviews) {
        if (window.innerWidth > 750) {
          this.reviewNum = (this.reviewNum + 3) % this.fetchedComments.length;
        } else {
          this.reviewNum = (this.reviewNum + 1) % this.fetchedComments.length;
        }
      }
    },
    decrementReviewNum() {
      if (this.reviews) {
        if (window.innerWidth > 750) {
          this.reviewNum =
            (this.reviewNum - 3 + this.fetchedComments.length) %
            this.fetchedComments.length;
        } else {
          this.reviewNum =
            (this.reviewNum - 1 + this.fetchedComments.length) %
            this.fetchedComments.length;
        }
      }
    },
    nextReview() {
      if (!this.open) {
        if (this.reviews) {
          this.incrementReviewNum();
        }
      } else {
        this.toggleReview();
        setTimeout(() => {
          if (this.reviews) {
            this.incrementReviewNum();
          }
        }, 300);
      }
    },
    previousReview() {
      if (!this.open) {
        if (this.reviews) {
          this.decrementReviewNum();
        }
      } else {
        this.toggleReview();
        setTimeout(() => {
          if (this.reviews) {
            this.decrementReviewNum();
          }
        }, 300);
      }
    },
    toggleReview() {
      const reviewEl = this.tallestReviewEl;
      if (reviewEl) {
        const height = reviewEl.getBoundingClientRect().height;
        if (!this.open) {
          this.open = true;
          this.height = height;
          setTimeout(() => {
            this.height = 0;
          }, 300);
        } else {
          this.open = false;
          this.height = height;
          requestAnimationFrame(() => {
            this.height = 0;
          });
        }
      }
    },
  },
  setup() {
    const height: Ref<number> = ref(0);
    const reviewNum: Ref<number> = ref(0);
    const open: Ref<boolean> = ref(false);
    const wrap: Ref<HTMLElement | null> = ref(null);
    const fetchedComments: Ref<Array<WoocommerceReview>> = ref([]);
    return { reviewNum, height, open, wrap, fetchedComments };
  },
  mounted() {
    setTimeout(() => {
      // Grab the comments if we're supposed to
      if (this.reviews instanceof Array) {
        if (this.reviews.length) {
          data.fetchComments(this.reviews).then((comments) => {
            this.fetchedComments = comments;
          });
        }
      } else if (this.reviews?.wooid) {
        data.fetchComments(this.reviews).then((comments) => {
          this.fetchedComments = comments;
        });
      }
    }, 500);
  },
});
</script>

<style lang="scss" scoped>
.review-section {
  padding: 150px 92px 150px;
  position: relative;
  background-color: #f1f2f2;

  @media (min-width: 1700px) {
    padding-left: calc((100% - 1516px) / 2);
    padding-right: calc((100% - 1516px) / 2);
  }

  @media (max-width: $medium-width) {
    padding: 125px 60px 125px;
  }

  @media (max-width: $large-width-up) {
    padding: 135px 92px 135px;
  }

  .section-title {
    font: 24px/120% $fnt-ev;
    letter-spacing: 0.073em;
    margin-bottom: 26px;
  }

  .reviews-container {
    position: relative;

    .review-opener {
      position: absolute;
      top: calc(100% + 5px);
      left: 50%;
      transform: translateX(-50%);
      font: 12px/120% $fnt-cm;
      text-transform: uppercase;
      width: 100%;
      cursor: pointer;
      user-select: none;
    }
  }

  .review-wrapper {
    height: 188px;
    overflow: hidden;
    position: relative;
    transition: height 0.3s ease;

    @media (min-width: $medium-width-up) {
      display: flex;
      align-items: flex-start;
    }

    @media (max-width: $large-width) {
      height: 280px;
    }

    &::after {
      position: absolute;
      content: "";
      width: 100%;
      height: 14px;
      background-image: linear-gradient(#ffffff00, #f1f2f2);
      bottom: 0;
      left: 0;
      transition: transform 0.3s ease;
      transform-origin: bottom;
    }

    &.open {
      height: auto;

      &::after {
        transform: scaleY(0);
      }
    }
  }

  .review {
    font: 300 16px/133.333% $fnt-cm;
    display: none;

    &.current {
      display: block;
      order: 1;
    }

    &.current-2 {
      order: 2;
    }

    &.current-3 {
      order: 3;
    }

    @media (min-width: $medium-width-up) {
      width: 33.3333%;
      padding-inline: 16px;
      box-sizing: border-box;

      &.current-2,
      &.current-3 {
        display: block;
      }
    }
  }

  .author-date {
    margin-bottom: 0.5em;
    margin-top: 1em;

    @media (max-width: $medium-width) {
      margin-top: 0.5em;
    }

  }

  .rating {
    font-size: 30px;
    letter-spacing: -0.05em;
    margin-bottom: 0.2em;
  }

  .write-review {
    border-radius: 28px;
    display: inline-block;
    margin-top: 36px;
    background-color: $orange;
    border: 2px solid $orange;
    padding: calc(1.4em - 4px) calc(1.4em + 25px) calc(1.3em - 4px);
    color: #fff;
    font: 14px/ 0.9 $fnt-ev;
    transition: color 0.2s linear, background-color 0.2s linear;

    &:hover {
      background-color: #fff;
      color: $orange;
    }
  }

  .arrow {
    position: absolute;
    width: 24px;
    height: 40px;
    top: 220px;
    transform: translateY(-50%);
    cursor: pointer;

    &::before,
    &::after {
      position: absolute;
      content: "";
      background-color: #000;
      width: 18px;
      height: 4px;
      top: 50%;
    }

    &::before {
      transform: translate(-50%, -50%) rotate(-45deg);
    }

    &::after {
      transform: translate(-50%, -50%) rotate(45deg);
    }

    &.previous-review {
      left: 32px;

      &::before,
      &::after {
        transform-origin: 2px;
        border-bottom-right-radius: 2px;
        border-top-right-radius: 2px;
      }

      @media (min-width: 1700px) {
        left: calc((100% - 1700px) / 2 + 32px);
      }

      @media (max-width: $medium-width) {
        left: 15px;
      }
    }

    &.next-review {
      right: 32px;

      &::before,
      &::after {
        transform-origin: calc(100% - 2px);
        border-bottom-left-radius: 2px;
        border-top-left-radius: 2px;
      }

      @media (min-width: 1700px) {
        right: calc((100% - 1700px) / 2 + 32px);
      }

      @media (max-width: $medium-width) {
        right: 15px;
      }
    }
  }
}
</style>