<template>
  <div class="leathers-list-wrapper">
    <div v-if="page.info" class="attribute-info">
      <div v-if="page.info.title" class="title" v-html="page.info.title"></div>
      <div
        :class="['info', { closed: !readMore }]"
        v-html="page.info.body"
      ></div>
      <div class="read-more" @click="toggleBody">
        {{ readMore ? "read less" : "read more" }}
      </div>
    </div>
    <div
      v-if="page.info?.quicktips"
      :class="['quick-tips-section', { open: quickTipsOpen }]"
    >
      <div class="quick-tips-head" @click="expandQuickTips">
        <div class="quick-tips-icon"></div>
        <div class="quick-tips-opener"></div>
      </div>
      <div
        class="quick-tips-list-wrapper"
        :style="quickTipsOpen ? null : { height: height + 'px' }"
      >
        <div class="quick-tips-list" ref="list">
          <div
            v-for="tip in page.info.quicktips"
            :key="tip.title"
            class="quick-tip"
          >
            <div class="quick-tip-title">{{ tip.title }}</div>
            <div class="quick-tip-content" v-html="tip.content"></div>
          </div>
        </div>
      </div>
    </div>
    <div
      v-for="(leathers, category) in leatherCategories"
      :key="category"
      :class="['leather-category', sanitize(category)]"
    >
      <template v-if="leathers.length">
        <div class="category-title">
          <div class="background-ct">
            <div class="bg-base"></div>
            <div class="chevron"></div>
          </div>
          <div class="title">
            {{ category }}
            <div class="sub-t">leathers</div>
          </div>
        </div>
        <leather-guide-leather
          v-for="leather in leathers"
          :key="leather.id"
          :leather="leather"
          :class="{ compare: compare.includes(leather) }"
          @compare="toggleComparison"
        />
      </template>
    </div>
    <div
      :class="['compare-btn', { disabled: compare.length < 2 }]"
      @click="compareLeathers"
    >
      compare leathers
    </div>
  </div>
</template>

<script lang="ts">
import {
  ComplexLeatherOption,
  ComplexOption,
  Option,
  LeatherInfo,
} from "@/types";
import utils from "@/utils";
import { defineComponent, ref, Ref } from "vue";
import { mapMutations, mapState } from "vuex";
import LeatherGuideLeather from "./LeatherGuideLeather.vue";

export type ProcessedLeatherOption = ComplexLeatherOption & {
  bucket: ComplexOption;
  info: LeatherInfo;
};

export default defineComponent({
  name: "OptionsInfoPage",
  props: {
    page: Object,
  },
  components: {
    LeatherGuideLeather,
  },
  computed: {
    ...mapState([
      "objectIDMap",
      "options",
      "leatherGuideLeathers",
      "leatherGuideInfo",
    ]),
    leathersOG(): Array<ComplexLeatherOption & { bucket: ComplexOption }> {
      const leathers: Array<ComplexLeatherOption & { bucket: ComplexOption }> =
        [];
      if (this.page) {
        if (this.page.leathers && this.options instanceof Array) {
          for (let i = 0; i < this.page.leathers.length; i++) {
            const leatherID = this.page.leathers[i];
            const bucket = this.options.find((o: Option) => {
              if (!(o.type == "ComplexLabelOption" && o.subtype == "bucket")) {
                return false;
              }
              if (o.suboptions && o.suboptions.options.includes(leatherID)) {
                return true;
              }
              return false;
            });
            const leather: ComplexLeatherOption & {
              bucket: ComplexOption;
            } = Object.assign({ bucket }, this.objectIDMap[leatherID]);
            if (leather.info) {
              leather.info = this.objectIDMap[leather.info];
            }
            leathers.push(leather);
          }
        } else if (this.page.buckets) {
          for (let i = 0; i < this.page.buckets.length; i++) {
            const bucketID = this.page.buckets[i];
            const bucket: ComplexOption = this.objectIDMap[bucketID];
            if (bucket && bucket.suboptions) {
              const opts = bucket.suboptions.options
                .map((id) => {
                  const leather = Object.assign(
                    { bucket },
                    this.objectIDMap[id]
                  );
                  if (leather.info) {
                    leather.info = this.objectIDMap[leather.info];
                  }
                  return leather;
                })
                .filter((o) => o);
              leathers.push(...opts);
            }
          }
        }
      }
      return leathers;
    },
    leatherCategories(): {
      [category: string]: Array<
        ComplexLeatherOption & { info: LeatherInfo; bucket: ComplexOption }
      >;
    } {
      if (this.leatherGuideLeathers && this.leatherGuideLeathers.length) {
        const mappedLeathers = this.leatherGuideLeathers
          .map((obj: { leather: string; bucket: string }) => {
            const wrap: any = {};
            const leatherOpt = this.objectIDMap[obj.leather];
            if (leatherOpt) {
              Object.assign(wrap, leatherOpt);
              if (wrap.info) {
                const info = this.objectIDMap[wrap.info];
                if (info) {
                  wrap.info = info;
                }
              }
              const bucket = this.objectIDMap[obj.bucket];
              if (bucket) {
                wrap.bucket = bucket;
              }
              return wrap;
            }
            return false;
          })
          .filter(
            (o: any) =>
              o && o.info instanceof Object && o.bucket instanceof Object
          );
        const categories: any = {};
        if (this.leatherGuideInfo?.categoryOrder) {
          for (let i = 0; i < this.leatherGuideInfo.categoryOrder.length; i++) {
            const catName = this.leatherGuideInfo.categoryOrder[i];
            categories[catName] = [];
          }
        }
        for (let i = 0; i < mappedLeathers.length; i++) {
          const leather: ComplexLeatherOption & {
            info: LeatherInfo;
            bucket: ComplexOption;
          } = mappedLeathers[i];
          if (!(leather.info.category in categories)) {
            categories[leather.info.category] = [];
          }
          categories[leather.info.category].push(leather);
        }
        return categories;
      }
      return {};
    },
  },
  methods: {
    ...mapMutations(["addLeatherComparePage"]),
    toggleComparison(leather: ProcessedLeatherOption) {
      const index = this.compare.indexOf(leather);
      if (index > -1) {
        this.compare.splice(index, 1);
      } else {
        this.compare.push(leather);
      }
    },
    compareLeathers() {
      if (this.compare.length > 1) {
        this.addLeatherComparePage(this.compare);
      }
    },
    toggleBody() {
      this.readMore = !this.readMore;
    },
    sanitize(subject: string): string {
      return utils.sanitize(subject);
    },
    expandQuickTips() {
      if (this.quickTipsOpen) {
        if (this.list) {
          this.height = this.list.getBoundingClientRect().height;
          this.quickTipsOpen = false;
          requestAnimationFrame(() => {
            this.height = 0;
          });
        }
      } else {
        if (this.list) {
          this.height = this.list.getBoundingClientRect().height;
          setTimeout(() => {
            this.quickTipsOpen = true;
          }, 300);
        }
      }
    },
  },
  setup() {
    const compare: Ref<Array<ProcessedLeatherOption>> = ref([]);
    const readMore: Ref<boolean> = ref(false);
    const quickTipsOpen: Ref<boolean> = ref(false);
    const height: Ref<number> = ref(0);
    const list: Ref<HTMLElement | null> = ref(null);
    return {
      compare,
      readMore,
      quickTipsOpen,
      height,
      list,
    };
  },
});
</script>

<style lang="scss" scoped>
.leathers-list-wrapper {
  margin-bottom: 55px;
  .attribute-info {
    padding: 25px 36px 26px;
    font-size: 13px;
    font-weight: 300;
    line-height: 138.461%;
    text-align: left;
    .title {
      font-weight: 700;
    }
    .info {
      overflow: hidden;
      max-height: 1100px;
      transition: max-height 0.4s linear;
      &.closed {
        max-height: 64px;
      }
    }
    .read-more {
      margin-top: 1em;
      text-transform: uppercase;
      color: $orange;
      cursor: pointer;
      user-select: none;
    }
  }
  .quick-tips-section {
    .quick-tips-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #d8d6d2;
      border-top: 1px solid #d8d6d2;
      padding: 15px 20px;
      cursor: pointer;
      .quick-tips-icon {
        width: 112px;
        height: 50px;
        background: url(../../assets/quick-tips.svg) no-repeat center/contain;
      }
      .quick-tips-opener {
        position: relative;
        width: 22px;
        height: 14px;
        margin-right: 10px;
        &::before,
        &::after {
          content: "";
          position: absolute;
          top: calc(50% - 2px);
          height: 4px;
          width: 16px;
          background-color: #828282;
          transform-origin: 50% calc(100% - 2px);
          transition: transform 0.3s ease;
        }
        &::before {
          border-top-left-radius: 1px;
          border-bottom-left-radius: 1px;
          transform: rotate(45deg);
          left: -2px;
        }
        &::after {
          border-top-right-radius: 1px;
          border-bottom-right-radius: 1px;
          transform: rotate(-45deg);
          right: -1px;
        }
      }
    }
    .quick-tips-list-wrapper {
      overflow: hidden;
      height: auto;
      transition: height 0.3s ease;
    }
    &.open {
      .quick-tips-head .quick-tips-opener {
        &::before {
          transform: rotate(-45deg);
        }
        &::after {
          transform: rotate(45deg);
        }
      }
      .quick-tips-list-wrapper {
        height: auto;
      }
    }
  }
  .leather-category {
    margin-bottom: 12px;
    .category-title {
      min-height: 108px;
      font: 700 25px/120% $fnt-cm;
      position: relative;
      .background-ct {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        .bg-base {
          height: calc(100% - 20px);
          background-color: #f1f2f2;
        }
        .chevron {
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 20px 315px 0 315px;
          border-color: #f1f2f2 transparent transparent transparent;
          @media (max-width: 630px) {
            border-width: 20px 50vw 0 50vw;
          }
        }
      }
      .title {
        position: relative;
        padding: 25px 10px 0;
        text-transform: uppercase;
        font: 600 21px/120% $fnt-cm;
        @media (min-width: $medium-width-up) {
          font-size: 24px;
        }
        .sub-t {
          font-weight: 400;
        }
      }
    }
  }
  .compare-btn {
    position: fixed;
    bottom: 0;
    right: 0;
    width: 100%;
    max-width: 630px;
    height: 55px;
    color: #fff;
    z-index: 2;
    background-color: #000;
    border: 2px solid #000;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 700 19px/100% $fnt-ev;
    text-transform: uppercase;
    box-sizing: border-box;
    user-select: none;
    padding-top: 6px;
    cursor: pointer;
    transition: all 0.25s ease, color 0.13s linear 0.21s;
    @media (min-width: $small-width-up) {
      font-size: 24px;
      &:hover {
        background-color: #fff;
        color: #000;
        border-color: #000;
        transition: all 0.25s ease;
      }
    }
    &.disabled,
    .page:not(.current) > & {
      height: 0;
      overflow: hidden;
      color: transparent;
      border-width: 0px;
      padding: 0;
      transition: all 0.25s ease 0.08s, color 0.13s linear;
    }
  }
}
</style>
<style lang="scss">
.leathers-list-wrapper .quick-tips-list {
  padding: 38px;
  text-align: left;
  font: 300 16px/138.461% $fnt-cm;
  @media (max-width: $small-width) {
    font-size: 13px;
  }
  .quick-tip {
    margin-bottom: 38px;
  }
  .quick-tip-title {
    font: 800 17px/100% $fnt-cm;
    text-transform: uppercase;
    margin-bottom: 0.7em;
  }
  p {
    margin-bottom: 1em;
  }
}
</style>

<style>
.leathers-list-wrapper .attribute-info .info p {
  margin-bottom: 1em;
}
</style>