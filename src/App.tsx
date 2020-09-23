import React, {
  useRef,
  Suspense,
  useMemo,
  useLayoutEffect,
  useState,
} from 'react';
import {
  Canvas,
  useFrame,
  ReactThreeFiber,
  extend,
  useThree,
  useUpdate,
} from 'react-three-fiber';
import * as THREE from 'three';
import { OrbitControls, shaderMaterial } from 'drei';
import * as dat from 'dat.gui';
import { useDeepMemo, useDeepCompareEffect } from './useDeep';
import myVideo from 'url:./assets/video.mp4';
import vertex from './shader/vertex.glsl';
import fragment from './shader/fragment.glsl';
import vertexSquares from './shader/vertex-squares.glsl';
import fragmentSquares from './shader/fragment-squares.glsl';
import vertexParticles from './shader/vertex-particles.glsl';
import fragmentParticles from './shader/fragment-particles.glsl';
import { PlaneBufferGeometry } from 'three';

interface DatGuiSetting {
  value: string | number | undefined;
  type?: 'color' | undefined;
  min?: number;
  max?: number;
  step?: number;
}

const VideoShaderMaterial = shaderMaterial(
  {
    image: null,
    resolution: new THREE.Vector4(),
  },
  vertex,
  fragment,
  () => null
);

const SquaresShaderMaterial = shaderMaterial(
  {
    mouse: new THREE.Vector3(),
    size: new THREE.Vector2(),
    time: 0,
  },
  vertexSquares,
  fragmentSquares,
  () => null
);

const ParticlesShaderMaterial = shaderMaterial(
  {
    time: 0,
  },
  vertexParticles,
  fragmentParticles,
  () => null
);

extend({
  VideoShaderMaterial,
  SquaresShaderMaterial,
  ParticlesShaderMaterial,
});

const useDatGui = <T extends Record<string, DatGuiSetting>>(settings: T) => {
  const obj = useDeepMemo<Record<keyof T, DatGuiSetting['value']>>(() => {
    const o = {} as Record<keyof T, DatGuiSetting['value']>;
    Object.keys(settings).forEach((key) => {
      const setting = settings[key];
      const { value } = setting;
      o[key as keyof T] = value;
    });
    return o;
  }, [settings]);

  useDeepCompareEffect(() => {
    const inst = new dat.GUI();
    Object.keys(settings).forEach((key) => {
      const setting = settings[key];
      const { type, min, max, step } = setting;
      if (type === 'color') {
        inst.addColor(obj, key);
      } else {
        inst.add(obj, key, min, max, step);
      }
    });
    return () => {
      inst.destroy();
    };
  }, [obj]);

  return obj;
};

const Bg = () => {
  const { aspect, size } = useThree();
  const [, reRender] = useState<any>();
  const video = useMemo(() => {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.src = myVideo;
    video.addEventListener('canplay', () => {
      reRender({});
      video.play();
    });
    return video;
  }, []);

  const videoTexture = useMemo(() => {
    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBFormat;
    return texture;
  }, [video]);

  const plane = useUpdate<THREE.Mesh>(
    (plane) => {
      if (aspect > 1) {
        plane.scale.x = aspect;
        plane.scale.y = 1;
      } else {
        plane.scale.y = 1 / aspect;
        plane.scale.x = 1;
      }
    },
    [aspect]
  );

  const material = useUpdate<THREE.ShaderMaterial>(
    (material) => {
      if (video.readyState !== 4) return;
      const videoAspect = video.videoHeight / video.videoWidth;
      const aspect = size.height / size.width;
      let a1 = 1;
      let a2 = 1;
      if (aspect > videoAspect) {
        a1 = videoAspect * (1 / aspect);
      } else {
        a2 = aspect / videoAspect;
      }
      material.uniforms.resolution.value.x = size.width;
      material.uniforms.resolution.value.y = size.height;
      material.uniforms.resolution.value.z = a1;
      material.uniforms.resolution.value.w = a2;
    },
    [video.videoWidth, video.videoHeight, size.width, size.height]
  );

  return (
    <mesh ref={plane}>
      <planeBufferGeometry args={[1, 1]} attach="geometry" />
      {/* @ts-ignore */}
      <videoShaderMaterial
        ref={material}
        side={THREE.DoubleSide}
        attach="material"
        image={videoTexture}
      />
    </mesh>
  );
};

const size = 40;
const cellSize = 0.08;

const Squares = () => {
  const { clock, size: dimensions, scene } = useThree();
  const mesh = useUpdate<THREE.InstancedMesh>(() => {
    if (!mesh.current) return;
    const dummy = new THREE.Object3D();
    const scales = new Float32Array(size ** 2);
    let count = 0;
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        dummy.position.set(
          cellSize * j - cellSize * size * 0.5,
          -(cellSize * i - cellSize * size * 0.5),
          0
        );
        dummy.updateMatrix();
        scales.set([Math.random()], count);
        mesh.current.setMatrixAt(count++, dummy.matrix);
      }
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  }, []);

  const material = useRef<THREE.ShaderMaterial>();

  useFrame(() => {
    material.current.uniforms.time.value = clock.elapsedTime;
  });

  return (
    <instancedMesh
      position={[0, 0, 0.01]}
      ref={mesh}
      args={[null, null, size ** 2]}
      onPointerMove={(e) => {
        const mouseX = (e.clientX / dimensions.width) * 2 - 1;
        const mouseY = (e.clientY / dimensions.height) * 2 - 1;
        scene.rotation.x = mouseY / 10;
        scene.rotation.y = mouseX / 10;
        material.current.uniforms.mouse.value = e.point;
      }}
    >
      <planeBufferGeometry attach="geometry" args={[cellSize, cellSize]} />
      {/* @ts-ignore */}
      <squaresShaderMaterial
        ref={material}
        transparent
        attach="material"
        side={THREE.DoubleSide}
        size={new THREE.Vector2(cellSize, cellSize)}
      />
    </instancedMesh>
  );
};

const Points = () => {
  const { clock } = useThree();
  const geometry = useMemo(() => {
    const bufferGeo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const x = j * cellSize - 0.5 * size * cellSize - 0.5 * cellSize;
        const y = -(i * cellSize - 0.5 * size * cellSize - 0.5 * cellSize);
        vertices.push(x, y, 0);
      }
    }
    bufferGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3)
    );

    return bufferGeo;
  }, []);

  const material = useRef<THREE.ShaderMaterial>();

  useFrame(() => {
    material.current.uniforms.time.value = clock.elapsedTime;
  });

  return (
    <points position-z={0.008} geometry={geometry}>
      {/* @ts-ignore */}
      <particlesShaderMaterial ref={material} transparent attach="material" />
    </points>
  );
};

const Lines = () => {
  const geometry = useMemo(() => {
    const geo = new THREE.Geometry();
    const l = -cellSize * size * 0.5;
    const r = -l;
    for (let i = 0; i < size; i++) {
      const d = i * cellSize - 0.5 * size * cellSize - 0.5 * cellSize;
      geo.vertices.push(new THREE.Vector3(l, d, 0));
      geo.vertices.push(new THREE.Vector3(r, d, 0));
      geo.vertices.push(new THREE.Vector3(d, l, 0));
      geo.vertices.push(new THREE.Vector3(d, r, 0));
    }
    return geo;
  }, []);

  return (
    // z-fighting so 0.009 here
    <lineSegments position-z={0.009} geometry={geometry}>
      {/* @ts-ignore */}
      <meshBasicMaterial
        opacity={0.1}
        color={0xffffff}
        transparent
        attach="material"
      />
    </lineSegments>
  );
};

const Scene = () => {
  return (
    <>
      <Bg />
      <Squares />
      <Points />
      <Lines />
    </>
  );
};

const CameraSet = () => {
  const { aspect, camera } = useThree();
  useLayoutEffect(() => {
    const dist = camera.position.z;
    const height = 0.8; // make the scene "bigger", so the rotation of scene will not show the blank space
    (camera as THREE.PerspectiveCamera).fov =
      2 * (180 / Math.PI) * Math.atan(height / 2 / dist);
    camera.updateProjectionMatrix();
  }, [aspect]);

  return null;
};

const App = () => {
  return (
    <Canvas
      colorManagement
      camera={{
        position: [0, 0, 2],
        fov: 70,
      }}
      onCreated={(ctx) => {
        ctx.gl.setClearColor(0x000000);
      }}
    >
      <ambientLight intensity={0.5} />
      <CameraSet />
      <OrbitControls />
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
};

export default App;
