varying vec2 vUv;
uniform float time;
varying float vDist;

void main() {
  gl_FragColor = vec4(1.0, 1.0, 1.0, 0.5 * vDist);
}