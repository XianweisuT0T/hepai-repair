import type { NoteSymbol, Timbre } from '../shared/types';
const frequencies: Record<NoteSymbol,number> = {leaf:523.25,star:659.25,moon:783.99};
export class RepairAudio {
  context: AudioContext | null = null;
  muted = true;
  volume = .24;
  nodes = new Set<OscillatorNode>();
  timers = new Set<ReturnType<typeof setTimeout>>();
  async enable() {
    this.context ??= new AudioContext();
    await this.context.resume();
    this.muted = false;
  }
  tone(symbol:NoteSymbol, timbre:Timbre='bell', delay=0, length=.65, frequencyScale=1, gainScale=1) {
    if (!this.context || this.context.state !== 'running' || this.muted) return;
    const ctx = this.context, start = ctx.currentTime + delay;
    for (const [harmonic, weight] of (timbre==='bell'?[[1,1],[2.76,.13],[4.1,.04]]:timbre==='wood'?[[1,1],[2,.15]]:[[1,1],[2,.06]])) {
      const osc = ctx.createOscillator(), gain=ctx.createGain();
      osc.type='sine'; osc.frequency.value=frequencies[symbol]*harmonic*frequencyScale;
      gain.gain.setValueAtTime(0,start); gain.gain.linearRampToValueAtTime(this.volume*.28*weight*gainScale,start+.012);
      gain.gain.exponentialRampToValueAtTime(.0001,start+length*(timbre==='wood'?.65:1));
      osc.connect(gain); gain.connect(ctx.destination); this.nodes.add(osc);
      osc.onended=()=>{osc.disconnect();gain.disconnect();this.nodes.delete(osc);};
      osc.start(start);osc.stop(start+length+.05);
    }
  }
  click(){this.tone('leaf','wood',0,.16);}
  stop(){for(const n of this.nodes){try{n.stop();}catch{ /* already stopped */ }}this.nodes.clear();for(const t of this.timers)clearTimeout(t);this.timers.clear();}
  dispose(){this.stop();void this.context?.close();this.context=null;}
}
