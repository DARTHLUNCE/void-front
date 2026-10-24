import assert from 'node:assert/strict';
import { test } from 'vitest';
import panelLayout from '../../public/assets/ui/noir-panel-layout.json';
import { buildFrameGeometry,mapFrameRect,frameVertices,excludeFrameRect,topFrameHeight,type FramePiece,type Rect } from './frameGeometry';

const panels = panelLayout.panels as unknown as Record<string,{safe:Rect;glass:Rect}>;
const scenarios = [
  {width:1280,height:720}, {width:1920,height:1080}, {width:1024,height:768},
  {width:768,height:600}, {width:320,height:568}, {width:3440,height:1440}, {width:1440,height:500},
];
for (const {width,height} of scenarios) {
  const mobile = width<=760;
  const rail = mobile ? Math.min(360,width) : Math.min(474,Math.max(340,width*.2835));
  const origin = mobile ? 0 : rail;
  const top = topFrameHeight(width-origin);
  const pieces = [
    {kind:'rail' as FramePiece, width:rail, height:mobile ? height-56 : height, x:0,y:0},
    {kind:'top' as FramePiece, width:width-origin, height:top,x:origin,y:0},
    {kind:'window' as FramePiece, width:width-origin,height:height-top,x:origin,y:top},
  ].map(piece => ({...piece,geometry:buildFrameGeometry(piece.kind,piece.width,piece.height)}));
  test(`frame fills sections and preserves apertures at ${width}x${height}`,() => {
    for (const {kind,width:w,height:h,geometry} of pieces) {
      let area = 0;
      for (const {target:[x,y,r,b],source:[sx,sy,sr,sb]} of geometry.patches) {
        assert(r>x && b>y && sr>sx && sb>sy,'no inverted/degenerate patch');
        assert(x>=-1e-6 && y>=-1e-6 && r<=w+1e-6 && b<=h+1e-6,'bounded');
        area += (r-x)*(b-y);
      }
      assert(Math.abs(area-w*h)<.01,'complete coverage');
      assert(frameVertices(geometry).every(Number.isFinite),'finite GPU geometry');
      for (const [name,panel] of Object.entries(panels)) {
        const section = name==='gameplay'?'window':panel.safe[0]>=835?'top':'rail';
        if (kind!==section) continue;
        const [x,y,r,b]=mapFrameRect(geometry,panel.safe), [gx,gy,gr,gb]=mapFrameRect(geometry,panel.glass);
        assert(x>=gx && y>=gy && r<=gr && b<=gb,`${name}: safe content stays inside glass`);
        assert(r>x && b>y && x>=0 && y>=0 && r<=w && b<=h,`${name}: usable aperture`);
      }
    }
  });
  test(`hardware stays proportional at ${width}x${height}`,() => {
    const geometry=pieces[0].geometry;
    const [x,y,r,b]=mapFrameRect(geometry,[750,30,800,80]);
    assert(Math.abs((r-x)/(b-y)-1)<1e-6,'rail knob stays square');
    const topGeometry=pieces[1].geometry;
    const [tx,ty,tr,tb]=mapFrameRect(topGeometry,[2020,90,2040,110]);
    assert(Math.abs((tr-tx)/(tb-ty)-1)<1e-6,'top indicator stays square');
  });
}
test('invalid sizes fail explicitly',()=>assert.throws(()=>buildFrameGeometry('rail',0,100)));
test('mobile drawer excludes underlying frame without losing the uncovered area',()=>{
  const clips=excludeFrameRect([0,0,500,600],[0,0,320,544]);
  assert.equal(clips.reduce((sum,[x,y,r,b])=>sum+(r-x)*(b-y),0),500*600-320*544);
  assert(clips.every(([x,y])=>x>=320 || y>=544));
});
