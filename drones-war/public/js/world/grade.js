// Cinematic grade shared with the game's post-processing chain: a ShaderPass-compatible shader (contrast,
// desaturation, split toning, vignette, film grain) plus bloom settings per time of day. Place it after the
// bloom pass and before OutputPass; it works on linear HDR values and converts to a perceptual curve
// internally so the same numbers behave sensibly on both sides of tone mapping.
export const GRADES = {
  // CoD: Ghosts overcast: muted, slightly cold shadows, dusty warm highlights, heavy vignette, soft bloom on the sky
  overcast: { saturation: 0.7, contrast: 1.2, shadows: [0.86, 0.98, 1.1], highlights: [1.08, 1.02, 0.9], lift: 0.012, vignette: 0.46, grain: 0.055, bloom: { strength: 0.32, radius: 0.55, threshold: 0.82 } },
  day: { saturation: 0.9, contrast: 1.1, shadows: [0.95, 1.0, 1.06], highlights: [1.06, 1.02, 0.94], lift: 0.008, vignette: 0.32, grain: 0.04, bloom: { strength: 0.3, radius: 0.5, threshold: 0.88 } },
  sunset: { saturation: 0.9, contrast: 1.16, shadows: [0.9, 0.97, 1.1], highlights: [1.14, 1.0, 0.86], lift: 0.01, vignette: 0.42, grain: 0.05, bloom: { strength: 0.42, radius: 0.6, threshold: 0.78 } },
  night: { saturation: 0.8, contrast: 1.12, shadows: [0.88, 0.98, 1.14], highlights: [1.1, 1.02, 0.92], lift: 0.004, vignette: 0.5, grain: 0.07, bloom: { strength: 0.6, radius: 0.7, threshold: 0.62 } },
};

export function gradeOf(timeOfDay) { return GRADES[timeOfDay] || GRADES.overcast; }

// Uniform values for GradeShader taken from a grade entry.
export function gradeUniforms(g) {
  return {
    uSaturation: g.saturation, uContrast: g.contrast, uShadows: g.shadows, uHighlights: g.highlights,
    uLift: g.lift, uVignette: g.vignette, uGrain: g.grain,
  };
}

export const GradeShader = {
  name: 'WorldGrade',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSaturation: { value: 0.8 },
    uContrast: { value: 1.1 },
    uShadows: { value: [0.95, 1, 1.05] },
    uHighlights: { value: [1.05, 1, 0.95] },
    uLift: { value: 0.01 },
    uVignette: { value: 0.4 },
    uGrain: { value: 0.05 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uSaturation, uContrast, uLift, uVignette, uGrain;
    uniform vec3 uShadows, uHighlights;
    varying vec2 vUv;
    float hash( vec2 p ) { p = fract( p * vec2( 443.897, 441.423 ) ); p += dot( p, p.yx + 19.19 ); return fract( ( p.x + p.y ) * p.x ); }
    void main() {
      vec4 src = texture2D( tDiffuse, vUv );
      // perceptual space: gamma 2.2 keeps contrast and toning from crushing the darks of HDR input
      vec3 c = pow( max( src.rgb, 0.0 ), vec3( 1.0 / 2.2 ) );
      float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
      c = mix( vec3( l ), c, uSaturation );
      c = mix( uShadows, uHighlights, smoothstep( 0.05, 0.85, l ) ) * c;
      c = ( c - 0.46 ) * uContrast + 0.46 + uLift;
      // vignette: darkens and slightly desaturates the corners like a lens
      vec2 p = vUv - 0.5;
      p.x *= 1.15;
      float v = smoothstep( 0.28, 0.95, length( p ) );
      c *= 1.0 - v * uVignette;
      // film grain, strongest in the mid-tones, animated per frame
      float g = hash( vUv * 1024.0 + fract( uTime ) * 77.0 ) - 0.5;
      c += g * uGrain * ( 1.0 - abs( l - 0.5 ) );
      c = pow( max( c, 0.0 ), vec3( 2.2 ) );
      gl_FragColor = vec4( c, src.a );
    }`,
};
