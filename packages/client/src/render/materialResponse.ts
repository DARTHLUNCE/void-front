/** Shared GGX / Smith / Schlick material response for world and preview lighting. */
export const MATERIAL_RESPONSE = `vec3 materialResponse(vec3 N, vec3 L, vec3 base, float roughness, float metallic) {
  const float PI = 3.14159265;
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(V + L);
  float nv = max(N.z, 0.001), nl = max(dot(N, L), 0.0);
  float nh = max(dot(N, H), 0.0), vh = max(dot(V, H), 0.0);
  float a = roughness * roughness, a2 = a * a;
  float denominator = nh * nh * (a2 - 1.0) + 1.0;
  float distribution = a2 / max(PI * denominator * denominator, 0.000001);
  float visibility = 0.5 / max(nl * sqrt(nv * nv * (1.0 - a2) + a2)
                           + nv * sqrt(nl * nl * (1.0 - a2) + a2), 0.0001);
  vec3 f0 = mix(vec3(0.04), base, metallic);
  vec3 fresnel = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
  vec3 diffuse = (1.0 - fresnel) * (1.0 - metallic) * base / PI;
  return (diffuse + fresnel * distribution * visibility) * nl * PI;
}`;
