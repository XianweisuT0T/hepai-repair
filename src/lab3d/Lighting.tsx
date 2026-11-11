import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, Color, PCFSoftShadowMap, PMREMGenerator, SRGBColorSpace } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Entirely local light rig: no HDR download and no postprocessing pass. */
export default function Lighting({ transparent = false }: { transparent?: boolean }) {
  const { gl, scene, size, invalidate } = useThree();
  const shadowSize = size.width < 700 ? 1024 : 2048;

  useEffect(() => {
    const previous = {
      background: scene.background, environment: scene.environment,
      environmentIntensity: scene.environmentIntensity,
      colorSpace: gl.outputColorSpace, toneMapping: gl.toneMapping,
      exposure: gl.toneMappingExposure, clearAlpha: gl.getClearAlpha(),
      shadows: gl.shadowMap.enabled, shadowType: gl.shadowMap.type
    };
    const room = new RoomEnvironment();
    const generator = new PMREMGenerator(gl);
    // Bake once. Temporary room geometry/materials and convolution buffers are
    // freed immediately; only the resulting environment target stays resident.
    const environment = (() => {
      try { return generator.fromScene(room, .035, .1, 100); }
      finally { room.dispose(); generator.dispose(); }
    })();
    const background = transparent ? null : new Color('#102e2d');
    scene.background = background;
    gl.setClearAlpha(transparent ? 0 : 1);
    scene.environment = environment.texture;
    scene.environmentIntensity = .55;
    gl.outputColorSpace = SRGBColorSpace;
    gl.toneMapping = ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.02;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = PCFSoftShadowMap;
    invalidate();

    return () => {
      if (scene.background === background) scene.background = previous.background;
      if (scene.environment === environment.texture) scene.environment = previous.environment;
      scene.environmentIntensity = previous.environmentIntensity;
      gl.outputColorSpace = previous.colorSpace;
      gl.toneMapping = previous.toneMapping;
      gl.toneMappingExposure = previous.exposure;
      gl.setClearAlpha(previous.clearAlpha);
      gl.shadowMap.enabled = previous.shadows;
      gl.shadowMap.type = previous.shadowType;
      environment.dispose();
    };
  }, [gl, scene, invalidate, transparent]);

  return <>
    <ambientLight color="#cfdbc9" intensity={.12}/>
    <hemisphereLight color="#e4ece0" groundColor="#263f34" intensity={.55}/>
    {/* Recreate the shadow-owning light only across the viewport breakpoint so
        Three releases the old shadow target instead of retaining its old size. */}
    <directionalLight key={shadowSize} position={[-5, 9, 7]} color="#ffe2b6" intensity={2.65}
      castShadow shadow-mapSize-width={shadowSize} shadow-mapSize-height={shadowSize}
      shadow-camera-near={.5} shadow-camera-far={35}
      shadow-camera-left={-8} shadow-camera-right={8}
      shadow-camera-top={8} shadow-camera-bottom={-8}
      shadow-bias={-.00012} shadow-normalBias={.025} shadow-radius={3}/>
    <directionalLight position={[6, 4, 2]} color="#b4d2cd" intensity={.45}/>
    <directionalLight position={[1, 6, -6]} color="#d6dec4" intensity={.45}/>
  </>;
}
