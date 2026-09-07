import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

let loader = null;

export function getGLTFLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
  }
  return loader;
}
