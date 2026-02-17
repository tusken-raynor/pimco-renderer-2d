import { loadObjFile } from "@/model3D";
import params from "@/params";
import { starters } from "@/store/initialize";
import { FixedSizeArray, Light3DReference, MaterialComponentName, MaterialTextureName, Mesh3DReference } from "@/types";
import utils from "@/utils";
import { rgbToRgb565, rgb565ToRgb } from "@/wasm";
// @ts-expect-error
import THREE, {
  Mesh,
  PerspectiveCamera,
  Scene,
  TextureLoader,
  WebGLRenderer,
  Matrix4,
  Material,
  MeshStandardMaterial,
  Texture,
  Light,
  ShadowMapType,
  Group,
  EulerTuple,
  PointLightHelper,
  DirectionalLightHelper,
  SpotLightHelper,
  Object3D,
  Camera
} from "three";

const THREE_JS_PATH = "/showgloves/three.min.js";
const RGBE_LOADER_PATH = "/showgloves/RGBELoader.js";

const LOADED_MESHES = new Map<string, Group | null>();
const LOADED_MESH_TRANSFORMS = new Map<string, FixedSizeArray<number, 16>>();

let SCENE: Scene = null as any;
let CAMERA: PerspectiveCamera = null as any;
let RENDERER: WebGLRenderer = null as any;
let TRANSFORMATION: Matrix4 = null as any;
let MAIN_GROUP: Group = null as any;

let TEXTURE_LOADER: TextureLoader = null as any;

let MESH_MATERIAL: MeshStandardMaterial | null = null;
let HAS_MATERIAL_DATA = false;

let HDR_LOADER = null as any;
let HDR_LIBRARY = new Map<string, Texture | Promise<Texture> | null>();

const SCENE_MESHES = new Map<string, Mesh | Group | null>();
const SCENE_LIGHTS = new Map<Light3DReference, Light>();
const SCENE_LIGHT_HELPERS = new Map<Light3DReference, PointLightHelper | DirectionalLightHelper | SpotLightHelper>();

let GLOBAL_TRANSFORM: Matrix4 | null = null;

const CONTEXT_TIME_TRACKER = new Map<string, number>();

const UPDATE_CALLBACKS = {
  multiple: [] as (() => void)[],
  single: [] as (() => void)[]
};
const TRANSFORMATION_CHANGE_CALLBACKS = [] as ((d: TransformationData) => void)[];

interface InitializationData {
  meshes: Mesh3DReference[];
  lights: Light3DReference[];
  globalTransform?: FixedSizeArray<number, 16>;
  fov?: number;
  cameraPosition?: EulerTuple;
  render: () => void;
};
interface InitializationPayload { 
  THREE: typeof THREE; 
  scene: Scene; 
  camera: PerspectiveCamera; 
  renderer: WebGLRenderer; 
  transformation: Matrix4;
  texLoader: TextureLoader;
};
interface TransformationData {
  rotation: [number, number, number];
  scale: [number, number, number];
  position: [number, number, number];
};
type FunctionsOnly<T> = Pick<T, {
  [K in keyof T]: T[K] extends Function ? K : never
}[keyof T]>;

export type ThreeJSTexture = Texture;

const exportableModule = {
  initialize(initData?: InitializationData) {
    return new Promise<InitializationPayload>((res, rej) => {
      // Resolve the promise immedietely if THREE is already usable
      if ("THREE" in window && SCENE && CAMERA && RENDERER && TEXTURE_LOADER && TRANSFORMATION && RENDER_2_TARGET) {
        const three = window['THREE'] as typeof THREE;
        // If there is a new render function, set it
        if (initData?.render) {
          RENDER_2_TARGET = initData.render;
        }
        res({
          THREE: three,
          scene: SCENE,
          camera: CAMERA,
          renderer: RENDERER,
          texLoader: TEXTURE_LOADER,
          transformation: TRANSFORMATION
        });
        return;
      }
      // Otherwise, load the THREE.js library by injecting a script tag
      utils.loadScript(THREE_JS_PATH).then(() => {
        if ("THREE" in window) {
          const three = window['THREE'] as typeof THREE;
          SCENE = new three.Scene();
          CAMERA = new three.PerspectiveCamera(initData?.fov || 25, 1, 0.1, 1000.0);
          setTimeout(() => {
            CAMERA.position.set(initData?.cameraPosition?.[0] || 0, initData?.cameraPosition?.[1] || 0, initData?.cameraPosition?.[2] || 2.5);
          }, 200);
          RENDERER = new three.WebGLRenderer({
            alpha: true,
            antialias: params.has('gr:antialias') ? params.getBool('gr:antialias') : true,
          });
          RENDER_2_TARGET = initData?.render || null;
          TEXTURE_LOADER = new three.TextureLoader();
          TRANSFORMATION = new three.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
          MAIN_GROUP = new three.Group();
          SCENE.add(MAIN_GROUP);
          if (initData && initData.globalTransform) {
            GLOBAL_TRANSFORM = new three.Matrix4();
            GLOBAL_TRANSFORM!.fromArray(initData.globalTransform);
          }
          const collection = {
            THREE: three,
            scene: SCENE,
            camera: CAMERA,
            renderer: RENDERER,
            texLoader: TEXTURE_LOADER,
            transformation: TRANSFORMATION
          };
          if (initData) {
            // Setup the 3D scene
            setup3dScene(collection, initData).then(() => {
              res(collection);
            }).catch(rej);
          } else {
            res(collection);
          }
        } else {
          rej(new Error('Error loading THREE.js: Cannot find THREE interface on window after script load.'));
        }
      }).catch(rej);
    });
  },
  render(destination: CanvasRenderingContext2D, callerID?: any) {
    if (RENDER_CALL && HAS_MATERIAL_DATA) {
      RENDER_CALL(destination);
    } else {
      // Clear the destination canvas
      destination.clearRect(0, 0, destination.canvas.width, destination.canvas.height);
    }
  },
  setRender2TargetFunction(render: () => void) {
    RENDER_2_TARGET = render;
  },
  updateSceneLights(lights: Light3DReference[]) {
    if (!this.initialized) {
      console.warn("THREE.js Scene not initialized");
      return;
    }
    removeAllLightsFromScene();

    // If we are in isolate texture mode, just add an ambient light
    if (params.isString('gr:isolate-texture')) {
      // Just add one ambient light at full power
      const three = window['THREE'] as typeof THREE;
      const lightReference: Light3DReference = {
        type: "AmbientLight",
        color: 0xffffff,
        intensity: 1.0
      };
      addLightToScene(lightReference);
      return;
    }

    for (const light of lights) {
      addLightToScene(light);
    }
  },
  async updateSceneMeshes(meshes: Mesh3DReference[]) {
    if (!this.initialized) {
      console.warn("THREE.js Scene not initialized");
      return;
    }
    const noLongerPresent: string[] = [];
    for (const mesh of SCENE_MESHES.keys()) {
      if (!meshes.find(m => m instanceof Object ? m.path === mesh : m === mesh) && mesh !== "3d-material-test") {
        noLongerPresent.push(mesh);
      }
    }
    for (const mesh of noLongerPresent) {
      removeMeshFromScene(mesh);
    }
    for (const mesh of meshes) {
      await addMeshToScene(mesh);
    }
    return;
  },
  setMaterialTextures(textures: Partial<Record<MaterialTextureName, ImageData | Texture>>, options?: { [key: string]: any }) {
    // console.log(textures);
    if (!window['THREE']) {
      // throw new Error("THREE.js not initialized");
      return;
    }
    const THREE = window['THREE'];
    if (!MESH_MATERIAL) {
      // throw new Error("Material not initialized");
      return;
    }
    if (!RENDERER) {
      // throw new Error("Renderer not initialized");
      return;
    }
    const anisotropy = RENDERER.capabilities.getMaxAnisotropy();
    HAS_MATERIAL_DATA = true;
    const textureObj = utils.filterObject(textures, (v) => 'isTexture' in v) as Record<string, Texture>;
    const bufferObj = utils.filterObject(textures, (v) => 'data' in v) as Record<string, ImageData>;
    const components: Partial<Record<MaterialComponentName, ImageData | Texture>> = Object.assign({}, decomposePBRTextures(bufferObj), textureObj) as any;
    
    const compACF = [
      { name: "albedo", prop: "map", format: THREE.RGBAFormat },
      { name: "normal", prop: "normalMap", format: THREE.RGBAFormat },
      { name: "roughness", prop: "roughnessMap", format: THREE.LuminanceFormat },
      { name: "metallic", prop: "metalnessMap", format: THREE.LuminanceFormat },
      { name: "ao", prop: "aoMap", format: THREE.LuminanceFormat },
      { name: "emissive", prop: "emissiveMap", format: THREE.RGBAFormat },
      { name: "env", prop: "envMap", format: THREE.RGBAFormat }
    ] as const;
    
    for (const { name, prop, format } of compACF) {
      const component = components[name];
      if ( component) {
        if ('isTexture' in  component) {
          if (component.isTexture && component !== MESH_MATERIAL[prop]) {
            MESH_MATERIAL[prop] = component;
          }
          if (name === "env") {
            MESH_MATERIAL.envMapIntensity = component['_intensity'] || 1.0;
          }
          continue;
        }
        if (!MESH_MATERIAL[prop] || MESH_MATERIAL[prop]!.image.width !==  component.width || MESH_MATERIAL[prop]!.image.height !==  component.height) {
          MESH_MATERIAL[prop] = new THREE.DataTexture(component.data,  component.width,  component.height, format);
          MESH_MATERIAL[prop]!.anisotropy = anisotropy;
          MESH_MATERIAL[prop]!.minFilter = THREE.LinearMipmapLinearFilter;
          MESH_MATERIAL[prop]!.magFilter = THREE.LinearFilter;
        } else {
          MESH_MATERIAL[prop]!.image.width =  component.width;
          MESH_MATERIAL[prop]!.image.height =  component.height;
          MESH_MATERIAL[prop]!.image.data.set(component.data);
        }
        MESH_MATERIAL[prop]!.needsUpdate = true;
        MESH_MATERIAL[prop]!.generateMipmaps = true;
        MESH_MATERIAL[prop]!.wrapS = THREE.RepeatWrapping;
        MESH_MATERIAL[prop]!.wrapT = THREE.RepeatWrapping
      } else if (name == "albedo") {
        MESH_MATERIAL[prop] = new THREE.DataTexture(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
        MESH_MATERIAL[prop]!.needsUpdate = true;
        MESH_MATERIAL[prop]!.generateMipmaps = true;
      } else {
        MESH_MATERIAL[prop] = null;
      }
    }
    MESH_MATERIAL.needsUpdate = true;
    if (components.emissive) {
      MESH_MATERIAL.emissive = new THREE.Color(0xffffff);
      MESH_MATERIAL.emissiveIntensity = 1.0;
    } else {
      MESH_MATERIAL.emissive = new THREE.Color(0x000000);
      MESH_MATERIAL.emissiveIntensity = 0.0;
    }
    if (components.metallic) {
      MESH_MATERIAL.metalness = 1.0;
    } else {
      MESH_MATERIAL.metalness = 0.0;
    }
    // Apply the options if there are any
    if (options) {
      for (const [key, value] of Object.entries(options)) {
        if (key in MESH_MATERIAL) {
          MESH_MATERIAL[key] = value;
        }
      }
    }
  },
  async loadTexture(url: string): Promise<Texture | null> {
    const  { texLoader } = await this.initialize();
    return texLoader.loadAsync(url);
  },
  async loadHdrTexture(url: string): Promise<Texture | null> {
    if (HDR_LIBRARY.has(url)) {
      return HDR_LIBRARY.get(url)!;
    }
    const hdrPromise = new Promise<Texture>(async (res) => {
      if ((window as any)._RGBELoaderPromise) {
        await (window as any)._RGBELoaderPromise;
        delete (window as any)._RGBELoaderPromise;
      } else if (!('RGBELoader' in window)) {
        (window as any)._RGBELoaderPromise = await new Promise((res) => {
          utils.onScriptLoaded(THREE_JS_PATH, () => {
            utils.loadScript(RGBE_LOADER_PATH).then(res);
          });
        });
      }
      if (!HDR_LOADER) {
        const RGBELoader = window['RGBELoader'];
        HDR_LOADER = new RGBELoader();
      }
      HDR_LOADER.load(url, function (hdrMap: any) {
        const pmremGenerator = new window['THREE'].PMREMGenerator(RENDERER);
        pmremGenerator.compileEquirectangularShader();
      
        const envMap = pmremGenerator.fromEquirectangular(hdrMap).texture;

        // Store the texture in the cache
        HDR_LIBRARY.set(url, envMap);
        res(envMap);
      });
    });
    // Reserve the slot for the texture in case it gets loaded later
    HDR_LIBRARY.set(url, hdrPromise);
    return hdrPromise;
  },
  getModificationContext() {
    // Use this method to generate a context to invoke other THREEDEE methods from so that
    // the context can track the time of the last invocation of each method
    const originalThis = this;
    const now = Date.now();
    const keys = Object.keys(originalThis);
    const context = {} as Record<string, any>;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key == "getModificationContext") {
        continue;
      }
      if (this[key] instanceof Function) {
        context[key] = (...args: any[]) => {
          if (CONTEXT_TIME_TRACKER.has(key)) {
            const last = CONTEXT_TIME_TRACKER.get(key)!;
            // If this function has been invoked by a context with a newer time, cancel this invocation
            if (now < last) {
              return;
            }
          }
          CONTEXT_TIME_TRACKER.set(key, now);
          return this[key].apply(originalThis, args);
        };
      }
    }
    return context as Omit<FunctionsOnly<typeof exportableModule>, "getModificationContext">;
  },
  onImportantUpdate(callback: () => void, use: "multiple" | "single" = "multiple") {
    if (use === "multiple") {
      UPDATE_CALLBACKS.multiple.push(callback);
    } else {
      UPDATE_CALLBACKS.single.push(callback);
    }
  },
  getCameraFOV() {
    if (!CAMERA) {
      return -1;
    }
    return CAMERA.fov;
  },
  setCameraFOV(fov: number) {
    if (!this.initialized) {
      throw new Error("THREE.js Scene not initialized");
    }
    CAMERA.fov = fov;
    CAMERA.updateProjectionMatrix();
  },
  setCameraPosition(rotationX: number, rotationY: number) {
    const maxPitch = 79 * Math.PI / 180;
    rotationY = Math.max(-maxPitch, Math.min(maxPitch, rotationY));
    // Transform the vector using the x rotation first, and then the y rotation
    // To do this, make sure the x rotation is applied after in the matrix

    TRANSFORMATION.identity();
    TRANSFORMATION.makeRotationY(rotationX);
    TRANSFORMATION.premultiply(new window['THREE'].Matrix4().makeRotationX(rotationY));

    // Apply the transformation matrix
    CAMERA.matrix.identity();
    CAMERA.applyMatrix4(TRANSFORMATION);
    CAMERA.lookAt(0, 0, 0);
  },
  setModelRotation(x: number, y: number, z: number) {
    x = utils.remEuclidean(x, Math.PI * 2);
    y = utils.remEuclidean(y, Math.PI * 2);
    z = utils.remEuclidean(z, Math.PI * 2);
    // Reset the transformation to apply an global transformation
    MAIN_GROUP.rotation.set(0, 0, 0);
    MAIN_GROUP.scale.set(1, 1, 1);
    MAIN_GROUP.position.set(0, 0, 0);
    MAIN_GROUP.rotation.set(x, y, z);
    this.triggerTransformChangeEvent();
  },
  getModelRotation(): [number, number, number] {
    return (MAIN_GROUP.rotation.toArray().slice(0, 3) as number[]).map(x => utils.remEuclidean(x, Math.PI * 2)) as [number, number, number];
    // return MAIN_GROUP.quaternion.toArray();
  },
  onTransformationChange(callback: (d: TransformationData) => void) {
    TRANSFORMATION_CHANGE_CALLBACKS.push(callback);
  },
  offTransformationChange(callback: (d: TransformationData) => void) {
    const index = TRANSFORMATION_CHANGE_CALLBACKS.indexOf(callback);
    if (index !== -1) {
      TRANSFORMATION_CHANGE_CALLBACKS.splice(index, 1);
    }
  },
  triggerTransformChangeEvent() {
    const data: TransformationData = {
      rotation: this.getModelRotation(),
      scale: MAIN_GROUP.scale.toArray().slice(0, 3) as [number, number, number],
      position: MAIN_GROUP.position.toArray().slice(0, 3) as [number, number, number]
    };
    for (const callback of TRANSFORMATION_CHANGE_CALLBACKS) {
      callback(data);
    }
  },
  animateModelRotation(to: [number, number, number], duration: number, timingFunction: ((t: number) => number) | null = null, renderFunction: (() => void ) | null = null) {
    const three = window['THREE'] as typeof THREE;
    renderFunction = renderFunction! || RENDER_2_TARGET || (() => {});
    timingFunction = timingFunction || ((t) => t);
    to[0] = utils.remEuclidean(to[0], Math.PI * 2);
    to[1] = utils.remEuclidean(to[1], Math.PI * 2);
    to[2] = utils.remEuclidean(to[2] || 0, Math.PI * 2);
    return new Promise<void>((res) => {
      if (duration <= 0) {
        this.setModelRotation(to[0], to[1], to[2]);
        renderFunction();
        res();
        return;
      }
      const start = Date.now();
      const end = start + duration;
      const from = eulerTupleToNumArray(new three.Euler().setFromQuaternion(MAIN_GROUP.quaternion).toArray());
      // Find the shortest path to the target rotation
      to = [
        getNearestCorrespondingAngle(from[0], to[0]),
        getNearestCorrespondingAngle(from[1], to[1]),
        getNearestCorrespondingAngle(from[2], to[2])
      ];
      // Use quaternions for interpolation for smoother animations
      const toQuaternion = new three.Quaternion().setFromEuler(new three.Euler(to[0], to[1], to[2]));
      const fromQuaternion = MAIN_GROUP.quaternion;
      const frameLength = params.isNumber("frame-rate") ? Math.max((1000 / params.getNumber("frame-rate")) || 16, 16) : 16;
      const runAnimation = requestAnimationPermission();
      if (runAnimation) {
        const setProgress = beginAnimation();
        const renderLoop = () => {
          if (!continueAnimation()) {
            setProgress(1.0);
            res();
            return;
          }
          const now = Date.now();
          const t = Math.max(0.0, Math.min(1.0, (now - start) / duration));
          const alpha = timingFunction(t);
          const quaternion = new three.Quaternion();
          quaternion.slerpQuaternions(fromQuaternion, toQuaternion, alpha);
          const eulerAngles = new three.Euler().setFromQuaternion(quaternion).toArray();
          this.setModelRotation(eulerAngles[0], eulerAngles[1], eulerAngles[2]);
          renderFunction();
          if (now < end) {
            setProgress(t);
            setTimeout(renderLoop, frameLength);
          } else {
            setProgress(1.0);
            res();
          }
        };
        setTimeout(renderLoop, frameLength);
      }
    });
  },
  animateModelTransformation(duration: number, getInterpolated: (alpha: number) => Matrix4, timingFunction: ((t: number) => number) | null = null, renderFunction: (() => void) | null = null) {
    renderFunction = renderFunction! || RENDER_2_TARGET || (() => {});
    timingFunction = timingFunction || ((t) => t);
    return new Promise<void>((res) => {
      if (duration <= 0) {
        const transformation = getInterpolated(1.0);
        MAIN_GROUP.applyMatrix4(transformation);
        this.triggerTransformChangeEvent();
        renderFunction();
        res();
        return;
      }
      const start = Date.now();
      const end = start + duration;
      const frameLength = params.isNumber("frame-rate") ? Math.max((1000 / params.getNumber("frame-rate")) || 16, 16) : 16;
      const runAnimation = requestAnimationPermission();
      if (runAnimation) {
        const setProgress = beginAnimation();
        const renderLoop = () => {
          if (!continueAnimation()) {
            setProgress(1.0);
            res();
            return;
          }
          const now = Date.now();
          const t = Math.max(0.0, Math.min(1.0, (now - start) / duration));
          const alpha = timingFunction(t);
          const transformation = getInterpolated(alpha);
          MAIN_GROUP.applyMatrix4(transformation);
          this.triggerTransformChangeEvent();
          renderFunction();
          if (now < end) {
            setProgress(t);
            setTimeout(renderLoop, frameLength);
          } else {
            setProgress(1.0);
            res();
          }
        };
        setTimeout(renderLoop, frameLength);
      }
    });
  },
  getAngleIndicesSortedByClosest<D extends boolean | undefined = false>(angles: Array<[number, number, number]>, leaveDot?: D): D extends true ? Array<{dot: number, index: number}> : number[] {
    if (!this.initialized) {
      throw new Error("THREE.js Scene not initialized");
    }
    // Convert each angle to a local space vector pointed at the camera
    const three = window['THREE'] as typeof THREE;
    const vectorObject = new three.Object3D();
    // Get the current local space vector of the MAIN_GROUP pointed at the camera
    const current = getObjectToCameraVector(MAIN_GROUP, CAMERA);
    const indices: Array<{dot: number, index: number}> = [];
    // Loop through all angles and get the local space vector pointed at the camera
    for (let i = 0; i < angles.length; i++) {
      const angle = angles[i];
      vectorObject.rotation.set(angle[0], angle[1], angle[2]);
      const vector = getObjectToCameraVector(vectorObject, CAMERA);
      const dot = Math.round(vector.dot(current) * 1000000) / 1000000;
      utils.orderedInsert(indices, { dot, index: i }, (a, b) => a.dot - b.dot);
    }
    if (leaveDot) {
      return indices as any;
    }
    return indices.map(x => x.index) as any;
  },
  getVectorCameraAlignment,
  getAngleLookVectorDot,
  getRotationDistance,
  requestAnimationPermission,
  requestAnimationPromise,
  beginAnimation,
  cancelAnimation,
  onAnimationFinish,
  onAnimationProgress,
  initialized: false
} as const;

Object.defineProperty(exportableModule, "initialized", {
  get() {
    return !!("THREE" in window && SCENE && CAMERA && RENDERER && TEXTURE_LOADER && TRANSFORMATION && RENDER_2_TARGET);
  }
});

export default exportableModule as typeof exportableModule;

let RENDER_CALL = null as any;
let RENDER_2_TARGET = null as any;
let LAST_WIDTH = 0;
let LAST_HEIGHT = 0;

async function setup3dScene(payload: InitializationPayload, data: InitializationData) {
  const { THREE, scene, camera, renderer, transformation } = payload;

  // Set the clear color to transparent
  renderer.setClearAlpha(0);
  // Clear the default frame
  renderer.clear();
  // Enable shadow mapping
  renderer.shadowMap.enabled = true;
  const shadowType = params.isNumber('gr:shadow-type') ? 
    Math.floor(Math.max(0, Math.min(params.getNumber('gr:shadow-type'), 3))) as ShadowMapType : 
    THREE.PCFSoftShadowMap;
  renderer.shadowMap.type = shadowType;

  // Set the initial camera attributes
  camera.position.z = 2.5;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  // Load the textures for the temp material
  // const diffuse = await texLoader.loadAsync('/show-imgs/pimcos/bats/textures/bat_wood_diffuse.jpg');
  // const normal = await texLoader.loadAsync('/show-imgs/pimcos/bats/textures/bat_wood_normal.jpg');
  // const roughness = await texLoader.loadAsync('/show-imgs/pimcos/bats/textures/bat_wood_roughness.jpg');

  // const hdrTexture = await exportableModule.loadHdrTexture("/show-imgs/pimcos/bats/textures/quarry_cloudy_1k.hdr?ver=0.7.19");
  // const hdrTexture2 = await exportableModule.loadHdrTexture("/show-imgs/pimcos/bats/textures/quarry_cloudy_1k.hdr?t=7");
  // console.log(hdrTexture);
  MESH_MATERIAL = new THREE.MeshStandardMaterial({
    transparent: false,
  });
  // MESH_MATERIAL.onBeforeCompile = function (shader) {
  //   // Log the fragment shader code
  //   console.log(shader.fragmentShader);
    
  //   // You can also log the vertex shader code if needed
  //   console.log(shader.vertexShader);
  // };
  if (params.getBool('dev') && params.getBool('gr:render-wireframe')) {
    MESH_MATERIAL!.wireframe = true;
  }
  // Add the lights to the scene
  exportableModule.updateSceneLights(data.lights);
  // Add the meshes to the scene
  await exportableModule.updateSceneMeshes(data.meshes);
  // If we are in 3d material test mode, add a sphere to the scene
  if (params.get("m") == '3d-material-test' && (params.getBool('dev') || params.getBool('debug'))) {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.4, 64, 64), MESH_MATERIAL);
    MAIN_GROUP.add(sphere);
    SCENE_MESHES.set("3d-material-test", sphere);
  }

  RENDER_CALL = (destination: CanvasRenderingContext2D) => {
    // Update the camera projection matrix if the canvas size has changed
    if (LAST_WIDTH !== destination.canvas.width || LAST_HEIGHT !== destination.canvas.height) {
      LAST_WIDTH = destination.canvas.width;
      LAST_HEIGHT = destination.canvas.height;
      camera.aspect = LAST_WIDTH / LAST_HEIGHT;
      camera.updateProjectionMatrix();
      const resScale = params.isNumber('gr:resolution-scale') ? params.getNumber('gr:resolution-scale') : 1.0;
      renderer.setSize(LAST_WIDTH * resScale, LAST_HEIGHT * resScale);
    }
    camera.lookAt(0, 0, 0);
    const group = MAIN_GROUP;
    group.matrix.identity();
    group.applyMatrix4(transformation);
    // Render the scene
    renderer.render(scene, camera);

    // Draw the result to the destination canvas
    const canvas = renderer.domElement;
    destination.clearRect(0, 0, destination.canvas.width, destination.canvas.height);
    destination.drawImage(canvas, 0, 0, destination.canvas.width, destination.canvas.height);
  };
}

async function getMeshGroup(ref: Mesh3DReference, material?: Material): Promise<Group | null> {
  // Load the mesh geometry from the file
  const filepath = ref instanceof Object ? ref.path : ref;
  if (LOADED_MESHES.has(filepath)) {
    return LOADED_MESHES.get(filepath)!;
  }
  // Reserve the slot for the mesh in case it gets loaded later
  LOADED_MESHES.set(filepath, null);
  const model3d = await loadObjFile(filepath);
  if (!model3d) {
    throw new Error("Failed to load OBJ file: " + filepath);
  }
  const three = window['THREE'] as typeof THREE;
  const group = new three.Group();
  for (const key in model3d.meshes) {
    const meshData = model3d.meshes[key];
    const geometry = new three.BufferGeometry();
    const vertexPositions = new Float32Array(Array.from(meshData.vib).map(v => [meshData.vb[v * 3], meshData.vb[v * 3 + 1], meshData.vb[v * 3 + 2]]).flat());
    geometry.setAttribute("position", new three.BufferAttribute(vertexPositions, 3));

    const textureCoordinates = new Float32Array(Array.from(meshData.tib).map(v => [meshData.tb[v * 2], meshData.tb[v * 2 + 1]]).flat());
    geometry.setAttribute("uv", new three.BufferAttribute(textureCoordinates, 2));

    const vertexNormals = new Float32Array(Array.from(meshData.nib).map(v => [meshData.nb[v * 3], meshData.nb[v * 3 + 1], meshData.nb[v * 3 + 2]]).flat());
    geometry.setAttribute("normal", new three.BufferAttribute(vertexNormals, 3));

    const mesh: Mesh = new three.Mesh(geometry, material);
    if (!params.has('gr:shadow-type') || params.getNumber('gr:shadow-type') !== -1) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }

    group.add(mesh);
  }

  if (ref instanceof Object && ref.transformation) {
    group.applyMatrix4(new three.Matrix4().fromArray(ref.transformation));
    LOADED_MESH_TRANSFORMS.set(filepath, ref.transformation);
  }
  if (GLOBAL_TRANSFORM) {
    group.applyMatrix4(GLOBAL_TRANSFORM);
  }
  // Save the mesh to the cache and return it
  LOADED_MESHES.set(filepath, group);
  return group;
}

function decomposePBRTextures(textures: Partial<Record<MaterialTextureName, ImageData>>) {
  const components = {} as Partial<Record<MaterialComponentName, { data: Uint8ClampedArray, width: number; height: number; }>>;
  if (textures.albedo) {
    components.albedo = textures.albedo;
  }
  if (textures.normal) {
    components.normal = textures.normal;
  }
  if (textures.emissive) {
    components.emissive = textures.emissive;
  }
  if (textures.orm) {
    const size = textures.orm.width * textures.orm.height;
    const roughness = new Uint8ClampedArray(size);
    const metallic = new Uint8ClampedArray(size);
    const ao = new Uint8ClampedArray(size);
    for (let i = 0; i < size; i++) {
      ao[i] = textures.orm.data[i * 4];
      roughness[i] = textures.orm.data[i * 4 + 1];
      metallic[i] = textures.orm.data[i * 4 + 2];
    }
    components.roughness = { data: roughness, width: textures.orm.width, height: textures.orm.height };
    components.metallic = { data: metallic, width: textures.orm.width, height: textures.orm.height };
    components.ao = { data: ao, width: textures.orm.width, height: textures.orm.height };
  }
  return components;
}

(window as any).logMeshMaterial = () => {
  console.log(MESH_MATERIAL);
}
(window as any).logSceneMeshes = () => {
  console.log(SCENE_MESHES);
}
(window as any).logSceneLights = () => {
  console.log(SCENE_LIGHTS);
}
(window as any).logModelRotation = (degrees = true) => {
  return (MAIN_GROUP.rotation.toArray().slice(0, 3).map(x => utils.remEuclidean(x as any, Math.PI * 2) * (degrees ? 180 / Math.PI : 1)));
}
(window as any).logCameraPosition = () => {
  console.log(CAMERA.position.toArray());
}
(window as any).logMainGroup = () => {
  console.log(MAIN_GROUP);
}

function addLightToScene(light: Light3DReference) {
  if (!SCENE_LIGHTS.has(light)) {
    const three = window['THREE'] as typeof THREE;
    let sceneLight: Light;
    let lightHelper: PointLightHelper | DirectionalLightHelper | SpotLightHelper | null = null;
    if (light.type === "AmbientLight") {
      const lit = new three.AmbientLight(light.color, light.intensity);
      sceneLight = lit;
    } else if (light.type === "HemisphereLight") {
      const lit = new three.HemisphereLight(light.color, light.color2 || 0, light.intensity);
      sceneLight = lit;
    } else {
      const lit = new three[light.type](light.color, light.intensity);
      const position = light.position || [-1, 5, 4];
      lit.position.set(position[0], position[1], position[2]);
      lit.castShadow = !!light.shadowing && params.getNumber('gr:shadow-type') !== -1;
      if (lit.castShadow) {
        // Set up shadow properties for the light
        const shadowSize = params.isNumber('gr:shadow-map-res') ? params.getNumber('gr:shadow-map-res') : 1024;
        lit.shadow.mapSize.width = shadowSize; // Shadow map width
        lit.shadow.mapSize.height = shadowSize; // Shadow map height
        lit.shadow.camera.near = 0.005; // Near shadow distance
        lit.shadow.camera.far = 50; // Far shadow distance
        if (lit instanceof three.DirectionalLight) {
          lit.shadow.camera.left = -1.4;
          lit.shadow.camera.right = 1.4;
          lit.shadow.camera.top = 1.4;
          lit.shadow.camera.bottom = -1.4;
        } else {
          lit.shadow.camera.fov = 60;
        }
      }
      sceneLight = lit;
      
      lit.shadow.bias = -0.00002;
      lit.shadow.radius = params.isNumber('gr:shadow-radius') ? params.getNumber('gr:shadow-radius') : (lit.shadow.mapSize.width / 256);

      if (params.getBool('gr:help-lights')) {
        lightHelper = new three[`${light.type}Helper`](lit as any);
      }
    }
    
    SCENE.add(sceneLight);
    SCENE_LIGHTS.set(light, sceneLight);
    if (lightHelper) {
      SCENE_LIGHT_HELPERS.set(light, lightHelper);
      SCENE.add(lightHelper);
    }
  }
}

function removeLightFromScene(light: Light3DReference) {
  if (SCENE_LIGHTS.has(light)) {
    SCENE.remove(SCENE_LIGHTS.get(light)!);
    SCENE_LIGHTS.delete(light);
  }
  if (SCENE_LIGHT_HELPERS.has(light)) {
    SCENE.remove(SCENE_LIGHT_HELPERS.get(light)!);
    SCENE_LIGHT_HELPERS.delete(light);
  }
}

function removeAllLightsFromScene() {
  for (const light of SCENE_LIGHTS.keys()) {
    removeLightFromScene(light);
  }
}

async function addMeshToScene(mesh: Mesh3DReference) {
  if (!MESH_MATERIAL) {
    console.warn("Mesh Material not initialized");
    return;
  }
  const meshPath = mesh instanceof Object ? mesh.path : mesh;
  if (!SCENE_MESHES.has(meshPath)) {
    // Reserve the slot for the mesh in case it gets loaded later
    // SCENE_MESHES.set(meshPath, null);
    const sceneMeshGroup = await getMeshGroup(mesh, MESH_MATERIAL);
    if (sceneMeshGroup) {
      MAIN_GROUP.add(sceneMeshGroup);
      SCENE_MESHES.set(meshPath, sceneMeshGroup);
    } else {
      // Free the slot if the mesh failed to load
      SCENE_MESHES.delete(meshPath);
    }
  }
}

function removeMeshFromScene(mesh: Mesh3DReference) {
  const meshPath = mesh instanceof Object ? mesh.path : mesh;
  if (SCENE_MESHES.has(meshPath)) {
    MAIN_GROUP.remove(SCENE_MESHES.get(meshPath)!);
    SCENE_MESHES.delete(meshPath);
  }
}

function removeAllMeshesFromScene() {
  for (const mesh of SCENE_MESHES.keys()) {
    removeMeshFromScene(mesh);
  }
}

function getNearestCorrespondingAngle(from: number, to: number) {
  // This is a bit brute force, but it works
  const step = to > from ? -Math.PI * 2 : Math.PI * 2;
  let nearest = to;
  while (Math.abs(nearest - from) > Math.PI) {
    nearest += step;
  }
  return nearest;
}

function eulerTupleToNumArray(tuple: EulerTuple) {
  return (tuple.slice(0, 3) as number[]).map(x => utils.remEuclidean(x, Math.PI * 2)) as [number, number, number];
}

let ANIMATION_IN_PROGRESS = false;
let ANIMATION_CANCEL_REQUESTED = false;
let ANIMATION_FINISH_PROMISE: Promise<AnimationState> | null = null;
const ANIMATION_FINISH_CALLBACKS: Array<(state: AnimationState) => void> = [];
const ANIMATION_PROGRESS_CALLBACKS: Array<(progress: number) => void> = [];

export type AnimationState = {
  x: number;
  y: number;
  z: number;
}

function requestAnimationPermission() {
  if (ANIMATION_IN_PROGRESS) {
    return false;
  }
  return true;
}
function requestAnimationPromise() {
  // Make sure the animation progress and promise are in sync
  if (!!ANIMATION_FINISH_PROMISE !== !!ANIMATION_IN_PROGRESS) {
    throw new Error("Animation promise and progress are out of sync");
  }
  if (ANIMATION_FINISH_PROMISE) {
    return ANIMATION_FINISH_PROMISE;
  }
  // Return an empty promise that resolves immediately
  return Promise.resolve();
}
function beginAnimation() {
  ANIMATION_IN_PROGRESS = true;
  let resolve: (s: AnimationState) => void;
  ANIMATION_FINISH_PROMISE = new Promise((res) => {
    resolve = res;
  });
  return (progress: number) => {
    for (const callback of ANIMATION_PROGRESS_CALLBACKS) {
      callback(progress);
    }
    if (progress >= 1.0) {
      finishAnimation();
      const rotation = exportableModule.getModelRotation();
      resolve({ x: rotation[0], y: rotation[1], z: rotation[2] });
    }
  }
}
function finishAnimation() {
  ANIMATION_IN_PROGRESS = false;
  ANIMATION_FINISH_PROMISE = null;
  ANIMATION_CANCEL_REQUESTED = false;
  const rotation = exportableModule.getModelRotation();
  for (const callback of ANIMATION_FINISH_CALLBACKS) {
    callback({ x: rotation[0], y: rotation[1], z: rotation[2] });
  }
  // Clear the animation progress callback list
  ANIMATION_PROGRESS_CALLBACKS.length = 0;
}
function cancelAnimation() {
  if (ANIMATION_IN_PROGRESS) {
    ANIMATION_CANCEL_REQUESTED = true;
  }
}
function continueAnimation() {
  return !ANIMATION_CANCEL_REQUESTED;
}
function onAnimationFinish(callback: (state: AnimationState) => void) {
  ANIMATION_FINISH_CALLBACKS.push(callback);
}
function onAnimationProgress(callback: (progress: number) => void) {
  if (!ANIMATION_IN_PROGRESS) {
    callback(1.0);
    return;
  }
  ANIMATION_PROGRESS_CALLBACKS.push(callback);
}

function getObjectToCameraVector(object: Object3D, camera: Camera) {
  const three = window['THREE'] as typeof THREE;
  // Step 1: Get the camera's position in world coordinates
  const cameraPosition = new three.Vector3();
  camera.getWorldPosition(cameraPosition);

  // Step 2: Get the object's position in world coordinates
  const objectPosition = new three.Vector3();
  object.getWorldPosition(objectPosition);

  // Step 3: Calculate the vector from the object to the camera
  const objectToCamera = new three.Vector3();
  objectToCamera.subVectors(cameraPosition, objectPosition).normalize();

  // Step 4: Transform the vector into the object's local space
  object.worldToLocal(objectToCamera); // Converts the world space vector to local space

  return objectToCamera;
}

function getVectorCameraAlignment([x, y, z]: [number, number, number] = [0, 0, -1]) {
  const three = window['THREE'] as typeof THREE;
  const localVector = new three.Vector3(x, y, z);
  // Transform the local vector to world space
  const worldVector = localVector.clone().applyQuaternion(MAIN_GROUP.quaternion);
  // Get the camera's view direction (normalized)
  const cameraDirection = CAMERA.getWorldDirection(new three.Vector3());

  // Calculate the dot product of the world vector and the camera direction
  return worldVector.dot(cameraDirection);
}

function getAngleLookVectorDot(angle: [number, number, number]) {
  if (!exportableModule.initialized) {
    throw new Error("THREE.js Scene not initialized");
  }
  // Create a new object to rotate to the given and so we can read its look vector
  const three = window['THREE'] as typeof THREE;
  const vectorObject = new three.Object3D();
  // Get the current local space vector of the MAIN_GROUP pointed at the camera
  const current = getObjectToCameraVector(MAIN_GROUP, CAMERA);
  vectorObject.rotation.set(angle[0], angle[1], angle[2]);
  const vector = getObjectToCameraVector(vectorObject, CAMERA);
  const dot = Math.round(vector.dot(current) * 1000000) / 1000000;
  return dot;
}

function getRotationDistance(targetRotation: [number, number, number], currentRotation?: [number, number, number]) {
  if (!exportableModule.initialized) {
    throw new Error("THREE.js Scene not initialized");
  }
  const three = window['THREE'] as typeof THREE;
  // Convert Euler rotations to Quaternions
  const targetEuler = new three.Euler().fromArray(targetRotation);
  const targetQuat = new three.Quaternion().setFromEuler(targetEuler);
  const currentQuat = currentRotation === undefined ? MAIN_GROUP.quaternion.clone() : new three.Quaternion().setFromEuler(new three.Euler().fromArray(currentRotation!));

  // Calculate dot product of quaternions
  const dot = currentQuat.dot(targetQuat);

  // Calculate angle between quaternions (in radians)
  const angle = 2 * Math.acos(Math.abs(dot));

  return angle;
}

type PackableLightDescriptor = {
  color1: number;
  color2: number;
  posx: number;
  posy: number;
  posz: number;
  dirx: number;
  diry: number;
  dirz: number;
  strength: number;
  type: number;
  shadow: number;
};

export function light3DReferenceToPld(light: Light3DReference) {
  const color1 = rgbToRgb565(light.color);
  const color2 = rgbToRgb565(light.color2 || 0);
  const types = ["DirectionalLight", "AmbientLight", "PointLight", "HemisphereLight"] as const;
  const type = types.indexOf(light.type);
  const shadowing = Number(!!light.shadowing);
  const pos = light.position || [0, 1, 0];
  const position = [
    Math.max(0, Math.min(Math.round((pos[0] * 256) + 32768), 65535)), 
    Math.max(0, Math.min(Math.round((pos[1] * 256) + 32768), 65535)), 
    Math.max(0, Math.min(Math.round((pos[2] * 256) + 32768), 65535)),
  ];
  const target = light.target || [0, 0, 0];
  const dir = [
    Math.max(0, Math.min(Math.round((target[0] * 256) + 32768), 65535)),
    Math.max(0, Math.min(Math.round((target[1] * 256) + 32768), 65535)),
    Math.max(0, Math.min(Math.round((target[2] * 256) + 32768), 65535)),
  ];
  const strength = Math.min(Math.round(light.intensity * 15), 15);
  return {
    color1,
    color2,
    posx: position[0],
    posy: position[1],
    posz: position[2],
    dirx: dir[0],
    diry: dir[1],
    dirz: dir[2],
    strength,
    type,
    shadow: shadowing
  };
}

export function pldToLight3DReference(pld: PackableLightDescriptor): Light3DReference {
  // Color 1 and 2 are 16 bit in RGB 565 format, and need to be converted to 24 bit RGB
  const color1 = rgb565ToRgb(pld.color1);
  const color2 = rgb565ToRgb(pld.color2);
  const types = ["DirectionalLight", "AmbientLight", "PointLight", "HemisphereLight"] as const;
  const type = types[Math.floor(Math.max(0, Math.min(pld.type, 3)))];
  const shadowing = !!pld.shadow;
  // Position is a 16 bit fixed point number, so divide by 256 to get the actual position
  const position = [(pld.posx - 32768) / 256, (pld.posy - 32768) / 256, (pld.posz - 32768) / 256] as [number, number, number];
  // Target is a 16 bit fixed point number, so divide by 256 to get the actual position
  const target = [(pld.dirx - 32768) / 256, (pld.diry - 32768) / 256, (pld.dirz - 32768) / 256] as [number, number, number];
  // Strength is a 4 bit number that is meant to represent a 0 to 1 light intensity
  const intensity = pld.strength / 15;

  return {
    color: color1,
    color2,
    type,
    position,
    target,
    intensity,
    shadowing
  };
}

if (starters.dev) {
  window['light3DReferenceToString'] = (r: Light3DReference) => {
    const bitSchema = { color1: 16, color2: 16, posx: 16, posy: 16, posz: 16, dirx: 16, diry: 16, dirz: 16, strength: 4, type: 2, shadow: 1 };
    return utils.packBitsToString(light3DReferenceToPld(r), bitSchema);
  };
  window['stringToLight3DReference'] = (s: string) => {
    const bitSchema = { color1: 16, color2: 16, posx: 16, posy: 16, posz: 16, dirx: 16, diry: 16, dirz: 16, strength: 4, type: 2, shadow: 1 };
    return pldToLight3DReference(utils.unpackBitsFromString(s, bitSchema) as any);
  }
}