import { frameGlassShader } from './frameGlassShader';

export const frameVertex = `#version 300 es
precision highp float;
in vec2 aCorner;
in vec2 aSource;
uniform vec2 uViewport;
uniform vec4 uRect;
uniform vec4 uUV;
out vec2 vUV;
out vec2 vScreen;
void main() {
  vScreen = uRect.xy + aCorner * uRect.zw;
  vUV = uUV.xy + aSource * uUV.zw;
  gl_Position = vec4(vScreen.x / uViewport.x * 2.0 - 1.0, 1.0 - vScreen.y / uViewport.y * 2.0, 0.0, 1.0);
}`;

export const frameFragment = `#version 300 es
precision highp float;
uniform sampler2D uAlbedo;
uniform sampler2D uNormal;
uniform vec2 uAnchors[8];
uniform vec2 uLights[8];
uniform vec3 uColors[8];
uniform vec2 uNormalScale;
uniform float uLighting;
uniform int uScreenCount;
uniform vec4 uScreens[32];
uniform vec3 uScreenColors[32];
in vec2 vUV;
in vec2 vScreen;
out vec4 fragColor;
vec3 decode(vec3 c) { return mix(pow((c + .055) / 1.055, vec3(2.4)), c / 12.92, lessThanEqual(c, vec3(.04045))); }
vec3 encode(vec3 c) { return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - .055, c * 12.92, lessThanEqual(c, vec3(.0031308))); }
${frameGlassShader}
void main() {
  vec2 source = vUV*vec2(2944.0,1664.0);
  vec2 sourceDx = dFdx(source), sourceDy = dFdy(source);
  vec4 glass = screenGlass(source,sourceDx,sourceDy,length(vec2(dFdx(vScreen.y),dFdy(vScreen.y))));
  vec4 texel = texture(uAlbedo, vUV);
  if (texel.a < .002) {
    if (glass.a < .002) discard;
    fragColor = glass; return;
  }
  vec3 base = decode(texel.rgb);
  base = mix(vec3(dot(base, vec3(.2126,.7152,.0722))), base, .18) * vec3(.88,.96,1.04);
  vec3 normal = texture(uNormal, vUV).rgb * 2.0 - 1.0;
  normal.xy *= vec2(1.25,-1.25) * uNormalScale;
  normal = normalize(vec3(normal.xy,max(normal.z,.2)));
  vec3 key = normalize(vec3(-.4,-.6,1.0));
  float relief = .72 + .36 * max(dot(normal,key),0.0);
  vec3 result = base * mix(1.0,relief,uLighting);
  for (int i=0; i<8; i++) {
    vec2 patchOffset = vScreen - uAnchors[i];
    float envelope = exp(-dot(patchOffset,patchOffset) / 100000.0);
    vec3 direction = normalize(vec3(uLights[i] - vScreen,140.0));
    float diffuse = max(dot(normal,direction),0.0);
    vec3 halfway = normalize(direction + vec3(0.0,0.0,1.0));
    float specular = pow(max(dot(normal,halfway),0.0),32.0) * .035;
    result += uColors[i] * envelope * (base * diffuse * .6 + specular) * uLighting;
  }
  // Instrument glass is an area emitter. Its nearest point illuminates the
  // neighboring bevel through the same normal map as reflected game lights.
  for (int i=0; i<32; i++) {
    if (i>=uScreenCount) break;
    vec2 nearest = clamp(vScreen,uScreens[i].xy,uScreens[i].zw);
    vec2 delta = nearest-vScreen;
    float falloff = exp(-length(delta)/18.0);
    vec3 direction = normalize(vec3(delta,8.0));
    float diffuse = max(dot(normal,direction),0.0);
    vec3 halfway = normalize(direction+vec3(0.0,0.0,1.0));
    float specular = pow(max(dot(normal,halfway),0.0),18.0);
    result += uScreenColors[i]*falloff*(base*diffuse*.85+specular*.07);
  }
  // Physical indicator lamps retain their baked visible brightness.
  float lamp = smoothstep(.45,.9,max(texel.r,max(texel.g,texel.b)));
  result = mix(result,max(result,base),lamp);
  float alpha = texel.a+glass.a*(1.0-texel.a);
  vec3 color = encode(clamp(result,0.0,1.0))*texel.a+glass.rgb*glass.a*(1.0-texel.a);
  fragColor = vec4(color/max(alpha,.001),alpha);
}`;
