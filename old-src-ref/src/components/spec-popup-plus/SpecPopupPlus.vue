<template>
  <div class="spec-popup-plus" v-if="popup">
    <email-list-form
      v-if="
        popup.mode == 'fnp_email-default' ||
        popup.mode == 'fnp_thankyou-default'
      "
      :popup="popup"
    ></email-list-form>
    <bat-construction v-else-if="popup.mode == 'fnp_bat-construction'" :popup="popup"></bat-construction>
    <upload-file v-else-if="popup.mode == 'fnp_upload-file'" :popup="popup"></upload-file>
    <size-run-selector v-else-if="popup.mode == 'fnp_size-run'" :popup="popup"></size-run-selector>
    <slot></slot>
  </div>
</template>

<script lang="ts">
import { SpecialPopupInfo } from "@/types";
import { defineComponent } from "vue";
import EmailListForm from "./EmailListForm.vue";
import BatConstruction from "./BatConstruction.vue";
import UploadFile from "./UploadFile.vue";
import SizeRunSelector from "./SizeRunSelector.vue";

export default defineComponent({
  name: "SpecPopupPlus",
  components: {
    EmailListForm,
    BatConstruction,
    UploadFile,
    SizeRunSelector,
  },
  props: {
    popup: Object as () => SpecialPopupInfo | null,
  },
});
</script>
