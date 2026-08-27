import * as THREE from 'three';
import { HEX } from './Palette';

/**
 * Three.js Renderer & Lighting Coordinator
 */
export class RenderPipeline {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public mainLight: THREE.DirectionalLight;
  public ambientLight: THREE.AmbientLight;
  public rimLight: THREE.DirectionalLight;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    // Clear colour only shows through where the sky dome does not cover, so
    // it matches the dome's horizon band.
    this.scene.background = new THREE.Color(HEX.skyHorizon);
    // No scene.fog: every material here is a hand-written ShaderMaterial with
    // no fog chunk, so three's fog was inert. Distance haze is done in
    // CelShaders via the shared uFogColor / uFogRange uniforms instead.

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Tone mapping off: ACES desaturates saturated neon badly, and this art
    // direction wants emissives to clip to white rather than roll off. The
    // materials still carry <tonemapping_fragment>, so flipping this back on
    // is a one-line change if the look ever wants it.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Key light: a low, warm morning sun placed AHEAD of the player (+Z) so it
    // agrees with the sun drawn in the sky dome. It used to sit behind at -Z,
    // which was survivable against a black backdrop but reads as a mistake the
    // moment there is a visible sun to contradict.
    this.mainLight = new THREE.DirectionalLight(HEX.sun, 1.55);
    this.mainLight.position.set(22, 20, 46);
    this.mainLight.castShadow = true;
    this.mainLight.shadow.mapSize.width = 2048;
    this.mainLight.shadow.mapSize.height = 2048;
    this.mainLight.shadow.camera.near = 0.5;
    this.mainLight.shadow.camera.far = 150;
    const shadowDist = 35;
    this.mainLight.shadow.camera.left = -shadowDist;
    this.mainLight.shadow.camera.right = shadowDist;
    this.mainLight.shadow.camera.top = shadowDist;
    this.mainLight.shadow.camera.bottom = -shadowDist;
    this.scene.add(this.mainLight);
    this.scene.add(this.mainLight.target);

    // Sky fill from behind and above: cool light bouncing off the cloud sea,
    // which is what keeps shadowed faces reading as stone rather than as holes.
    this.rimLight = new THREE.DirectionalLight(HEX.skyMid, 0.85);
    this.rimLight.position.set(-24, 26, -34);
    this.scene.add(this.rimLight);

    // Ambient is now bright and sky-tinted. On a light field the ambient term
    // sets the floor of the whole image, and a dark one would drag every
    // surface back toward the look we are leaving behind.
    this.ambientLight = new THREE.AmbientLight(HEX.skyHigh, 1.15);
    this.scene.add(this.ambientLight);

    // Handle Window Resizing
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  public updateLightPosition(targetPos: THREE.Vector3): void {
    // Keep directional shadows aligned around the player
    this.mainLight.position.set(targetPos.x + 22, targetPos.y + 20, targetPos.z + 46);
    this.mainLight.target.position.copy(targetPos);
    this.mainLight.target.updateMatrixWorld();
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
