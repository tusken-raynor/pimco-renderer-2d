<template>
  <transition name="fade" appear>
    <div
      v-if="isDev && editorPimco"
      :id="'swatch-pimco-editor-' + option.id"
      class="swatch-pimco-editor"
      @mousedown.stop="closeSwatchPimcoEditor"
      title=""
    >
      <div class="swatch-editor-modal" @mousedown.stop @click.stop="closeColorPickers()" ref="modal">
        <template v-for="(value, key) in pimcoProperties" :key="key">
          <label :for="key + option.id">{{ value }}</label>
          <select
            v-if="key == 'mode'"
            :name="key"
            :id="'pimco-editor-input-' + key"
          >
            <option
              v-for="mode in ['color', 'image']"
              :value="mode"
              :selected="mode == editorPimco[key]"
            >
              {{ mode }}
            </option>
          </select>
          <div v-else-if="key == 'color'" class="color-editor">
            <template v-if="isEnumerable(editorPimco[key])">
              <LvColorpicker
                v-for="(color, index, i) in editorPimco[key]"
                :value="color"
                :name="key + '.' + index"
                :label="enumColorLabel(key, index)"
                hidePalette
                ref="colorpicker"
                @click.stop="() => closeColorPickers(firstNum(i, index, 0))"
              />
            </template>
            <LvColorpicker
              v-else
              :value="toStringValue(editorPimco[key])"
              :name="key"
              hidePalette
              ref="colorpicker"
              @click.stop="() => closeColorPickers(0)"
            />
          </div>
          <input
            v-else
            :id="'pimco-editor-input-' + key"
            type="text"
            :name="key"
            :data-type="typeOf(editorPimco[key])"
            :value="toStringValue(editorPimco[key])"
          />
        </template>
        <div class="save-button" @click="saveSwatchPimcoEditor">
          SAVE VALUES
        </div>
        <div class="save-button" @click="resetSwatchPimcoEditor">
          RESET VALUES
        </div>
        <div
          class="close-button x-pattern"
          @click="closeSwatchPimcoEditor"
        ></div>
      </div></div
  ></transition>
</template>

<script lang="ts">
import { starters } from "@/store/initialize";
import { defineComponent } from "vue";
import { mapState, mapMutations } from "vuex";
import { Option, ProductImageContributer } from "@/types";
import LvColorpicker from "lightvue/color-picker";
import { type } from "os";
import utils from "@/utils";

export default defineComponent({
  name: "PimcoEditor",
  components: {
    LvColorpicker,
  },
  computed: {
    ...mapState(["editorPimcoOption"]),
    isDev(): boolean {
      return starters.dev;
    },
    option(): Option & { pimco?: any; pimco3d?: any } {
      const option =
        this.editorPimcoOption && "option" in this.editorPimcoOption
          ? this.editorPimcoOption.option
          : this.editorPimcoOption;
      return option;
    },
    editorPimco(): ProductImageContributer | null {
      let pimco: ProductImageContributer | null = null;
      if (this.option?.pimco) {
        if (this.option?.pimco?.USECASCADING) {
          pimco = this.option.pimco.USECASCADING;
        } else {
          const pimcoKeys = Object.keys(this.option?.pimco || {});
          if (pimcoKeys.length) {
            pimco = this.option.pimco[pimcoKeys[0]] || null;
          }
        }
      } else if (this.option?.pimco3d) {
        if (this.option?.pimco3d?.USECASCADING) {
          pimco = this.option.pimco3d.USECASCADING.albedo || this.option.pimco3d.USECASCADING;
        } else {
          const pimcoKeys = Object.keys(this.option?.pimco3d || {});
          if (pimcoKeys.length) {
            pimco = this.option.pimco3d[pimcoKeys[0]]?.albedo || this.option.pimco3d[pimcoKeys[0]] || null;
          }
        }
      }
      return pimco;
    },
  },
  data() {
    const pimcoProperties = {
      mode: "Swatch Mode",
      color: "Color Value",
      texture: "Texture Image",
      alpha: "Primary Alpha",
      blend: "Blend Mode",
      hlalpha1: "Highlight Alpha 1",
      hlblend1: "Highlight Blend 1",
      hlalpha2: "Highlight Alpha 2",
      hlblend2: "Highlight Blend 2",
      eindex: "Default Transparency Index",
      altbaseimage: "Alternate Base Image Key",
    };
    return {
      pimcoProperties,
      formatIntervalID: -1,
      resetData: "null"
    };
  },
  watch: {
    editorPimco(val) {
      this.resetData = JSON.stringify(val);
    }
  },
  methods: {
    ...mapMutations(["setEditorPimcoOption"]),
    toStringValue(val: any) {
      if (val instanceof Object) {
        return JSON.stringify(val);
      } else if (val != undefined) {
        return val.toString();
      }
      return val;
    },
    saveSwatchPimcoEditor() {
      if (this.editorPimco) {
        const inputs = document.querySelectorAll(
          `#swatch-pimco-editor-${this.option.id} input, #swatch-pimco-editor-${this.option.id} select`
        );
        for (let i = 0; i < inputs.length; i++) {
          const input = inputs[i] as HTMLInputElement;
          if (input.value) {
            let value = this.properType(input.value);
            if (input.classList.contains('lv-input__element')) {
              // If the input comes from a color picker convert the css color to rgb string
              value = utils.colorToRGBString(value);
            }
            utils.setNested(this.editorPimco, value, input.name.split("."));
          }
        }
      }
      // Close any color pickers
      this.closeColorPickers();
      if (this.editorPimcoOption?.onClose) {
        const callback = this.editorPimcoOption.onClose;
        requestAnimationFrame(() => {
          callback();
        });
      }
    },
    resetSwatchPimcoEditor() {
      const resetData = JSON.parse(this.resetData);
      if (this.editorPimco) {
        for (const key in resetData) {
          this.editorPimco[key] = resetData[key];
        }
      }
    },
    isEnumerable(value: any): value is Object {
      return value instanceof Object;
    },
    typeOf(value: any) {
      return typeof value;
    },
    properType(value: string) {
      try {
        return JSON.parse(value);
      } catch (error) {
        return value;
      }
    },
    enumColorLabel(key: string, index: number | string) {
      if (typeof index == "number") {
        return `${key} ${index + 1}`;
      } 
      return `${index} ${key}`;
    },
    closeColorPickers(exempted?: number) {
    const colorPickerComponents = this.getColorPickerComponents();
      for (let i = 0; i < colorPickerComponents.length; i++) {
        if (i == exempted) {
          continue;
        }
        const colorPicker = colorPickerComponents[i];
        if (colorPicker?.close instanceof Function) {
          colorPicker.close();
        } 
      }
    },
    closeSwatchPimcoEditor() {
      this.setEditorPimcoOption(null);
    },
    firstNum(...values: any[]) {
      return values.find((value) => typeof value == "number");
    },
    getColorPickerComponents(): any[] {
      if (this.$refs.colorpicker instanceof Array) {
        return this.$refs.colorpicker;
      }
      return [];
    },
  }
});
</script>

<style scoped lang="scss">
.swatch-pimco-editor {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: $shrowder-z;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  cursor: default;
  .swatch-editor-modal {
    box-shadow: 0 0 7px 1px rgba(0, 0, 0, 0.548);
    min-height: 100%;
    max-width: 400px;
    background-color: #fff;
    box-sizing: border-box;
    padding: 45px 35px 35px;
    display: flex;
    flex-direction: column;
    label {
      padding-left: 4px;
      text-align: left;
      margin-top: 6px;
      font-size: 14px;
    }
    select {
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      padding: 0.5em;
      border: 1px solid #767676;
      border-radius: 3px;
      background-color: #fff;
      cursor: pointer;
    }
    .save-button {
      background-color: $orange;
      padding: 4px;
      margin-top: 8px;
      color: #fff;
      cursor: pointer;
    }
    .close-button {
      height: 20px;
      width: 20px;
      position: absolute;
      top: 10px;
      right: 10px;
      cursor: pointer;
    }
  }
  .color-editor {
    width: calc(100% - 25px);
    .lv-colorpicker-wrapper {
      width: 100%;
      background-color: #fff;
    }
    ::v-deep {
      .lv-input__field {
        background-color: #fff;
        border: 1px solid #767676;
        border-radius: 3px;
      }
      .lv-input__label {
        text-align: left;
        margin-bottom: 0;
        text-transform: capitalize;
        font-weight: 300;
        font-size: 12px;
        padding-left: 8px;
      }
    }
  }
}
</style>
<style>
.vc-input__input, .lv-input__element {
  text-transform: lowercase;
}
</style>
