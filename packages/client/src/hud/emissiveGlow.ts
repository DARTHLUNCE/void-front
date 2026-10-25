/** Linear-light, normalized multi-scale point-spread approximation for DOM displays. */
export function installEmissiveGlow():void{
  if(document.getElementById('phosphor-scatter'))return;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width','0');svg.setAttribute('height','0');svg.setAttribute('aria-hidden','true');svg.style.position='absolute';
  svg.innerHTML=`<defs><filter id="phosphor-scatter" x="-20%" y="-30%" width="140%" height="160%" color-interpolation-filters="linearRGB">
    <feGaussianBlur in="SourceGraphic" stdDeviation=".7" result="tight"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="medium"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="wide"/>
    <feComposite in="tight" in2="medium" operator="arithmetic" k2=".55" k3=".30" result="near"/>
    <feComposite in="near" in2="wide" operator="arithmetic" k2="1" k3=".15" result="scatter"/>
    <feComposite in="SourceGraphic" in2="scatter" operator="arithmetic" k2=".96" k3=".16"/>
  </filter></defs>`;
  document.body.prepend(svg);
}
