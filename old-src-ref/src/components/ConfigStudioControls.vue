<template>
  <div
    v-if="displayStudioControls"
    :class="['config-studio-controls', { opened }]"
  >
    <button class="open-toggle" @click="toggleOpeness"><span>{{ opened ? '-' : '+' }}</span></button>
    <div class="tabs">
      <button :class="['studio-tab', { current: page == 'layout' }]" @click="setPage('layout')">Layout</button>
      <button :class="['studio-tab', { current: page == 'lights' }]" @click="setPage('lights')">Lighting</button>
      <button :class="['studio-tab', { current: page == 'poses' }]" @click="setPage('poses')">Poses</button>
      <button :class="['studio-tab', { current: page == 'options' }]" @click="setPage('options')">Options</button>
      <button :class="['studio-tab', { current: page == 'load' }]" @click="setPage('load')">Load</button>
    </div>
    <div class="page-content">
      <div v-if="page == 'load'" class="load-settings">
        <h2>Load Studio Settings</h2>
        <input type="file" accept=".json" @change="handleFileUpload" />
      </div>
      <div v-else-if="page == 'poses'" class="pose-settings">
        <div v-if="!studioPoses.length" class="poses-list">No Saved Poses</div>
        <div class="poses-list" v-else>
          <div class="studio-pose" v-for="pose in studioPoses" @click="setPose(pose.euler)">
            <span>Apply &quot;{{ pose.name }}&quot;</span>
            <button class="delete-pose-btn" @click.stop="deletePose(pose.name)">&cross;</button>
          </div>
        </div>
        <div class="save-pose">
          <input type="text" v-model="poseName" placeholder="Pose Name" />
          <button class="studio-btn save-pose-btn" @click="savePose" :disabled="!poseName">Save Pose</button>
        </div>
      </div>
      <div v-else-if="page == 'lights'" class="light-settings">
        <div v-if="!studioLighting || !studioLighting.length" class="lights-list">No Lights</div>
        <div class="lights-list" v-else>
          <div class="studio-light" v-for="light in studioLighting" :class="{ expanded: expandedLight == light.name }">
            <div class="light-head" @click="expandLight(light.name)">
              <span>{{ light.name }}</span>
              <button class="expand-light-btn">{{ expandedLight == light.name ? '-' : '+' }}</button>
            </div>
            <div class="light-expand-wrap">
              <div class="light-details">
                <div class="light-type">Type: <b>{{ typeToWords(light.type) }}</b></div>
                <div class="intensity">
                  <input type="range" step="0.01" min="0" max="5" :value="light.intensity" @input="e => updateLightValue(e, 'intensity', light.name)" />
                  <span>{{ Number(light.intensity).toFixed(2) }}</span>
                </div>
                <div class="colors">
                  <input type="color" @input="e => updateLightValue(e, 'color', light.name)" :value="'#' + light.color.toString(16).padStart(6, '0')" />
                  <input v-if="light.type == 'HemisphereLight'" type="color"  @input="e => updateLightValue(e, 'color2', light.name)" :value="'#' + light.color2.toString(16).padStart(6, '0')" />
                </div>
                <div class="position" v-if="light.type == 'DirectionalLight' || light.type == 'PointLight'" :data-json="stringify(light.position)">
                  <div>Position (X, Y, Z):</div>
                  <input type="number" step="0.01" :value="round(light.position[0], 2)" @input="e => updateLightValue(e, 'positionX', light.name)" />
                  <input type="number" step="0.01" :value="round(light.position[1], 2)" @input="e => updateLightValue(e, 'positionY', light.name)" />
                  <input type="number" step="0.01" :value="round(light.position[2], 2)" @input="e => updateLightValue(e, 'positionZ', light.name)" />
                </div>
                <div class="direction" v-if="light.type == 'DirectionalLight'">
                  <div>Look (X, Y, Z):</div>
                  <input type="number" step="0.01" :value="round(light.target[0], 2)" @input="e => updateLightValue(e, 'targetX', light.name)" />
                  <input type="number" step="0.01" :value="round(light.target[1], 2)" @input="e => updateLightValue(e, 'targetY', light.name)" />
                  <input type="number" step="0.01" :value="round(light.target[2], 2)" @input="e => updateLightValue(e, 'targetZ', light.name)" />
                </div>
                <div class="shadowing" v-if="light.type == 'DirectionalLight' || light.type == 'PointLight'">
                  <input type="checkbox" :id="'shadowing-' + light.name" :checked="light.shadowing" @input="e => updateLightValue(e, 'shadowing', light.name)" />
                  <label :for="'shadowing-' + light.name">Light Casts Shadow</label>
                </div>
                <div class="remove-light-btn-wrap">
                  <button class="studio-btn remove-light-btn" @click="deleteLight(light.name)">Remove Light</button>
                  <button class="studio-btn copy-light-btn" @click="duplicateLight(light.name)">Clone Light</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="add-light">
          <input type="text" v-model="lightName" placeholder="Light Name" />
          <select v-model="lightType">
            <option value="DirectionalLight" selected>Type: Directional Light</option>
            <option value="AmbientLight">Type: Ambient Light</option>
            <option value="PointLight">Type: Point Light</option>
            <option value="HemisphereLight">Type: Hemisphere Light</option>
          </select>
          <div class="intensity">
            <input type="range" v-model="lightIntensity" step="0.01" min="0" max="5" />
            <span>{{ Number(lightIntensity).toFixed(2) }}</span>
          </div>
          <div class="colors">
            <input type="color" v-model="lightColor" />
            <input v-if="lightType == 'HemisphereLight'" type="color" v-model="lightColor2" />
          </div>
          <div class="shadowing" v-if="lightType == 'DirectionalLight' || lightType == 'PointLight'">
            <input type="checkbox" id="shadowing" v-model="lightShadowing" />
            <label for="shadowing">Light Casts Shadow</label>
          </div>
          <div class="add-light-btn-wrap">
            <button class="studio-btn add-light-btn" @click="addLight()" :disabled="!lightName">Add Light</button>
          </div>
        </div>
      </div>
      <div v-else-if="page == 'layout'" class="layout-settings">
        <ConfigStudioOrthograph :active-light-name="expandedLight" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, Ref } from "vue";
import { mapActions, mapMutations, mapState } from "vuex";
import threedee from "@/threedee";
import utils from "@/utils";
import { Light3DReference } from "@/types";
import ConfigStudioOrthograph from "./ConfigStudioOrthograph.vue";

export default defineComponent({
  name: "ConfigStudioControls",
  components: {
    ConfigStudioOrthograph,
  },
  computed: {
    ...mapState(["displayStudioControls", "studioPoses", "studioLighting"]),
  },
  methods: {
    ...mapMutations(["setProductView", "addStudioPose", "removeStudioPose", "addStudioLight", "removeStudioLight", "updateStudioLightParameter"]),
    ...mapActions(["saveStudioSettings", "loadStudioSettings"]),
    toggleOpeness() {
      this.opened = !this.opened;
    },
    setPage(page: string) {
      if (this.page == page) {
        page = "";
      }
      this.page = page;
    },
    handleFileUpload(event: Event) {
      const input = event.target as HTMLInputElement;
      if (input.files && input.files.length > 0) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result;
          if (content) {
            if (typeof content === "string") {
              this.loadSettings(content);
            } else {
              console.error("File content is not a string");
            }
          }
        };
        reader.readAsText(file);
      }
    },
    loadSettings(content: string) {
      try {
        const settings = JSON.parse(content);
        // Assuming you have a Vuex action to handle loading settings
        this.loadStudioSettings(settings);
        this.saveStudioSettings();
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    },
    setPose(euler: [number, number, number]) {
      this.setProductView({ unit: "radians", view: euler });
    },
    savePose() {
      if (!this.poseName) {
        return;
      }
      if (this.studioPoses.find((pose: { name: string }) => pose.name === this.poseName)) {
        alert("Pose name already exists");
        return;
      }
      this.addStudioPose({
        name: this.poseName,
        euler: threedee.getModelRotation(),
      });
      this.poseName = "";
      this.saveStudioSettings();
    },
    deletePose(name: string) {
      const index = this.studioPoses.findIndex((pose) => pose.name === name);
      if (index !== -1) {
        this.removeStudioPose(index);
        this.saveStudioSettings();
      }
    },
    addLight() {
      if (!this.lightName) {
        return;
      }
      if (this.studioLighting?.find((light: { name: string }) => light.name === this.lightName)) {
        alert("Light name already exists");
        return;
      }
      const newLight: Light3DReference & { name: string; } = {
        name: this.lightName,
        type: this.lightType as Light3DReference["type"],
        intensity: Number(this.lightIntensity),
        color: parseInt(this.lightColor.replace("#", ""), 16),
      };
      if (this.lightType === "HemisphereLight") {
        newLight.color2 = parseInt(this.lightColor2.replace("#", ""), 16);
      }
      if (this.lightType === "DirectionalLight" || this.lightType === "PointLight") {
        newLight.position = [0, 0, 0];
        newLight.shadowing = this.lightShadowing;
      }
      if (this.lightType === "DirectionalLight") {
        newLight.target = [0, 0, 0];
      }
      this.addStudioLight(newLight);

      this.lightName = "";
      this.lightType = "DirectionalLight";
      this.lightIntensity = 1;
      this.lightColor = "#ffffff";
      this.lightColor2 = "#999999";
      this.lightShadowing = false;

      this.saveStudioSettings();
    },
    deleteLight(name: string) {
      const index = this.studioLighting.findIndex((light: any) => light.name === name);
      if (index !== -1) {
        this.removeStudioLight(index);
        this.saveStudioSettings();
      }
      this.expandedLight = "";
    },
    duplicateLight(name: string) {
      const index = this.studioLighting.findIndex((light: any) => light.name === name);
      if (index !== -1) {
        const light = this.studioLighting[index];
        const newLight = { ...light, name: `${light.name} (Copy)` };
        this.addStudioLight(newLight);
        this.saveStudioSettings();
      }
    },
    updateLightValue(e: Event, prop: string, name: string) {
      this.updateLightValueThrottled.call(this, e, prop, name);
    },
    expandLight(name: string) {
      this.expandedLight = this.expandedLight === name ? "" : name;
    },
    typeToWords(type: string) {
      return utils.camelCase2Words(type);
    },
    round(num: number, decimalPlaces = 0) {
      const factor = Math.pow(10, decimalPlaces);
      return Math.round(num * factor) / factor;
    },
    stringify(v: any) {
      return JSON.stringify(v);
    }
  },
  watch: {
    page(val: string) {
      this.poseName = "";
      this.lightName = "";
      this.lightType = "DirectionalLight";
      this.lightIntensity = 1;
      this.lightColor = "#ffffff";
      this.lightColor2 = "#999999";
      this.lightShadowing = false;
      if (!['lights', 'layout'].includes(val)) this.expandedLight = "";
    }
  },
  setup() {
    const opened: Ref<boolean> = ref(false);
    const page: Ref<string> = ref("");
    const poseName: Ref<string> = ref("");
    const lightName: Ref<string> = ref("");
    const lightType: Ref<string> = ref("DirectionalLight");
    const lightIntensity: Ref<number> = ref(1);
    const lightColor: Ref<string> = ref("#ffffff");
    const lightColor2: Ref<string> = ref("#999999");
    const lightShadowing: Ref<boolean> = ref(false);
    const expandedLight: Ref<string> = ref("");

    // Generate throttled functions for setting lighting values
    const saveStudioSettings = utils.toThrottled(function(this: any) {
      this.saveStudioSettings();
    }, 1000);
    const updateLightValueThrottled = utils.toThrottled(function(this: any, e: Event, prop: string, name: string) {
      if (!this.studioLighting) {
        return;
      }
      let property = prop;
      if (property.startsWith('position') || property.startsWith('target')) {
        property = property.slice(0, -1);
      }
      const index = this.studioLighting.findIndex((l: { name: string }) => l.name == name);
      if (index < 0) {
        return;
      }
      const input = e.target as HTMLInputElement;
      const value = input.type === "checkbox" ? input.checked : input.value;
      
      if (property == 'intensity') {
        this.updateStudioLightParameter({ index, path: [property], value: Number(value) });
      } else if (property == 'position' || property == 'target') {
        const idx = ['X', 'Y', 'Z'].indexOf(prop.charAt(property.length));
        console.log(this.studioLighting);
        const vec = this.studioLighting[index][property];
        vec[idx] = Number(value);
        this.updateStudioLightParameter({ index, path: [property], value: vec });
      } else if (property == 'color' || property == 'color2') {
        this.updateStudioLightParameter({ index, path: [property], value: parseInt((value as string).slice(1), 16) });
      } else {
        this.updateStudioLightParameter({ index, path: [property], value });
      }

      saveStudioSettings.call(this);
    }, 41.6666);

    return { 
      opened, 
      page,
      poseName, 
      lightName,
      lightType,
      lightColor,
      lightColor2,
      lightIntensity,
      lightShadowing,
      expandedLight,
      updateLightValueThrottled,
    };
  }
});
</script>

<style lang="scss" scoped>
.config-studio-controls {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 1000;
  &.opened {
    right: 10px;
    bottom: 10px;
    height: calc(100vh - 90px);
    width: min(100vw - 24px, 600px);
    background-color: #fff1;
    // background-color: #fff9;
    padding: 45px 16px 28px;
    box-sizing: border-box;
    border-radius: 4px;
    border: 1px solid #fffc;
    backdrop-filter: blur(3px);
    display: flex;
    flex-direction: column;
  }
  &:not(.opened) > :not(.open-toggle) {
    display: none;
  }
}
.open-toggle {
  appearance: none;
  padding: 0;
  width: 28px;
  font-size: 21px;
  font-weight: 900;
  color: #000;
  border-radius: 4px;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  .config-studio-controls.opened & {
    position: absolute;
    bottom: 1px;
    right: 1px;
  }
}
.tabs {
  display: flex;
  position: absolute;
  width: 100%;
  box-sizing: border-box;
  top: 5px;
  left: 0;
  height: 40px;
  padding-inline: 16px;
  gap: 4px;
  overflow: auto;
}
.studio-tab {
  appearance: none;
  border: 0;
  margin: 0;
  padding: 0 1.25em;
  height: 100%;
  box-sizing: border-box;
  background-color: #fff0;
  color: #fffa;
  border: 1px solid #fff8;
  text-transform: uppercase;
  transition: background-color 0.2s linear, color 0.2s linear, border-color 0.2s linear;
  cursor: pointer;
  &:hover {
    border-color: #fffd;
    color: #fff;
  }
  &.current {
    background-color: #fff6;
    color: #fff;
    border-color: #fff0;
  }
}
.page-content {
  flex-grow: 1;
  padding-block: 16px;
  overflow: auto;
  text-align: left;
  $mask: linear-gradient(to bottom, #0000 0%, #000 16px, #000 calc(100% - 16px), #0000 100%) no-repeat center/cover;
  -webkit-mask: $mask;
  mask: $mask;
}
.studio-btn {
  appearance: none;
  border: none;
  padding: 0.6em;
  margin: 0;
  color: #fffc;
  background-color: #fff6;
  transition: background-color 0.2s linear;
  text-transform: uppercase;
  cursor: pointer;
  &:hover:not(:disabled) {
    background-color: #fff9;
  }
  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
}
.load-settings {
  color: #fff9;
  h2 {
    margin-block: 0.4em;
    font-size: 28px;
    font-weight: 700;
    line-height: 1.2;
  }
}
.pose-settings {
  color: #fff9;
  display: flex;
  gap: 8px;
}
.poses-list {
  flex: 60% 1 1;
  display: flex;
  flex-direction: column-reverse;
  align-self: flex-start;
}
.studio-pose {
  padding: 0.6em;
  text-align: center;
  color: #fffc;
  border: 1px solid #fff6;
  transition: background-color 0.2s linear, border-color 0.2s linear;
  cursor: pointer;
  margin-bottom: 1px;
  position: relative;
  &:hover:not(:has(.delete-pose-btn:hover)) {
    background-color: #fff9;
    border-color: #fff0;
  }
}
.delete-pose-btn {
  appearance: none;
  border: none;
  padding: 0 0.8em;
  height: 100%;;
  margin: 0;
  color: #fff9;
  background-color: #f000;
  position: absolute;
  right: 0;
  top: 0;
  cursor: not-allowed;
  transition: background-color 0.2s linear;
  &:hover {
    background-color: #f004;
  }
}
.save-pose {
  flex: 40% 1 1;
  display: flex;
  flex-direction: column;
  input {
    appearance: none;
    border: 1px solid #fff3;
    padding: 0.6em;
    background-color: #fff4;
    color: #fffc;
    &::placeholder {
      color: #fff6;
    }
    &:focus {
      border-color: #fff8;
    }
  }
}

.light-settings {
  color: #fff9;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;

  input:is([type="text"], [type="number"]), select {
    border: 1px solid #fff3;
    padding: 0.6em;
    background-color: #fff4;
    color: #fffc;
    &::placeholder {
      color: #fff6;
    }
    &:focus {
      border-color: #fff8;
    }
  }
  select {
    padding-block: 0.5em;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
  }
}
.lights-list {
  display: flex;
  flex-direction: column;
}
.studio-light {
  border: 1px solid #fff6;
  margin-bottom: 1px;
  &:has(.light-head:hover) {
    border-color: #fff9;
  }
}
.light-head {
  padding: 0.6em;
  text-align: center;
  color: #fffc;
  transition: background-color 0.2s linear, border-color 0.2s linear;
  cursor: pointer;
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  &:hover {
    background-color: #fff9;
  }
}
.expand-light-btn {
  appearance: none;
  border: none;
  padding: 0;
  width: 1em;
  text-align: center;
  margin: 0;
  color: #fffc;
  background-color: #fff0;
  cursor: pointer;
  font-size: 24px;
  font-weight: 900;
  line-height: 1;
}
.light-expand-wrap {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s cubic-bezier(0.5, 1, 0.89, 1);
  .studio-light.expanded & {
    max-height: 180px;
    transition: max-height 0.3s cubic-bezier(0.11, 0, 0.5, 0);
  }
}
.light-details {
  padding: 0.3em 0.6em 0.6em;
  display: flex;
  flex-wrap: wrap;
  gap: 10%;
  row-gap: 4px;
  .shadowing {
    margin-bottom: 8px;
  }
  .position, .direction { 
    input[type="number"] {
      width: 56px;
      margin-right: 4px;
    }
  }
}
.remove-light-btn-wrap {
  display: flex;
  gap: 8px;
  width: 100%;
  .remove-light-btn, .copy-light-btn {
    padding-inline: 1.5em;
  }
}
.shadowing :is(label, input) {
  cursor: pointer;
  user-select: none;
}
.add-light {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.add-light-btn-wrap {
  width: 100%;
  .add-light-btn {
    padding-inline: 1.5em;
  }
}
</style>