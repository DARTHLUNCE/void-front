import { smooth } from './abilityFxCatalog';

export interface ConcealmentPose { alpha:number; entering:number; leaving:number; entryProgress:number; exitProgress:number }
interface State extends ConcealmentPose { cast:number; active:boolean; exitAt:number }
/** Presentation follows the real cloak flag, including an early reveal from firing.
 * Call only after visibility admits the hull. No delayed enemy visibility is introduced. */
export class AbilityConcealment {
  private readonly states=new Map<number,State>();
  reset():void {this.states.clear();}
  sample(slot:number,cast:number,active:boolean,time:number,variant=4):ConcealmentPose {
    let state=this.states.get(slot);
    if(!state||state.cast!==cast){
      state={cast,active,exitAt:-Infinity,alpha:active?.26:1,entering:0,leaving:0,entryProgress:0,exitProgress:0};
      this.states.set(slot,state);
    }
    if(state.active&&!active)state.exitAt=time;
    state.active=active;
    const age=Math.max(0,time-cast),out=Math.max(0,time-state.exitAt);
    state.entering=active?smooth(age/.035)*(1-smooth(age/.32)):0;
    state.leaving=active?0:smooth(out/.028)*(1-smooth(out/.25));
    state.entryProgress=smooth(age/(variant===5?.24:.20));
    state.exitProgress=smooth(out/(variant===5?.105:.14));
    state.alpha=active?1-.74*state.entryProgress:.26+.74*state.exitProgress;
    return state;
  }
}
