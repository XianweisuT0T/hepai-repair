import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  AdditiveBlending, CatmullRomCurve3, DoubleSide, ExtrudeGeometry, Group,
  LatheGeometry, MathUtils, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial,
  ShapeGeometry, TubeGeometry, Vector2, Vector3,
  type Material,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BeveledBox, useGeometry } from '../lab3d/Geometry';
import Lighting from '../lab3d/Lighting';
import { useLabMaterials } from '../lab3d/materials';
import { supportsWebGL2 } from '../lab3d/MusicBox3D';
import { archedPanel, haloTexture, lanternColors, patternTexture } from './PrismLanternArt';

export interface PrismLanternProps {
  colorIndex: number;
  patternIndex: number;
  viewRevision: number;
  onColorChange: (index: number) => void;
  onPatternChange: (index: number) => void;
}

const LANTERN_Z = -.39;
const SHADE_X = -.08;
const SHADE_Z = -1.92;
const CAGE_RADIUS = 1.03;
const CAGE_COUNT = 6;
const CAGE_STAGGER = Math.PI / 6;
const WHEEL_ADJUSTMENTS = [0, -2 * Math.PI / 3, 2 * Math.PI / 3];

function CameraOrbit({ revision }: { revision: number }) {
  const { camera, gl, size, invalidate } = useThree();
  const ref = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    ref.current = controls;
    controls.enablePan = false;
    controls.enableDamping = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    controls.dampingFactor = .12;
    controls.rotateSpeed = .7;
    controls.zoomSpeed = .78;
    controls.minPolarAngle = .32;
    controls.maxPolarAngle = Math.PI * .46;
    controls.minAzimuthAngle = -1.5;
    controls.maxAzimuthAngle = 1.5;
    const changed = () => invalidate();
    controls.addEventListener('change', changed);
    controls.addEventListener('start', changed);
    return () => {
      controls.removeEventListener('start', changed);
      controls.removeEventListener('change', changed);
      controls.dispose();
      ref.current = null;
    };
  }, [camera, gl, invalidate]);
  useEffect(() => {
    const controls = ref.current;
    if (!controls || !size.width || !size.height) return;
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    const fit = Math.max(1, 1.13 / (size.width / size.height));
    const target = new Vector3(0, 2.14, -.18);
    camera.position.copy(new Vector3(4.5, 3.75, 10.7).multiplyScalar(fit).add(target));
    controls.target.copy(target);
    controls.minDistance = 7 * fit;
    controls.maxDistance = 25 * fit;
    controls.update();
    controls.enableDamping = damping;
    invalidate();
  }, [camera, size.width, size.height, revision, invalidate]);
  useFrame(() => ref.current?.update(), -1);
  return null;
}

function Disc({ size, position, material, taper = 1, segments = 48 }: {
  size: [radius: number, height: number]; position: [number, number, number];
  material: Material; taper?: number; segments?: number;
}) {
  return <mesh position={position} material={material} castShadow receiveShadow>
    <cylinderGeometry args={[size[0], size[0] * taper, size[1], segments]}/>
  </mesh>;
}

function archFace(width: number, height: number, crown: number) {
  const geometry = new ShapeGeometry(archedPanel(width, height, crown), 28);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / width + .5, position.getY(i) / height);
  return geometry;
}

function tube(points: Vector3[], radius: number) {
  return new TubeGeometry(new CatmullRomCurve3(points), 28, radius, 7, false);
}

function PrismLantern({ props, host }: { props: PrismLanternProps; host: RefObject<HTMLDivElement | null> }) {
  const gl = useThree(state => state.gl);
  const camera = useThree(state => state.camera);
  const invalidate = useThree(state => state.invalidate);
  const materials = useLabMaterials('walnut');
  const palette = lanternColors[props.colorIndex] ?? lanternColors[0];
  const wheel = useRef<Group>(null);
  const wheelCenter = useRef<Group>(null);
  const cardCenters = useRef<(Group | null)[]>([]);
  const reducedMotion = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const projected = useRef(new Vector3());

  const shadeBack = useGeometry(() => new ExtrudeGeometry(archedPanel(6.46, 3.65, 1.21), {
    depth: .13, bevelEnabled: true, bevelSegments: 2, bevelThickness: .035, bevelSize: .052, curveSegments: 28,
  }), []);
  const shadeRim = useGeometry(() => new ExtrudeGeometry(archedPanel(6.27, 3.49, 1.13), {
    depth: .043, bevelEnabled: true, bevelSegments: 2, bevelThickness: .012, bevelSize: .021, curveSegments: 28,
  }), []);
  const shadeFace = useGeometry(() => archFace(6.11, 3.35, 1.07), []);
  const cardEdge = useGeometry(() => new ExtrudeGeometry(archedPanel(1.22, 1.2, .30), {
    depth: .051, bevelEnabled: true, bevelSegments: 2, bevelThickness: .012, bevelSize: .021, curveSegments: 20,
  }), []);
  const cardFace = useGeometry(() => archFace(1.085, 1.055, .24), []);
  const cageRib = useGeometry(() => tube([
    new Vector3(CAGE_RADIUS, 3.41, 0), new Vector3(.99, 3.63, 0),
    new Vector3(.76, 3.87, 0), new Vector3(.44, 4.02, 0), new Vector3(.12, 4.08, 0),
  ], .034), []);
  const windowArch = useGeometry(() => tube([
    new Vector3(.892, 2.68, -.515), new Vector3(.958, 2.96, -.34),
    new Vector3(.991, 3.15, 0), new Vector3(.958, 2.96, .34), new Vector3(.892, 2.68, .515),
  ], .026), []);
  const crystal = useGeometry(() => new LatheGeometry([
    new Vector2(0, -1.03), new Vector2(.49, -.61), new Vector2(.55, .48),
    new Vector2(.38, .73), new Vector2(0, 1.03),
  ], 6), []);

  const extra = useMemo(() => {
    const halo = haloTexture();
    const brass = new MeshStandardMaterial({ color: '#d3a45c', metalness: .72, roughness: .39 });
    const paleBrass = new MeshStandardMaterial({ color: '#e5c58d', metalness: .65, roughness: .43 });
    const darkEnamel = new MeshStandardMaterial({ color: '#203932', metalness: .24, roughness: .6 });
    const innerGlass = new MeshStandardMaterial({ color: '#ffdc91', emissive: '#ffc46c', emissiveIntensity: .74, roughness: .34, flatShading: true });
    const glass = new MeshPhysicalMaterial({ color: '#ffc46c', emissive: '#ffc46c', emissiveIntensity: .16, opacity: .62, transparent: true,
      depthWrite: false, roughness: .15, metalness: .12, clearcoat: .75, clearcoatRoughness: .11, flatShading: true });
    const cards = [0,1,2].map(pattern => patternTexture(pattern, 0, true));
    const cardMaterials = cards.map(map => new MeshStandardMaterial({ map, color: '#fff3ce', roughness: .95, side: DoubleSide }));
    const wheelMaterials = lanternColors.map(color => new MeshStandardMaterial({ color: color.glass, metalness: .46, roughness: .39 }));
    return { halo, brass, paleBrass, darkEnamel, innerGlass, glass, cards, cardMaterials, wheelMaterials };
  }, []);

  const backdrop = useMemo(() => {
    const texture = patternTexture(props.patternIndex, props.colorIndex);
    return { texture, material: new MeshBasicMaterial({ map: texture, color: '#ffffff', toneMapped: false }) };
  }, [props.colorIndex, props.patternIndex]);

  useEffect(() => () => {
    extra.halo?.dispose();
    extra.cards.forEach(texture => texture?.dispose());
    for (const material of [extra.brass, extra.paleBrass, extra.darkEnamel, extra.innerGlass, extra.glass, ...extra.cardMaterials, ...extra.wheelMaterials]) material.dispose();
  }, [extra]);
  useEffect(() => () => { backdrop.material.dispose(); backdrop.texture?.dispose(); }, [backdrop]);
  useEffect(() => {
    extra.glass.color.set(palette.glass);
    extra.glass.emissive.set(palette.glass);
    extra.innerGlass.color.set(palette.glow);
    extra.innerGlass.emissive.set(palette.glass);
    invalidate();
  }, [palette, extra, backdrop, invalidate]);
  useEffect(() => {
    const element = host.current;
    if (element) element.dataset.webgl = 'ready';
    return () => {
      if (element) element.dataset.webgl = 'loading';
      gl.domElement.style.cursor = '';
    };
  }, [gl, host]);

  useFrame((_, delta) => {
    if (wheel.current) {
      const target = WHEEL_ADJUSTMENTS[props.colorIndex] ?? 0;
      const distance = Math.atan2(Math.sin(target - wheel.current.rotation.y), Math.cos(target - wheel.current.rotation.y));
      if (reducedMotion.current || Math.abs(distance) < .003) wheel.current.rotation.y = target;
      else { wheel.current.rotation.y += MathUtils.damp(0, distance, 12, Math.min(delta, .05)); invalidate(); }
    }
    const element = host.current;
    if (!element) return;
    camera.updateMatrixWorld();
    const project = (part: string, control: Group | null | undefined) => {
      if (!control) return;
      control.getWorldPosition(projected.current);
      projected.current.project(camera);
      element.setAttribute(`data-${part}-ndc-x`, projected.current.x.toFixed(5));
      element.setAttribute(`data-${part}-ndc-y`, projected.current.y.toFixed(5));
    };
    project('wheel', wheelCenter.current);
    cardCenters.current.forEach((card, index) => project(`card-${index}`, card));
    element.dataset.cameraX = camera.position.x.toFixed(4);
    element.dataset.cameraZ = camera.position.z.toFixed(4);
  });

  const enter = (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); gl.domElement.style.cursor = 'pointer'; };
  const exit = () => { gl.domElement.style.cursor = 'grab'; };
  const click = (action: () => void) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta < 7) action();
  };

  return <>
    <Lighting transparent/>
    <CameraOrbit revision={props.viewRevision}/>
    <mesh position={[0,-.075,0]} receiveShadow material={materials.table}>
      <cylinderGeometry args={[5.35,5.35,.14,64]}/>
    </mesh>
    <group name="prism-lantern">
      {/* The screen, controls and light all sit on the same bevelled wooden instrument. */}
      <BeveledBox material={materials.wood} size={[7.56,.66,4.46]} position={[0,.49,0]} radius={.23}/>
      <BeveledBox material={materials.woodEdge} size={[7.64,.16,4.54]} position={[0,.187,0]} radius={.13}/>
      <BeveledBox material={extra.brass} size={[7.53,.045,4.43]} position={[0,.81,0]} radius={.019}/>
      <BeveledBox material={materials.velvet} size={[7.37,.07,4.24]} position={[0,.856,0]} radius={.034}/>
      {[-3.04,3.04].flatMap(x => [-1.68,1.68].map(z => <Disc key={`${x}:${z}`} position={[x,.10,z]} size={[.22,.20]} material={materials.brassDark} taper={1.05} segments={24}/>))}
      <BeveledBox material={materials.brassDark} size={[2.43,.37,.075]} position={[0,.49,2.229]} radius={.030}/>
      <BeveledBox material={extra.paleBrass} size={[2.34,.301,.027]} position={[0,.49,2.275]} radius={.012}/>
      {[-1.06,1.06].map(x => <mesh key={x} position={[x,.49,2.299]} material={materials.brassDark}>
        <sphereGeometry args={[.043,14,10]}/>
      </mesh>)}
      <mesh position={[0,.49,2.294]} material={materials.brassDark}><torusGeometry args={[.084,.011,6,28]}/></mesh>
      {[-.62,-.45,-.28,.28,.45,.62].map((x,index) => <mesh key={x} position={[x,.49,2.294]} rotation={[0,0,Math.PI / 4]} material={materials.brassDark}>
        <boxGeometry args={[index===0||index===5?.039:.053,index===0||index===5?.039:.053,.009]}/>
      </mesh>)}

      <group position={[SHADE_X,.9,SHADE_Z]} name="prism-projection-screen">
        <mesh geometry={shadeBack} material={materials.woodEdge} castShadow receiveShadow/>
        <mesh geometry={shadeRim} material={extra.brass} position={[0,.069,.174]} castShadow/>
        <mesh geometry={shadeFace} material={backdrop.material} position={[0,.14,.235]}/>
        <BeveledBox material={materials.wood} size={[6.6,.13,.40]} position={[0,.035,.085]} radius={.04}/>
        {[-3.06,3.06].map(x => <group key={x} position={[x,.28,.31]}>
          <BeveledBox material={extra.brass} size={[.19,.28,.15]} position={[0,0,0]} radius={.02}/>
          <mesh material={materials.brassDark} position={[0,0,.09]}><sphereGeometry args={[.040,14,10]}/></mesh>
        </group>)}
      </group>

      <group name="prism-lantern-cage" position={[0,0,LANTERN_Z]}>
        <Disc size={[1.18,.16]} position={[0,.97,0]} material={materials.brassDark} taper={1.04}/>
        <Disc size={[1.16,.07]} position={[0,1.08,0]} material={extra.brass} taper={1.05}/>
        <Disc size={[1.07,.12]} position={[0,1.175,0]} material={extra.darkEnamel}/>
        <Disc size={[1.10,.06]} position={[0,1.265,0]} material={extra.paleBrass}/>
        <Disc size={[.49,.11]} position={[0,1.355,0]} material={materials.brassDark} taper={1.18}/>
        <Disc size={[.26,.11]} position={[0,1.46,0]} material={extra.brass} taper={1.16}/>
        <mesh rotation={[Math.PI/2,0,0]} position={[0,1.304,0]} material={extra.brass}><torusGeometry args={[.84,.022,9,56]}/></mesh>
        {[3.33,3.43].map(y => <mesh key={y} position={[0,y,0]} rotation={[Math.PI/2,0,0]} material={y<3.4?extra.brass:extra.paleBrass} castShadow>
          <torusGeometry args={[1.04,.046,10,64]}/></mesh>)}
        {Array.from({ length: CAGE_COUNT }, (_,index) => <group key={index} rotation={[0,CAGE_STAGGER+index*2*Math.PI/CAGE_COUNT,0]}>
          <Disc size={[.052,2.13]} position={[CAGE_RADIUS,2.33,0]} material={extra.brass} segments={16}/>
          <Disc size={[.086,.12]} position={[CAGE_RADIUS,1.36,0]} material={extra.paleBrass} segments={20}/>
          <Disc size={[.086,.12]} position={[CAGE_RADIUS,3.23,0]} material={extra.paleBrass} segments={20}/>
          <mesh geometry={cageRib} material={extra.brass} castShadow/>
          <mesh geometry={windowArch} rotation={[0,Math.PI/CAGE_COUNT,0]} material={extra.brass}/>
        </group>)}
        <Disc size={[.18,.114]} position={[0,4.086,0]} material={materials.brassDark}/>
        <Disc size={[.11,.14]} position={[0,4.185,0]} material={extra.brass} taper={1.2}/>
        <mesh material={extra.paleBrass} position={[0,4.31,0]} scale={[.13,.16,.13]}><sphereGeometry args={[1,18,12]}/></mesh>
        <mesh material={extra.brass} position={[0,4.49,0]}><torusGeometry args={[.14,.023,9,30]}/></mesh>
        <mesh geometry={crystal} material={extra.innerGlass} position={[0,2.335,0]} scale={[.65,.78,.65]} rotation={[0,.18,0]}/>
        <mesh geometry={crystal} material={extra.glass} position={[0,2.335,0]} rotation={[0,.18,0]} renderOrder={3}/>
        <pointLight color={palette.glass} intensity={7.5} distance={3.2} position={[0,1.72,.18]} decay={2}/>
        <sprite position={[0,2.3,.26]} scale={[2.65,3.15,1]} renderOrder={4} raycast={() => {}}>
          <spriteMaterial map={extra.halo} color={palette.halo} opacity={.23} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false}/>
        </sprite>
      </group>

      {/* Three detents on one keyed rotary disc. The highlight changes with the light color. */}
      <group name="prism-color-wheel" position={[-2.43,1.031,1.01]} rotation={[.14,0,0]}
        onPointerOver={enter} onPointerOut={exit} onClick={click(() => props.onColorChange((props.colorIndex+1)%3))}>
        <Disc size={[.88,.20]} position={[0,0,0]} material={materials.woodEdge} taper={1.08}/>
        <Disc size={[.83,.10]} position={[0,.128,0]} material={materials.brassDark} taper={1.04}/>
        <mesh rotation={[Math.PI/2,0,0]} material={extra.paleBrass} position={[0,.187,0]}><torusGeometry args={[.759,.036,10,56]}/></mesh>
        <group ref={wheel}>
          {extra.wheelMaterials.map((material,index) => <mesh key={index} material={material} position={[0,.182,0]}>
            <cylinderGeometry args={[.715,.715,.046,32,1,false,index*Math.PI*2/3+.047,Math.PI*2/3-.094]}/>
          </mesh>)}
          <Disc size={[.25,.158]} position={[0,.273,0]} material={extra.brass} taper={1.13} segments={32}/>
          <Disc size={[.22,.025]} position={[0,.362,0]} material={extra.paleBrass} segments={32}/>
          <BeveledBox size={[.055,.017,.25]} position={[0,.386,.124]} radius={.008} material={materials.brassDark}/>
        </group>
        <group ref={wheelCenter} position={[0,.395,0]}/>
      </group>

      {/* The offset drawers expose the top of every physical card for selection. */}
      <group position={[2.43,0,.6]} name="prism-pattern-rack">
        <BeveledBox size={[1.57,.19,1.32]} position={[0,.977,0]} radius={.065} material={materials.woodEdge}/>
        {[-.69,.69].map(x => <BeveledBox key={x} size={[.14,.40,1.26]} position={[x,1.158,0]} radius={.04} material={materials.wood}/>) }
        {[0,1,2].map(index => <group key={index} name={`prism-pattern-card-${index}`}
          position={[(index-1)*.067,1.04+index*.24,.46-index*.37]} rotation={[-.13,0,(index-1)*-.065]}
          onPointerOver={enter} onPointerOut={exit} onClick={click(() => props.onPatternChange(index))}>
          <mesh geometry={cardEdge} material={index===props.patternIndex?extra.paleBrass:materials.brassDark} castShadow/>
          <mesh geometry={cardFace} material={extra.cardMaterials[index]} position={[0,.061,.067]}/>
          <group ref={value => { cardCenters.current[index]=value; }} position={[0,1.08,.084]}/>
        </group>)}
        <BeveledBox size={[1.47,.145,.14]} position={[0,1.085,.62]} radius={.022} material={extra.brass}/>
      </group>
    </group>
  </>;
}

export default function PrismLanternViewer(props: PrismLanternProps) {
  const host = useRef<HTMLDivElement>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => setSupported(supportsWebGL2()), []);
  if (supported === false) return <div className="commission-error" role="status">当前浏览器暂时无法显示三维棱灯。</div>;
  return <div ref={host} className="commission-model-host" role="group" aria-label="合拍棱灯三维预览"
    data-testid="prism-lantern-canvas" data-webgl="loading" data-prism-color={props.colorIndex} data-prism-pattern={props.patternIndex}>
    {supported ? <Canvas frameloop="demand" shadows dpr={[1,1.5]} camera={{ position: [4.5,5.89,10.52], fov: 37, near: .1, far: 65 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
      <PrismLantern props={props} host={host}/>
    </Canvas> : <div className="commission-loading" role="status">正在打开棱灯…</div>}
  </div>;
}
